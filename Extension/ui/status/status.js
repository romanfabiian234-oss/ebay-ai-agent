(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("status")) return;
  function setText(target, text, tone = "") {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    if (!element) return false;
    element.textContent = String(text ?? "");
    if (tone) element.dataset.tone = String(tone); else delete element.dataset.tone;
    return true;
  }
  ui.register("status", { setText });
})();
