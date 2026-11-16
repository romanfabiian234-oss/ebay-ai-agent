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
assert(core?.buildLocalEvidenceRepairPlan, "Local Evidence repair planner missing");
assert(core?.localEvidenceSupportsIndependentSkip, "Local Evidence independent support decision missing");

const verificationPlan = { questions: ["Brand", "Material", "Country of Origin", "Model", "US Shoe Size"] };
const bundle = {
  answers: { Brand: "Nike", Material: "Cotton" },
  modelResults: {
    Brand: { value: "Nike", rawValue: "Nike" },
    Material: { value: "Cotton", localOcrConflict: true, rawValue: "Cotton" },
    "Country of Origin": { rawValue: "China", value: "" },
    Model: { value: "" },
    "US Shoe Size": { value: "" }
  },
  rejectionReasons: {}
};
const ctx = { recoverableQuestionKeys: new Set(["us shoe size"]) };
const plan = core.buildLocalEvidenceRepairPlan(bundle, verificationPlan, ctx, ["Brand"]);
const decisions = new Map(Array.from(plan.decisions).map(item => [item.field, item]));
assert.strictEqual(decisions.get("Brand").action, "skip");
assert.strictEqual(decisions.get("Brand").code, "local_ocr_verified");
assert.strictEqual(decisions.get("Material").code, "ocr_conflict");
assert.strictEqual(decisions.get("Country of Origin").code, "primary_candidate_rejected");
assert.strictEqual(decisions.get("US Shoe Size").code, "local_direct_evidence_detected");
assert.strictEqual(decisions.get("Model").code, "no_direct_evidence");
assert(plan.questions.includes("Material") && plan.questions.includes("Country of Origin") && plan.questions.includes("US Shoe Size"));
assert(!plan.questions.includes("Brand"));
assert(!plan.questions.includes("Model"));
assert(plan.skippedNoEvidence.includes("Model"));

function ocr(blocks) {
  return {
    ok: true, available: true, engine: "macos_vision",
    photos: [{ ok: true, photoId: "tag-2", displayNumber: 2, blocks: blocks.map(block => ({ confidence: 0.97, votes: 2, box: { x: .1, y: .2, width: .8, height: .1 }, ...block })) }],
    photoCount: 1, blockCount: blocks.length
  };
}

const crossPhoto = core.applyFastOcrIndependentVerification({
  answers: { Brand: "Nike", Material: "Cotton" },
  evidence: {},
  modelResults: {
    Brand: { value: "Nike", confidence: .93, evidenceType: "physical_tag", evidence: "NIKE", photoSources: [1] },
    Material: { value: "Cotton", confidence: .93, evidenceType: "physical_tag", evidence: "100% cotton", photoSources: [1] }
  },
  rejectionReasons: {}, warnings: []
}, ["Brand", "Material"], ocr([{ text: "NIKE" }, { text: "100% COTTON" }]), validator);
assert(crossPhoto.confirmed.includes("Brand"), "strong cross-photo Brand OCR should avoid a paid verifier");
assert(crossPhoto.confirmed.includes("Material"), "strong cross-photo whole-item Material OCR should avoid a paid verifier");
assert.strictEqual(crossPhoto.bundle.modelResults.Brand.localEvidenceMode, "cross_photo_local_evidence");

// More ambiguous direct text such as Model remains same-photo only.
const modelDecision = core.localEvidenceSupportsIndependentSkip("Model", { evidenceType: "physical_tag", photoSources: [1] }, { status: "confirmed", blocks: [{ photoId: "tag-2" }] });
assert.strictEqual(modelDecision.ok, false, "Model must not use broad cross-photo text matching");

console.log(`PASS V8.23.21 Local Evidence Engine: ${plan.questions.length} justified repair field(s), no-evidence fields skipped, strong deterministic cross-photo facts stay single-pass`);
