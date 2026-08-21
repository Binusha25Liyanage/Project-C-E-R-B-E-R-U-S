"""
Local SQLite data layer for Cerberus Desktop.

Tables:
  schemas    - user-defined record templates (field definitions as JSON)
  records    - actual data rows, stored as JSON so any schema fits one table
  audit_log  - append-only change history per record
"""

import sqlite3
import json
import datetime
import os
import threading

DB_LOCK = threading.Lock()  # sqlite3 connections aren't thread-safe by default


def _now():
    return datetime.datetime.utcnow().isoformat()


class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_tables()

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_tables(self):
        with DB_LOCK, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS schemas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    field_definitions_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    schema_id INTEGER NOT NULL,
                    data_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    source TEXT NOT NULL DEFAULT 'manual',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (schema_id) REFERENCES schemas(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    record_id INTEGER NOT NULL,
                    change_json TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_type TEXT NOT NULL,
                    schema_id INTEGER,
                    status TEXT NOT NULL DEFAULT 'queued',
                    title TEXT,
                    progress_json TEXT NOT NULL DEFAULT '{}',
                    result_json TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_records_schema ON records(schema_id);
                CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_id);
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                """
            )

    # ---------------- Schemas ----------------

    def create_schema(self, name, field_definitions):
        with DB_LOCK, self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO schemas (name, field_definitions_json, created_at) VALUES (?, ?, ?)",
                (name, json.dumps(field_definitions), _now()),
            )
            return cur.lastrowid

    def list_schemas(self):
        with DB_LOCK, self._connect() as conn:
            rows = conn.execute("SELECT * FROM schemas ORDER BY created_at DESC").fetchall()
            return [self._schema_row_to_dict(r) for r in rows]

    def get_schema(self, schema_id):
        with DB_LOCK, self._connect() as conn:
            row = conn.execute("SELECT * FROM schemas WHERE id = ?", (schema_id,)).fetchone()
            return self._schema_row_to_dict(row) if row else None

    def update_schema(self, schema_id, name=None, field_definitions=None):
        with DB_LOCK, self._connect() as conn:
            current = conn.execute("SELECT * FROM schemas WHERE id = ?", (schema_id,)).fetchone()
            if not current:
                return False
            new_name = name if name is not None else current["name"]
            new_fields = (
                json.dumps(field_definitions)
                if field_definitions is not None
                else current["field_definitions_json"]
            )
            conn.execute(
                "UPDATE schemas SET name = ?, field_definitions_json = ? WHERE id = ?",
                (new_name, new_fields, schema_id),
            )
            return True

    def delete_schema(self, schema_id):
        with DB_LOCK, self._connect() as conn:
            conn.execute("DELETE FROM schemas WHERE id = ?", (schema_id,))
            return True

    @staticmethod
    def _schema_row_to_dict(row):
        return {
            "id": row["id"],
            "name": row["name"],
            "fields": json.loads(row["field_definitions_json"]),
            "created_at": row["created_at"],
        }

    # ---------------- Records ----------------

    def create_record(self, schema_id, data, source="manual", status="pending"):
        with DB_LOCK, self._connect() as conn:
            now = _now()
            cur = conn.execute(
                """INSERT INTO records (schema_id, data_json, status, source, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (schema_id, json.dumps(data), status, source, now, now),
            )
            record_id = cur.lastrowid
            conn.execute(
                "INSERT INTO audit_log (record_id, change_json, timestamp) VALUES (?, ?, ?)",
                (record_id, json.dumps({"action": "create", "data": data}), now),
            )
            return record_id

    def update_record(self, record_id, data=None, status=None):
        with DB_LOCK, self._connect() as conn:
            current = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
            if not current:
                return False
            new_data = data if data is not None else json.loads(current["data_json"])
            new_status = status if status is not None else current["status"]
            now = _now()
            conn.execute(
                "UPDATE records SET data_json = ?, status = ?, updated_at = ? WHERE id = ?",
                (json.dumps(new_data), new_status, now, record_id),
            )
            conn.execute(
                "INSERT INTO audit_log (record_id, change_json, timestamp) VALUES (?, ?, ?)",
                (record_id, json.dumps({"action": "update", "data": new_data, "status": new_status}), now),
            )
            return True

    def delete_record(self, record_id):
        with DB_LOCK, self._connect() as conn:
            conn.execute(
                "INSERT INTO audit_log (record_id, change_json, timestamp) VALUES (?, ?, ?)",
                (record_id, json.dumps({"action": "delete"}), _now()),
            )
            conn.execute("DELETE FROM records WHERE id = ?", (record_id,))
            return True

    def list_records(self, schema_id):
        with DB_LOCK, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM records WHERE schema_id = ? ORDER BY updated_at DESC", (schema_id,)
            ).fetchall()
            return [self._record_row_to_dict(r) for r in rows]

    def get_record(self, record_id):
        with DB_LOCK, self._connect() as conn:
            row = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
            return self._record_row_to_dict(row) if row else None

    @staticmethod
    def _record_row_to_dict(row):
        return {
            "id": row["id"],
            "schema_id": row["schema_id"],
            "data": json.loads(row["data_json"]),
            "status": row["status"],
            "source": row["source"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    # ---------------- Audit log ----------------

    # ---------------- Jobs (bulk import, and later OCR / scraping) ----------------

    def create_job(self, job_type, schema_id=None, title=None):
        with DB_LOCK, self._connect() as conn:
            now = _now()
            cur = conn.execute(
                """INSERT INTO jobs (job_type, schema_id, status, title, progress_json, created_at, updated_at)
                   VALUES (?, ?, 'queued', ?, '{}', ?, ?)""",
                (job_type, schema_id, title, now, now),
            )
            return cur.lastrowid

    def update_job(self, job_id, status=None, progress=None, result=None, error=None):
        with DB_LOCK, self._connect() as conn:
            current = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not current:
                return False
            new_status = status if status is not None else current["status"]
            new_progress = json.dumps(progress) if progress is not None else current["progress_json"]
            new_result = json.dumps(result) if result is not None else current["result_json"]
            new_error = error if error is not None else current["error"]
            conn.execute(
                """UPDATE jobs SET status = ?, progress_json = ?, result_json = ?, error = ?, updated_at = ?
                   WHERE id = ?""",
                (new_status, new_progress, new_result, new_error, _now(), job_id),
            )
            return True

    def get_job(self, job_id):
        with DB_LOCK, self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return self._job_row_to_dict(row) if row else None

    def list_jobs(self, active_only=False):
        with DB_LOCK, self._connect() as conn:
            if active_only:
                rows = conn.execute(
                    "SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY created_at DESC"
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50").fetchall()
            return [self._job_row_to_dict(r) for r in rows]

    @staticmethod
    def _job_row_to_dict(row):
        return {
            "id": row["id"],
            "job_type": row["job_type"],
            "schema_id": row["schema_id"],
            "status": row["status"],
            "title": row["title"],
            "progress": json.loads(row["progress_json"]) if row["progress_json"] else {},
            "result": json.loads(row["result_json"]) if row["result_json"] else None,
            "error": row["error"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def get_audit_log(self, record_id):
        with DB_LOCK, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_log WHERE record_id = ? ORDER BY timestamp DESC", (record_id,)
            ).fetchall()
            return [
                {"id": r["id"], "record_id": r["record_id"], "change": json.loads(r["change_json"]), "timestamp": r["timestamp"]}
                for r in rows
            ]
