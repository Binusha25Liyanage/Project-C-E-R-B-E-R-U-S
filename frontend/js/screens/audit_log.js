/* screens/audit_log.js — global "Audit Log" nav view + a per-record history
   modal opened from the grid's "History" row action.
   Depends on: state.js, utils.js, tabs.js. */

function openAuditLogTab() {
  const tab = ensureSingletonTab("audit_log", "Audit Log", "🕒");
  renderAuditLogPane(tab);
}

async function renderAuditLogPane(tab) {
  const pane = document.getElementById("pane-" + tab.id);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Audit Log</h1>
    <p class="view-hint">Every create, edit, and delete across every schema, most recent first. Click a record's "History" button in its grid to see just that record's trail.</p>
    <div class="audit-list" id="audit-list"></div>
  </div>`;

  const entries = await window.pywebview.api.get_recent_audit_log(150);
  const listEl = pane.querySelector("#audit-list");

  if (!entries.length) {
    listEl.innerHTML = `<p class="view-hint">No changes recorded yet.</p>`;
    return;
  }

  entries.forEach((entry) => {
    const schema = state.schemas.find((s) => s.id === entry.schema_id);
    const row = document.createElement("div");
    row.className = "audit-row";
    row.innerHTML = `
      <span class="audit-action-badge audit-${entry.change.action}">${entry.change.action}</span>
      <div class="audit-row-body">
        <div class="audit-row-head">
          <span>${schema ? escapeHtml(schema.name) : "Unknown schema"} · record #${entry.record_id}</span>
          <span class="audit-timestamp">${entry.timestamp.slice(0, 19).replace("T", " ")}</span>
        </div>
        ${_auditSummaryLine(entry)}
      </div>
    `;
    listEl.appendChild(row);
  });
}

function _auditSummaryLine(entry) {
  if (entry.change.action === "delete") return `<div class="audit-row-detail">Record deleted.</div>`;
  const data = entry.change.data || {};
  const preview = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 3)
    .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`)
    .join(" · ");
  return `<div class="audit-row-detail">${preview || "(no field values)"}</div>`;
}

async function openRecordHistoryModal(recordId) {
  const entries = await window.pywebview.api.get_audit_log(recordId);
  const overlay = document.getElementById("history-modal");
  const body = document.getElementById("history-modal-body");
  document.getElementById("history-modal-title").textContent = `History — Record #${recordId}`;

  if (!entries.length) {
    body.innerHTML = `<p class="view-hint">No history recorded for this record.</p>`;
  } else {
    body.innerHTML = "";
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "audit-row";
      row.innerHTML = `
        <span class="audit-action-badge audit-${entry.change.action}">${entry.change.action}</span>
        <div class="audit-row-body">
          <div class="audit-row-head"><span></span><span class="audit-timestamp">${entry.timestamp.slice(0, 19).replace("T", " ")}</span></div>
          ${_auditSummaryLine(entry)}
        </div>
      `;
      body.appendChild(row);
    });
  }
  overlay.style.display = "flex";
}
