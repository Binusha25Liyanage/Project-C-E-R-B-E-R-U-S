/* screens/dashboard.js — Depends on: state.js, tabs.js. */

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
  const pendingDupes = await window.pywebview.api.count_pending_duplicate_flags();

  document.getElementById("dash-stats").innerHTML = `
    <div class="import-result-stat"><span class="num">${state.schemas.length}</span><span class="label">Schemas</span></div>
    <div class="import-result-stat ok"><span class="num">${totalRecords}</span><span class="label">Total Records</span></div>
    <div class="import-result-stat"><span class="num">${activeJobs.length}</span><span class="label">Active Jobs</span></div>
    <div class="import-result-stat${pendingDupes ? " fail" : ""}"><span class="num">${pendingDupes}</span><span class="label">Pending Duplicates</span></div>
  `;
}
