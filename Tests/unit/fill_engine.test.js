"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const extension = path.resolve(__dirname, "../../Extension");
const context = vm.createContext({ console, setTimeout, clearTimeout, Promise, Map, Set, Object, Array, String, Number, Boolean, Math, Date });
context.globalThis = context;
context.EbayPageFieldsV810 = { draftIdFromUrl: () => "draft-96" };
for (const relative of [
  "core/policy.js",
  "core/verify.js",
  "core/fill.js"
]) vm.runInContext(fs.readFileSync(path.join(extension, relative), "utf8"), context, { filename: relative });

const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function dropdown(name, initial = "", allowed = []) {
  let current = initial, open = false, openCount = 0;
  return {
    name, label: name, type: "dropdown", order: 1,
    get openCount() { return openCount; },
    async read() { return current; },
    async open() { if (!open) { open = true; openCount += 1; } return true; },
    async close() { open = false; return true; },
    async options() { return allowed.slice(); },
    async isSelected(value) { return normalize(current) === normalize(value); },
    async selectExact(value) {
      if (!open || !allowed.some(option => normalize(option) === normalize(value))) {
        this.lastSelectionResult = { retryable: false, code: "exact_option_unavailable" };
        return false;
      }
      current = allowed.find(option => normalize(option) === normalize(value));
      this.lastSelectionResult = { retryable: false, code: "exact_selected", kind: "exact" };
      return true;
    }
  };
}
function text(name, initial = "", delayMs = 0) {
  let current = initial;
  return {
    name, label: name, type: "text", order: 4,
    async read() { return current; },
    async write(value) { if (delayMs) await new Promise(r => setTimeout(r, delayMs)); current = String(value); return true; }
  };
}
function multi(name, initial = [], allowed = []) {
  const selected = new Set(initial.map(normalize));
  let open = false, openCount = 0;
  return {
    name, label: name, type: "multi", order: 2,
    get openCount() { return openCount; },
    async read() { return allowed.filter(v => selected.has(normalize(v))).join(", "); },
    async open() { if (!open) { open = true; openCount += 1; } return true; },
    async close() { open = false; return true; },
    async options() { return allowed.slice(); },
    async isSelected(value) { return selected.has(normalize(value)); },
    async selectExact(value) {
      if (!open || !allowed.some(option => normalize(option) === normalize(value))) {
        this.lastSelectionResult = { retryable: false, code: "exact_option_unavailable" };
        return false;
      }
      selected.add(normalize(value));
      this.lastSelectionResult = { retryable: false, code: "exact_selected", kind: "exact" };
      return true;
    }
  };
}
function yesno(name, initial = "") {
  let current = initial;
  return {
    name, label: name, type: "yesno", order: 3,
    async read() { return current; },
    async open() { return true; },
    async close() { return true; },
    async isSelected(value) { return normalize(current) === normalize(value); },
    async selectExact(value) {
      if (!/^(yes|no)$/i.test(String(value))) return false;
      current = /^yes$/i.test(String(value)) ? "Yes" : "No";
      this.lastSelectionResult = { retryable: false, code: "yesno_selected", kind: "exact" };
      return true;
    }
  };
}

(async () => {
  const season = multi("Season", ["Fall"], ["Spring", "Summer", "Fall", "Winter"]);
  const fieldMap = new Map([
    [normalize("Brand"), dropdown("Brand", "", ["Gucci", "Nike"])],
    [normalize("Season"), season],
    [normalize("Handmade"), yesno("Handmade", "")],
    [normalize("Fabric Type"), text("Fabric Type", "")]
  ]);
  let forbiddenAdapterCalls = 0;
  context.EbayAiFillEngineV790.registerAdapters({
    getPreparedFieldMap: async () => fieldMap,
    shouldStop: async () => false,
    closeOpenMenus: async () => ({ ok: true }),
    waitAutosave: async () => ({ ok: true, confirmed: true }),
    showResult: async () => ({ ok: true }),
    // Regression guard: old runtime adapters must never be the field writer.
    fillPreparedField: async () => { forbiddenAdapterCalls += 1; throw new Error("legacy writer used"); }
  });

  const result = await context.EbayCore.fill.fillAll({
    expectedDraftId: "draft-96",
    answers: {
      Brand: "Gucci",
      Season: "Fall, Winter, Spring",
      Handmade: "No",
      "Fabric Type": "Knit",
      "Missing Field": "Value",
      UPC: "123456789012",
      MPN: "DO-NOT-TOUCH"
    },
    waitForAutosave: true
  }, "queue");

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.answerCount, 5, "UPC/MPN must be removed before the writer");
  assert.strictEqual(result.processedCount, 5);
  assert.strictEqual(result.allAnswersProcessed, true);
  assert.strictEqual(result.filled, 4);
  assert.strictEqual(result.review, 1);
  assert.strictEqual(result.retryCount, 0, "known unavailable/missing fields must not trigger broad retry");
  assert.strictEqual(result.fillPasses, 1);
  assert.strictEqual(season.openCount, 1, "multi-select must open once for all values");
  assert.strictEqual(forbiddenAdapterCalls, 0, "legacy adapter writer must never be used");
  assert.ok(result.reviewFields.some(row => row.includes("Missing Field")));
  assert.ok(String(result.engine).includes("single-core-fill-v8.23.21"));

  const material = multi("Material", [], ["Polyester", "Other"]);
  const materialResult = await context.EbaySimpleFillV810.fill(material, "99% Polyester, 1% Other Fiber");
  assert.strictEqual(materialResult.status, "filled");
  assert.strictEqual(materialResult.okCount, 2);
  assert.strictEqual(material.openCount, 1);

  const invalidYesNo = await context.EbaySimpleFillV810.fill(yesno("Vintage"), "Maybe");
  assert.strictEqual(invalidYesNo.status, "review");
  assert.strictEqual(invalidYesNo.failureCode, "invalid_yesno_value");
  // V8.23.21 regression: a Size recovered by local OCR from an incomplete snapshot
  // is still accepted only after the shared Fill Engine finds the exact live option.
  const size = dropdown("Size", "", ["3XS", "2XS", "XS", "S", "M", "L", "XL"]);
  const sizeResult = await context.EbaySimpleFillV810.fill(size, "XS");
  assert.strictEqual(sizeResult.status, "filled");
  assert.strictEqual(await size.read(), "XS");
  assert.strictEqual(size.openCount, 1);


  // One page-level writer lock must reject a concurrent operation immediately.
  const slow = text("Fabric Type", "", 120);
  const slowMap = new Map([[normalize("Fabric Type"), slow]]);
  context.EbayAiFillEngineV790.registerAdapters({ getPreparedFieldMap: async () => slowMap });
  const first = context.EbayAiFillEngineV790.fillOne({ mode: "manual", payload: { label: "Fabric Type", value: "Woven" } });
  const second = await context.EbayAiFillEngineV790.fillOne({ mode: "manual", payload: { label: "Fabric Type", value: "Knit" } });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.busy, true, "second page writer must be blocked by operation lock");
  const firstResult = await first;
  assert.strictEqual(firstResult.status, "filled");
  assert.strictEqual(await slow.read(), "Woven");
  assert.strictEqual(context.EbayAiFillEngineV790.operationStatus(), null, "lock must release after completion");

  console.log("PASS V8.23.21 single Fill Engine, exact live Size/Yes-No, multi-select, material normalization and page writer lock");
})().catch(error => { console.error(error); process.exit(1); });
