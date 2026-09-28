/* screens/about.js — Depends on: tabs.js. */

function openAboutTab() {
  const tab = ensureSingletonTab("about", "About", "✦");
  const pane = document.getElementById("pane-" + tab.id);

  const features = [
    { color: "var(--accent)", tag: "Built", title: "📄 Schema Builder", desc: "Define your own record types — Text, Number, Date, Dropdown, Yes/No fields, with regex validation and dropdown chip options." },
    { color: "var(--accent)", tag: "Built", title: "🗂 Data Grid & Search", desc: "Spreadsheet-style grid per schema, inline top-bar search, CSV export with correct Sinhala Unicode handling." },
    { color: "var(--stamp-green)", tag: "Built", title: "📥 Bulk Import Wizard", desc: "Import many xlsx / csv / docx files at once into one schema, with column mapping and per-file, per-row validation results." },
    { color: "var(--stamp-green)", tag: "Built", title: "🗔 Tab Multitasking", desc: "Browser-style tabs — a bulk import keeps running in the background even if you switch tabs or close the tab entirely." },
    { color: "var(--stamp-green)", tag: "Built", title: "🕒 Audit Log", desc: "Every record change is recorded and viewable — per-record history and a global recent-changes feed." },
    { color: "var(--stamp-green)", tag: "Built", title: "🧭 Duplicate Review Queue", desc: "Fuzzy-matches near-identical records automatically on save, plus an on-demand schema scan — flagged pairs wait for you to decide, never auto-merged." },
    { color: "var(--stamp-amber)", tag: "Built", title: "⏱ Processing Queue", desc: "Every background job in one place, capped at 2 running at once so the app can't choke itself." },
    { color: "var(--stamp-red)", tag: "Phase 3", title: "📷 OCR Capture", desc: "Photograph or scan a document and extract Sinhala + English text automatically. Not started yet." },
    { color: "var(--stamp-red)", tag: "Phase 4", title: "🌐 Web Scraper", desc: "Point-and-click web data collection, feeding into the same validated pipeline as manual entry. Not started yet." },
  ];

  pane.innerHTML = `
    <div class="about-view">
      <div class="about-hero">
        <div class="about-hero-content">
          <img class="about-logo" src="assets/icons/cerberus_ember_logo.png" alt="Cerberus" />
          <h1>Cerberus Desktop</h1>
          <p class="tagline">A local, offline data-entry ledger — manual entry, bulk import, duplicate review, and (soon) OCR and web scraping, all feeding one validated, auditable dataset on your own machine.</p>
        </div>
      </div>
      <div class="about-body">
        <p class="intro">Everything runs locally in a SQLite database — no server, no account, no cloud sync. Whether a record comes from typing it in, importing a spreadsheet, or (eventually) scanning a document, it goes through the same validation rules, the same duplicate check, and the same audit trail — so your data stays consistent no matter how it got there.</p>
        <div class="about-section-label">What's inside</div>
        <div class="feature-grid" id="about-feature-grid"></div>
        <div class="about-footer-strip">
          <span><strong>Storage</strong> SQLite (local)</span>
          <span><strong>Shell</strong> pywebview</span>
          <span><strong>Build</strong> Phase 1 + 2</span>
        </div>
      </div>
    </div>
  `;

  const grid = pane.querySelector("#about-feature-grid");
  features.forEach((f) => {
    const card = document.createElement("div");
    card.className = "feature-card";
    card.style.setProperty("--feature-color", f.color);
    card.innerHTML = `<h4>${f.title}<span class="status-tag">${f.tag}</span></h4><p>${f.desc}</p>`;
    grid.appendChild(card);
  });
}
