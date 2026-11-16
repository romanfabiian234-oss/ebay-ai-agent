/* Small storage wrapper for mode files. */
(function initEbayAiStorage(global) {
  "use strict";

  async function get(keys) {
    if (!global.chrome?.storage?.local) return {};
    return chrome.storage.local.get(keys);
  }

  async function set(values) {
    if (!global.chrome?.storage?.local) return;
    await chrome.storage.local.set(values);
  }

  async function remove(keys) {
    if (!global.chrome?.storage?.local) return;
    await chrome.storage.local.remove(keys);
  }

  function onChanged(listener) {
    if (typeof listener !== "function" || !global.chrome?.storage?.onChanged) return () => {};
    chrome.storage.onChanged.addListener(listener);
    return () => { chrome.storage.onChanged.removeListener(listener); };
  }

  global.EbayAiStorageV790 = Object.freeze({ get, set, remove, onChanged });
})(globalThis);
