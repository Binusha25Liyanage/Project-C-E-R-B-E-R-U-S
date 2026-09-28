/* screens/processing_queue.js — Processing Queue nav view + the global job
   polling loop that keeps bulk-import tabs and the nav badge live.
   Depends on: state.js, utils.js, tabs.js, bulk_import.js (renderBulkStep). */

function openProcessingQueueTab() {
  const tab = ensureSingletonTab("processing_queue", "Processing Queue", "⏱");
  renderProcessingQueuePane(tab);
}

async function renderProcessingQueuePane(tab) {
  const pane = document.getElementById("pane-" + tab.id);
  const jobs = await window.pywebview.api.list_jobs(false);
  pane.innerHTML = `<div class="singleton-view">
    <h1>Processing Queue</h1>
    <p class="view-hint">Background jobs — bulk imports today, OCR and scraping in later phases. Up to 2 run concurrently; the rest wait their turn.</p>
    <div class="job-list" id="job-list"></div>
  </div>`;

  const listEl = pane.querySelector("#job-list");
  if (!jobs.length) {
    listEl.innerHTML = `<p class="view-hint">No jobs yet — a bulk import will show up here.</p>`;
    return;
  }
  jobs.forEach((job) => {
    const row = document.createElement("div");
    row.className = "job-row";
    const progress = job.progress || {};
    let progressText = "";
    if (progress.total_files !== undefined) {
      progressText = `File ${(progress.file_index ?? 0) + 1}/${progress.total_files} · ${progress.rows_done ?? 0}/${progress.rows_total ?? 0} rows`;
    }
    row.innerHTML = `
      <div class="job-row-head">
        <span class="job-row-title">${escapeHtml(job.title || job.job_type)}</span>
        <span class="stamp-badge stamp-${job.status}">${job.status}</span>
      </div>
      <div class="job-row-meta">${job.job_type} · started ${job.created_at.slice(0, 16).replace("T", " ")}</div>
      ${progressText ? `<div class="job-row-progress">${progressText}</div>` : ""}
    `;
    listEl.appendChild(row);
  });
}

async function pollJobs() {
  const importingTabs = state.tabs.filter((t) => t.type === "bulk_import" && t.bulk && t.bulk.step === "importing");
  for (const tab of importingTabs) {
    const job = await window.pywebview.api.get_job(tab.bulk.jobId);
    if (!job) continue;

    if (job.status === "completed") {
      tab.bulk.result = job.result;
      tab.bulk.step = "results";
      if (tab.id === state.activeTabId) renderBulkStep(tab);
      renderTabBar();
      showToast(`${tab.title}: import complete`, "success");
    } else if (job.status === "failed") {
      tab.bulk.error = job.error;
      tab.bulk.step = "error";
      if (tab.id === state.activeTabId) renderBulkStep(tab);
      renderTabBar();
    } else if (tab.id === state.activeTabId) {
      updateImportingProgressUI(job.progress);
    }
  }

  await refreshJobBadge();

  const queueTab = state.tabs.find((t) => t.type === "processing_queue");
  if (queueTab && queueTab.id === state.activeTabId) renderProcessingQueuePane(queueTab);
}

function updateImportingProgressUI(progress) {
  if (!progress || progress.total_files === undefined) return;
  const fileEl = document.getElementById("import-current-file");
  const rowEl = document.getElementById("import-row-count");
  const fillEl = document.getElementById("import-progress-fill");
  if (!fileEl) return;
  fileEl.textContent = `File ${progress.file_index + 1} of ${progress.total_files}: ${progress.current_file}`;
  rowEl.textContent = `${progress.rows_done} / ${progress.rows_total} rows`;
  const pct = progress.rows_total ? Math.round((progress.rows_done / progress.rows_total) * 100) : 0;
  fillEl.style.width = pct + "%";
}

async function refreshJobBadge() {
  const active = await window.pywebview.api.list_jobs(true);
  const badge = document.getElementById("nav-job-badge");
  if (active.length) { badge.style.display = "inline-block"; badge.textContent = active.length; }
  else { badge.style.display = "none"; }
}
