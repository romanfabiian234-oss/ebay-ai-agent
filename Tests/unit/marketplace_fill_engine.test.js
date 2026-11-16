"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const extension = path.resolve(__dirname, "../../Extension");
const context = vm.createContext({ console, setTimeout, clearTimeout, Promise, Map, Set, Object, Array, String, Number, Boolean, Math, Date, URL });
context.globalThis = context;
context.location = { hostname: "www.depop.com", href: "https://www.depop.com/products/create/" };
context.EbayPageFieldsV810 = { draftIdFromUrl: () => "" };
for (const relative of ["core/policy.js", "core/verify.js", "core/fill.js"]) {
  vm.runInContext(fs.readFileSync(path.join(extension, relative), "utf8"), context, { filename: relative });
}
const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function dropdown(name, allowed) {
  let current = "";
  return {
    name, label: name, type: "dropdown", order: name === "Category" ? 0 : 1,
    async read() { return current; }, async open() { return true; }, async close() { return true; },
    async options() { return allowed.slice(); }, async isSelected(value) { return normalize(current) === normalize(value); },
    async selectExact(value) {
      const hit = allowed.find(option => normalize(option) === normalize(value));
      if (!hit) { this.lastSelectionResult = { retryable: false, code: "exact_option_not_found" }; return false; }
      current = hit; this.lastSelectionResult = { retryable: false, kind: "exact" }; return true;
    }
  };
}
(async () => {
  assert.strictEqual(context.EbayAiSafetyV790.isBlockedField("Category"), false, "Depop Category must be allowed");
  assert.strictEqual(context.EbayAiSafetyV790.isBlockedField("Condition"), false, "Depop Condition must be allowed");
  assert.strictEqual(context.EbayAiSafetyV790.isBlockedField("Item price"), true, "Depop price must stay protected");
  const map = new Map([
    [normalize("Category"), dropdown("Category", ["Women > Accessories > Bags"])],
    [normalize("Condition"), dropdown("Condition", ["Used - Excellent", "Used - Good"])],
    [normalize("Color"), dropdown("Color", ["Pink", "Black"])]
  ]);
  context.EbayAiFillEngineV790.registerAdapters({
    getPreparedFieldMap: async () => map, shouldStop: async () => false,
    closeOpenMenus: async () => ({ ok: true }), waitAutosave: async () => ({ ok: true, confirmed: true })
  });
  const result = await context.EbayAiFillEngineV790.fillAll({
    answers: { Category: "Women > Accessories > Bags", Condition: "Used - Excellent", Color: "Pink", "Item price": "999" },
    fieldMap: map, waitForAutosave: false
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.answerCount, 3, "protected Item price must be removed before shared Fill Engine");
  assert.strictEqual(result.filled, 3);
  context.location.hostname = "www.ebay.com"; context.location.href = "https://www.ebay.com/lstng?draftId=test";
  assert.strictEqual(context.EbayAiSafetyV790.isBlockedField("Category"), true, "eBay Category protection must remain unchanged");
  assert.strictEqual(context.EbayAiSafetyV790.isBlockedField("Condition"), true, "eBay Condition protection must remain unchanged");
  console.log("PASS V8.23.21 marketplace safety uses the same Fill Engine while preserving eBay protected fields");
})().catch(error => { console.error(error); process.exit(1); });
