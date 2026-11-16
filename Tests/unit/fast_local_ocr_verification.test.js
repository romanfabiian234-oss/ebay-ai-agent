#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
const context = { console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
for (const rel of [
  "Extension/shared/config.js",
  "Extension/core/policy.js",
  "Extension/core/snapshot.js",
  "Extension/core/ai.js"
]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

const core = context.EbayCoreAiV800;
const validator = context.EbayEvidenceValidatorV860;
assert(core?.applyFastOcrIndependentVerification, "fast local OCR verifier missing");
assert(core?.fastOcrEligibleQuestions, "fast local OCR field gate missing");
assert(validator?.photoBlocks && validator?.evidenceForField, "OCR evidence validator missing");

assert.deepStrictEqual(
  Array.from(core.fastOcrEligibleQuestions(["Brand", "Size", "Material", "Country of Origin", "Garment Care", "Color", "Style", "Vintage"])),
  ["Brand", "Size", "Material", "Country of Origin", "Garment Care"],
  "local OCR must stay limited to direct label facts and never replace GPT for visual/ambiguous fields"
);

function ocrWith(blocks) {
  return {
    ok: true,
    available: true,
    engine: "macos_vision",
    photos: [{
      ok: true,
      photoId: "tag-1",
      displayNumber: 2,
      blocks: blocks.map(block => ({
        confidence: 0.96,
        votes: 2,
        box: { x: 0.15, y: 0.2, width: 0.7, height: 0.08 },
        ...block
      }))
    }],
    photoCount: 1,
    blockCount: blocks.length
  };
}

const bundle = {
  answers: {
    Brand: "Nike",
    Material: "Cotton",
    "Country of Origin": "China",
    "Garment Care": "Machine Washable",
    Color: "Black"
  },
  evidence: {},
  modelResults: {
    Brand: { value: "Nike", confidence: 0.96, evidenceType: "physical_tag", evidence: "Brand label reads Nike", photoSources: [2] },
    Material: { value: "Cotton", confidence: 0.95, evidenceType: "physical_tag", evidence: "Composition label reads cotton", photoSources: [2] },
    "Country of Origin": { value: "China", confidence: 0.95, evidenceType: "physical_tag", evidence: "Made in China", photoSources: [2] },
    "Garment Care": { value: "Machine Washable", confidence: 0.95, evidenceType: "physical_tag", evidence: "Machine wash cold", photoSources: [2] },
    Color: { value: "Black", confidence: 0.95, evidenceType: "visual", evidence: "Product appears black", photoSources: [1] }
  },
  rejectionReasons: {},
  warnings: []
};

const strongOcr = ocrWith([
  { text: "NIKE" },
  { text: "100% COTTON" },
  { text: "MADE IN CHINA" },
  { text: "MACHINE WASH COLD" }
]);
const checked = core.applyFastOcrIndependentVerification(
  bundle,
  ["Brand", "Material", "Country of Origin", "Garment Care", "Color"],
  strongOcr,
  validator
);
for (const field of ["Brand", "Material", "Country of Origin", "Garment Care"]) {
  assert(checked.confirmed.includes(field), `${field} should be independently confirmed by strong local OCR`);
  if (field === "Material") {
    assert.strictEqual(checked.bundle.answers[field], "100% Cotton", "physical 100% evidence should safely upgrade generic Material specificity");
    assert.strictEqual(checked.bundle.modelResults[field].localOcrSpecificityUpgrade, true);
  } else {
    assert.strictEqual(checked.bundle.answers[field], bundle.answers[field], `${field} primary GPT answer must be preserved`);
  }
  assert.strictEqual(checked.bundle.modelResults[field].independentVerifier, "local_ocr");
  assert.strictEqual(checked.bundle.modelResults[field].independentVerification, true);
}
assert(!checked.confirmed.includes("Color"), "Color must never skip GPT verification from OCR text");
assert.strictEqual(checked.bundle.answers.Color, "Black", "visual answer must remain untouched by OCR helper");

// V8.23.21 Local Evidence Engine may use a different gallery photo when field-specific OCR independently confirms the exact direct fact with strong consensus.
const wrongPhoto = core.applyFastOcrIndependentVerification(
  {
    answers: { Brand: "Nike" },
    evidence: {},
    modelResults: { Brand: { value: "Nike", evidenceType: "physical_tag", photoSources: [1] } },
    rejectionReasons: {},
    warnings: []
  },
  ["Brand"],
  strongOcr,
  validator
);
assert(wrongPhoto.confirmed.includes("Brand"), "strong field-specific OCR from another product photo should independently validate Brand");
assert.strictEqual(wrongPhoto.bundle.modelResults.Brand.localEvidenceMode, "cross_photo_local_evidence", "cross-photo local validation mode should be diagnostic");

const sellerOnly = core.applyFastOcrIndependentVerification(
  {
    answers: { Brand: "Nike" },
    evidence: {},
    modelResults: { Brand: { value: "Nike", evidenceType: "seller_context", photoSources: [] } },
    rejectionReasons: {},
    warnings: []
  },
  ["Brand"],
  strongOcr,
  validator
);
assert(sellerOnly.confirmed.includes("Brand"), "strong direct local OCR may independently validate a seller-context primary value without a paid second read");
assert.strictEqual(sellerOnly.bundle.modelResults.Brand.independentVerifier, "local_ocr");

// OCR may confirm an existing GPT answer, but it must never invent/recover a missing normal-Fill answer.
const missing = core.applyFastOcrIndependentVerification(
  { answers: {}, evidence: {}, modelResults: {}, rejectionReasons: {}, warnings: [] },
  ["Brand", "Material", "Country of Origin"],
  strongOcr,
  validator
);
assert.deepStrictEqual(Array.from(missing.confirmed), [], "missing GPT answers must not be recovered by normal-Fill OCR");
assert.deepStrictEqual(Object.keys(missing.bundle.answers || {}), [], "OCR must not create standalone normal-Fill answers");

// A strong contradiction must not overwrite the GPT answer. It stays scheduled for the paid independent verifier.
const conflict = core.applyFastOcrIndependentVerification(
  {
    answers: { "Country of Origin": "China" },
    evidence: {},
    modelResults: { "Country of Origin": { value: "China", confidence: 0.95 } },
    rejectionReasons: {},
    warnings: []
  },
  ["Country of Origin"],
  ocrWith([{ text: "MADE IN VIETNAM" }]),
  validator
);
assert(conflict.conflicts.includes("Country of Origin"), "direct OCR contradiction should be flagged");
assert.strictEqual(conflict.bundle.answers["Country of Origin"], "China", "OCR conflict must not auto-correct the primary answer");
assert.strictEqual(conflict.bundle.modelResults["Country of Origin"].localOcrConflict, true);

// Low-confidence OCR must never suppress the independent GPT verifier.
const weakOcr = ocrWith([{ text: "100% COTTON", confidence: 0.61, votes: 1 }]);
const weak = core.applyFastOcrIndependentVerification(
  {
    answers: { Material: "Cotton" },
    evidence: {},
    modelResults: { Material: { value: "Cotton", confidence: 0.95 } },
    rejectionReasons: {},
    warnings: []
  },
  ["Material"],
  weakOcr,
  validator
);
assert(!weak.confirmed.includes("Material"), "weak OCR must not count as independent verification");
assert(weak.weak.includes("Material"), "weak OCR should be visible diagnostically");

console.log("PASS V8.23.21 local OCR only confirms high-confidence direct label facts, never invents visual answers, and conflicts remain for GPT verification");
