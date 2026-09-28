/* core/state.js — shared mutable state + constants. Every screen file reads
   and writes `state` directly (plain global, not a module export - see the
   file:// / CORS note in README for why this project doesn't use ES modules). */

var state = {
  schemas: [],
  tabs: [],              // { id, type, title, icon, schemaId?, bulk?:{...} }
  activeTabId: null,
  tabCounter: 0,
  lastGridTabId: null,     // for "Data Ledger" nav shortcut
  editingSchemaId: null,
  editingRecordId: null,
  editingRecordSchemaId: null,
  fieldRowCounter: 0,
};

var gridInstances = {};    // tabId -> Tabulator instance

var FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "boolean", label: "Yes / No" },
];

var NAV_TITLES = {
  dashboard: "Dashboard",
  schema_editor: "Schema Editor",
  processing_queue: "Processing Queue",
  settings: "Settings",
  about: "About",
  audit_log: "Audit Log",
  duplicates: "Review Queue",
};
