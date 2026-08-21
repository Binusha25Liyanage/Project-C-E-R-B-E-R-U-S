/* Cerberus Desktop — frontend logic.
   Talks to Python only through window.pywebview.api.* (see backend/api.py).
   No build step: plain JS + Tabulator.js for the grid. */

var state = {
  schemas: [],
  tabs: [],            // { id, type, title, icon, schemaId?, bulk?:{...} }
  activeTabId: null,
  tabCounter: 0,
  lastGridTabId: null,  // for "Data Ledger" nav shortcut
};

var gridInstances = {};   // tabId -> Tabulator instance
var pollTimer = null;

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "boolean", label: "Yes / No" },
];

const NAV_TITLES = {
  dashboard: "Dashboard",
  schema_editor: "Schema Editor",
  processing_queue: "Processing Queue",
  settings: "Settings",
};

// ---------------- Boot ----------------

window.addEventListener("pywebviewready", init);
if (!window.pywebview) {
  document.addEventListener("DOMContentLoaded", () => {
    console.warn("pywebview API not found — this page must run inside the desktop app.");
  });
}

async function init() {
  bindGlobalEvents();
  await loadSchemas();
  pollTimer = setInterval(pollJobs, 1200);
  await refreshJobBadge();
}

function bindGlobalEvents() {
  document.getElementById("btn-new-schema").onclick = () => openSchemaModal(null);
  document.getElementById("btn-add-field").onclick = () => addFieldRow();
  document.getElementById("btn-save-schema").onclick = saveSchema;
  document.getElementById("btn-save-record").onclick = saveRecord;

  document.getElementById("btn-browse-archives").onclick = () => openSchemaEditorTab();
  document.getElementById("btn-empty-bulk-import").onclick = () => openBulkImportTab(null);

  document.getElementById("btn-new-tab").onclick = (e) => {
    e.stopPropagation();
    toggleTabNewMenu();
  };
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("tab-new-menu");
    if (menu.style.display !== "none" && !menu.contains(e.target) && e.target.id !== "btn-new-tab") {
      menu.style.display = "none";
    }
  });
  document.querySelector('[data-new-tab="bulk_import"]').onclick = () => {
    document.getElementById("tab-new-menu").style.display = "none";
    openBulkImportTab(null);
  };

  document.querySelectorAll(".modal-close, [data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.style.display = "none";
    });
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => handleNavClick(item.dataset.view));
  });

  document.getElementById("btn-refresh").onclick = () => refreshActiveTab();
  document.getElementById("topbar-search-input").addEventListener("input", (e) => applySearchFilter(e.target.value));
}

function handleNavClick(view) {
  if (view === "dashboard") openDashboardTab();
  else if (view === "schema_editor") openSchemaEditorTab();
  else if (view === "data_ledger") openDataLedgerDefault();
  else if (view === "processing_queue") openProcessingQueueTab();
  else if (view === "settings") openSettingsTab();
}

function toggleTabNewMenu() {
  const menu = document.getElementById("tab-new-menu");
  const isOpen = menu.style.display !== "none";
  if (isOpen) { menu.style.display = "none"; return; }
  renderTabNewMenuSchemas();
  menu.style.display = "block";
}

function renderTabNewMenuSchemas() {
  const wrap = document.getElementById("tab-new-menu-schemas");
  if (!state.schemas.length) {
    wrap.innerHTML = `<div style="padding:8px; font-size:12px; color:var(--ink-text-mute);">No schemas yet — create one from the sidebar.</div>`;
    return;
  }
  wrap.innerHTML = state.schemas
    .map((s) => `<button class="tab-menu-item" data-open-schema="${s.id}"><span>📄 ${escapeHtml(s.name)}</span></button>`)
    .join("");
  wrap.querySelectorAll("[data-open-schema]").forEach((btn) => {
    btn.onclick = () => {
      document.getElementById("tab-new-menu").style.display = "none";
      openGridTab(parseInt(btn.dataset.openSchema, 10));
    };
  });
}

// ---------------- Schemas ----------------

async function loadSchemas() {
  state.schemas = await window.pywebview.api.list_schemas();
  renderSchemaList();
}

function renderSchemaList() {
  const list = document.getElementById("schema-list");
  if (!state.schemas.length) {
    list.innerHTML = `<div class="schema-list-empty">No schemas yet. Create one to start entering data.</div>`;
    return;
  }
  list.innerHTML = "";
  state.schemas.forEach((s) => {
    const isActiveTab = state.tabs.some((t) => t.id === state.activeTabId && t.type === "grid" && t.schemaId === s.id);
    const el = document.createElement("div");
    el.className = "schema-item" + (isActiveTab ? " active" : "");
    el.innerHTML = `<span class="schema-item-icon">📄</span><span>${escapeHtml(s.name)}</span><span class="schema-item-count">${s.fields.length}f</span>`;
    el.onclick = () => openGridTab(s.id);
    list.appendChild(el);
  });
}

function openSchemaModal(existingSchema) {
  state.editingSchemaId = existingSchema ? existingSchema.id : null;
  document.getElementById("schema-modal-title").textContent = existingSchema ? "Edit Schema" : "New Schema";
  document.getElementById("schema-name-input").value = existingSchema ? existingSchema.name : "";
  document.getElementById("schema-error").textContent = "";
  document.getElementById("field-list").innerHTML = "";
  state.fieldRowCounter = 0;

  if (existingSchema) {
    existingSchema.fields.forEach((f) => addFieldRow(f));
  } else {
    addFieldRow();
  }
  document.getElementById("schema-modal").style.display = "flex";
}

function addFieldRow(field) {
  const rowId = "field-row-" + state.fieldRowCounter++;
  const wrap = document.createElement("div");
  wrap.className = "field-row";
  wrap.id = rowId;
  wrap.innerHTML = `
    <div class="field-row-main">
      <span class="field-drag-handle" title="Reorder (visual only for now)">⋮⋮</span>
      <input type="text" class="f-name" placeholder="Field name (e.g. customer_name)" value="${field ? escapeAttr(field.name) : ""}" />
      <select class="f-type">
        ${FIELD_TYPES.map((t) => `<option value="${t.value}" ${field && field.type === t.value ? "selected" : ""}>${t.label}</option>`).join("")}
      </select>
      <label class="field-required-label"><input type="checkbox" class="f-required" ${field && field.required ? "checked" : ""}/> Req</label>
      <button class="field-remove" title="Remove field">&times;</button>
    </div>
    <div class="field-row-extra" data-role="dropdown-extra">
      <label class="field-label" style="margin-top:8px;">Options</label>
      <div class="chip-input-wrap" data-role="chip-wrap">
        <input type="text" class="chip-add-input" placeholder="Type an option, press Enter" />
      </div>
    </div>
    <div class="field-row-extra" data-role="text-extra">
      <input type="text" class="f-pattern" placeholder="Optional regex pattern (e.g. ^0\\d{9}$ for a phone number)" value="${field && field.pattern ? escapeAttr(field.pattern) : ""}" />
    </div>
  `;
  document.getElementById("field-list").appendChild(wrap);

  wrap._options = field && field.options ? [...field.options] : [];

  const typeSelect = wrap.querySelector(".f-type");
  const dropdownExtra = wrap.querySelector('[data-role="dropdown-extra"]');
  const textExtra = wrap.querySelector('[data-role="text-extra"]');
  const syncExtraVisibility = () => {
    dropdownExtra.classList.toggle("show", typeSelect.value === "dropdown");
    textExtra.classList.toggle("show", typeSelect.value === "text");
  };
  typeSelect.addEventListener("change", syncExtraVisibility);
  syncExtraVisibility();

  renderChips(wrap);
  const chipInput = wrap.querySelector(".chip-add-input");
  chipInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = chipInput.value.trim().replace(/,$/, "");
      if (val && !wrap._options.includes(val)) {
        wrap._options.push(val);
        renderChips(wrap);
      }
      chipInput.value = "";
    }
  });

  wrap.querySelector(".field-remove").onclick = () => wrap.remove();
}

function renderChips(wrap) {
  const chipWrap = wrap.querySelector('[data-role="chip-wrap"]');
  const input = chipWrap.querySelector(".chip-add-input");
  chipWrap.querySelectorAll(".option-chip").forEach((c) => c.remove());
  wrap._options.forEach((opt, idx) => {
    const chip = document.createElement("span");
    chip.className = "option-chip";
    chip.innerHTML = `${escapeHtml(opt)} <button type="button">&times;</button>`;
    chip.querySelector("button").onclick = () => {
      wrap._options.splice(idx, 1);
      renderChips(wrap);
    };
    chipWrap.insertBefore(chip, input);
  });
}

function collectFieldsFromBuilder() {
  const rows = document.querySelectorAll("#field-list .field-row");
  const fields = [];
  rows.forEach((row) => {
    const name = row.querySelector(".f-name").value.trim();
    if (!name) return;
    const type = row.querySelector(".f-type").value;
    const required = row.querySelector(".f-required").checked;
    const field = { name, label: name, type, required };
    if (type === "dropdown") field.options = [...(row._options || [])];
    if (type === "text") {
      const pattern = row.querySelector(".f-pattern").value.trim();
      if (pattern) field.pattern = pattern;
    }
    fields.push(field);
  });
  return fields;
}

async function saveSchema() {
  const name = document.getElementById("schema-name-input").value.trim();
  const fields = collectFieldsFromBuilder();
  const errorEl = document.getElementById("schema-error");
  errorEl.textContent = "";

  if (!name) { errorEl.textContent = "Schema name is required."; return; }
  if (!fields.length) { errorEl.textContent = "Add at least one field."; return; }

  let result;
  if (state.editingSchemaId) {
    result = await window.pywebview.api.update_schema(state.editingSchemaId, name, fields);
    if (!result.success) { errorEl.textContent = "Could not update schema."; return; }
  } else {
    result = await window.pywebview.api.create_schema(name, fields);
    if (result.error) { errorEl.textContent = result.error; return; }
  }

  closeModal("schema-modal");
  const targetId = state.editingSchemaId || result.id;
  await loadSchemas();
  openGridTab(targetId);
  showToast("Schema saved", "success");

  const editorTab = state.tabs.find((t) => t.type === "schema_editor");
  if (editorTab) renderSchemaEditorPane(editorTab);
}

async function deleteSchemaFromEditor(schemaId) {
  if (!confirm("Delete this schema and all its records? This cannot be undone.")) return;
  await window.pywebview.api.delete_schema(schemaId);
  const gridTab = state.tabs.find((t) => t.type === "grid" && t.schemaId === schemaId);
  if (gridTab) closeTab(gridTab.id);
  await loadSchemas();
  const editorTab = state.tabs.find((t) => t.type === "schema_editor");
  if (editorTab) renderSchemaEditorPane(editorTab);
  showToast("Schema deleted", "success");
}

// ---------------- Tabs: core plumbing ----------------

function renderTabBar() {
  const strip = document.getElementById("tab-strip");
  strip.innerHTML = "";
  state.tabs.forEach((tab) => {
    const chip = document.createElement("div");
    chip.className = "tab-chip" + (tab.id === state.activeTabId ? " active" : "");
    let dotHtml = "";
    if (tab.type === "bulk_import" && tab.bulk && tab.bulk.jobId) {
      const cls = tab.bulk.step === "results" ? "done" : tab.bulk.step === "error" ? "error" : "";
      dotHtml = `<span class="tab-job-dot ${cls}"></span>`;
    }
    chip.innerHTML = `<span class="tab-icon">${tab.icon || ""}</span><span>${escapeHtml(tab.title)}</span>${dotHtml}<button class="tab-close" data-tab-id="${tab.id}">&times;</button>`;
    chip.addEventListener("click", (e) => {
      if (e.target.classList.contains("tab-close")) { closeTab(tab.id); return; }
      activateTab(tab.id);
    });
    strip.appendChild(chip);
  });
  document.getElementById("empty-state").style.display = state.tabs.length ? "none" : "flex";
}

function activateTab(tabId) {
  state.activeTabId = tabId;
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  const pane = document.getElementById("pane-" + tabId);
  if (pane) pane.classList.add("active");
  renderTabBar();
  renderSchemaList();
  updateNavActiveState();

  const tab = state.tabs.find((t) => t.id === tabId);
  document.getElementById("topbar-title").textContent = tab ? (NAV_TITLES[tab.type] || "Cerberus Ledger") : "Cerberus Ledger";
  document.getElementById("topbar-search-input").value = "";
  document.getElementById("topbar-search-input").style.display = tab && tab.type === "grid" ? "block" : "none";

  if (tab && tab.type === "grid") state.lastGridTabId = tab.id;
}

function updateNavActiveState() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", !!tab && item.dataset.view === tab.type);
  });
}

function closeTab(tabId) {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const tab = state.tabs[idx];

  if (tab.type === "bulk_import" && tab.bulk && tab.bulk.step === "importing") {
    showToast("Import continues in the background — check Processing Queue", "success");
  }

  const pane = document.getElementById("pane-" + tabId);
  if (pane) pane.remove();
  delete gridInstances[tabId];
  state.tabs.splice(idx, 1);

  if (state.activeTabId === tabId) {
    const next = state.tabs[idx] || state.tabs[idx - 1];
    if (next) activateTab(next.id);
    else { state.activeTabId = null; renderTabBar(); updateNavActiveState(); document.getElementById("topbar-title").textContent = "Cerberus Ledger"; }
  } else {
    renderTabBar();
  }
}

function createPane(tab) {
  const pane = document.createElement("div");
  pane.className = "tab-pane";
  pane.id = "pane-" + tab.id;
  document.getElementById("tab-content").appendChild(pane);
  return pane;
}

function ensureSingletonTab(type, title, icon) {
  const existing = state.tabs.find((t) => t.type === type);
  if (existing) { activateTab(existing.id); return existing; }
  const tab = { id: "tab-" + (++state.tabCounter), type, title, icon };
  state.tabs.push(tab);
  createPane(tab);
  renderTabBar();
  activateTab(tab.id);
  return tab;
}

// ---------------- Grid tabs ----------------

function openGridTab(schemaId) {
  const existing = state.tabs.find((t) => t.type === "grid" && t.schemaId === schemaId);
  if (existing) { activateTab(existing.id); return; }
  const schema = state.schemas.find((s) => s.id === schemaId);
  if (!schema) return;

  const tab = { id: "tab-" + (++state.tabCounter), type: "grid", schemaId, title: schema.name, icon: "📄" };
  state.tabs.push(tab);
  const pane = createPane(tab);
  pane.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-title"><h1>${escapeHtml(schema.name)}</h1><span class="record-count" id="count-${tab.id}"></span></div>
      <div class="toolbar-actions">
        <button class="btn btn-outline" data-act="edit-schema">Edit Fields</button>
        <button class="btn btn-outline" data-act="export-csv">Export CSV</button>
        <button class="btn btn-accent" data-act="add-record">+ Add Record</button>
      </div>
    </div>
    <div class="grid-wrap"><div id="grid-inner-${tab.id}"></div></div>
  `;
  pane.querySelector('[data-act="edit-schema"]').onclick = () => openSchemaModal(state.schemas.find((s) => s.id === schemaId));
  pane.querySelector('[data-act="export-csv"]').onclick = () => exportCsv(schemaId);
  pane.querySelector('[data-act="add-record"]').onclick = () => openRecordModal(schemaId, null);

  renderTabBar();
  activateTab(tab.id);
  loadRecordsForGridTab(tab);
}

async function loadRecordsForGridTab(tab) {
  const schema = state.schemas.find((s) => s.id === tab.schemaId);
  const records = await window.pywebview.api.list_records(tab.schemaId);
  const countEl = document.getElementById("count-" + tab.id);
  if (countEl) countEl.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
  initOrUpdateGrid(tab, schema, records);
}

function initOrUpdateGrid(tab, schema, records) {
  const columns = schema.fields.map((f) => ({
    title: f.label || f.name,
    field: f.name,
    formatter: f.type === "boolean" ? (cell) => (cell.getValue() ? "Yes" : "No") : undefined,
  }));

  columns.push({
    title: "Status",
    field: "status",
    width: 140,
    formatter: (cell) => {
      const status = cell.getValue() || "pending";
      return `<span class="stamp-badge stamp-${status}">${status.replace(/_/g, " ")}</span>`;
    },
  });

  columns.push({
    title: "Actions",
    field: "_actions",
    width: 110,
    hozAlign: "right",
    headerSort: false,
    formatter: () => `<div class="row-actions"><button class="btn btn-small edit-btn">Edit</button><button class="btn btn-small btn-danger del-btn">Del</button></div>`,
    cellClick: (e, cell) => {
      const rowData = cell.getRow().getData();
      if (e.target.classList.contains("edit-btn")) openRecordModal(tab.schemaId, rowData);
      if (e.target.classList.contains("del-btn")) deleteRecord(tab, rowData.id);
    },
  });

  const tableData = records.map((r) => ({ id: r.id, status: r.status, ...r.data }));

  if (gridInstances[tab.id]) {
    gridInstances[tab.id].setColumns(columns);
    gridInstances[tab.id].setData(tableData);
  } else {
    gridInstances[tab.id] = new Tabulator("#grid-inner-" + tab.id, {
      data: tableData,
      columns,
      layout: "fitDataStretch",
      height: "100%",
      placeholder: "No records yet — click \"+ Add Record\" to enter your first one.",
    });
  }
}

function openRecordModal(schemaId, record) {
  const schema = state.schemas.find((s) => s.id === schemaId);
  state.editingRecordSchemaId = schemaId;
  state.editingRecordId = record ? record.id : null;
  document.getElementById("record-modal-title").textContent = record ? "Edit Record" : "New Record";
  document.getElementById("record-error").textContent = "";
  renderRecordForm(schema, record);
  document.getElementById("record-modal").style.display = "flex";
}

function renderRecordForm(schema, record) {
  const container = document.getElementById("record-form");
  container.innerHTML = "";
  schema.fields.forEach((f) => {
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = f.label + (f.required ? " *" : "");
    container.appendChild(label);

    const existingValue = record ? record[f.name] ?? (record.data ? record.data[f.name] : undefined) : "";
    let input;

    if (f.type === "dropdown") {
      input = document.createElement("select");
      input.className = "select-input";
      input.innerHTML = `<option value="">-- select --</option>` +
        (f.options || []).map((o) => `<option value="${escapeAttr(o)}" ${existingValue === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("");
    } else if (f.type === "boolean") {
      input = document.createElement("select");
      input.className = "select-input";
      input.innerHTML = `
        <option value="">-- select --</option>
        <option value="true" ${existingValue === true ? "selected" : ""}>Yes</option>
        <option value="false" ${existingValue === false ? "selected" : ""}>No</option>`;
    } else {
      input = document.createElement("input");
      input.className = "text-input";
      input.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
      if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    }
    input.dataset.fieldName = f.name;
    input.dataset.fieldType = f.type;
    container.appendChild(input);

    const errEl = document.createElement("div");
    errEl.className = "record-field-error";
    errEl.dataset.errorFor = f.name;
    container.appendChild(errEl);
  });
}

function readRecordFormData() {
  const inputs = document.querySelectorAll("#record-form [data-field-name]");
  const data = {};
  inputs.forEach((input) => {
    const name = input.dataset.fieldName;
    const type = input.dataset.fieldType;
    let value = input.value;
    if (type === "boolean") value = value === "" ? null : value === "true";
    if (value === "") value = null;
    data[name] = value;
  });
  return data;
}

async function saveRecord() {
  document.querySelectorAll(".record-field-error").forEach((el) => (el.textContent = ""));
  document.getElementById("record-error").textContent = "";

  const data = readRecordFormData();
  const result = await window.pywebview.api.save_record(state.editingRecordSchemaId, data, state.editingRecordId);

  if (!result.success) {
    Object.entries(result.errors || {}).forEach(([field, msg]) => {
      const el = document.querySelector(`[data-error-for="${field}"]`);
      if (el) el.textContent = msg;
      else document.getElementById("record-error").textContent = msg;
    });
    return;
  }

  closeModal("record-modal");
  const tab = state.tabs.find((t) => t.type === "grid" && t.schemaId === state.editingRecordSchemaId);
  if (tab) loadRecordsForGridTab(tab);
  showToast("Record saved", "success");
}

async function deleteRecord(tab, recordId) {
  if (!confirm("Delete this record? This cannot be undone.")) return;
  await window.pywebview.api.delete_record(recordId);
  loadRecordsForGridTab(tab);
  showToast("Record deleted", "success");
}

async function exportCsv(schemaId) {
  const result = await window.pywebview.api.export_csv(schemaId);
  if (result.cancelled) return;
  if (result.error) { showToast(result.error, "error"); return; }
  showToast(`Exported to ${result.path}`, "success");
}

// ---------------- Bulk Import wizard tabs ----------------

function openBulkImportTab(schemaId) {
  const tab = {
    id: "tab-" + (++state.tabCounter),
    type: "bulk_import",
    title: "Bulk Import",
    icon: "📥",
    bulk: { step: schemaId ? "pick_files" : "pick_schema", schemaId, filePaths: [], columns: [], mapping: {}, jobId: null, result: null, error: null },
  };
  state.tabs.push(tab);
  createPane(tab);
  renderTabBar();
  activateTab(tab.id);
  renderBulkStep(tab);
}

function bulkStepIndex(step) {
  return { pick_schema: 1, pick_files: 2, map_columns: 3, importing: 4, results: 5, error: 5 }[step] || 1;
}

function renderBulkStep(tab) {
  const pane = document.getElementById("pane-" + tab.id);
  const b = tab.bulk;
  const stepLabel = `<div class="bulk-step-progress">STEP ${bulkStepIndex(b.step)} OF 5</div>`;

  if (b.step === "pick_schema") {
    pane.innerHTML = `<div class="bulk-import-view"><div class="bulk-step">
      ${stepLabel}
      <h3>Pick a target schema</h3>
      <p class="hint">Choose which schema these files' rows will be imported into. Every file in this batch should share the same column structure.</p>
      <div class="schema-card-grid" id="bulk-schema-pick"></div>
    </div></div>`;
    const grid = pane.querySelector("#bulk-schema-pick");
    if (!state.schemas.length) {
      grid.innerHTML = `<p class="hint">No schemas yet — create one first from the sidebar.</p>`;
    }
    state.schemas.forEach((s) => {
      const card = document.createElement("div");
      card.className = "schema-card";
      card.style.cursor = "pointer";
      card.innerHTML = `<h3>${escapeHtml(s.name)}</h3><div class="schema-card-meta">${s.fields.length} fields</div>`;
      card.onclick = () => { b.schemaId = s.id; b.step = "pick_files"; renderBulkStep(tab); };
      grid.appendChild(card);
    });
    return;
  }

  const schema = state.schemas.find((s) => s.id === b.schemaId);
  tab.title = "Import: " + schema.name;
  renderTabBar();

  if (b.step === "pick_files") {
    pane.innerHTML = `<div class="bulk-import-view"><div class="bulk-step">
      ${stepLabel}
      <h3>Select files</h3>
      <p class="hint">Choose one or more .xlsx, .csv, or .docx files that share the same column layout — into <strong>${escapeHtml(schema.name)}</strong>.</p>
      <button id="bulk-choose-files" class="btn btn-outline" style="margin-bottom:14px;">Choose Files</button>
      <div class="file-pill-list" id="bulk-file-pills"></div>
      <div style="display:flex; gap:10px;">
        <button id="bulk-back" class="btn btn-ghost">Back</button>
        <button id="bulk-continue" class="btn btn-accent" ${b.filePaths.length ? "" : "disabled"}>Continue</button>
      </div>
    </div></div>`;

    renderFilePills(pane, b);
    pane.querySelector("#bulk-choose-files").onclick = async () => {
      const result = await window.pywebview.api.pick_files_for_import();
      (result.files || []).forEach((f) => { if (!b.filePaths.includes(f)) b.filePaths.push(f); });
      renderBulkStep(tab);
    };
    pane.querySelector("#bulk-back").onclick = () => { b.step = "pick_schema"; renderBulkStep(tab); };
    const continueBtn = pane.querySelector("#bulk-continue");
    if (continueBtn) continueBtn.onclick = async () => {
      const colResult = await window.pywebview.api.get_file_columns(b.filePaths[0]);
      if (colResult.error) { showToast(colResult.error, "error"); return; }
      b.columns = colResult.columns;
      b.mapping = guessMapping(schema.fields, b.columns);
      b.step = "map_columns";
      renderBulkStep(tab);
    };
    return;
  }

  if (b.step === "map_columns") {
    pane.innerHTML = `<div class="bulk-import-view"><div class="bulk-step">
      ${stepLabel}
      <h3>Map columns</h3>
      <p class="hint">Match each schema field to the matching column in your files. Fields marked <span style="color:var(--stamp-red)">*</span> are required.</p>
      <div class="mapping-panel">
        <div class="mapping-header-row"><span>Schema Field</span><span>Source Column</span></div>
        <div id="mapping-rows"></div>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="bulk-back" class="btn btn-ghost">Back</button>
        <button id="bulk-start-import" class="btn btn-accent">Start Import →</button>
      </div>
    </div></div>`;

    const rowsEl = pane.querySelector("#mapping-rows");
    schema.fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "mapping-row";
      const options = ['<option value="">— skip —</option>']
        .concat(b.columns.map((c) => `<option value="${escapeAttr(c)}" ${b.mapping[f.name] === c ? "selected" : ""}>${escapeHtml(c)}</option>`));
      row.innerHTML = `
        <span class="mapping-field-name">${escapeHtml(f.label)}${f.required ? '<span class="req">*</span>' : ""}</span>
        <select data-field="${f.name}">${options.join("")}</select>
      `;
      rowsEl.appendChild(row);
    });

    pane.querySelector("#bulk-back").onclick = () => { b.step = "pick_files"; renderBulkStep(tab); };
    pane.querySelector("#bulk-start-import").onclick = async () => {
      const mapping = {};
      pane.querySelectorAll("[data-field]").forEach((sel) => { mapping[sel.dataset.field] = sel.value || null; });
      b.mapping = mapping;
      const result = await window.pywebview.api.start_bulk_import(b.schemaId, b.filePaths, mapping);
      if (result.error) { showToast(result.error, "error"); return; }
      b.jobId = result.job_id;
      b.step = "importing";
      renderBulkStep(tab);
      renderTabBar();
    };
    return;
  }

  if (b.step === "importing") {
    pane.innerHTML = `<div class="bulk-import-view"><div class="bulk-step">
      ${stepLabel}
      <h3>Importing…</h3>
      <p class="hint">This keeps running even if you switch to another tab.</p>
      <div class="import-progress-list" id="import-progress-list">
        <div class="import-file-progress">
          <div class="import-file-progress-head"><span id="import-current-file">Starting…</span><span id="import-row-count"></span></div>
          <div class="progress-bar-track"><div class="progress-bar-fill" id="import-progress-fill" style="width:0%;"></div></div>
        </div>
      </div>
    </div></div>`;
    return;
  }

  if (b.step === "results") {
    const r = b.result;
    const totalFailed = r.files.reduce((sum, f) => sum + f.failed, 0);
    pane.innerHTML = `<div class="bulk-import-view"><div class="bulk-step" style="max-width:760px;">
      <h3>Import complete</h3>
      <div class="import-result-summary">
        <div class="import-result-stat ok"><span class="num">${r.total_imported}</span><span class="label">Imported</span></div>
        <div class="import-result-stat fail"><span class="num">${totalFailed}</span><span class="label">Failed Rows</span></div>
        <div class="import-result-stat"><span class="num">${r.total_files}</span><span class="label">Files Processed</span></div>
      </div>
      <div id="import-file-results"></div>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button id="bulk-import-more" class="btn btn-outline">Import More Files</button>
        <button id="bulk-view-data" class="btn btn-accent">View Data</button>
      </div>
    </div></div>`;

    const resultsEl = pane.querySelector("#import-file-results");
    r.files.forEach((f) => {
      const card = document.createElement("div");
      card.className = "import-file-result";
      let errorsHtml = "";
      if (f.errors && f.errors.length) {
        errorsHtml = f.errors.map((e) => `<div class="import-error-row">Row ${e.row ?? "—"}: ${escapeHtml(e.message)}</div>`).join("");
      }
      card.innerHTML = `<div class="import-file-result-head">${escapeHtml(f.file)} — ${f.imported}/${f.total} imported${f.failed ? `, ${f.failed} failed` : ""}</div>${errorsHtml}`;
      resultsEl.appendChild(card);
    });

    pane.querySelector("#bulk-import-more").onclick = () => {
      tab.bulk = { step: "pick_files", schemaId: b.schemaId, filePaths: [], columns: [], mapping: {}, jobId: null, result: null, error: null };
      renderBulkStep(tab);
    };
    pane.querySelector("#bulk-view-data").onclick = () => openGridTab(b.schemaId);
    return;
  }

  if (b.step === "error") {
    pane.innerHTML = `<div class="bulk-import-view"><div class="bulk-step">
      <h3 style="color:var(--stamp-red);">Import failed</h3>
      <p class="hint">${escapeHtml(b.error || "Something went wrong during import.")}</p>
      <button id="bulk-retry" class="btn btn-accent">Try Again</button>
    </div></div>`;
    pane.querySelector("#bulk-retry").onclick = () => {
      tab.bulk = { step: "pick_files", schemaId: b.schemaId, filePaths: [], columns: [], mapping: {}, jobId: null, result: null, error: null };
      renderBulkStep(tab);
    };
  }
}

function renderFilePills(pane, b) {
  const wrap = pane.querySelector("#bulk-file-pills");
  if (!wrap) return;
  wrap.innerHTML = "";
  b.filePaths.forEach((path, idx) => {
    const filename = path.split(/[\\/]/).pop();
    const pill = document.createElement("div");
    pill.className = "file-pill";
    pill.innerHTML = `<span>${escapeHtml(filename)}</span><button class="tab-close" title="Remove">&times;</button>`;
    pill.querySelector("button").onclick = () => { b.filePaths.splice(idx, 1); renderFilePills(pane, b); pane.querySelector("#bulk-continue").disabled = !b.filePaths.length; };
    wrap.appendChild(pill);
  });
}

function guessMapping(fields, columns) {
  const mapping = {};
  fields.forEach((f) => {
    const target = f.name.toLowerCase().replace(/[_\s]/g, "");
    const match = columns.find((c) => c.toLowerCase().replace(/[_\s]/g, "").includes(target) || target.includes(c.toLowerCase().replace(/[_\s]/g, "")));
    mapping[f.name] = match || null;
  });
  return mapping;
}

// ---------------- Job polling (keeps bulk-import tabs + nav badge live) ----------------

async function pollJobs() {
  const importingTabs = state.tabs.filter((t) => t.type === "bulk_import" && t.bulk && t.bulk.step === "importing");
  for (const tab of importingTabs) {
    const job = await window.pywebview.api.get_job(tab.bulk.jobId);
    if (!job) continue;

    if (job.status === "completed") {
      tab.bulk.result = job.result;
      tab.bulk.step = "results";
      if (tab.id === state.activeTabId) renderBulkStep(tab);
      renderTabBar();
      showToast(`${tab.title}: import complete`, "success");
    } else if (job.status === "failed") {
      tab.bulk.error = job.error;
      tab.bulk.step = "error";
      if (tab.id === state.activeTabId) renderBulkStep(tab);
      renderTabBar();
    } else if (tab.id === state.activeTabId) {
      updateImportingProgressUI(job.progress);
    }
  }

  await refreshJobBadge();

  const queueTab = state.tabs.find((t) => t.type === "processing_queue");
  if (queueTab && queueTab.id === state.activeTabId) renderProcessingQueuePane(queueTab);
}

function updateImportingProgressUI(progress) {
  if (!progress || progress.total_files === undefined) return;
  const fileEl = document.getElementById("import-current-file");
  const rowEl = document.getElementById("import-row-count");
  const fillEl = document.getElementById("import-progress-fill");
  if (!fileEl) return;
  fileEl.textContent = `File ${progress.file_index + 1} of ${progress.total_files}: ${progress.current_file}`;
  rowEl.textContent = `${progress.rows_done} / ${progress.rows_total} rows`;
  const pct = progress.rows_total ? Math.round((progress.rows_done / progress.rows_total) * 100) : 0;
  fillEl.style.width = pct + "%";
}

async function refreshJobBadge() {
  const active = await window.pywebview.api.list_jobs(true);
  const badge = document.getElementById("nav-job-badge");
  if (active.length) { badge.style.display = "inline-block"; badge.textContent = active.length; }
  else { badge.style.display = "none"; }
}

// ---------------- Singleton views: Dashboard / Schema Editor / Data Ledger / Processing Queue / Settings ----------------

async function openDashboardTab() {
  const tab = ensureSingletonTab("dashboard", "Dashboard", "▦");
  const pane = document.getElementById("pane-" + tab.id);
  pane.innerHTML = `<div class="singleton-view"><h1>Dashboard</h1><p class="view-hint">A quick read on what's in the ledger right now.</p><div class="import-result-summary" id="dash-stats"></div></div>`;

  let totalRecords = 0;
  for (const s of state.schemas) {
    const records = await window.pywebview.api.list_records(s.id);
    totalRecords += records.length;
  }
  const activeJobs = await window.pywebview.api.list_jobs(true);

  document.getElementById("dash-stats").innerHTML = `
    <div class="import-result-stat"><span class="num">${state.schemas.length}</span><span class="label">Schemas</span></div>
    <div class="import-result-stat ok"><span class="num">${totalRecords}</span><span class="label">Total Records</span></div>
    <div class="import-result-stat"><span class="num">${activeJobs.length}</span><span class="label">Active Jobs</span></div>
  `;
}

function openSchemaEditorTab() {
  const tab = ensureSingletonTab("schema_editor", "Schema Editor", "✎");
  renderSchemaEditorPane(tab);
}

function renderSchemaEditorPane(tab) {
  const pane = document.getElementById("pane-" + tab.id);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Schema Editor</h1>
    <p class="view-hint">Every schema in this ledger. Edit fields or remove a schema entirely (this also removes its records).</p>
    <button id="schema-editor-new" class="btn btn-accent" style="margin-bottom:16px;">+ New Schema</button>
    <div class="schema-card-grid" id="schema-editor-grid"></div>
  </div>`;
  pane.querySelector("#schema-editor-new").onclick = () => openSchemaModal(null);

  const grid = pane.querySelector("#schema-editor-grid");
  if (!state.schemas.length) {
    grid.innerHTML = `<p class="view-hint">No schemas yet.</p>`;
    return;
  }
  state.schemas.forEach((s) => {
    const card = document.createElement("div");
    card.className = "schema-card";
    card.innerHTML = `
      <h3>${escapeHtml(s.name)}</h3>
      <div class="schema-card-meta">${s.fields.length} fields · created ${s.created_at.slice(0, 10)}</div>
      <div class="schema-card-actions">
        <button class="btn btn-small btn-outline" data-act="edit">Edit</button>
        <button class="btn btn-small btn-danger" data-act="delete">Delete</button>
      </div>`;
    card.querySelector('[data-act="edit"]').onclick = () => openSchemaModal(s);
    card.querySelector('[data-act="delete"]').onclick = () => deleteSchemaFromEditor(s.id);
    grid.appendChild(card);
  });
}

function openDataLedgerDefault() {
  if (state.lastGridTabId && state.tabs.some((t) => t.id === state.lastGridTabId)) {
    activateTab(state.lastGridTabId);
    return;
  }
  const anyGrid = state.tabs.find((t) => t.type === "grid");
  if (anyGrid) { activateTab(anyGrid.id); return; }
  if (state.schemas.length) { openGridTab(state.schemas[0].id); return; }
  showToast("Create a schema first", "error");
}

function openProcessingQueueTab() {
  const tab = ensureSingletonTab("processing_queue", "Processing Queue", "⏱");
  renderProcessingQueuePane(tab);
}

async function renderProcessingQueuePane(tab) {
  const pane = document.getElementById("pane-" + tab.id);
  const jobs = await window.pywebview.api.list_jobs(false);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Processing Queue</h1>
    <p class="view-hint">Background jobs — bulk imports today, OCR and scraping in later phases. Up to 2 run concurrently; the rest wait their turn.</p>
    <div class="job-list" id="job-list"></div>
  </div>`;

  const listEl = pane.querySelector("#job-list");
  if (!jobs.length) {
    listEl.innerHTML = `<p class="view-hint">No jobs yet — a bulk import will show up here.</p>`;
    return;
  }
  jobs.forEach((job) => {
    const row = document.createElement("div");
    row.className = "job-row";
    const progress = job.progress || {};
    let progressText = "";
    if (progress.total_files !== undefined) {
      progressText = `File ${(progress.file_index ?? 0) + 1}/${progress.total_files} · ${progress.rows_done ?? 0}/${progress.rows_total ?? 0} rows`;
    }
    row.innerHTML = `
      <div class="job-row-head">
        <span class="job-row-title">${escapeHtml(job.title || job.job_type)}</span>
        <span class="stamp-badge stamp-${job.status}">${job.status}</span>
      </div>
      <div class="job-row-meta">${job.job_type} · started ${job.created_at.slice(0, 16).replace("T", " ")}</div>
      ${progressText ? `<div class="job-row-progress">${progressText}</div>` : ""}
    `;
    listEl.appendChild(row);
  });
}

function openSettingsTab() {
  const tab = ensureSingletonTab("settings", "Settings", "⚙");
  const pane = document.getElementById("pane-" + tab.id);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Settings</h1>
    <p class="view-hint">Cerberus Desktop is local-only — there's no account or cloud sync, everything below lives on this machine.</p>
    <div class="settings-info-row"><span class="k">Local database</span><span class="v">~/.cerberus-desktop/cerberus.db</span></div>
    <div class="settings-info-row"><span class="k">Storage engine</span><span class="v">SQLite</span></div>
    <div class="settings-info-row"><span class="k">Max concurrent background jobs</span><span class="v">2</span></div>
    <div class="settings-info-row"><span class="k">Build</span><span class="v">Phase 1 + 2 — tabs, bulk import</span></div>
    <div class="settings-info-row"><span class="k">Coming next</span><span class="v">Phase 3: OCR capture</span></div>
  </div>`;
}

// ---------------- Search (grid tabs only) + Refresh ----------------

function applySearchFilter(term) {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab || tab.type !== "grid") return;
  const grid = gridInstances[tab.id];
  if (!grid) return;
  if (!term.trim()) { grid.clearFilter(); return; }
  const lower = term.toLowerCase();
  grid.setFilter((data) => Object.values(data).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(lower)));
}

function refreshActiveTab() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) { loadSchemas(); return; }
  if (tab.type === "grid") loadRecordsForGridTab(tab);
  else if (tab.type === "dashboard") openDashboardTab();
  else if (tab.type === "schema_editor") renderSchemaEditorPane(tab);
  else if (tab.type === "processing_queue") renderProcessingQueuePane(tab);
  showToast("Refreshed", "success");
}

// ---------------- Utilities ----------------

function closeModal(id) {
  if (!id) return;
  document.getElementById(id).style.display = "none";
}

function showToast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  el.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.style.display = "none"), 3000);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
