/* Cerberus Desktop — frontend logic.
   Talks to Python only through window.pywebview.api.* (see backend/api.py).
   No build step: plain JS + Tabulator.js for the grid. */

let state = {
  schemas: [],
  currentSchema: null,
  records: [],
  editingRecordId: null,
  editingSchemaId: null, // set when the schema modal is in "edit" mode
  fieldRowCounter: 0,
};

let grid = null;

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "boolean", label: "Yes / No" },
];

// ---------------- Boot ----------------

window.addEventListener("pywebviewready", init);
// Fallback for browser-based testing without pywebview present
if (!window.pywebview) {
  document.addEventListener("DOMContentLoaded", () => {
    console.warn("pywebview API not found — this page must run inside the desktop app.");
  });
}

async function init() {
  bindGlobalEvents();
  await loadSchemas();
}

function bindGlobalEvents() {
  document.getElementById("btn-new-schema").onclick = () => openSchemaModal(null);
  document.getElementById("btn-add-field").onclick = () => addFieldRow();
  document.getElementById("btn-save-schema").onclick = saveSchema;
  document.getElementById("btn-add-row").onclick = () => openRecordModal(null);
  document.getElementById("btn-save-record").onclick = saveRecord;
  document.getElementById("btn-export-csv").onclick = exportCsv;
  document.getElementById("btn-edit-schema").onclick = () => openSchemaModal(state.currentSchema);

  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.style.display = "none";
    });
  });
}

// ---------------- Schemas ----------------

async function loadSchemas() {
  state.schemas = await window.pywebview.api.list_schemas();
  renderSchemaList();
  if (state.schemas.length && !state.currentSchema) {
    selectSchema(state.schemas[0].id);
  }
}

function renderSchemaList() {
  const list = document.getElementById("schema-list");
  if (!state.schemas.length) {
    list.innerHTML = `<div class="schema-list-empty">No schemas yet. Create one to start entering data.</div>`;
    return;
  }
  list.innerHTML = "";
  state.schemas.forEach((s) => {
    const el = document.createElement("div");
    el.className = "schema-item" + (state.currentSchema && state.currentSchema.id === s.id ? " active" : "");
    el.innerHTML = `<span>${escapeHtml(s.name)}</span><span class="schema-item-count">${s.fields.length}f</span>`;
    el.onclick = () => selectSchema(s.id);
    list.appendChild(el);
  });
}

async function selectSchema(schemaId) {
  const schema = state.schemas.find((s) => s.id === schemaId);
  if (!schema) return;
  state.currentSchema = schema;
  renderSchemaList();

  document.getElementById("current-schema-name").textContent = schema.name;
  document.getElementById("btn-add-row").disabled = false;
  document.getElementById("btn-export-csv").disabled = false;
  document.getElementById("btn-edit-schema").disabled = false;
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("grid-wrap").style.display = "block";

  await loadRecords();
  initGrid(schema);
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
    addFieldRow(); // start with one blank field
  }
  document.getElementById("schema-modal").style.display = "flex";
}

function addFieldRow(field) {
  const id = "field-row-" + state.fieldRowCounter++;
  const wrap = document.createElement("div");
  wrap.className = "field-row";
  wrap.id = id;
  wrap.innerHTML = `
    <div class="field-row-main">
      <input type="text" class="f-name" placeholder="Field name (e.g. customer_name)" value="${field ? escapeAttr(field.name) : ""}" />
      <select class="f-type">
        ${FIELD_TYPES.map((t) => `<option value="${t.value}" ${field && field.type === t.value ? "selected" : ""}>${t.label}</option>`).join("")}
      </select>
      <label class="field-required-label"><input type="checkbox" class="f-required" ${field && field.required ? "checked" : ""}/> Required</label>
      <button class="field-remove" title="Remove field">&times;</button>
    </div>
    <div class="field-row-extra ${field && field.type === "dropdown" ? "show" : ""}" data-role="dropdown-extra">
      <input type="text" class="f-options" placeholder="Options, comma separated (e.g. New, Paid, Overdue)" value="${field && field.options ? escapeAttr(field.options.join(", ")) : ""}" />
    </div>
    <div class="field-row-extra ${field && field.type === "text" ? "show" : ""}" data-role="text-extra">
      <input type="text" class="f-pattern" placeholder="Optional regex pattern (e.g. ^0\\d{9}$ for a phone number)" value="${field && field.pattern ? escapeAttr(field.pattern) : ""}" />
    </div>
  `;
  document.getElementById("field-list").appendChild(wrap);

  const typeSelect = wrap.querySelector(".f-type");
  const dropdownExtra = wrap.querySelector('[data-role="dropdown-extra"]');
  const textExtra = wrap.querySelector('[data-role="text-extra"]');
  typeSelect.addEventListener("change", () => {
    dropdownExtra.classList.toggle("show", typeSelect.value === "dropdown");
    textExtra.classList.toggle("show", typeSelect.value === "text");
  });
  wrap.querySelector(".field-remove").onclick = () => wrap.remove();
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
    if (type === "dropdown") {
      const raw = row.querySelector(".f-options").value.trim();
      field.options = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
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
  await selectSchema(targetId);
  showToast("Schema saved", "success");
}

// ---------------- Records / Grid ----------------

async function loadRecords() {
  state.records = await window.pywebview.api.list_records(state.currentSchema.id);
  document.getElementById("record-count").textContent = `${state.records.length} record${state.records.length === 1 ? "" : "s"}`;
}

function initGrid(schema) {
  const columns = schema.fields.map((f) => ({
    title: f.label || f.name,
    field: f.name,
    editor: false,
    formatter: f.type === "boolean" ? (cell) => (cell.getValue() ? "Yes" : "No") : undefined,
  }));

  columns.push({
    title: "Status",
    field: "status",
    width: 130,
    formatter: (cell) => {
      const status = cell.getValue() || "pending";
      return `<span class="stamp-badge stamp-${status}">${status.replace("_", " ")}</span>`;
    },
  });

  columns.push({
    title: "",
    field: "_actions",
    width: 130,
    hozAlign: "right",
    headerSort: false,
    formatter: () => `<div class="row-actions"><button class="btn btn-small edit-btn">Edit</button><button class="btn btn-small btn-danger del-btn">Del</button></div>`,
    cellClick: (e, cell) => {
      const rowData = cell.getRow().getData();
      if (e.target.classList.contains("edit-btn")) openRecordModal(rowData);
      if (e.target.classList.contains("del-btn")) deleteRecord(rowData.id);
    },
  });

  const tableData = state.records.map((r) => ({ id: r.id, status: r.status, ...r.data }));

  if (grid) {
    grid.setColumns(columns);
    grid.setData(tableData);
  } else {
    grid = new Tabulator("#grid", {
      data: tableData,
      columns,
      layout: "fitDataStretch",
      height: "100%",
      placeholder: "No records yet — click \"Add Record\" to enter your first one.",
    });
  }
}

function openRecordModal(record) {
  state.editingRecordId = record ? record.id : null;
  document.getElementById("record-modal-title").textContent = record ? "Edit Record" : "New Record";
  document.getElementById("record-error").textContent = "";
  renderRecordForm(state.currentSchema, record);
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

    const existingValue = record ? record.data[f.name] : "";
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
  const result = await window.pywebview.api.save_record(state.currentSchema.id, data, state.editingRecordId);

  if (!result.success) {
    Object.entries(result.errors || {}).forEach(([field, msg]) => {
      const el = document.querySelector(`[data-error-for="${field}"]`);
      if (el) el.textContent = msg;
      else document.getElementById("record-error").textContent = msg;
    });
    return;
  }

  closeModal("record-modal");
  await loadRecords();
  initGrid(state.currentSchema);
  showToast("Record saved", "success");
}

async function deleteRecord(recordId) {
  if (!confirm("Delete this record? This cannot be undone.")) return;
  await window.pywebview.api.delete_record(recordId);
  await loadRecords();
  initGrid(state.currentSchema);
  showToast("Record deleted", "success");
}

// ---------------- Export ----------------

async function exportCsv() {
  const result = await window.pywebview.api.export_csv(state.currentSchema.id);
  if (result.cancelled) return;
  if (result.error) { showToast(result.error, "error"); return; }
  showToast(`Exported to ${result.path}`, "success");
}

// ---------------- Utilities ----------------

function closeModal(id) {
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
