/* Early Depop/Poshmark/Vinted drop receiver — V8.23.21.
   Loaded at document_start so a user drop is not lost while the listing UI is still rendering. */
(function initMarketplacePhotoDropEarlyV8220(global) {
  "use strict";

  const VERSION = "8.23.21";
  const MIME = "application/x-marketplace-ai-photos";
  const PREFIX = "MARKETPLACE_AI_PHOTOS_V1:";
  const STATE_KEY = "MarketplaceEarlyPhotoDropV8220";

  function supportedDestination() {
    const host = String(location.hostname || "").toLowerCase();
    return host === "chatgpt.com" || host === "chat.openai.com" || host === "depop.com" || host.endsWith(".depop.com") || host === "poshmark.com" || host.endsWith(".poshmark.com") || host === "vinted.com" || host.endsWith(".vinted.com");
  }

  function parsePayload(text) {
    const value = String(text || "");
    if (!value.startsWith(PREFIX)) return null;
    try {
      const parsed = JSON.parse(value.slice(PREFIX.length));
      return parsed?.kind === "marketplace_ai_photo_transfer" && Array.isArray(parsed?.photos) ? parsed : null;
    } catch (error) {
      console.debug("[Photo Drop Early V8.23.21] Payload parse skipped", error?.message || error);
      return null;
    }
  }

  function friendlyRuntimeMessage(value) {
    const message = String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (/extension context invalidated|context invalidated/i.test(message)) return "Extension was updated. Refresh this marketplace page once, then drag again.";
    if (/receiving end does not exist|could not establish connection/i.test(message)) return "The extension page connection is not ready. Refresh this marketplace page once, then drag again.";
    return message || "No extension response.";
  }

  function showRefreshNotice(message) {
    try {
      return global.EbayUI?.photoTransfer?.notice?.(friendlyRuntimeMessage(message), {
        error: true, timeoutMs: 10000, id: "marketplace-ai-photo-early-refresh-v8221"
      });
    } catch (error) {
      console.debug("[Photo Drop Early V8.23.21] Refresh notice skipped", error?.message || error);
      return null;
    }
  }

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const runtimeError = chrome.runtime.lastError?.message || "";
          const friendly = friendlyRuntimeMessage(runtimeError);
          if (runtimeError && /refresh this marketplace page/i.test(friendly)) showRefreshNotice(friendly);
          resolve(runtimeError ? { ok: false, message: friendly } : (response || { ok: false, message: "No extension response." }));
        });
      } catch (error) {
        const friendly = friendlyRuntimeMessage(error?.message || String(error));
        if (/refresh this marketplace page/i.test(friendly)) showRefreshNotice(friendly);
        resolve({ ok: false, message: friendly });
      }
    });
  }

  function state() {
    if (!global[STATE_KEY]) global[STATE_KEY] = { version: VERSION, pendingPayload: null, pendingAt: 0, importing: false };
    return global[STATE_KEY];
  }

  async function payloadFromEvent(event) {
    const transfer = event?.dataTransfer;
    if (transfer) {
      for (const type of [MIME, "text/plain"]) {
        try {
          const parsed = parsePayload(transfer.getData(type));
          if (parsed) return parsed;
        } catch (error) { console.debug("[Photo Drop Early V8.23.21] DataTransfer read skipped", error?.message || error); }
      }
    }
    const session = await runtimeMessage({ type: "MARKETPLACE_PHOTO_SESSION_GET_V8220" });
    return session?.ok ? session.payload || null : null;
  }

  function looksLikeOurDrag(event) {
    const types = Array.from(event?.dataTransfer?.types || []);
    return types.includes(MIME);
  }

  function payloadLooksLikeOurs(event) {
    if (looksLikeOurDrag(event)) return true;
    try { return String(event?.dataTransfer?.getData?.("text/plain") || "").startsWith(PREFIX); }
    catch (error) { console.debug("[Photo Drop Early V8.23.21] Plain-text marker read skipped", error?.message || error); return false; }
  }

  function publishPending(payload) {
    if (!payload?.photos?.length) return false;
    const holder = state();
    holder.pendingPayload = payload;
    holder.pendingAt = Date.now();
    try { document.dispatchEvent(new CustomEvent("MARKETPLACE_PHOTO_EARLY_DROP_V8220", { detail: { transferId: payload.transferId || "" } })); }
    catch (error) { console.debug("[Photo Drop Early V8.23.21] Pending event skipped", error?.message || error); }
    return true;
  }

  if (!supportedDestination()) return;

  document.addEventListener("dragover", event => {
    if (!looksLikeOurDrag(event)) return;
    event.preventDefault();
    try { event.dataTransfer.dropEffect = "copy"; }
    catch (error) { console.debug("[Photo Drop Early V8.23.21] dropEffect skipped", error?.message || error); }
  }, true);

  document.addEventListener("drop", event => {
    if (!payloadLooksLikeOurs(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    payloadFromEvent(event).then(payload => {
      if (payload) publishPending(payload);
    }).catch(error => console.debug("[Photo Drop Early V8.23.21] Early drop capture failed", error?.message || error));
  }, true);
})(globalThis);
