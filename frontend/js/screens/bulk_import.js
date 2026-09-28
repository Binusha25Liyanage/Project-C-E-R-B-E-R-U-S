/* screens/bulk_import.js — the multi-step bulk import wizard tab type.
   Depends on: state.js, utils.js, tabs.js, grid.js (openGridTab). */

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
    if (!state.schemas.length) grid.innerHTML = `<p class="hint">No schemas yet — create one first from the sidebar.</p>`;
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
