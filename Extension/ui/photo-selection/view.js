(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("photoSelectionView")) return;
  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[ch]));
  }
  function renderSourceBar({ countTag, sourceBar, counts = {}, sourceLabel = "eBay" } = {}) {
    const upload = Number(counts.upload || 0), marketplace = Number(counts.marketplace || 0), screenshot = Number(counts.screenshot || 0);
    const total = upload + marketplace + screenshot;
    if (countTag) { countTag.textContent = `${total} photo${total === 1 ? "" : "s"}`; countTag.className = `sourceTag ${total ? "ok" : "warn"}`; }
    if (sourceBar) sourceBar.innerHTML = [
      `<span class="sourceTag ${upload ? "ok" : ""}">Upload: ${upload}</span>`,
      `<span class="sourceTag ${marketplace ? "ok" : ""}">${escapeHtml(sourceLabel)}: ${marketplace}</span>`,
      `<span class="sourceTag ${screenshot ? "ok" : ""}">Screenshot: ${screenshot}</span>`
    ].join("");
    return total;
  }
  function renderChecklist(container, items = []) {
    if (!container) return false;
    container.innerHTML = (Array.isArray(items) ? items : []).map(item => {
      const state = item?.state === "ok" ? "ok" : item?.state === "missing" ? "missing" : "review";
      const stateText = state === "ok" ? "OK" : state === "missing" ? "Missing" : "Review";
      return `<div class="checkItem"><div><b>${escapeHtml(item?.label || item?.key || "Check")}</b><div class="caption">${escapeHtml(item?.note || "")}</div></div><span class="checkState ${state}">${stateText}</span></div>`;
    }).join("");
    return true;
  }
  ui.register("photoSelectionView", { escapeHtml, renderSourceBar, renderChecklist });
})();
