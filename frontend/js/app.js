/* app.js — bootstrap only. Every actual screen lives in screens/*.js.
   This file just wires global events and starts polling. */

var pollTimer = null;

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
  document.querySelector(".brand").addEventListener("click", () => openAboutTab());
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
  else if (view === "audit_log") openAuditLogTab();
  else if (view === "duplicates") openDuplicatesTab();
  else if (view === "settings") openSettingsTab();
}

function toggleTabNewMenu() {
  const menu = document.getElementById("tab-new-menu");
  const isOpen = menu.style.display !== "none";
  if (isOpen) { menu.style.display = "none"; return; }
  renderTabNewMenuSchemas();
  menu.style.display = "block";
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
  else if (tab.type === "audit_log") renderAuditLogPane(tab);
  else if (tab.type === "duplicates") renderDuplicatesPane(tab);
  showToast("Refreshed", "success");
}
