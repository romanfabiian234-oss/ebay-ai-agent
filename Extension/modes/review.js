/* Review orchestration — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== modes/review.js ===== */
/* BLOCK 08 — REVIEW. Verification lives here and is never part of normal Autopilot/Queue Fill. */
(function initReviewBlock(global) {
  "use strict";

  async function run(options = {}) {
    const ai = global.EbayBlocksV890?.aiAnalysis;
    if (!ai?.run) throw new Error("AI_ANALYSIS block is not loaded.");
    return ai.run({ ...options, reviewMode: true });
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.review = Object.freeze({ run });
})(globalThis);

/* ===== REVIEW MODE ===== */
/* Review Mode: verification container only. It does not share the normal Fill path. */
(function initReviewMode(global) {
  "use strict";
  async function analyze(options = {}) {
    if (!global.EbayBlocksV890?.review?.run) throw new Error("REVIEW block is not loaded.");
    return global.EbayBlocksV890.review.run(options);
  }
  global.EbayReviewModeV890 = Object.freeze({ analyze, reviewOwner: "modes/review.js" });
})(globalThis);
