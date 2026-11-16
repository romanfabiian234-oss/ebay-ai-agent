#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const { webcrypto } = require("crypto");
const ROOT = path.resolve(__dirname, "../..");
const store = {};
const context = {
  console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise, crypto: webcrypto,
  chrome: { storage: { local: {
    async get(key) { return typeof key === "string" ? { [key]: store[key] } : { ...store }; },
    async set(values) { Object.assign(store, values); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) delete store[k]; }
  } } }
};
context.globalThis = context;
vm.createContext(context);
for (const rel of ["Extension/shared/config.js", "Extension/shared/usage.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

(async () => {
  const usage = context.EbayUsageV8237;
  await usage.startRequest({
    id: "repair-telemetry",
    provider: "openai", model: "gpt-5.6", stage: "recovery", analysisRunId: "fill-1",
    photoCount: 1, highDetailPhotoCount: 1,
    questionNames: ["Material", "Country of Origin"],
    repairReasons: [
      { field: "Material", code: "ocr_conflict", reason: "OCR conflicts with primary." },
      { field: "Country of Origin", code: "primary_candidate_rejected", reason: "Primary failed evidence validation." }
    ],
    photoIds: ["tag-4"], estimatedCost: .02, estimatedInputTokens: 2400, estimatedOutputTokens: 800
  });
  await usage.finishRequest("repair-telemetry", { status: "success", inputTokens: 2100, outputTokens: 180, totalTokens: 2280, cost: .0159, costKnown: true, uncertainCharge: false });
  const record = (await usage.history()).find(item => item.id === "repair-telemetry");
  assert(record, "repair ledger record missing");
  assert.deepStrictEqual(Array.from(record.questionNames), ["Material", "Country of Origin"]);
  assert.strictEqual(record.repairReasons[0].code, "ocr_conflict");
  assert.strictEqual(record.photoIds[0], "tag-4");
  assert.strictEqual(record.highDetailPhotoCount, 1);
  assert.strictEqual(record.costKnown, true);
  assert(Math.abs(record.cost - .0159) < 1e-12);

  const uiSource = fs.readFileSync(path.join(ROOT, "Extension/ui/diagnostics/diagnostics.js"), "utf8");
  assert(uiSource.includes("Repair reasons:"), "Diagnostics UI must expose per-field repair reasons");
  assert(uiSource.includes("HIGH detail"), "Diagnostics UI must expose HIGH-detail photo count");
  assert(uiSource.includes("Fields:"), "Diagnostics UI must expose per-request field names");
  assert(uiSource.includes("LATEST ANALYSIS RUNS"), "Diagnostics UI must group requests by analysis run for per-item cost visibility");
  assert(uiSource.includes("summarizeAnalysisRunsV82318"), "Diagnostics UI must calculate request/token/cost totals per analysis run");

  console.log("PASS V8.23.21 per-field repair telemetry: fields, reason codes, evidence photos, token/cost record are preserved for diagnostics");
})().catch(error => { console.error(error); process.exit(1); });
