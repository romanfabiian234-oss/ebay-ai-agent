(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("progress")) return;
  const PANEL_ID = "ebay-ai-progress";
  const STAGE_LABELS = Object.freeze({ loading:"Reading eBay draft", primary:"GPT photo analysis", recovery:"GPT critical-field recovery", filling:"Filling Item Specifics", saving:"Waiting for eBay autosave", completed:"Completed", review:"Needs review", error:"Error" });
  let timer = 0, hideTimer = 0;
  function remove() { document.getElementById(PANEL_ID)?.remove(); clearInterval(timer); clearTimeout(hideTimer); timer = 0; hideTimer = 0; }
  function current() { return document.getElementById(PANEL_ID); }
  function isActive() { const panel=current(); return Boolean(panel && panel.dataset.finished !== "1"); }
  function show(payload = {}) {
    if (payload.hidden === true) { remove(); return { ok:true }; }
    const stage = String(payload.stage || (payload.finished ? "completed" : "loading"));
    let panel=current();
    if (!panel) {
      panel=document.createElement("div"); panel.id=PANEL_ID;
      panel.style.cssText=["position:fixed","left:16px","bottom:16px","z-index:2147483643","width:min(390px,calc(100vw - 32px))","background:#0f172a","color:#fff","border:1px solid rgba(255,255,255,.16)","border-radius:14px","box-shadow:0 14px 42px rgba(0,0,0,.38)","padding:11px 12px","font:13px Arial,sans-serif","line-height:1.35"].join(";");
      panel.innerHTML='<div data-role="title" style="font-weight:800;margin-bottom:4px"></div><div data-role="message" style="color:#e2e8f0"></div><div data-role="timer" style="color:#93c5fd;margin-top:5px;font-variant-numeric:tabular-nums"></div>';
      document.documentElement.appendChild(panel);
    }
    const title=panel.querySelector('[data-role="title"]'), message=panel.querySelector('[data-role="message"]'), timerNode=panel.querySelector('[data-role="timer"]');
    const total=Number(payload.total||0), rawIndex=Number(payload.index ?? payload.current ?? 0);
    const position=total ? ` ${Math.min(total, Math.max(1, rawIndex + (payload.index !== undefined ? 1 : 0)))}/${total}` : "";
    const prefix=String(payload.titlePrefix || "AI Queue");
    title.textContent=`${prefix}${position} — ${STAGE_LABELS[stage] || stage}`;
    message.textContent=String(payload.message || "Working…");
    panel.dataset.stageStartedAt=String(payload.stageStartedAt || new Date().toISOString()); panel.dataset.finished=payload.finished ? "1" : "0";
    const updateTimer=()=>{ const started=Date.parse(panel.dataset.stageStartedAt||""); const seconds=Number.isFinite(started)?Math.max(0,Math.floor((Date.now()-started)/1000)):0; const limit=Number(payload.timeoutMs||0); timerNode.textContent=payload.finished?`Stage time: ${Math.max(0,Math.round(Number(payload.durationMs||seconds*1000)/1000))}s`:`Elapsed: ${seconds}s${limit?` / timeout ${Math.round(limit/1000)}s`:""}`; };
    clearInterval(timer); clearTimeout(hideTimer); updateTimer(); if(!payload.finished) timer=window.setInterval(updateTimer,1000);
    if(payload.autoHideMs){ const stamp=panel.dataset.stageStartedAt; hideTimer=window.setTimeout(()=>{ if(panel.isConnected && panel.dataset.stageStartedAt===stamp) remove(); },Math.max(0,Number(payload.autoHideMs)||0)); }
    return {ok:true};
  }
  ui.register("progress", { show, remove, current, isActive, stageLabels:STAGE_LABELS });
})();
