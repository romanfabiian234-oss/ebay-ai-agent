#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
function makeContext() {
  const context = { console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise, setTimeout, clearTimeout };
  context.globalThis = context;
  vm.createContext(context);
  for (const rel of [
    "Extension/shared/config.js",
    "Extension/core/policy.js",
    "Extension/core/snapshot.js",
    "Extension/core/fill.js",
    "Extension/core/ai.js"
  ]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
  return context;
}

function shoeOcr(confidence = 0.97, votes = 2, role = "shoe size material label") {
  const lines = ["9", "2E", "LEATHER UPPER", "SYNTHETIC LINING", "MAN MADE SOLE", "MADE IN CHINA"];
  return {
    ok: true,
    available: true,
    healthy: true,
    engine: "macos_vision",
    durationMs: 8,
    photos: [{
      ok: true,
      photoId: "p7",
      displayNumber: 7,
      role,
      blocks: lines.map(text => ({ text, confidence, votes }))
    }],
    photoCount: 1,
    blockCount: lines.length
  };
}

const shoeFields = [
  { name: "US Shoe Size", type: "single", options: ["8.5", "9", "9.5"] },
  { name: "Shoe Width", type: "single", options: ["M", "W", "2E"] },
  { name: "Upper Material", type: "single", options: ["Leather", "Synthetic", "Textile"] },
  { name: "Lining Material", type: "single", options: ["Leather", "Synthetic", "Textile"] },
  { name: "Outsole Material", type: "single", options: ["Rubber", "Synthetic", "Leather"] },
  { name: "Country of Origin", type: "single", options: ["China", "Vietnam"] },
  { name: "Color", type: "single", options: ["Black", "Brown"] }
];
const directQuestions = shoeFields.slice(0, 6).map(field => field.name);

// Deterministic parsing: the exact physical label from the real shoe test must be
// recoverable field-by-field, never collapsed into a generic Material guess.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const blocks = validator.photoBlocks(shoeOcr());
  const expected = {
    "US Shoe Size": "9",
    "Shoe Width": "2E",
    "Upper Material": "Leather",
    "Lining Material": "Synthetic",
    "Outsole Material": "Synthetic",
    "Country of Origin": "China"
  };
  for (const field of shoeFields.slice(0, 6)) {
    const candidate = validator.deriveOcrCandidate(field.name, blocks, field);
    assert(candidate, `${field.name} direct OCR candidate missing`);
    assert.strictEqual(candidate.value, expected[field.name], `${field.name} direct OCR value mismatch`);
    const evidence = validator.evidenceForField(field.name, candidate.value, blocks);
    assert.strictEqual(evidence.status, "confirmed", `${field.name} must have deterministic direct evidence`);
  }
  const genericMaterial = validator.deriveOcrCandidate("Material", blocks, { name: "Material", options: ["Leather", "Synthetic"] });
  assert.strictEqual(genericMaterial, null, "LEATHER UPPER must not be promoted to generic whole-item Material");
}

// Bare numeric text is unsafe unless the same photo is clearly a shoe label.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const ocr = {
    ok: true, available: true, photos: [{ photoId: "p1", displayNumber: 1, role: "front product photo", blocks: [
      { text: "9", confidence: 0.98, votes: 2 }, { text: "2E", confidence: 0.98, votes: 2 }
    ] }]
  };
  const blocks = validator.photoBlocks(ocr);
  assert.strictEqual(validator.deriveOcrCandidate("US Shoe Size", blocks, shoeFields[0]), null, "bare visual 9 must not become shoe size");
  assert.strictEqual(validator.deriveOcrCandidate("Shoe Width", blocks, shoeFields[1]), null, "bare visual 2E must not become shoe width");
}

// High-confidence OCR may recover missing direct fields, but weak OCR and values not
// present in the live eBay option list must remain blank.
{
  const context = makeContext();
  const core = context.EbayCoreAiV800;
  const validator = context.EbayEvidenceValidatorV860;
  const emptyBundle = { answers: {}, evidence: {}, modelResults: {}, rejectionReasons: {}, warnings: [] };
  const strong = core.applyFastOcrMissingRecovery(emptyBundle, directQuestions, shoeOcr(), validator, shoeFields);
  assert.deepStrictEqual(Array.from(strong.recovered), directQuestions, "all six strong direct shoe facts should recover locally");
  assert.strictEqual(strong.bundle.answers["US Shoe Size"], "9");
  assert.strictEqual(strong.bundle.answers["Shoe Width"], "2E");
  assert.strictEqual(strong.bundle.answers["Upper Material"], "Leather");
  assert.strictEqual(strong.bundle.answers["Lining Material"], "Synthetic");
  assert.strictEqual(strong.bundle.answers["Outsole Material"], "Synthetic");
  assert.strictEqual(strong.bundle.answers["Country of Origin"], "China");

  const weak = core.applyFastOcrMissingRecovery(emptyBundle, directQuestions, shoeOcr(0.60, 1), validator, shoeFields);
  assert.deepStrictEqual(Array.from(weak.recovered), [], "weak OCR must not auto-fill direct shoe facts");

  const wrongOptions = shoeFields.map(field => field.name === "US Shoe Size" ? { ...field, options: ["8", "10"] } : field);
  const optionGuard = core.applyFastOcrMissingRecovery(emptyBundle, ["US Shoe Size"], shoeOcr(), validator, wrongOptions);
  assert.deepStrictEqual(Array.from(optionGuard.recovered), [], "OCR must not fill a shoe size absent from current eBay options");

  // Virtualized/large eBay menus deliberately omit options from the compact AI snapshot.
  // Direct physical-label facts may cross that boundary only when optionsComplete=false;
  // the shared Fill Engine still performs the exact live option selection/verification.
  const incomplete = shoeFields.slice(0, 6).map(field => ({ ...field, options: [], optionsComplete: false, optionTotal: 200 }));
  const deferred = core.applyFastOcrMissingRecovery(emptyBundle, directQuestions, shoeOcr(), validator, incomplete);
  assert.deepStrictEqual(Array.from(deferred.recovered), directQuestions, "direct shoe facts should survive an intentionally incomplete virtualized option snapshot");
  assert.strictEqual(deferred.bundle.answers["US Shoe Size"], "9");
  assert.strictEqual(deferred.bundle.answers["Shoe Width"], "2E");

  const unknownCompleteness = shoeFields.slice(0, 6).map(field => ({ ...field, options: [] }));
  const blockedUnknown = core.applyFastOcrMissingRecovery(emptyBundle, directQuestions, shoeOcr(), validator, unknownCompleteness);
  assert.deepStrictEqual(Array.from(blockedUnknown.recovered), [], "empty options without an explicit incomplete-snapshot marker must remain blocked");
}

function successResponse(body) {
  return {
    ok: true,
    requestConfirmed: true,
    text: JSON.stringify(body),
    usage: { totalTokens: 100, inputTokens: 80, outputTokens: 20 },
    transport: { upstreamStatus: 200 }
  };
}

function payload() {
  const image = { photoId: "p7", requestPhotoNumber: 7, dataUrl: "data:image/jpeg;base64,AA==", role: "shoe size material label" };
  return {
    imagesPrepared: true,
    images: [image],
    allImages: [image],
    questions: [...directQuestions, "Color"],
    fields: shoeFields,
    settings: { tokenMode: "balanced", smartLocalOcrVerify: true, maxOutputTokens: "4000" },
    allowRecovery: true
  };
}

// Live Fill resolves deterministic shoe-width aliases only against the actual opened menu.
{
  const context = makeContext();
  const fill = context.EbaySimpleFillV810;
  assert.strictEqual(fill.resolveShoeWidth("2E", ["M", "W", "EE"]), "EE", "2E label code should map deterministically to live eBay EE");
  assert.strictEqual(fill.resolveShoeWidth("3E", ["M", "EEE"]), "EEE");
  assert.strictEqual(fill.resolveShoeWidth("2E", ["EE", "Extra Wide (2E)"]), "", "ambiguous live aliases must not be guessed");
}

(async () => {
  // Real target behavior: GPT can omit direct tag facts; strong local OCR fills them
  // after the primary pass and the listing remains one paid GPT request.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions || []) });
        return successResponse({
          fill_response_schema_version: 3,
          answers: { Color: "Black" },
          support: { Color: { source_type: "visual", photo: 7, evidence: "The shoe appears black." } }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => shoeOcr()
    };
    const result = await context.EbayCoreAiV800.analyzeListing(payload());
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls.length, 1, "strong direct shoe-label OCR must not require a second GPT request");
    assert.deepStrictEqual(Array.from(result.fastOcrRecoveredQuestions), directQuestions, "pipeline must report all locally recovered shoe facts");
    assert.strictEqual(result.fastRepairUsed, false, "local direct recovery should keep normal shoe listing single-pass");
    assert.strictEqual(result.answers["US Shoe Size"], "9");
    assert.strictEqual(result.answers["Shoe Width"], "2E");
    assert.strictEqual(result.answers["Upper Material"], "Leather");
    assert.strictEqual(result.answers["Lining Material"], "Synthetic");
    assert.strictEqual(result.answers["Outsole Material"], "Synthetic");
    assert.strictEqual(result.answers["Country of Origin"], "China");
    assert.strictEqual(result.answers.Color, "Black", "visual Color must remain GPT-owned");
  }

  // Accuracy guard: if GPT and OCR disagree on a strict direct field, OCR must not
  // silently overwrite GPT. The bounded independent second GPT read remains active.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage });
        if (args.stage === "primary") {
          return successResponse({
            fill_response_schema_version: 3,
            answers: { "Upper Material": "Synthetic" },
            support: { "Upper Material": { source_type: "physical_tag", photo: 7, evidence: "Upper label reads synthetic." } }
          });
        }
        return successResponse({
          fill_response_schema_version: 3,
          answers: { "Upper Material": "Leather" },
          support: { "Upper Material": { source_type: "physical_tag", photo: 7, evidence: "LEATHER UPPER" } }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => shoeOcr()
    };
    const p = payload();
    p.questions = ["Upper Material"];
    p.fields = shoeFields.filter(field => field.name === "Upper Material");
    const result = await context.EbayCoreAiV800.analyzeListing(p);
    assert.strictEqual(calls.length, 2, "GPT/OCR component-material conflict must retain one independent GPT repair");
    assert.strictEqual(result.fastRepairUsed, true);
    assert.strictEqual(result.answers["Upper Material"], undefined, "disagreement between primary GPT and verifier must stay blank for manual review");
    assert(result.fastOcrConflictQuestions.includes("Upper Material"), "OCR conflict must remain visible diagnostically");
  }

  console.log("PASS V8.23.21 shoe OCR direct facts: 9/2E and component materials recover locally with exact-option + confidence guards; conflicts still require GPT repair");
})().catch(error => { console.error(error); process.exit(1); });
