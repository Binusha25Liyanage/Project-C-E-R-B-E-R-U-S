"""
Validates a record's data dict against its schema's field_definitions.

Each field definition looks like:
{
    "name": "customer_id",       # key in the data dict
    "label": "Customer ID",      # shown in the UI
    "type": "text" | "number" | "date" | "dropdown" | "boolean",
    "required": true/false,
    "options": ["A", "B"],       # only for dropdown
    "pattern": "^[0-9]{10}$"     # optional regex, only for text
}

Returns (is_valid: bool, errors: dict[field_name -> message], cleaned_data: dict)
Pydantic handles type coercion; regex/dropdown membership are checked separately
since they're per-field business rules rather than base types.
"""

import re
import datetime
from typing import Optional, Any
from pydantic import create_model, ValidationError

_TYPE_MAP = {
    "text": str,
    "number": float,
    "date": str,  # kept as ISO string; validated with a regex/parse check below
    "dropdown": str,
    "boolean": bool,
}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _build_model(field_defs):
    fields = {}
    for f in field_defs:
        py_type = _TYPE_MAP.get(f["type"], str)
        if f.get("required"):
            fields[f["name"]] = (py_type, ...)
        else:
            fields[f["name"]] = (Optional[py_type], None)
    return create_model("DynamicRecord", **fields)


def validate_record(field_defs, data):
    errors = {}
    model_cls = _build_model(field_defs)

    # Only pass through keys that are actually defined on the schema
    relevant_data = {f["name"]: data.get(f["name"]) for f in field_defs}

    try:
        instance = model_cls(**relevant_data)
        cleaned = instance.model_dump()
    except ValidationError as e:
        cleaned = dict(relevant_data)
        for err in e.errors():
            field_name = err["loc"][0]
            errors[field_name] = _friendly_message(err)

    # Custom per-field rules that pydantic's base types don't cover
    for f in field_defs:
        name = f["name"]
        if name in errors:
            continue
        value = cleaned.get(name)
        if value in (None, ""):
            continue  # required-ness already handled above

        if f["type"] == "dropdown":
            options = f.get("options", [])
            if options and value not in options:
                errors[name] = f"Must be one of: {', '.join(options)}"

        if f["type"] == "text" and f.get("pattern"):
            if not re.match(f["pattern"], str(value)):
                errors[name] = f"Does not match required format ({f['pattern']})"

        if f["type"] == "date":
            if not _DATE_RE.match(str(value)):
                errors[name] = "Date must be in YYYY-MM-DD format"
            else:
                try:
                    datetime.date.fromisoformat(value)
                except ValueError:
                    errors[name] = "Not a real calendar date"

    return (len(errors) == 0, errors, cleaned)


def _friendly_message(pydantic_error):
    err_type = pydantic_error["type"]
    if err_type == "missing":
        return "This field is required"
    if "float" in err_type or "int" in err_type:
        return "Must be a number"
    if "bool" in err_type:
        return "Must be true or false"
    return pydantic_error.get("msg", "Invalid value")
