(() => {
  "use strict";

  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("photoTransfer")) return;

  const DROP_OVERLAY_ID = "marketplace-ai-photo-drop-overlay-v8220";
  const NOTICE_ID = "marketplace-ai-photo-transfer-toast-v8220";
  const SOURCE_ID = "marketplace-ai-photo-drag-source-v8220";

  function clean(value, limit = 800) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function notice(text, { error = false, id = NOTICE_ID, timeoutMs = 0, priority = false } = {}) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement("div");
      node.id = id;
      node.setAttribute("role", "status");
      node.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:22px",
        "transform:translateX(-50%)",
        `z-index:${priority ? 2147483647 : 2147483646}`,
        `max-width:min(${priority ? 640 : 600}px,calc(100vw - 28px))`,
        `padding:${priority ? "11px 15px" : "10px 14px"}`,
        "border-radius:12px",
        "box-shadow:0 10px 32px rgba(0,0,0,.3)",
        `font:${priority ? 700 : 600} 13px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`,
        "text-align:center",
        "pointer-events:none"
      ].join(";");
      (document.documentElement || document.body).appendChild(node);
    }

    node.style.background = error ? "#7f1d1d" : "#111827";
    node.style.color = "#fff";
    node.textContent = clean(text);

    if (Number(timeoutMs) > 0) {
      const marker = `${Date.now()}-${Math.random()}`;
      node.dataset.marker = marker;
      setTimeout(() => {
        if (node?.dataset?.marker === marker) node.remove();
      }, Number(timeoutMs));
    }
    return node;
  }

  function dropOverlay(text = "Drop photos here", { id = DROP_OVERLAY_ID } = {}) {
    let overlay = document.getElementById(id);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = id;
      overlay.style.cssText = [
        "position:fixed",
        "inset:16px",
        "z-index:2147483644",
        "pointer-events:none",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "border:3px dashed rgba(17,24,39,.75)",
        "border-radius:20px",
        "background:rgba(255,255,255,.82)",
        "backdrop-filter:blur(2px)",
        "font:800 22px/1.25 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "color:#111827",
        "text-align:center",
        "padding:24px"
      ].join(";");
      (document.documentElement || document.body).appendChild(overlay);
    }
    overlay.textContent = clean(text, 300) || "Drop photos here";
    overlay.style.display = "flex";
    return overlay;
  }

  function hideDropOverlay(id = DROP_OVERLAY_ID) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.style.display = "none";
  }

  function source({ id = SOURCE_ID, label = "Photos", title = "", onDragStart = null, onDragEnd = null } = {}) {
    document.getElementById(id)?.remove();
    const node = document.createElement("div");
    node.id = id;
    node.draggable = true;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", "Drag selected eBay photos to Depop, Poshmark, or Vinted");
    node.title = String(title || "");
    node.textContent = String(label || "Photos");
    node.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483645",
      "padding:10px 14px",
      "border-radius:999px",
      "background:#111827",
      "color:#fff",
      "box-shadow:0 10px 30px rgba(0,0,0,.28)",
      "font:700 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "cursor:grab",
      "user-select:none",
      "-webkit-user-select:none",
      "border:1px solid rgba(255,255,255,.18)"
    ].join(";");

    if (onDragStart) node.addEventListener("dragstart", onDragStart);
    node.addEventListener("dragstart", () => { node.style.cursor = "grabbing"; });
    node.addEventListener("dragend", event => {
      node.style.cursor = "grab";
      onDragEnd?.(event);
    });
    (document.documentElement || document.body).appendChild(node);
    return node;
  }

  ui.register("photoTransfer", {
    notice,
    dropOverlay,
    hideDropOverlay,
    source,
    ids: Object.freeze({ dropOverlay: DROP_OVERLAY_ID, notice: NOTICE_ID, source: SOURCE_ID })
  });
})();
