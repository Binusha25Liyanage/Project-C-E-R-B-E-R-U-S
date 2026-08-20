"""
Api is the single class exposed to the frontend as `window.pywebview.api.*`.
Every method here is callable directly from JS. Keep methods thin -
they translate JS calls into calls on Database/validation/export modules.
"""

import os
import webview

from .database import Database
from .validation import validate_record
from .export_csv import export_records_to_csv

APP_DATA_DIR = os.path.join(os.path.expanduser("~"), ".cerberus-desktop")
DB_PATH = os.path.join(APP_DATA_DIR, "cerberus.db")


class Api:
    def __init__(self):
        self.db = Database(DB_PATH)
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
            return {"success": True, "id": new_id}

    def delete_record(self, record_id):
        ok = self.db.delete_record(record_id)
        return {"success": ok}

    def get_audit_log(self, record_id):
        return self.db.get_audit_log(record_id)

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
