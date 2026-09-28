/* core/utils.js — small shared helpers. No dependencies on other files. */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

function closeModal(id) {
  if (!id) return;
  document.getElementById(id).style.display = "none";
}

function showToast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  el.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.style.display = "none"), 3000);
}
