# Cerberus Desktop

Local, offline, single-user data entry app. Ledger-themed design (Black
Mercury sidebar, Paper workspace, Cherry Alloy accent, rotated stamp
badges for status).

## ⚠️ Before you run this: copy your assets folder in

This zip does **not** include `frontend/assets/` (the logo images and
`.ico` files). Those are binary files from an earlier build step and
weren't regenerated this round. **Copy your existing
`frontend/assets/` folder** (from your current local project) into this
new `frontend/` folder before running — nothing in it needs to change,
the code references the same filenames as before:
- `frontend/assets/brand_mark.png`
- `frontend/assets/app_icon.ico`
- `frontend/assets/icons/cerberus_ember_logo.png`
- `frontend/assets/icons/cerberus_heraldic_logo.png` (+ their `.ico` versions)

## What's built

- **Tab-based multitasking** — browser-style tabs; a bulk import keeps
  running in the background even if you switch tabs or close the tab.
- **Schema builder** — Text / Number / Date / Dropdown / Yes-No fields,
  regex patterns, chip-style dropdown options.
- **Data grid** — Tabulator-powered, per-schema, inline search, CSV
  export (UTF-8 BOM, so Sinhala text opens correctly in Excel), and now
  a **History** button per row.
- **Bulk import wizard** — multi-file xlsx/csv/docx import with column
  mapping and per-row validation results.
- **Audit Log** *(new this round)* — every create/update/delete is
  recorded and taggeed with its schema at write time (so history survives
  even if the record is later deleted). A global "Audit Log" nav view
  shows recent changes across every schema; a "History" button on each
  grid row shows just that record's trail.
- **Duplicate Review Queue** *(new this round)* — RapidFuzz-based fuzzy
  matching runs automatically whenever you save a new record, comparing
  it against existing records in the same schema. A schema-wide "Scan for
  Duplicates" button is also available from the grid toolbar or the
  Review Queue itself. **Nothing is ever auto-merged** — every match is a
  flag waiting for a human decision: "Keep This One" (merges, deleting
  the other) or "Not a Duplicate" (dismisses the flag permanently, so the
  same pair won't be re-flagged by a future scan).
- **Core Views (sidebar nav)**: Dashboard, Schema Editor, Data Ledger,
  Processing Queue, **Audit Log**, **Review Queue**, Settings.
- **Background job system** — capped at 2 concurrent jobs.

## File structure (one file per screen, on purpose)

```
cerberus-desktop/
  main.py
  requirements.txt
  backend/
    api.py              the only class exposed to JS (window.pywebview.api.*)
    database.py           SQLite: schemas, records, audit_log, jobs, duplicate_flags
    validation.py           schema-driven validation (Pydantic + custom rules)
    export_csv.py             CSV export (UTF-8 BOM)
    bulk_import.py             reads xlsx/csv/docx, maps columns, validates, imports
    jobs.py                     background job runner (capped at 2 workers)
    dedup.py                     RapidFuzz-based fuzzy duplicate matching
  frontend/
    index.html
    css/style.css                design system
    assets/                       ← you copy this in, see above
    js/
      core/
        utils.js                   escapeHtml, toast, modal helpers
        state.js                    shared state object + constants
        sidebar.js                   schema list, "new tab" menu population
        tabs.js                       tab bar plumbing (open/close/activate)
      screens/
        grid.js                       data grid + record entry modal
        schema_editor.js                schema builder + Schema Editor view
        bulk_import.js                   bulk import wizard
        dashboard.js
        processing_queue.js
        settings.js
        about.js
        audit_log.js                      ← new
        duplicates.js                      ← new
      app.js                                bootstrap: binds nav clicks, starts polling
```

**Why plain `<script>` tags instead of ES modules (`import`/`export`):**
pywebview loads this HTML over the `file://` protocol, and Chromium-based
engines (which WebView2 is) block `type="module"` scripts under `file://`
due to CORS restrictions. So every screen file is a classic script,
loaded in dependency order, sharing the global scope — the same reason
`state`, `gridInstances`, `FIELD_TYPES`, etc. are declared with `var`
rather than `let`/`const` at the top level: it's what reliably works
across separate `<script>` tags in every engine, without depending on a
subtler spec detail (top-level `let`/`const` *are* technically visible
across sequential classic scripts in real browsers, but relying on that
felt like asking for a cross-engine surprise later).

## Setup

```bash
cd cerberus-desktop
pip install -r requirements.txt
python main.py
```

Data lives in `~/.cerberus-desktop/cerberus.db` (SQLite).

## Known limitations, stated plainly

- Field drag-handle in the schema builder is visual only, not wired to
  actually reorder fields.
- Duplicate detection compares text/dropdown field values only — number,
  date, and boolean fields aren't part of the similarity check (they're
  too coarse-grained to fuzzy-match meaningfully).
- Duplicate scanning is O(n²) per schema — fine at the record counts a
  single-user local tool deals with, not built to scale to huge tables.
- The app still loads Google Fonts and Tabulator.js from a CDN despite
  claiming "offline" in the sidebar — this was flagged earlier and not
  yet fixed.

## What's deliberately not here yet

- OCR / image capture (Phase 3)
- Web scraping (Phase 4)
- Text expansion snippets
- Word (.docx) export with Sinhala font handling
- Packaging into a single .exe

## Testing notes

Backend: full integration test covering schema/record CRUD, auto-dedup
on save, manual scan, both resolution paths (merge / not_duplicate,
including confirming a dismissed pair is never re-flagged), and audit
log correctness — all run directly through the `Api` class, not mocked.

Frontend: headless jsdom simulation with a mocked `pywebview.api`,
exercising schema creation, record save, the full duplicate review flow
(flag → Review Queue renders → "Keep This One" click → record actually
deleted), the Audit Log tab, and the per-record history modal.

One real bug was caught and fixed during this testing pass: duplicate
flags dismissed as "not a duplicate" were being re-flagged on every
subsequent scan, because the flag-exists check only looked at *pending*
flags rather than any prior flag for that pair.
