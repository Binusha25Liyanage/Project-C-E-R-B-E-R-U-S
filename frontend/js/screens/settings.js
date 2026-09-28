/* screens/settings.js — Depends on: tabs.js. */

function openSettingsTab() {
  const tab = ensureSingletonTab("settings", "Settings", "⚙");
  const pane = document.getElementById("pane-" + tab.id);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Settings</h1>
    <p class="view-hint">Cerberus Desktop is local-only — there's no account or cloud sync, everything below lives on this machine.</p>
    <div class="settings-info-row"><span class="k">Local database</span><span class="v">~/.cerberus-desktop/cerberus.db</span></div>
    <div class="settings-info-row"><span class="k">Storage engine</span><span class="v">SQLite</span></div>
    <div class="settings-info-row"><span class="k">Max concurrent background jobs</span><span class="v">2</span></div>
    <div class="settings-info-row"><span class="k">Duplicate match threshold</span><span class="v">85 / 100 (RapidFuzz token_sort_ratio)</span></div>
    <div class="settings-info-row"><span class="k">Build</span><span class="v">Phase 1 + 2 — tabs, bulk import, audit log, duplicate review</span></div>
    <div class="settings-info-row"><span class="k">Coming next</span><span class="v">Phase 3: OCR capture</span></div>
  </div>`;
}
