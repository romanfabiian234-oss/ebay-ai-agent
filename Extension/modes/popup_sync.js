/* V8.23.21 popup synchronization controller. Storage/events stay outside UI. */
(function initPopupSyncV82310(global) {
  "use strict";
  if (global.EbayPopupSyncV82310) return;
  function start({ onQueue, onRunner, onLogs, onUsage, onDrafts } = {}) {
    const stops = [];
    const storage = global.EbayAiStorageV790;
    const keys = global.EbayAiConstantsV790?.STORAGE_KEYS || {};
    if (storage?.onChanged) {
      stops.push(storage.onChanged((changes, area) => {
        if (area !== "local") return;
        if (changes?.[keys.QUEUE] && typeof onQueue === "function") onQueue(changes[keys.QUEUE].newValue || { items: [] });
        if (changes?.[keys.QUEUE_RUNNER] && typeof onRunner === "function") onRunner(changes[keys.QUEUE_RUNNER].newValue || { status: "idle" });
      }));
    }
    const events = global.EbayEventsV82310;
    if (events?.on) {
      stops.push(events.on("diagnostics:logs", () => onLogs?.()));
      stops.push(events.on("diagnostics:usage", () => onUsage?.()));
      stops.push(events.on("diagnostics:drafts", () => onDrafts?.()));
    }
    return () => { for (const stop of stops) stop?.(); };
  }
  global.EbayPopupSyncV82310 = Object.freeze({ start });
})(globalThis);
