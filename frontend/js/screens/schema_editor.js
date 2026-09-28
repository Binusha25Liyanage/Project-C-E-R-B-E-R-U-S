/* screens/schema_editor.js — schema builder modal + Schema Editor nav view.
   Depends on: state.js, utils.js, tabs.js, sidebar.js, grid.js (openGridTab). */

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
    chip.querySelector("button").onclick = () => { wrap._options.splice(idx, 1); renderChips(wrap); };
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
