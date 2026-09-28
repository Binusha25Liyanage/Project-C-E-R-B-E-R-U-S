"""
Api is the single class exposed to the frontend as `window.pywebview.api.*`.
"""

import os
import webview

from .database import Database
from .validation import validate_record
from .export_csv import export_records_to_csv
from .jobs import JobManager
from . import bulk_import
from . import dedup

APP_DATA_DIR = os.path.join(os.path.expanduser("~"), ".cerberus-desktop")
DB_PATH = os.path.join(APP_DATA_DIR, "cerberus.db")


class Api:
    def __init__(self):
        self.db = Database(DB_PATH)
        self.jobs = JobManager(self.db)
        self.window = None  # set by main.py after window creation (needed for file dialogs)

    # ---------------- Schemas ----------------

    def list_schemas(self):
        return self.db.list_schemas()

    def create_schema(self, name, fields):
        if not name or not name.strip():
            return {"error": "Schema name cannot be empty"}
        if not fields:
            return {"error": "Schema needs at least one field"}
        names_seen = set()
        for f in fields:
            if not f.get("name"):
                return {"error": "Every field needs an internal name"}
            if f["name"] in names_seen:
                return {"error": f"Duplicate field name: {f['name']}"}
            names_seen.add(f["name"])
        schema_id = self.db.create_schema(name.strip(), fields)
        return {"id": schema_id}

    def update_schema(self, schema_id, name=None, fields=None):
        ok = self.db.update_schema(schema_id, name=name, field_definitions=fields)
        return {"success": ok}

    def delete_schema(self, schema_id):
        ok = self.db.delete_schema(schema_id)
        return {"success": ok}

    # ---------------- Records ----------------

    def list_records(self, schema_id):
        return self.db.list_records(schema_id)

    def validate_only(self, schema_id, data):
        schema = self.db.get_schema(schema_id)
        if not schema:
            return {"valid": False, "errors": {"_schema": "Schema not found"}}
        is_valid, errors, cleaned = validate_record(schema["fields"], data)
        return {"valid": is_valid, "errors": errors, "cleaned": cleaned}

    def save_record(self, schema_id, data, record_id=None, source="manual"):
        schema = self.db.get_schema(schema_id)
        if not schema:
            return {"success": False, "errors": {"_schema": "Schema not found"}}

        is_valid, errors, cleaned = validate_record(schema["fields"], data)
        if not is_valid:
            return {"success": False, "errors": errors}

        if record_id:
            self.db.update_record(record_id, data=cleaned)
            return {"success": True, "id": record_id}
        else:
            new_id = self.db.create_record(schema_id, cleaned, source=source)
            self._check_duplicates_for_new_record(schema, new_id, cleaned)
            return {"success": True, "id": new_id}

    def delete_record(self, record_id):
        ok = self.db.delete_record(record_id)
        return {"success": ok}

    # ---------------- Export ----------------

    def export_csv(self, schema_id):
        schema = self.db.get_schema(schema_id)
        if not schema:
            return {"error": "Schema not found"}
        records = self.db.list_records(schema_id)

        default_filename = f"{schema['name'].replace(' ', '_')}.csv"
        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG, save_filename=default_filename
        )
        if not result:
            return {"cancelled": True}

        out_path = result if isinstance(result, str) else result[0]
        export_records_to_csv(schema["fields"], records, out_path)
        return {"success": True, "path": out_path}

    # ---------------- Bulk import ----------------

    def pick_files_for_import(self):
        file_types = ("Data files (*.xlsx;*.xlsm;*.csv;*.docx)", "All files (*.*)")
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types
        )
        if not result:
            return {"files": []}
        return {"files": list(result)}

    def get_file_columns(self, file_path):
        try:
            columns = bulk_import.read_file_columns(file_path)
            return {"columns": columns}
        except Exception as e:
            return {"error": str(e)}

    def start_bulk_import(self, schema_id, file_paths, column_mapping, batch_label=None):
        schema = self.db.get_schema(schema_id)
        if not schema:
            return {"error": "Schema not found"}
        if not file_paths:
            return {"error": "No files selected"}

        label = batch_label or f"Bulk import ({len(file_paths)} file{'s' if len(file_paths) != 1 else ''})"

        def target_fn(job_id, progress_cb, schema, file_paths, column_mapping, label):
            def wrapped_progress(file_i, total_files, current_file, rows_done, rows_total):
                progress_cb({
                    "file_index": file_i, "total_files": total_files, "current_file": current_file,
                    "rows_done": rows_done, "rows_total": rows_total,
                })
            return bulk_import.run_bulk_import(
                self.db, job_id, schema, file_paths, column_mapping, label, wrapped_progress
            )

        job_id = self.jobs.submit(
            "bulk_import", target_fn, schema_id=schema_id, title=label,
            args=(schema, file_paths, column_mapping, label),
        )
        return {"job_id": job_id}

    def get_job(self, job_id):
        return self.db.get_job(job_id)

    def list_jobs(self, active_only=False):
        return self.db.list_jobs(active_only=active_only)

    # ---------------- Audit log ----------------

    def get_audit_log(self, record_id):
        return self.db.get_audit_log(record_id)

    def get_recent_audit_log(self, limit=100, schema_id=None):
        return self.db.list_recent_audit_log(limit=limit, schema_id=schema_id)

    # ---------------- Duplicate detection / review queue ----------------

    def _check_duplicates_for_new_record(self, schema, new_record_id, cleaned_data):
        """Runs automatically after a manual save. Flags are advisory only —
        the record is already saved regardless of what this finds."""
        other_records = [r for r in self.db.list_records(schema["id"]) if r["id"] != new_record_id]
        matches = dedup.find_duplicates_for_record(schema["fields"], new_record_id, cleaned_data, other_records)
        for m in matches:
            if not self.db.flag_exists(schema["id"], new_record_id, m["matched_record_id"]):
                self.db.create_duplicate_flag(
                    schema["id"], new_record_id, m["matched_record_id"], m["similarity_score"]
                )

    def scan_duplicates(self, schema_id):
        schema = self.db.get_schema(schema_id)
        if not schema:
            return {"error": "Schema not found"}
        records = self.db.list_records(schema_id)
        pairs = dedup.scan_schema_for_duplicates(schema["fields"], records)
        new_flags = 0
        for p in pairs:
            if not self.db.flag_exists(schema_id, p["record_id"], p["matched_record_id"]):
                self.db.create_duplicate_flag(schema_id, p["record_id"], p["matched_record_id"], p["similarity_score"])
                new_flags += 1
        return {"pairs_found": len(pairs), "new_flags": new_flags}

    def list_duplicate_flags(self, schema_id, status="pending"):
        flags = self.db.list_duplicate_flags(schema_id, status=status)
        # Attach a light snapshot of both records so the UI doesn't need N+1 calls
        for flag in flags:
            r1 = self.db.get_record(flag["record_id"])
            r2 = self.db.get_record(flag["matched_record_id"])
            flag["record"] = r1
            flag["matched_record"] = r2
        return flags

    def count_pending_duplicate_flags(self, schema_id=None):
        return self.db.count_pending_flags(schema_id=schema_id)

    def resolve_duplicate_flag(self, flag_id, resolution, keep_record_id=None):
        """
        resolution: 'not_duplicate' (keep both, dismiss the flag) or
                    'merge' (delete the record that ISN'T keep_record_id).
        """
        flag = self.db.get_duplicate_flag(flag_id)
        if not flag:
            return {"success": False, "error": "Flag not found"}

        if resolution == "merge":
            if keep_record_id is None:
                return {"success": False, "error": "keep_record_id required for merge"}
            other_id = flag["matched_record_id"] if keep_record_id == flag["record_id"] else flag["record_id"]
            self.db.delete_record(other_id)

        self.db.resolve_duplicate_flag(flag_id, resolution)
        return {"success": True}
