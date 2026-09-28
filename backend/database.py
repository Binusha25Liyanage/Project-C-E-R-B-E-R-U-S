"""
Local SQLite data layer for Cerberus Desktop.

Tables:
  schemas          - user-defined record templates (field definitions as JSON)
  records          - actual data rows, stored as JSON so any schema fits one table
  audit_log        - append-only change history. Tagged with schema_id at write
                      time (not looked up later) so history survives even if the
                      record itself is later deleted.
  jobs             - background jobs (bulk import today; OCR/scraping later)
  duplicate_flags  - fuzzy-match duplicate pairs awaiting manual review
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
                    schema_id INTEGER,
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

                CREATE TABLE IF NOT EXISTS duplicate_flags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    schema_id INTEGER NOT NULL,
                    record_id INTEGER NOT NULL,
                    matched_record_id INTEGER NOT NULL,
                    similarity_score REAL NOT NULL,
                    resolution_status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    resolved_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_records_schema ON records(schema_id);
                CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_id);
                CREATE INDEX IF NOT EXISTS idx_audit_schema ON audit_log(schema_id);
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_dupflags_schema_status ON duplicate_flags(schema_id, resolution_status);
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
                "INSERT INTO audit_log (record_id, schema_id, change_json, timestamp) VALUES (?, ?, ?, ?)",
                (record_id, schema_id, json.dumps({"action": "create", "data": data}), now),
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
                "INSERT INTO audit_log (record_id, schema_id, change_json, timestamp) VALUES (?, ?, ?, ?)",
                (record_id, current["schema_id"], json.dumps({"action": "update", "data": new_data, "status": new_status}), now),
            )
            return True

    def delete_record(self, record_id):
        with DB_LOCK, self._connect() as conn:
            current = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
            schema_id = current["schema_id"] if current else None
            conn.execute(
                "INSERT INTO audit_log (record_id, schema_id, change_json, timestamp) VALUES (?, ?, ?, ?)",
                (record_id, schema_id, json.dumps({"action": "delete"}), _now()),
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

    # ---------------- Jobs ----------------

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

    # ---------------- Audit log ----------------

    def get_audit_log(self, record_id):
        with DB_LOCK, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_log WHERE record_id = ? ORDER BY timestamp DESC", (record_id,)
            ).fetchall()
            return [self._audit_row_to_dict(r) for r in rows]

    def list_recent_audit_log(self, limit=100, schema_id=None):
        with DB_LOCK, self._connect() as conn:
            if schema_id:
                rows = conn.execute(
                    "SELECT * FROM audit_log WHERE schema_id = ? ORDER BY timestamp DESC LIMIT ?",
                    (schema_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?", (limit,)
                ).fetchall()
            return [self._audit_row_to_dict(r) for r in rows]

    @staticmethod
    def _audit_row_to_dict(row):
        return {
            "id": row["id"],
            "record_id": row["record_id"],
            "schema_id": row["schema_id"],
            "change": json.loads(row["change_json"]),
            "timestamp": row["timestamp"],
        }

    # ---------------- Duplicate flags ----------------

    def create_duplicate_flag(self, schema_id, record_id, matched_record_id, similarity_score):
        with DB_LOCK, self._connect() as conn:
            cur = conn.execute(
                """INSERT INTO duplicate_flags
                   (schema_id, record_id, matched_record_id, similarity_score, resolution_status, created_at)
                   VALUES (?, ?, ?, ?, 'pending', ?)""",
                (schema_id, record_id, matched_record_id, similarity_score, _now()),
            )
            return cur.lastrowid

    def flag_exists(self, schema_id, record_id, matched_record_id):
        """
        Checks both orderings so (A,B) and (B,A) aren't both flagged, and
        checks ANY status (not just pending) - once a human has reviewed a
        pair and marked it 'not_duplicate', it must never be re-flagged by
        a future scan just because the same two records still fuzzy-match.
        """
        with DB_LOCK, self._connect() as conn:
            row = conn.execute(
                """SELECT id FROM duplicate_flags
                   WHERE schema_id = ?
                   AND ((record_id = ? AND matched_record_id = ?) OR (record_id = ? AND matched_record_id = ?))""",
                (schema_id, record_id, matched_record_id, matched_record_id, record_id),
            ).fetchone()
            return row is not None

    def list_duplicate_flags(self, schema_id, status="pending"):
        with DB_LOCK, self._connect() as conn:
            if status:
                rows = conn.execute(
                    "SELECT * FROM duplicate_flags WHERE schema_id = ? AND resolution_status = ? ORDER BY created_at DESC",
                    (schema_id, status),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM duplicate_flags WHERE schema_id = ? ORDER BY created_at DESC", (schema_id,)
                ).fetchall()
            return [self._flag_row_to_dict(r) for r in rows]

    def count_pending_flags(self, schema_id=None):
        with DB_LOCK, self._connect() as conn:
            if schema_id:
                row = conn.execute(
                    "SELECT COUNT(*) as c FROM duplicate_flags WHERE schema_id = ? AND resolution_status = 'pending'",
                    (schema_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT COUNT(*) as c FROM duplicate_flags WHERE resolution_status = 'pending'"
                ).fetchone()
            return row["c"]

    def resolve_duplicate_flag(self, flag_id, resolution_status):
        with DB_LOCK, self._connect() as conn:
            conn.execute(
                "UPDATE duplicate_flags SET resolution_status = ?, resolved_at = ? WHERE id = ?",
                (resolution_status, _now(), flag_id),
            )
            return True

    def get_duplicate_flag(self, flag_id):
        with DB_LOCK, self._connect() as conn:
            row = conn.execute("SELECT * FROM duplicate_flags WHERE id = ?", (flag_id,)).fetchone()
            return self._flag_row_to_dict(row) if row else None

    @staticmethod
    def _flag_row_to_dict(row):
        return {
            "id": row["id"],
            "schema_id": row["schema_id"],
            "record_id": row["record_id"],
            "matched_record_id": row["matched_record_id"],
            "similarity_score": row["similarity_score"],
            "resolution_status": row["resolution_status"],
            "created_at": row["created_at"],
            "resolved_at": row["resolved_at"],
        }
