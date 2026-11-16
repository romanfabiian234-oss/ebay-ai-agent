(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("fillActions")) return;
  function inputText() { return String(document.getElementById("chatgptText")?.value || ""); }
  function renderReport(text) {
    const box = document.getElementById("fillReportBox");
    if (box) box.textContent = String(text ?? "");
  }
  function closeIfStandalone(delayMs = 0) {
    if (document.documentElement.dataset.windowMode === "embedded") return false;
    window.setTimeout(() => window.close(), Math.max(0, Number(delayMs) || 0));
    return true;
  }
  ui.register("fillActions", { inputText, renderReport, closeIfStandalone });
})();
