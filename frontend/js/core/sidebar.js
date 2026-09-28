/* core/sidebar.js — schema list rendering + "new tab" menu population.
   Depends on: state.js, utils.js. */

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

function renderTabNewMenuSchemas() {
  const wrap = document.getElementById("tab-new-menu-schemas");
  if (!state.schemas.length) {
    wrap.innerHTML = `<div style="padding:8px; font-size:12px; color:var(--ink-text-dim);">No schemas yet — create one from the sidebar.</div>`;
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
