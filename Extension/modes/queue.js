/* Queue per-item orchestration using the shared Photo route — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== QUEUE MODE ===== */
/* Queue Mode owns only sequencing. Each opened draft runs the same ONE_ITEM_PROCESS as Autopilot. */
(function initEbayQueueMode(global) {
  "use strict";
  async function runItem(options = {}) {
    if (!global.EbayOneItemProcessV890?.run) throw new Error("ONE_ITEM_PROCESS is not loaded.");
    return global.EbayOneItemProcessV890.run({ ...options, mode: "queue" });
  }
  global.EbayQueueModeV890 = Object.freeze({
    runItem,
    processOwner: "modes/photo.js",
    draftOwner: "modes/photo.js",
    owners: Object.freeze({ photos: "02_READ_PHOTOS", fields: "03_READ_FIELDS", ai: "04_AI_ANALYSIS", match: "05_MATCH_EBAY", fill: "06_FILL_FIELDS", save: "07_SAVE" })
  });
})(globalThis);
