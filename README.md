# Cerberus Desktop — Phase 1

Local, offline, single-user data entry app. This is Phase 1 from the build plan:
schema builder, spreadsheet-style grid, validated manual entry, SQLite storage,
audit log, and CSV export. OCR, scraping, dedup, text expansion, and task
tracking are Phases 2 onward.

## Requirements

- Python 3.9+
- Windows: pywebview uses WebView2 (already installed on Windows 10/11by default —
  if not, Microsoft's WebView2 Runtime is a small free download)
- Mac: uses the built-in WebKit, no extra install
- Linux: needs `python3-gi` + `gir1.2-webkit2-4.0` (or `gir1.2-webkit2-4.1`)
  installed via your system package manager — pip alone can't install these

## Setup

```bash
cd cerberus-desktop
pip install -r requirements.txt
python main.py
```

A window should open. Your data lives in a local SQLite file at:
- Windows: `C:\Users\<you>\.cerberus-desktop\cerberus.db`
- Mac/Linux: `~/.cerberus-desktop/cerberus.db`

Delete that file any time to start fresh (there's no reset button yet, that's
coming with the task-tracking module).

## How to use it

1. **Create a schema** — click "+ New Schema", name it (e.g. "Route Sales
   Invoices"), and add fields. Field types: Text, Number, Date, Dropdown,
   Yes/No. Text fields can take an optional regex pattern (e.g. `^0\d{9}$`
   to require a 10-digit phone number starting with 0). Dropdown fields take
   a comma-separated list of allowed values.
2. **Add records** — click "+ Add Record", fill the form. Validation runs
   on save; errors show inline next to the offending field.
3. **Edit/delete** — from the grid, using the row action buttons.
4. **Export CSV** — exports the current schema's records as UTF-8-with-BOM
   CSV, which opens correctly in Excel including non-Latin text (Sinhala,
   etc.) — Excel's default CSV import otherwise mangles non-Latin
   characters without the BOM.

## Project structure

```
cerberus-desktop/
  main.py                  entry point — creates the pywebview window
  requirements.txt
  backend/
    api.py                 the only class exposed to JS (window.pywebview.api.*)
    database.py             SQLite layer: schemas, records, audit_log
    validation.py            schema-driven validation (Pydantic + custom rules)
    export_csv.py            CSV export
  frontend/
    index.html
    css/style.css            design system
    js/app.js                 all frontend logic, no build step
  data/                      local SQLite file lands here in dev
                              (production default is ~/.cerberus-desktop/)
```

## Why it's built this way

- **No REST server.** pywebview's `js_api` bridge lets JS call Python
  functions directly (`window.pywebview.api.save_record(...)`), so there's
  no HTTP layer to run or secure for a single-user local app.
- **`data_json` column instead of per-schema tables.** One `records` table
  handles every schema you create, with the actual field values stored as
  JSON. This means creating a new schema never requires a database
  migration — SQLite's `json_extract` can still query into it later if
  needed (not used yet in Phase 1, but the door's open).
- **Pydantic + custom rules, not one or the other.** Pydantic handles type
  coercion (text/number/date/boolean) cleanly; regex patterns and dropdown
  membership are checked separately since those are business rules, not
  base types.

## What's deliberately not here yet (later phases)

- OCR / image capture (Phase 3)
- Web scraping (Phase 4)
- Fuzzy-match duplicate detection (Phase 2)
- Text expansion snippets (Phase 5)
- Personal batch/task tracking dashboard (Phase 5)
- Word (.docx) export with Sinhala font handling (folds into Phase 3 export work)
- Packaging into a single .exe (Phase 6)

## Known limitation to be aware of

Grid edits happen through the "Edit Record" modal, not inline-in-cell —
this was a deliberate simplification for Phase 1 so validation errors have
a clear place to show. Tabulator does support inline cell editing directly,
and that's a reasonable Phase 2 upgrade once the validation UX is proven out.
