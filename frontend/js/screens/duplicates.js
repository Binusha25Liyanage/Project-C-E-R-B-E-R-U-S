/* screens/duplicates.js — "Review Queue" nav view: fuzzy-duplicate review.
   Depends on: state.js, utils.js, tabs.js, grid.js (to refresh grids after
   a merge/dismiss). */

function openDuplicatesTab() {
  const tab = ensureSingletonTab("duplicates", "Review Queue", "🧭");
  renderDuplicatesPane(tab);
}

function renderDuplicatesPane(tab) {
  const pane = document.getElementById("pane-" + tab.id);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Review Queue</h1>
    <p class="view-hint">Records that fuzzy-matched closely — a near-identical name, a one-character typo, word order swapped. Nothing here is ever merged automatically; every pair waits for you to decide.</p>
    <div class="dup-schema-picker">
      <label class="field-label" style="margin-bottom:0;">Schema</label>
      <select id="dup-schema-select" class="select-input" style="width:260px; margin-bottom:0;"></select>
      <button id="dup-scan-btn" class="btn btn-outline">Scan for Duplicates</button>
    </div>
    <div id="dup-list" class="dup-list"></div>
  </div>`;

  const select = pane.querySelector("#dup-schema-select");
  if (!state.schemas.length) {
    select.innerHTML = `<option value="">No schemas yet</option>`;
    pane.querySelector("#dup-scan-btn").disabled = true;
    pane.querySelector("#dup-list").innerHTML = `<p class="view-hint">Create a schema first.</p>`;
    return;
  }
  select.innerHTML = state.schemas.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

  const targetSchemaId = tab.lastDupSchemaId || state.schemas[0].id;
  select.value = targetSchemaId;

  select.onchange = () => {
    tab.lastDupSchemaId = parseInt(select.value, 10);
    loadDuplicatesForSchema(tab, pane);
  };
  pane.querySelector("#dup-scan-btn").onclick = () => scanForDuplicates(parseInt(select.value, 10), tab, pane);

  loadDuplicatesForSchema(tab, pane);
}

async function loadDuplicatesForSchema(tab, pane) {
  const schemaId = parseInt(pane.querySelector("#dup-schema-select").value, 10);
  tab.lastDupSchemaId = schemaId;
  const flags = await window.pywebview.api.list_duplicate_flags(schemaId, "pending");
  const listEl = pane.querySelector("#dup-list");

  if (!flags.length) {
    listEl.innerHTML = `<p class="view-hint">No pending duplicates for this schema. Click "Scan for Duplicates" to check again.</p>`;
    return;
  }

  const schema = state.schemas.find((s) => s.id === schemaId);
  listEl.innerHTML = "";
  flags.forEach((flag) => listEl.appendChild(_buildDupCard(flag, schema, tab, pane)));
}

function _buildDupCard(flag, schema, tab, pane) {
  const card = document.createElement("div");
  card.className = "dup-card";

  const sideHtml = (record, sideLabel) => {
    if (!record) return `<div class="dup-side dup-side-missing">Record no longer exists</div>`;
    const rows = schema.fields
      .filter((f) => f.type === "text" || f.type === "dropdown")
      .map((f) => `<div class="dup-field-row"><span class="k">${escapeHtml(f.label)}</span><span class="v">${escapeHtml(record.data[f.name] ?? "—")}</span></div>`)
      .join("");
    return `<div class="dup-side">
      <div class="dup-side-label">${sideLabel} <span class="dup-record-id">#${record.id}</span></div>
      ${rows}
      <button class="btn btn-small btn-accent dup-keep-btn" data-keep="${record.id}">Keep This One</button>
    </div>`;
  };

  card.innerHTML = `
    <div class="dup-card-head">
      <span class="dup-score">${flag.similarity_score}% match</span>
      <button class="btn btn-small btn-outline dup-notdupe-btn">Not a Duplicate</button>
    </div>
    <div class="dup-sides">
      ${sideHtml(flag.record, "Record A")}
      ${sideHtml(flag.matched_record, "Record B")}
    </div>
  `;

  card.querySelectorAll(".dup-keep-btn").forEach((btn) => {
    btn.onclick = async () => {
      const keepId = parseInt(btn.dataset.keep, 10);
      const result = await window.pywebview.api.resolve_duplicate_flag(flag.id, "merge", keepId);
      if (!result.success) { showToast(result.error || "Could not resolve", "error"); return; }
      showToast("Duplicate merged", "success");
      loadDuplicatesForSchema(tab, pane);
      _refreshGridForSchema(schema.id);
    };
  });

  card.querySelector(".dup-notdupe-btn").onclick = async () => {
    await window.pywebview.api.resolve_duplicate_flag(flag.id, "not_duplicate");
    showToast("Kept both records", "success");
    loadDuplicatesForSchema(tab, pane);
  };

  return card;
}

async function scanForDuplicates(schemaId, tab, pane) {
  const result = await window.pywebview.api.scan_duplicates(schemaId);
  if (result.error) { showToast(result.error, "error"); return; }
  showToast(`Scan complete — ${result.new_flags} new duplicate${result.new_flags === 1 ? "" : "s"} flagged`, "success");

  let dupTab = tab || state.tabs.find((t) => t.type === "duplicates");
  if (!dupTab) {
    // Triggered from a grid toolbar with no Review Queue tab open yet — open one so the result is visible.
    dupTab = ensureSingletonTab("duplicates", "Review Queue", "🧭");
    dupTab.lastDupSchemaId = schemaId;
    renderDuplicatesPane(dupTab);
    return;
  }
  const dupPane = pane || document.getElementById("pane-" + dupTab.id);
  if (dupPane && dupPane.querySelector("#dup-schema-select")) {
    dupPane.querySelector("#dup-schema-select").value = schemaId;
    loadDuplicatesForSchema(dupTab, dupPane);
  }
}

function _refreshGridForSchema(schemaId) {
  const gridTab = state.tabs.find((t) => t.type === "grid" && t.schemaId === schemaId);
  if (gridTab) loadRecordsForGridTab(gridTab);
}

function refreshDupBadgeIfOpen(schemaId) {
  const dupTab = state.tabs.find((t) => t.type === "duplicates");
  if (dupTab && dupTab.id === state.activeTabId) {
    const pane = document.getElementById("pane-" + dupTab.id);
    const select = pane.querySelector("#dup-schema-select");
    if (select && parseInt(select.value, 10) === schemaId) loadDuplicatesForSchema(dupTab, pane);
  }
}
