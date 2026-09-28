/* core/tabs.js — generic tab bar plumbing shared by every screen.
   Depends on: state.js, utils.js, sidebar.js (for renderSchemaList). */

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
    else {
      state.activeTabId = null;
      renderTabBar();
      updateNavActiveState();
      document.getElementById("topbar-title").textContent = "Cerberus Ledger";
    }
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
