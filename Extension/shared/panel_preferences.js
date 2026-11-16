/* V8.23.21 Control Panel preference boundary. */
(function initPanelPreferencesV82310(global) {
  "use strict";
  if (global.EbayPanelPreferencesV82310) return;
  const key = global.EbayAiConstantsV790?.STORAGE_KEYS?.SETTINGS;
  const defaults = global.EbayAiConstantsV790?.DEFAULT_SETTINGS || {};
  async function load() {
    if (!key || !global.EbayAiStorageV790?.get) return { ...defaults };
    const stored = await global.EbayAiStorageV790.get(key);
    return { ...defaults, ...(stored?.[key] || {}) };
  }
  function subscribe(listener) {
    if (!key || typeof listener !== "function" || !global.EbayAiStorageV790?.onChanged) return () => {};
    return global.EbayAiStorageV790.onChanged((changes, area) => {
      if (area !== "local" || !changes?.[key]) return;
      listener({ ...defaults, ...(changes[key].newValue || {}) });
    });
  }
  const PREVIEW_WIDTH_KEY = "ebayAiA412PreviewPanelWidth";
  function loadPreviewWidth() {
    try {
      const value = Number(global.localStorage?.getItem?.(PREVIEW_WIDTH_KEY) || "");
      return Number.isFinite(value) && value >= 320 ? value : null;
    } catch (error) {
      global.EbayLogger?.debug?.("Fill Preview width preference unavailable", { message: error?.message || String(error) });
      return null;
    }
  }
  function savePreviewWidth(value) {
    const width = Math.round(Number(value) || 0);
    if (width < 320) return false;
    try {
      global.localStorage?.setItem?.(PREVIEW_WIDTH_KEY, String(width));
      return true;
    } catch (error) {
      global.EbayLogger?.debug?.("Fill Preview width preference save failed", { message: error?.message || String(error) });
      return false;
    }
  }
  global.EbayPanelPreferencesV82310 = Object.freeze({ load, subscribe, loadPreviewWidth, savePreviewWidth });
})(globalThis);
