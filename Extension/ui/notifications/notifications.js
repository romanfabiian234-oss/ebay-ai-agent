(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("notifications")) return;
  const TOAST_ID = "ebay-ai-filler-toast";
  let timer = 0;
  function show(message, ms = 12000) {
    let box = document.getElementById(TOAST_ID);
    if (!box) {
      box = document.createElement("div"); box.id = TOAST_ID;
      box.style.cssText = ["position:fixed","left:16px","right:16px","top:14px","z-index:2147483644","background:#0f172a","color:white","font:13px Arial,sans-serif","border-radius:14px","box-shadow:0 14px 40px rgba(0,0,0,.38)","padding:12px","white-space:pre-wrap","line-height:1.38","max-height:48vh","overflow:auto"].join(";");
      document.documentElement.appendChild(box);
    }
    box.textContent = String(message ?? "");
    clearTimeout(timer);
    timer = window.setTimeout(() => { box.remove(); timer = 0; }, Math.max(0, Number(ms) || 0));
    return box;
  }
  function hide() { clearTimeout(timer); timer = 0; document.getElementById(TOAST_ID)?.remove(); }
  function confirmAction(message) { return window.confirm(String(message ?? "")); }
  ui.register("notifications", { show, hide, confirm: confirmAction });
})();
