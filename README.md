# Cerberus Desktop

Local, offline, single-user data entry app. Design system sourced from
Stitch AI (see `frontend/css/style.css` header) — "Digital Ledger" /
Tactile-Corporate: Black Mercury sidebar, Paper workspace, Cherry Alloy
accent, rotated stamp badges for status.

## What's built

- **Tab-based multitasking** — like browser tabs, each schema's data grid
  and each bulk import wizard opens in its own tab. A bulk import keeps
  running in the background even if you switch to another tab or close
  the import tab entirely; check it later from Processing Queue.
- **Schema builder** — Text / Number / Date / Dropdown / Yes-No fields,
  optional regex pattern on text fields, chip-style option editor for
  dropdowns.
- **Data grid** — Tabulator-powered, per-schema, with inline search
  (top bar), CSV export, and Edit/Delete per row.
- **Bulk import wizard** — pick a schema, select multiple .xlsx/.csv/.docx
  files at once, map their columns to your schema fields (auto-guessed,
  editable), then import. Every row runs through the same validation as
  manual entry. Per-file results with row-level error messages for
  anything that failed.
- **Core Views (sidebar nav)**:
  - **Dashboard** — schema count, total records, active job count.
  - **Schema Editor** — browse/edit/delete every schema.
  - **Data Ledger** — jumps to your most recently used grid tab.
  - **Processing Queue** — every background job (bulk imports today; OCR
    and scraping will land here in later phases), with live status.
  - **Settings** — where your data lives, storage engine, build info.
- **Background job system** — capped at 2 concurrent jobs on purpose, so
  a tab-based UI can't accidentally choke the machine.

## Requirements

- Python 3.9+
- Windows: pywebview uses WebView2 (present by default on Windows 10/11)
- Mac: uses the built-in WebKit, no extra install
- Linux: needs `python3-gi` + `gir1.2-webkit2-4.0` (or `4.1`) via your
  system package manager — pip alone can't install these

## Setup

```bash
cd cerberus-desktop
pip install -r requirements.txt
python main.py
```

Your data lives in a local SQLite file:
- Windows: `C:\Users\<you>\.cerberus-desktop\cerberus.db`
- Mac/Linux: `~/.cerberus-desktop/cerberus.db`

## Project structure

```
cerberus-desktop/
  main.py                  entry point — creates the pywebview window
  requirements.txt
  backend/
    api.py                  the only class exposed to JS (window.pywebview.api.*)
    database.py               SQLite: schemas, records, audit_log, jobs
    validation.py               schema-driven validation (Pydantic + custom rules)
    export_csv.py                CSV export (UTF-8 BOM, opens correctly with Sinhala in Excel)
    bulk_import.py               reads xlsx/csv/docx, maps columns, validates, imports
    jobs.py                       background job runner (ThreadPoolExecutor, capped at 2)
  frontend/
    index.html
    css/style.css                design system (Stitch-sourced tokens)
    js/app.js                      all frontend logic — tabs, grid, wizard, nav views
    assets/
      brand_mark.png                sidebar logo
      app_icon.ico                   for PyInstaller packaging later (Phase 6)
      icons/                          both logo variants, generated as multi-res .ico
```

## Why it's built this way

- **No REST server.** pywebview's `js_api` bridge lets JS call Python
  functions directly, so there's no HTTP layer to run or secure.
- **`data_json` column instead of per-schema tables.** One `records`
  table handles every schema, so creating a new schema never needs a
  database migration.
- **Jobs are generic, not bulk-import-specific.** The `jobs` table and
  `JobManager` don't know anything about bulk import in particular —
  OCR (Phase 3) and scraping (Phase 4) will submit jobs through the exact
  same mechanism, which is why Processing Queue is already a real,
  useful screen instead of a placeholder.
- **Only one grid Tabulator instance per open tab**, kept alive while the
  tab exists (not rebuilt on every tab switch) — scroll position and sort
  state survive switching away and back.

## Known limitations, stated plainly

- **Field drag-handle in the schema builder is visual only** — the dots
  icon (⋮⋮) suggests reordering, but that's not wired up to actually
  reorder fields yet. Worth flagging so it doesn't look like a bug.
- **The "more options" (⋮) menu from the original Stitch mockups isn't
  implemented** — there wasn't a concrete action for it yet, so it was
  left out rather than shipped as a dead button.
- Grid edits happen through the "Edit Record" modal, not inline-in-cell.

## What's deliberately not here yet (later phases)

- OCR / image capture (Phase 3)
- Web scraping (Phase 4)
- Fuzzy-match duplicate detection
- Text expansion snippets
- Word (.docx) export with Sinhala font handling
- Packaging into a single .exe (Phase 6) — `app_icon.ico` is ready for
  when that happens (`pyinstaller --icon=frontend/assets/app_icon.ico ...`)

## Testing notes

Both the backend (SQLite layer, validation engine, bulk import across
xlsx/csv/docx, background job manager) and the frontend (schema creation,
record save, all four nav views, the full bulk import wizard including
the background poller transitioning a tab to "results" while unfocused)
were exercised end-to-end during development — the backend via direct
Python calls, the frontend via a headless jsdom simulation with a mocked
`pywebview.api`. Neither replaces actually clicking through it yourself,
since pywebview's real WebView2/WebKit rendering can't be tested from
this environment — but the underlying logic has been verified to work.
