(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("assistantPanel")) return;

  function ensureStyles() {
    if (document.getElementById("ebay-ai-hover-styles")) return;
    const style = document.createElement("style");
    style.id = "ebay-ai-hover-styles";
    style.textContent = `
      .ebay-ai-hover-btn{display:none!important;pointer-events:none!important}
      #ebay-ai-hover-panel{position:fixed;display:block!important;pointer-events:auto!important;z-index:2147483646;width:320px;max-width:calc(100vw - 18px);max-height:min(420px,calc(100vh - 18px));overflow:auto;background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:13px;box-shadow:0 16px 42px rgba(0,0,0,.32);padding:10px;font:13px Arial,sans-serif;line-height:1.28;box-sizing:border-box}
      #ebay-ai-hover-panel .hf-drag-handle{position:absolute;left:0;top:0;width:44px;height:38px;border-top-left-radius:14px;cursor:move;z-index:3;background:linear-gradient(135deg,rgba(96,165,250,.42),rgba(96,165,250,0) 68%)}
      #ebay-ai-hover-panel .hf-drag-handle:hover{background:linear-gradient(135deg,rgba(96,165,250,.72),rgba(96,165,250,0) 72%)}
      #ebay-ai-hover-panel .hf-title{font-weight:900;font-size:13.5px;margin:0 0 4px;padding-left:12px;display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:move;user-select:none}
      #ebay-ai-hover-panel .hf-close{border:0;background:rgba(255,255,255,.1);color:#fff;border-radius:999px;width:21px;height:21px;cursor:pointer;font-weight:900;padding:0}
      #ebay-ai-hover-panel .hf-muted{color:#cbd5e1;font-size:11px;margin:2px 0}.hf-value{background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px;margin:5px 0;white-space:pre-wrap;max-height:58px;overflow:auto}
      #ebay-ai-hover-panel .hf-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}#ebay-ai-hover-panel .hf-row-main{align-items:stretch;justify-content:flex-start;flex-wrap:nowrap}#ebay-ai-hover-panel .hf-nav-group{display:flex;gap:7px;margin-left:0}@media (max-width:338px){#ebay-ai-hover-panel .hf-row-main{flex-wrap:wrap}#ebay-ai-hover-panel .hf-nav-group{width:100%;margin-left:0}#ebay-ai-hover-panel button.hf-action.hf-nav-btn{flex:1 1 0}}#ebay-ai-hover-panel button.hf-action{border:0;border-radius:9px;padding:9px 10px;font-weight:900;cursor:pointer;background:#2563eb;color:#fff;min-width:56px;min-height:36px;font-size:13px;line-height:1.15}#ebay-ai-hover-panel button.hf-action.hf-fill-main{min-width:60px;flex:0 0 auto}#ebay-ai-hover-panel button.hf-action.hf-fillall-main{min-width:74px;flex:0 0 auto;background:#16a34a}#ebay-ai-hover-panel button.hf-action.hf-nav-btn{min-width:56px;flex:0 0 auto}#ebay-ai-hover-panel button.hf-action.secondary{background:#334155}#ebay-ai-hover-panel button.hf-action.danger{background:#991b1b}#ebay-ai-hover-panel button.hf-action:disabled{opacity:.45;cursor:not-allowed}
      #ebay-ai-fillall-panel{position:fixed;z-index:2147483647;right:16px;top:94px;width:336px;max-width:calc(100vw - 24px);background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.34);padding:10px;font:12.5px Arial,sans-serif;line-height:1.3;box-sizing:border-box;pointer-events:auto!important}#ebay-ai-fillall-panel .fa-drag-handle{position:absolute;left:0;top:0;width:44px;height:38px;border-top-left-radius:14px;cursor:move;z-index:3;background:linear-gradient(135deg,rgba(34,197,94,.38),rgba(34,197,94,0) 68%)}#ebay-ai-fillall-panel .fa-title{font-weight:900;font-size:14px;margin-bottom:6px;padding-left:14px;cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center;gap:8px}#ebay-ai-fillall-panel .fa-line{color:#cbd5e1;margin:4px 0}#ebay-ai-fillall-panel .fa-current{background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:7px;margin:7px 0;white-space:pre-wrap;max-height:92px;overflow:auto}#ebay-ai-fillall-panel .fa-bar{height:8px;background:#1f2937;border-radius:999px;overflow:hidden;margin:8px 0}#ebay-ai-fillall-panel .fa-bar span{display:block;height:100%;background:#22c55e;width:0%}#ebay-ai-fillall-panel button{border:0;border-radius:9px;padding:8px 10px;font-weight:900;cursor:pointer;background:#991b1b;color:#fff;min-width:88px}
      #ebay-ai-hover-panel .hf-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:#334155;border:1px solid rgba(255,255,255,.24);color:#f8fafc;padding:5px 9px;margin:4px 5px 0 0;font-weight:900;font-size:12px;line-height:1.1;box-shadow:0 1px 5px rgba(0,0,0,.18)}#ebay-ai-hover-panel .hf-chip.hf-chip-ok{background:#14532d!important;border-color:#22c55e!important;color:#dcfce7!important;box-shadow:0 0 0 1px rgba(34,197,94,.22),0 4px 12px rgba(34,197,94,.18)}#ebay-ai-hover-panel .hf-chip.hf-chip-bad{background:#7f1d1d!important;border-color:#ef4444!important;color:#fee2e2!important;box-shadow:0 0 0 1px rgba(239,68,68,.28),0 4px 12px rgba(239,68,68,.18)}#ebay-ai-hover-panel .hf-chip.hf-chip-active{background:#1d4ed8!important;border-color:#60a5fa!important;color:#eff6ff!important}#ebay-ai-hover-panel .hf-chip.hf-chip-pending{background:#475569;border-color:#94a3b8;color:#f8fafc}.hf-status-ok{color:#86efac}.hf-status-warn{color:#fde68a}.hf-status-risk{color:#fecaca}.hf-status-empty{color:#cbd5e1}
      #ebay-ai-hover-panel.review-mode{width:340px;max-height:min(500px,calc(100vh - 18px))}
      #ebay-ai-hover-panel .rv-status{display:inline-flex;border-radius:999px;padding:4px 8px;margin:3px 0 7px;font-size:11px;font-weight:900;border:1px solid rgba(255,255,255,.2);background:#334155;color:#f8fafc}
      #ebay-ai-hover-panel .rv-status[data-status="confirmed_by_tag"],#ebay-ai-hover-panel .rv-status[data-status="confirmed_by_photo"],#ebay-ai-hover-panel .rv-status[data-status="user_confirmed"]{background:#14532d;border-color:#22c55e;color:#dcfce7}
      #ebay-ai-hover-panel .rv-status[data-status="suggested"],#ebay-ai-hover-panel .rv-status[data-status="likely_correct"],#ebay-ai-hover-panel .rv-status[data-status="supported_by_two_models"]{background:#713f12;border-color:#f59e0b;color:#fef3c7}
      #ebay-ai-hover-panel .rv-status[data-status="needs_review"]{background:#7c2d12;border-color:#fb923c;color:#ffedd5}
      #ebay-ai-hover-panel .rv-status[data-status="conflict"]{background:#7f1d1d;border-color:#ef4444;color:#fee2e2}
      #ebay-ai-hover-panel .rv-status[data-status="user_corrected"]{background:#1e3a8a;border-color:#60a5fa;color:#dbeafe}
      #ebay-ai-hover-panel .rv-status[data-status="cleared_by_user"],#ebay-ai-hover-panel .rv-status[data-status="not_filled"]{background:#334155;border-color:#94a3b8;color:#e2e8f0}
      #ebay-ai-hover-panel .rv-grid{display:grid;grid-template-columns:92px minmax(0,1fr);gap:4px 7px;margin:5px 0;font-size:11px}
      #ebay-ai-hover-panel .rv-label{color:#94a3b8;font-weight:800}.rv-text{color:#f8fafc;overflow-wrap:anywhere}
      #ebay-ai-hover-panel .rv-change{border:1px solid rgba(96,165,250,.35);background:#172554;border-radius:8px;padding:6px;margin:6px 0;color:#dbeafe;font-size:11px}
      #ebay-ai-hover-panel button.hf-action.rv-confirm{background:#16a34a}#ebay-ai-hover-panel button.hf-action.rv-change-btn{background:#d97706}
    `;
    document.documentElement.appendChild(style);
  }

  function create({ id, html = "", className = "" } = {}) {
    if (!id) throw new Error("Assistant panel id is required.");
    document.getElementById(id)?.remove();
    const panel = document.createElement("div");
    panel.id = id;
    if (className) panel.className = className;
    panel.innerHTML = String(html || "");
    return panel;
  }
  function attach(panel, parent = document.documentElement) {
    if (!panel) return null;
    (parent || document.documentElement).appendChild(panel);
    return panel;
  }
  function mount(options = {}) { const panel = create(options); return attach(panel, options.parent); }
  function ensureStyle(id, cssText) {
    if (!id) return null;
    let style = document.getElementById(id);
    if (!style) { style = document.createElement("style"); style.id = id; document.documentElement.appendChild(style); }
    if (cssText !== undefined) style.textContent = String(cssText || "");
    return style;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[char]));
  }

  function chipClass(state = "pending") {
    if (state === "ok") return "hf-chip-ok";
    if (state === "bad") return "hf-chip-bad";
    if (state === "active") return "hf-chip-active";
    return "hf-chip-pending";
  }

  function chipText(value, state = "pending") {
    const prefix = state === "ok" ? "✓ " : state === "bad" ? "✕ " : state === "active" ? "… " : "• ";
    return `${prefix}${String(value ?? "")}`;
  }

  function chipTitle(value, state = "pending") {
    if (state === "ok") return `${value} — filled / already selected`;
    if (state === "bad") return `${value} — not found or not confirmed`;
    if (state === "active") return `${value} — trying now`;
    return `${value} — pending`;
  }

  function bindActions(panel, onAction) {
    if (!panel || typeof onAction !== "function") return panel;
    const handler = event => {
      try { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
      if (!["pointerdown", "mousedown", "click"].includes(event.type)) return;
      const target = event.target?.closest?.("[data-action], .hf-close");
      if (!target || target.disabled) return;
      const now = Date.now();
      if (now - Number(panel.__lastLocalActionAt || 0) < 260) return;
      panel.__lastLocalActionAt = now;
      const action = target.classList?.contains("hf-close") ? "close" : target.dataset.action;
      if (!action) return;
      Promise.resolve(onAction(action, target, event)).catch(error => {
        globalThis.EbayLogger?.warn?.("Assistant Panel action failed", { action, message: error?.message || String(error) });
      });
    };
    panel.addEventListener("pointerdown", handler, true);
    panel.addEventListener("mousedown", handler, true);
    panel.addEventListener("mouseup", event => {
      try { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
    }, true);
    panel.addEventListener("click", handler, true);
    return panel;
  }

  function renderSuggestion(model = {}, onAction) {
    ensureStyles();
    const panel = create({ id: "ebay-ai-hover-panel" });
    panel.dataset.version = String(model.version || globalThis.EbayUI?.version || "");
    const answers = Array.isArray(model.answers) ? model.answers : [];
    const choices = Array.isArray(model.choices) ? model.choices : [];
    panel.innerHTML = `
      <div class="hf-drag-handle" title="Drag helper"></div>
      <div class="hf-title" title="Drag helper"><span>${escapeHtml(model.label || "")}</span><button type="button" tabindex="-1" class="hf-close" title="Close">×</button></div>
      <div class="hf-muted">Suggestion</div>
      <div class="hf-value">${escapeHtml(model.suggestion || "No AI value")}</div>
      ${answers.length > 1 ? `<div class="hf-muted">Answers: ${answers.map(item => `<span class="hf-chip ${chipClass(item.state)}" data-value-key="${escapeHtml(item.key)}" data-state="${escapeHtml(item.state || "pending")}" title="${escapeHtml(chipTitle(item.value, item.state))}">${escapeHtml(chipText(item.value, item.state))}</span>`).join("")}</div>` : ""}
      ${choices.length ? `<div class="hf-muted">Choices: ${choices.map(item => `<span class="hf-chip ${chipClass(item.state)}" data-value-key="${escapeHtml(item.key)}" data-state="${escapeHtml(item.state || "pending")}">${escapeHtml(item.value)}</span>`).join("")}</div>` : ""}
      <div class="hf-muted hf-live-status hf-status-${escapeHtml(model.statusClass || "empty")}">${escapeHtml(model.statusText || "")}</div>
      <div class="hf-row hf-row-main">
        <button type="button" tabindex="-1" class="hf-action hf-fill-main" data-action="fill" ${model.fillDisabled ? "disabled" : ""}>Fill</button>
        <button type="button" tabindex="-1" class="hf-action hf-fillall-main" data-action="fill-all">Fill All</button>
        <div class="hf-nav-group">
          <button type="button" tabindex="-1" class="hf-action secondary hf-nav-btn" data-action="back">Back</button>
          <button type="button" tabindex="-1" class="hf-action secondary hf-nav-btn" data-action="next">Next</button>
        </div>
      </div>`;
    bindActions(panel, onAction);
    attach(panel);
    return panel;
  }

  function renderReview(model = {}, onAction) {
    ensureStyles();
    const panel = create({ id: "ebay-ai-hover-panel", className: "review-mode" });
    panel.dataset.version = String(model.version || globalThis.EbayUI?.version || "");
    const validation = Array.isArray(model.validationIssues) ? model.validationIssues.filter(Boolean) : [];
    panel.innerHTML = `
      <div class="hf-drag-handle" title="Drag Review Assistant"></div>
      <div class="hf-title" title="Drag Review Assistant"><span>${escapeHtml(model.label || "")}</span><button type="button" tabindex="-1" class="hf-close" title="Close">×</button></div>
      <span class="rv-status" data-status="${escapeHtml(model.status || "not_filled")}">${escapeHtml(model.statusLabel || model.status || "Not filled")}</span>
      <div class="rv-grid">
        <div class="rv-label">Final answer</div><div class="rv-text">${escapeHtml(model.aiValue || "No final answer")}</div>
        <div class="rv-label">OpenAI</div><div class="rv-text">${escapeHtml(model.primaryValue || "Not returned")}</div>
        ${model.reviewerValue ? `<div class="rv-label">Claude</div><div class="rv-text">${escapeHtml(model.reviewerValue)}</div>` : ""}
        <div class="rv-label">Current eBay</div><div class="rv-text">${escapeHtml(model.current || "Empty")}</div>
        <div class="rv-label">Source</div><div class="rv-text">${escapeHtml(model.sources || "No source")}</div>
        ${model.evidenceScope ? `<div class="rv-label">Evidence scope</div><div class="rv-text">${escapeHtml(model.evidenceScope)}</div>` : ""}
        ${model.reviewReason && model.reviewReason !== "none" ? `<div class="rv-label">Review reason</div><div class="rv-text">${escapeHtml(model.reviewReason)}</div>` : ""}
        ${validation.length ? `<div class="rv-label">Validation</div><div class="rv-text">${escapeHtml(validation.join(", "))}</div>` : ""}
      </div>
      ${(model.changedFrom || model.changedTo) ? `<div class="rv-change">Changed: ${escapeHtml(model.changedFrom || "Empty")} → ${escapeHtml(model.changedTo || "Empty")}</div>` : ""}
      <div class="hf-muted hf-live-status hf-status-empty">Confirm the current value or press Change to edit this exact Item Specific.</div>
      <div class="hf-row hf-row-main">
        <button type="button" tabindex="-1" class="hf-action rv-confirm" data-action="review-confirm">Confirm</button>
        <button type="button" tabindex="-1" class="hf-action rv-change-btn" data-action="review-change">Change</button>
        <div class="hf-nav-group">
          <button type="button" tabindex="-1" class="hf-action secondary hf-nav-btn" data-action="back">Back</button>
          <button type="button" tabindex="-1" class="hf-action secondary hf-nav-btn" data-action="next">Next</button>
        </div>
      </div>`;
    bindActions(panel, onAction);
    attach(panel);
    return panel;
  }

  function ensureFillAll({ onStop } = {}) {
    ensureStyles();
    let panel = document.getElementById("ebay-ai-fillall-panel");
    if (panel) return panel;
    panel = create({ id: "ebay-ai-fillall-panel" });
    panel.innerHTML = `
      <div class="fa-drag-handle" title="Drag Fill All helper"></div>
      <div class="fa-title" title="Drag Fill All helper"><span>Fill All Running</span><button type="button" data-action="fill-all-stop">Stop</button></div>
      <div class="fa-line fa-progress-text">Preparing Item Specifics route...</div>
      <div class="fa-current">Current: —</div>
      <div class="fa-bar"><span></span></div>
      <div class="fa-line fa-summary">Done: 0 • Review: 0 • Skipped: 0</div>`;
    let drag = null;
    const stop = event => {
      try { event?.preventDefault?.(); event?.stopPropagation?.(); event?.stopImmediatePropagation?.(); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
      Promise.resolve(onStop?.()).catch(error => globalThis.EbayLogger?.warn?.("Fill All stop UI callback failed", { message: error?.message || String(error) }));
    };
    panel.addEventListener("pointerdown", event => {
      const button = event.target?.closest?.("[data-action='fill-all-stop']");
      if (button) { stop(event); return; }
      if (!event.target?.closest?.(".fa-drag-handle, .fa-title")) return;
      try { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
      const rect = panel.getBoundingClientRect();
      drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      try { panel.setPointerCapture?.(event.pointerId); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
    }, true);
    panel.addEventListener("click", event => {
      if (event.target?.closest?.("[data-action='fill-all-stop']")) stop(event);
    }, true);
    panel.addEventListener("pointermove", event => {
      if (!drag) return;
      try { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
      const width = panel.offsetWidth || 336;
      const height = panel.offsetHeight || 180;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.offsetX));
      const top = Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - drag.offsetY));
      setPosition(panel, { left, top, right: "auto", bottom: "auto", display: "block" });
    }, true);
    const endDrag = event => {
      drag = null;
      try { panel.releasePointerCapture?.(event.pointerId); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
    };
    panel.addEventListener("pointerup", endDrag, true);
    panel.addEventListener("pointercancel", endDrag, true);
    attach(panel);
    return panel;
  }

  function updateFillAll(panel, update = {}) {
    const target = panel || document.getElementById("ebay-ai-fillall-panel");
    if (!target) return false;
    if (update.status) target.querySelector(".fa-progress-text")?.replaceChildren(document.createTextNode(String(update.status)));
    if (update.current) target.querySelector(".fa-current")?.replaceChildren(document.createTextNode(String(update.current)));
    if (typeof update.percent === "number") {
      const bar = target.querySelector(".fa-bar span");
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, update.percent))}%`;
    }
    if (update.summary) target.querySelector(".fa-summary")?.replaceChildren(document.createTextNode(String(update.summary)));
    return true;
  }

  function setMessage(panel, message, className = "") {
    const status = panel?.querySelector?.(".hf-live-status");
    if (status) {
      status.className = `hf-muted hf-live-status ${className}`;
      status.textContent = String(message ?? "");
      return true;
    }
    const fillAll = panel?.querySelector?.(".fa-progress-text");
    if (fillAll) { fillAll.textContent = String(message ?? ""); return true; }
    return false;
  }

  function setChip(panel, { key, value, state = "pending" } = {}) {
    if (!panel || !key) return false;
    let chip = null;
    try { chip = panel.querySelector(`.hf-chip[data-value-key="${CSS.escape(String(key))}"]`); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
    if (!chip) return false;
    chip.dataset.state = state;
    chip.classList.remove("hf-chip-ok", "hf-chip-bad", "hf-chip-active", "hf-chip-pending");
    chip.classList.add(chipClass(state));
    chip.textContent = chipText(value, state);
    chip.title = chipTitle(value, state);
    return true;
  }

  function setPosition(panel, { left, top, width, right, bottom, display } = {}) {
    if (!panel) return false;
    if (display !== undefined) panel.style.display = String(display);
    if (width !== undefined) panel.style.width = typeof width === "number" ? `${Math.round(width)}px` : String(width);
    if (left !== undefined) panel.style.left = typeof left === "number" ? `${Math.round(left)}px` : String(left);
    if (top !== undefined) panel.style.top = typeof top === "number" ? `${Math.round(top)}px` : String(top);
    if (right !== undefined) panel.style.right = typeof right === "number" ? `${Math.round(right)}px` : String(right);
    if (bottom !== undefined) panel.style.bottom = typeof bottom === "number" ? `${Math.round(bottom)}px` : String(bottom);
    return true;
  }

  function clampPosition(panel, left, top) {
    if (!panel) return { left, top };
    const rect = panel.getBoundingClientRect?.();
    const width = Math.max(220, rect?.width || 264);
    const height = Math.max(120, rect?.height || 220);
    return {
      left: Math.max(8, Math.min(Math.round(left), window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(Math.round(top), window.innerHeight - height - 8))
    };
  }

  function startDrag(panel, event) {
    if (!panel) return null;
    const rect = panel.getBoundingClientRect?.();
    if (!rect) return null;
    try { panel.setPointerCapture?.(event.pointerId); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
    return { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
  }

  function moveDrag(panel, event, drag) {
    if (!panel || !drag) return false;
    const pos = clampPosition(panel, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    return setPosition(panel, { display: "block", left: pos.left, top: pos.top });
  }

  function endDrag(panel, event) {
    try { panel?.releasePointerCapture?.(event.pointerId); } catch (_) { /* Best-effort UI event isolation / pointer capture cleanup. */ }
    return true;
  }

  function placeNear(panel, anchorRect, { mode = "helper" } = {}) {
    if (!panel) return false;
    const rect = anchorRect;
    if (!rect) return setPosition(panel, { display: "none" });
    const preferredWidth = mode === "review" ? 340 : 320;
    const width = Math.min(preferredWidth, Math.max(270, window.innerWidth - 18));
    const panelHeight = Math.min(panel.offsetHeight || 220, Math.max(180, window.innerHeight - 18));
    const gap = 8;
    const canRight = rect.right + gap + width <= window.innerWidth - 8;
    const canLeft = rect.left - gap - width >= 8;
    const left = canRight ? rect.right + gap : (canLeft ? rect.left - width - gap : Math.max(8, window.innerWidth - width - 8));
    let top = Math.round(rect.top + (rect.height / 2) - (panelHeight / 2));
    top = Math.max(8, Math.min(top, window.innerHeight - panelHeight - 8));
    return setPosition(panel, { display: "block", width, left, top });
  }

  function removePanel(panelOrId) {
    const panel = typeof panelOrId === "string" ? document.getElementById(panelOrId) : panelOrId;
    panel?.remove?.();
    return true;
  }

  function ensureFillPreviewStyles() {
    return ensureStyle("ebay-ai-fill-preview-styles", `
      .ebay-ai-fill-outline,.ebay-ai-fill-num{display:none!important}
      .ebay-ai-menu-glow{outline:3px solid rgba(239,68,68,.98)!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(239,68,68,.18),0 0 18px rgba(239,68,68,.38)!important;border-radius:9px!important;transition:outline-color .12s ease, box-shadow .12s ease!important}
      .ebay-ai-menu-glow.ebay-ai-menu-glow-done{outline-color:rgba(34,197,94,.98)!important;box-shadow:0 0 0 4px rgba(34,197,94,.18),0 0 18px rgba(34,197,94,.35)!important}
      .ebay-ai-menu-glow.ebay-ai-menu-glow-review{outline-color:rgba(245,158,11,.98)!important;box-shadow:0 0 0 4px rgba(245,158,11,.18),0 0 18px rgba(245,158,11,.35)!important}
      #ebay-ai-fill-preview-panel{position:fixed;right:14px;top:74px;z-index:2147483646;width:min(420px,calc(100vw - 28px));min-width:320px;max-width:min(760px,calc(100vw - 28px));min-height:280px;max-height:86vh;overflow:auto;resize:both;background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.45);font:13px Arial,sans-serif;line-height:1.35;padding:12px;box-sizing:border-box}
      #ebay-ai-fill-preview-panel .fp-resize-left{position:absolute;left:-13px;top:12px;bottom:12px;width:24px;cursor:ew-resize;border-radius:999px;background:rgba(59,130,246,.48);box-shadow:0 0 0 1px rgba(255,255,255,.22) inset;z-index:2}
      #ebay-ai-fill-preview-panel .fp-resize-left:hover{background:rgba(96,165,250,.82)}
      #ebay-ai-fill-preview-panel .fp-title{font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
      #ebay-ai-fill-preview-panel .fp-muted{color:#cbd5e1;font-size:12px;margin:4px 0 9px}
      #ebay-ai-fill-preview-panel .fp-topline{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      #ebay-ai-fill-preview-panel .fp-chip{font-size:11px;border-radius:999px;padding:4px 7px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(255,255,255,.10)}
      #ebay-ai-fill-preview-panel .fp-row{display:grid;grid-template-columns:22px 24px 1fr;gap:7px;align-items:start;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;margin:6px 0;background:#111827;cursor:pointer}
      #ebay-ai-fill-preview-panel .fp-row.missing{opacity:.62;border-color:rgba(245,158,11,.35);cursor:default}#ebay-ai-fill-preview-panel .fp-row.review{border-color:rgba(245,158,11,.55);background:#422006}#ebay-ai-fill-preview-panel .fp-row.already{border-color:rgba(34,197,94,.45);background:#052e16}#ebay-ai-fill-preview-panel .fp-row.done{border-color:rgba(34,197,94,.65);background:#052e16}#ebay-ai-fill-preview-panel .fp-row.fail{border-color:rgba(239,68,68,.65);background:#450a0a}#ebay-ai-fill-preview-panel .fp-row.unchecked{opacity:.72}
      #ebay-ai-fill-preview-panel .fp-row input[type='checkbox']{width:18px;height:18px;accent-color:#ef4444;margin-top:1px}
      #ebay-ai-fill-preview-panel .fp-index{height:22px;border-radius:999px;background:#ef4444;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px}#ebay-ai-fill-preview-panel .fp-label{font-weight:900}#ebay-ai-fill-preview-panel .fp-value{color:#e2e8f0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:285px;margin-top:2px}#ebay-ai-fill-preview-panel .fp-status{font-size:12px;color:#cbd5e1;margin-top:3px}
      #ebay-ai-fill-preview-panel .fp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;position:sticky;bottom:0;background:#0f172a;padding-top:8px}#ebay-ai-fill-preview-panel button{border:0;border-radius:11px;padding:9px 10px;font-weight:900;cursor:pointer;background:#2563eb;color:white;flex:1;min-width:96px}#ebay-ai-fill-preview-panel button.secondary{background:#334155}#ebay-ai-fill-preview-panel button.red{background:#991b1b}#ebay-ai-fill-preview-panel button.green{background:#16a34a}#ebay-ai-fill-preview-panel button:disabled{opacity:.45;cursor:not-allowed}
      #ebay-ai-fill-preview-panel .fp-live{white-space:pre-wrap;background:#020617;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;margin-top:8px;color:#e2e8f0;max-height:156px;overflow:auto}
    `);
  }

  function fillPreviewRows(plan = []) {
    return (Array.isArray(plan) ? plan : []).map(item => {
      const cls = item.previewOnly ? " review" : item.alreadySet ? " already" : item.found ? (item.checked ? "" : " unchecked") : " missing";
      const type = item.kind === "dropdown" ? "dropdown / exact-only" : item.kind === "yes-no" ? "yes-no" : item.kind === "description" ? "description/editor" : "text/field";
      const status = item.previewOnly ? "Found on page • no value to auto-fill" : item.found ? (item.alreadySet ? "Already set — skipped" : `Checked • will try once • ${type}`) : item.status;
      const disabled = (!item.found || item.alreadySet || item.previewOnly) ? "disabled" : "";
      const checked = (item.checked && !item.alreadySet && item.found && !item.previewOnly) ? "checked" : "";
      return `<div class="fp-row${cls}" data-index="${Number(item.index) || 0}" title="Click row to scroll to this field">
        <input type="checkbox" data-check-index="${Number(item.index) || 0}" ${checked} ${disabled} />
        <div class="fp-index">${Number(item.index) || 0}</div>
        <div><div class="fp-label">${escapeHtml(item.label)}</div>
        <div class="fp-value">${escapeHtml(item.value)}</div>
        <div class="fp-status">${escapeHtml(status)}</div></div>
      </div>`;
    }).join("");
  }

  function fillPreviewCounts(counts = {}) {
    const pairs = [
      ["Checked", counts.checked], ["Ready", counts.ready], ["Already set", counts.already],
      ["Review-only", counts.review], ["Not found/hidden", counts.missing]
    ];
    return pairs.map(([label, value]) => `<span class="fp-chip">${escapeHtml(label)}: ${Number(value) || 0}</span>`).join("");
  }

  function renderFillPreview({ plan = [], counts = {}, onAction, onCheck, onRow } = {}) {
    ensureFillPreviewStyles();
    const panel = create({ id: "ebay-ai-fill-preview-panel" });
    panel.innerHTML = `
      <div class="fp-resize-left" title="Drag left/right to resize panel"></div>
      <div class="fp-title"><span>V8.23.21 Smart Text Helper Control</span><button class="secondary" data-action="close" title="Close">×</button></div>
      <div class="fp-muted">Check the exact fields you want to fill. Red glow stays attached to the real eBay menu/input while scrolling. Drag the left edge of this panel to resize it on iMac. Each checked field gets one attempt only.</div>
      <div class="fp-topline fp-counts">${fillPreviewCounts(counts)}</div>
      <div class="fp-actions" style="position:static;padding-top:0;margin-bottom:8px">
        <button class="secondary" data-action="select-ready">Select Ready</button>
        <button class="secondary" data-action="select-visible">Visible Only</button>
        <button class="secondary" data-action="unselect-all">Unselect All</button>
        <button class="secondary" data-action="panel-narrow">Narrow</button>
        <button class="secondary" data-action="panel-wide">Wide</button>
      </div>
      ${plan.length ? fillPreviewRows(plan) : `<div class="fp-live">No fields with values were found in the current Listing data.</div>`}
      <div class="fp-live">Waiting for your confirmation. Click a row to scroll to its eBay question.</div>
      <div class="fp-actions">
        <button class="green" data-action="start" ${Number(counts.checked) ? "" : "disabled"}>Fill Checked Once</button>
        <button data-action="start-visible">Fill Visible Once</button>
        <button class="red" data-action="stop">Stop</button>
        <button class="secondary" data-action="cancel">Close</button>
      </div>`;
    panel.addEventListener("pointerdown", event => event.stopPropagation(), true);
    panel.addEventListener("change", event => {
      const input = event.target?.closest?.("input[data-check-index]");
      if (!input) return;
      onCheck?.(Number(input.dataset.checkIndex || 0), !!input.checked, input);
    }, true);
    panel.addEventListener("click", event => {
      if (event.target?.closest?.("input[data-check-index]")) return;
      const actionTarget = event.target?.closest?.("[data-action]");
      if (actionTarget) {
        event.preventDefault(); event.stopPropagation();
        Promise.resolve(onAction?.(actionTarget.dataset.action, actionTarget, event)).catch(error => globalThis.EbayLogger?.warn?.("Fill Preview action failed", { message: error?.message || String(error) }));
        return;
      }
      const row = event.target?.closest?.(".fp-row[data-index]");
      if (row) { event.preventDefault(); event.stopPropagation(); onRow?.(Number(row.dataset.index || 0), row, event); }
    }, true);
    attach(panel);
    enableFillPreviewResize(panel);
    return panel;
  }

  function enableFillPreviewResize(panel) {
    if (!panel) return false;
    const savedWidth = Number(globalThis.EbayPanelPreferencesV82310?.loadPreviewWidth?.() || 0);
    if (savedWidth >= 320) panel.style.width = `${Math.min(savedWidth, Math.max(340, window.innerWidth - 34))}px`;
    const handle = panel.querySelector(".fp-resize-left");
    if (!handle) return false;
    let startX = 0, startW = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const onMove = event => {
      const nextW = clamp(startW + (startX - event.clientX), 320, Math.max(340, window.innerWidth - 34));
      panel.style.width = `${nextW}px`;
      globalThis.EbayPanelPreferencesV82310?.savePreviewWidth?.(nextW);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove, true); window.removeEventListener("pointerup", onUp, true); };
    handle.addEventListener("pointerdown", event => {
      event.preventDefault(); event.stopPropagation();
      startX = event.clientX; startW = panel.getBoundingClientRect().width;
      window.addEventListener("pointermove", onMove, true); window.addEventListener("pointerup", onUp, true);
    }, true);
    return true;
  }

  function readFillPreviewChecked(panel) {
    if (!panel) return [];
    return Array.from(panel.querySelectorAll("input[data-check-index]:checked:not(:disabled)"))
      .map(input => Number(input.dataset.checkIndex || 0)).filter(Boolean);
  }
  function syncFillPreviewChecks(panel, plan = []) {
    if (!panel) return false;
    for (const item of Array.isArray(plan) ? plan : []) {
      const input = panel.querySelector(`input[data-check-index="${Number(item.index) || 0}"]`);
      if (input && !input.disabled) input.checked = !!item.checked;
    }
    return true;
  }
  function updateFillPreviewCounts(panel, counts = {}) {
    const box = panel?.querySelector?.(".fp-counts");
    if (!box) return false;
    box.innerHTML = fillPreviewCounts(counts);
    const start = panel.querySelector("button[data-action='start']");
    if (start) start.disabled = !Number(counts.checked);
    return true;
  }
  function updateFillPreviewRow(panel, index, state, status) {
    const row = panel?.querySelector?.(`.fp-row[data-index="${Number(index) || 0}"]`);
    if (!row) return false;
    row.classList.remove("done", "fail", "unchecked");
    if (state) row.classList.add(String(state));
    const text = row.querySelector(".fp-status");
    if (text) text.textContent = String(status || "");
    return true;
  }
  function setFillPreviewMessage(panel, message) {
    const boxes = panel?.querySelectorAll?.(".fp-live");
    const box = boxes?.length ? boxes[boxes.length - 1] : null;
    if (!box) return false;
    box.textContent = String(message || "");
    return true;
  }
  function setFillPreviewWidth(panel, width) {
    if (!panel) return false;
    const next = Math.max(320, Math.min(Number(width) || 360, Math.max(340, window.innerWidth - 34)));
    panel.style.width = `${next}px`;
    globalThis.EbayPanelPreferencesV82310?.savePreviewWidth?.(next);
    return true;
  }

  ui.register("assistantPanel", {
    ensureStyles, ensureStyle, create, attach, mount,
    renderSuggestion, renderReview, ensureFillAll, updateFillAll,
    ensureFillPreviewStyles, renderFillPreview, readFillPreviewChecked, syncFillPreviewChecks, updateFillPreviewCounts, updateFillPreviewRow, setFillPreviewMessage, setFillPreviewWidth,
    setMessage, setChip, setPosition, clampPosition, startDrag, moveDrag, endDrag, placeNear, removePanel
  });
})();
