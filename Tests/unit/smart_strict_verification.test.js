#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
const context = { console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, setTimeout, clearTimeout, Promise };
context.globalThis = context;
vm.createContext(context);
for (const rel of [
  "Extension/shared/config.js",
  "Extension/core/policy.js",
  "Extension/core/snapshot.js",
  "Extension/core/ai.js"
]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

const processor = context.EbayCoreAiAnswerProcessorV800;
assert(processor?.smartStrictVerificationPlan, "smart strict verification planner missing");

const questions = [
  "Brand", "Size", "Material", "Garment Care", "Country of Origin", "Model", "Product Line",
  "Vintage", "Character", "Character Family", "Fabric Weight", "Performance/Activity",
  "Cushioning Level", "Midsole Type", "US Shoe Size"
];
const fields = questions.map(name => ({
  name,
  type: name === "Vintage" ? "yesno" : name === "Material" ? "multi" : "single",
  options: name === "Vintage" ? ["Yes", "No"] : ["Nike", "M", "Leather", "China", "Other"]
}));

const answers = {
  Brand: "Nike",
  Size: "M",
  Material: "Leather",
  "Garment Care": "Machine Wash",
  "Country of Origin": "China",
  Model: "Air Zoom",
  "Product Line": "Nike Air",
  Vintage: "Yes",
  Character: "Mickey Mouse",
  "Character Family": "Disney",
  "Fabric Weight": "Midweight",
  "Performance/Activity": "Running",
  "Cushioning Level": "Moderate",
  "Midsole Type": "Foam"
};
const modelResults = {};
for (const [index, question] of questions.entries()) {
  if (!answers[question]) continue;
  modelResults[question] = {
    value: answers[question],
    confidence: 0.9,
    evidenceType: ["Character", "Character Family"].includes(question) ? "visual" : "physical_tag",
    evidence: `${question} visibly shows ${answers[question]}`,
    photoSources: [1 + (index % 2)]
  };
}

const plan = processor.smartStrictVerificationPlan({ answers, modelResults, rejectionReasons: {} }, questions, fields, 8);
for (const direct of ["Brand", "Size", "Material", "Garment Care", "Country of Origin", "Model", "Product Line", "Vintage", "Character", "Character Family", "Fabric Weight", "Performance/Activity", "Cushioning Level", "Midsole Type"]) {
  assert(!plan.questions.includes(direct), `${direct} with validated direct primary support should stay single-pass`);
  assert(plan.skippedDirect.includes(direct), `${direct} should be reported as validated direct primary support`);
}
assert(plan.questions.includes("US Shoe Size"), "missing critical shoe size remains a recovery candidate before evidence gating");

// Visual evidence can skip only named Character fields; hidden technical fields cannot.
const unsafeVisual = JSON.parse(JSON.stringify({ answers, modelResults, rejectionReasons: {} }));
unsafeVisual.modelResults["Performance/Activity"].evidenceType = "visual";
const unsafeVisualPlan = processor.smartStrictVerificationPlan(unsafeVisual, questions, fields, 8);
assert(unsafeVisualPlan.questions.includes("Performance/Activity"), "technical visual-only support must remain unresolved");

// Any strict field goes back to the verifier when direct primary support is weak.
const weakBundle = JSON.parse(JSON.stringify({ answers, modelResults, rejectionReasons: {} }));
weakBundle.modelResults["Fabric Weight"].photoSources = [];
const weakPlan = processor.smartStrictVerificationPlan(weakBundle, questions, fields, 8);
assert(weakPlan.questions.includes("Fabric Weight"), "strict field without a supporting photo must be verified");
assert(!weakPlan.skippedDirect.includes("Fabric Weight"), "weak strict evidence must never be labeled safe single-pass");

// Seller context is useful primary context, but it is not direct physical evidence and still needs re-read.
const sellerContextPlan = processor.smartStrictVerificationPlan({
  answers: { Brand: "Nike" },
  modelResults: { Brand: { value: "Nike", confidence: 0.9, evidenceType: "seller_context", evidence: "Seller title says Nike", photoSources: [] } },
  rejectionReasons: {}
}, ["Brand"], [{ name: "Brand", type: "single", options: ["Nike"] }], 8);
assert(sellerContextPlan.questions.includes("Brand"), "seller-context-only Brand must not bypass direct-evidence verification");

// Explicit binary physical evidence can stay single-pass in normal Fill.
const binaryLabelPlan = processor.smartStrictVerificationPlan({
  answers: { Vintage: "Yes" },
  modelResults: { Vintage: { value: "Yes", confidence: 0.9, evidenceType: "physical_tag", evidence: "Vintage Yes marking", photoSources: [1] } },
  rejectionReasons: {}
}, ["Vintage"], [{ name: "Vintage", type: "single", options: [] }], 8);
assert(!binaryLabelPlan.questions.includes("Vintage"), "explicit physical binary evidence should not force a second paid read");
assert(binaryLabelPlan.skippedDirect.includes("Vintage"));

const coreAi = context.EbayCoreAiV800;
assert(coreAi?.smartStrictRecoveryImages, "smart strict recovery photo picker missing");
const primaryImages = Array.from({ length: 5 }, (_, index) => ({
  url: `https://i.ebayimg.com/images/g/test${index + 1}/s-l1600.jpg`,
  photoId: `p${index + 1}`,
  requestPhotoNumber: index + 1,
  role: index === 1 ? "brand size tag" : index === 3 ? "care material tag" : "detail"
}));
const photoBundle = {
  answers: { Brand: "Nike", Material: "Leather" },
  modelResults: {
    Brand: { photoSources: [2] },
    Material: { photoSources: [4] }
  }
};
const picked = Array.from(coreAi.smartStrictRecoveryImages(primaryImages, primaryImages, photoBundle, ["Brand", "Material"], 2));
assert(picked.length <= 2, `Balanced repair should normally use no more than 2 photos, got ${picked.length}`);
assert(picked.some(image => image.photoId === "p2"), "Brand supporting photo must be retained");
assert(picked.some(image => image.photoId === "p4"), "Material supporting photo must be retained");
assert(picked.every(image => image.forceHighDetail === true), "strict verification photos must stay high detail");

const oneKnown = Array.from(coreAi.smartStrictRecoveryImages(primaryImages, primaryImages, photoBundle, ["Brand"], 2));
assert.strictEqual(oneKnown.length, 1, "one exact primary support photo must not be padded with an unrelated second HIGH-detail image");
assert.strictEqual(oneKnown[0].photoId, "p2");

const ocrPreferred = Array.from(coreAi.smartStrictRecoveryImages(
  primaryImages.slice(0, 2),
  primaryImages,
  { answers: {}, modelResults: {} },
  ["Garment Care"],
  2,
  { "Garment Care": ["p4"] }
));
assert.strictEqual(ocrPreferred.length, 1, "one exact OCR evidence photo must be sufficient for a missing-field repair");
assert.strictEqual(ocrPreferred[0].photoId, "p4", "repair must use the exact OCR evidence photo before gallery heuristics");
assert.strictEqual(ocrPreferred[0].forceHighDetail, true);

console.log(`PASS V8.23.21 smart strict verification: validated direct support stays single-pass; exact repair evidence is not padded; ${plan.questions.length} unresolved candidate(s) remain bounded`);
