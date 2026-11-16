/* V8.23.21 lightweight cross-container event bus. No UI ownership. */
(function initEbayEventsV82310(global) {
  "use strict";
  if (global.EbayEventsV82310) return;
  const listeners = new Map();
  function on(type, listener) {
    const key = String(type || "");
    if (!key || typeof listener !== "function") return () => {};
    const bucket = listeners.get(key) || new Set();
    bucket.add(listener); listeners.set(key, bucket);
    return () => { bucket.delete(listener); if (!bucket.size) listeners.delete(key); };
  }
  function emit(type, payload) {
    const bucket = listeners.get(String(type || ""));
    if (!bucket) return;
    for (const listener of [...bucket]) {
      try { listener(payload); }
      catch (error) { global.EbayLogger?.warn?.("Event listener failed", { type: String(type || ""), message: error?.message || String(error) }); }
    }
  }
  global.EbayEventsV82310 = Object.freeze({ on, emit });
})(globalThis);
