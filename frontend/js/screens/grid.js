/* screens/grid.js — the data grid tab type + record entry modal.
   Depends on: state.js, utils.js, tabs.js. */

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
        <button class="btn btn-outline" data-act="scan-dupes">Scan for Duplicates</button>
        <button class="btn btn-outline" data-act="export-csv">Export CSV</button>
        <button class="btn btn-accent" data-act="add-record">+ Add Record</button>
      </div>
    </div>
    <div class="grid-wrap"><div id="grid-inner-${tab.id}"></div></div>
  `;
  pane.querySelector('[data-act="edit-schema"]').onclick = () => openSchemaModal(state.schemas.find((s) => s.id === schemaId));
  pane.querySelector('[data-act="export-csv"]').onclick = () => exportCsv(schemaId);
  pane.querySelector('[data-act="add-record"]').onclick = () => openRecordModal(schemaId, null);
  pane.querySelector('[data-act="scan-dupes"]').onclick = () => scanForDuplicates(schemaId);

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
    width: 170,
    hozAlign: "right",
    headerSort: false,
    formatter: () => `<div class="row-actions"><button class="btn btn-small edit-btn">Edit</button><button class="btn btn-small history-btn">History</button><button class="btn btn-small btn-danger del-btn">Del</button></div>`,
    cellClick: (e, cell) => {
      const rowData = cell.getRow().getData();
      if (e.target.classList.contains("edit-btn")) openRecordModal(tab.schemaId, rowData);
      if (e.target.classList.contains("del-btn")) deleteRecord(tab, rowData.id);
      if (e.target.classList.contains("history-btn")) openRecordHistoryModal(rowData.id);
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

    const existingValue = record ? (record[f.name] !== undefined ? record[f.name] : (record.data ? record.data[f.name] : undefined)) : "";
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
  refreshDupBadgeIfOpen(state.editingRecordSchemaId);
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
