/* Final autosave verification — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== AUTOSAVE ===== */
/* BLOCK 07 — SAVE. One final autosave check after the batch Fill. */
(function initSaveBlock(global) {
  "use strict";

  async function run({ tabId, draftId = "", fill = {}, timeoutMs = 12000, baselineValues = {}, expectedAnswers = {} } = {}) {
    const changed = Number(fill?.filled || 0) > 0 || Number(fill?.partial || 0) > 0 || Number(fill?.valuesFilled || 0) > 0;
    if (!changed) return { ok: true, confirmed: true, changed: false, message: "No new field values required autosave." };
    const core = global.EbayCore?.ebay;
    if (!Number.isInteger(tabId) || !core?.waitAutosave) throw new Error("SAVE requires the eBay autosave checker.");
    return core.waitAutosave(tabId, {
      expectedDraftId: draftId || undefined,
      changed: true,
      timeoutMs: Math.min(10000, Number(timeoutMs || 12000)),
      autosaveEvidence: fill?.autosaveEvidence || {},
      baselineValues,
      expectedAnswers
    }, Math.max(5000, Number(timeoutMs || 12000)));
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.save = Object.freeze({ run });
})(globalThis);
