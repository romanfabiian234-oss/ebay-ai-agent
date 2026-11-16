/* Text import orchestration using the shared core — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== TEXT PARSER ===== */
/* BLOCK 00 — TEXT INPUT. Parses pasted Field - Value text only; it never fills eBay itself. */
(function initTextInputBlock(global) {
  "use strict";

  function clean(value, limit = 160) { return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }
  function key(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  function run(text = "", { questions = [] } = {}) {
    const parser = global.EbayAiFieldParserV790;
    if (!parser?.parseFieldValueText) throw new Error("TEXT_INPUT parser is not loaded.");
    // Normal Text mode follows the same Best Answer policy as normal Photo/Autopilot:
    // Vintage/Handmade/Personalize = No, Fabric Weight and an exact eBay option None are valid candidates.
    const parsed = parser.parseFieldValueText(text, { strictAiDefaults: false });
    const ordered = Array.isArray(questions) ? questions.map(value => clean(value, 120)).filter(Boolean) : [];
    if (!ordered.length) return parsed;

    const exactByKey = new Map(ordered.map(question => [key(question), question]));
    const answers = {};
    const rows = [];
    const ignored = [...(parsed.ignored || [])];
    for (const row of parsed.rows || []) {
      const exact = exactByKey.get(key(row.label));
      if (!exact) {
        ignored.push({ label: row.label, value: row.value, reason: "unrequested field" });
        continue;
      }
      answers[exact] = row.value;
      rows.push({ label: exact, value: row.value });
    }
    return { ...parsed, answers, rows, ignored, answerCount: rows.length };
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.textInput = Object.freeze({ run, key });
})(globalThis);

/* ===== TEXT MODE ===== */
/* Text Mode: BLOCK 00 -> BLOCK 05 -> BLOCK 06 -> BLOCK 07. No AI or private Fill. */
(function initTextMode(global) {
  "use strict";
  global.EbayTextModeV890 = Object.freeze({
    parse: (text, options = {}) => global.EbayBlocksV890.textInput.run(text, options),
    owners: Object.freeze({ input: "00_TEXT_INPUT", match: "05_MATCH_EBAY", fill: "06_FILL_FIELDS", save: "07_SAVE" })
  });
})(globalThis);
