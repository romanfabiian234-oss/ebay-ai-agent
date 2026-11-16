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
    "Extension/core/ai.js"
  ]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
  return context;
}

function successResponse(text) {
  return {
    ok: true,
    requestConfirmed: true,
    text: JSON.stringify(text),
    usage: { totalTokens: 100, inputTokens: 80, outputTokens: 20 },
    transport: { upstreamStatus: 200 }
  };
}

function labelOcr(blocks) {
  return {
    ok: true,
    available: true,
    engine: "macos_vision",
    durationMs: 10,
    photos: [{
      ok: true,
      photoId: "p2",
      displayNumber: 2,
      role: "brand size material origin tag",
      blocks: blocks.map(text => ({ text, confidence: 0.97, votes: 2 }))
    }],
    photoCount: 1,
    blockCount: blocks.length
  };
}

function payload(questions, fields) {
  const image = { photoId: "p2", requestPhotoNumber: 2, dataUrl: "data:image/jpeg;base64,AA==", role: "brand size material origin tag" };
  return {
    imagesPrepared: true,
    images: [image],
    allImages: [image],
    questions,
    fields,
    settings: { tokenMode: "balanced", smartLocalOcrVerify: true, maxOutputTokens: "4000" },
    allowRecovery: true
  };
}

(async () => {
  // Case 1: GPT and high-confidence OCR independently read the same physical-label photo.
  // The paid second GPT request must be omitted only for those confirmed strict fields.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), prompt: String(args.prompt || ""), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        return successResponse({
          fill_response_schema_version: 3,
          answers: { Brand: "Nike", Material: "Cotton", Color: "Black" },
          support: {
            Brand: { source_type: "physical_tag", photo: 2, evidence: "Brand label reads Nike" },
            Material: { source_type: "physical_tag", photo: 2, evidence: "Composition label reads 100% cotton" }
          }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => labelOcr(["NIKE", "100% COTTON"])
    };

    const response = await context.EbayCoreAiV800.analyzeListing(payload(
      ["Brand", "Material", "Color"],
      [
        { name: "Brand", type: "single", options: ["Nike"] },
        { name: "Material", type: "multi", options: ["Cotton"] },
        { name: "Color", type: "single", options: ["Black"] }
      ]
    ));

    assert.strictEqual(response.ok, true);
    assert.strictEqual(calls.length, 1, "same-photo OCR confirmation should avoid the second GPT request when no strict fields remain");
    assert(calls[0].prompt.includes("LOCAL OCR HINTS"), "high-confidence local OCR should assist the first GPT read instead of requiring a second read");
    assert(/Brand:\s+NIKE/i.test(calls[0].prompt) && /Material:\s+(?:100%\s+)?Cotton/i.test(calls[0].prompt), "first-read OCR hints should contain only compact deterministic label facts");
    assert.deepStrictEqual(Array.from(response.fastOcrVerifiedQuestions), ["Brand", "Material"]);
    assert.deepStrictEqual(Array.from(response.fastRepairQuestions), []);
    assert.strictEqual(response.fastRepairStatus, "not_needed_local_ocr");
    assert.strictEqual(response.answers.Color, "Black", "ordinary visual answers must remain primary-GPT decisions");
  }

  // Case 2: local OCR conflicts with GPT. OCR must not overwrite the value or suppress
  // independent GPT verification; the field stays in the one bounded recovery request.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), prompt: String(args.prompt || ""), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        if (args.stage === "recovery") {
          return successResponse({ fill_response_schema_version: 3, answers: {}, support: {} });
        }
        return successResponse({
          fill_response_schema_version: 3,
          answers: { "Country of Origin": "China" },
          support: {
            "Country of Origin": { source_type: "physical_tag", photo: 2, evidence: "Country label reads China" }
          }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => labelOcr(["MADE IN VIETNAM"])
    };

    const response = await context.EbayCoreAiV800.analyzeListing(payload(
      ["Country of Origin"],
      [{ name: "Country of Origin", type: "single", options: ["China", "Vietnam"] }]
    ));

    assert.strictEqual(calls.length, 2, "OCR conflict must keep the independent GPT verification request");
    assert.strictEqual(response.openAiRequestsAttempted, 2, "normal Fill must count exactly primary + one repair");
    assert.strictEqual(response.openAiRequestLimit, 2, "normal Fill hard OpenAI request limit must be two");
    assert.strictEqual(response.requestBudgetExhausted, true, "after the one allowed repair no third OpenAI stage may exist");
    assert.strictEqual(calls[1].stage, "recovery");
    assert.deepStrictEqual(calls[1].questions, ["Country of Origin"]);
    assert.deepStrictEqual(calls[1].imageIds, ["p2"], "known conflict evidence must be re-read from the exact photo without padding a second HIGH-detail image");
    assert(response.fastOcrConflictQuestions.includes("Country of Origin"));
    assert(response.fastRepairQuestions.includes("Country of Origin"));
    assert(!response.fastOcrVerifiedQuestions.includes("Country of Origin"));
  }



  // Case 3: direct primary support is valid and a different critical field is simply
  // absent with no OCR evidence. Normal Fill must not pay for a speculative second read.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        return successResponse({
          fill_response_schema_version: 3,
          answers: { Brand: "Nike", "Garment Care": "" },
          support: {
            Brand: { source_type: "physical_tag", photo: 1, evidence: "Brand label reads Nike" },
            "Garment Care": { source_type: "none", photo: 0, evidence: "" }
          }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => ({ ok: true, available: true, engine: "macos_vision", photos: [], photoCount: 0, blockCount: 0 })
    };

    const response = await context.EbayCoreAiV800.analyzeListing(payload(
      ["Brand", "Garment Care"],
      [
        { name: "Brand", type: "single", options: ["Nike"] },
        { name: "Garment Care", type: "multi", options: ["Machine Washable", "Hand Wash Only"] }
      ]
    ));

    assert.strictEqual(calls.length, 1, "missing strict field without direct evidence must not trigger speculative GPT repair");
    assert.strictEqual(response.answers.Brand, "Nike");
    assert(response.fastRepairSkippedDirect.includes("Brand"), "validated direct Brand should be reported as single-pass");
    assert(response.fastRepairSkippedNoEvidence.includes("Garment Care"), "missing no-evidence strict field should be explicitly reported as not retried");
    assert.strictEqual(response.fastRepairStatus, "not_needed_no_direct_evidence");
  }

  // Case 4: a strict candidate rejected by the primary support validator still gets one
  // targeted repair even when local OCR cannot help. Accuracy failures remain recoverable.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        if (args.stage === "recovery") {
          return successResponse({
            fill_response_schema_version: 3,
            answers: { Brand: "Nike" },
            support: { Brand: { source_type: "physical_tag", photo: 1, evidence: "Brand label reads Nike" } }
          });
        }
        return successResponse({
          fill_response_schema_version: 3,
          answers: { Brand: "Nike" },
          support: { Brand: { source_type: "none", photo: 0, evidence: "" } }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => ({ ok: true, available: true, engine: "macos_vision", photos: [], photoCount: 0, blockCount: 0 })
    };

    const response = await context.EbayCoreAiV800.analyzeListing(payload(
      ["Brand"],
      [{ name: "Brand", type: "single", options: ["Nike"] }]
    ));
    assert.strictEqual(calls.length, 2, "rejected strict candidate must retain the one targeted repair path");
    assert.strictEqual(calls[1].stage, "recovery");
    assert.deepStrictEqual(calls[1].questions, ["Brand"]);
    assert.strictEqual(response.answers.Brand, "Nike");
  }

  // Case 5: OCR can find a high-confidence direct fact on a photo that was not selected
  // for the paid primary request. V8.23.21 recovers that exact eBay option locally, so a
  // second GPT call is unnecessary while the primary Vision request stays unchanged.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        if (args.stage === "recovery") {
          return successResponse({
            fill_response_schema_version: 3,
            answers: { "Country of Origin": "Vietnam" },
            support: { "Country of Origin": { source_type: "physical_tag", photo: 1, evidence: "Country label reads Made in Vietnam" } }
          });
        }
        return successResponse({
          fill_response_schema_version: 3,
          answers: { "Country of Origin": "" },
          support: { "Country of Origin": { source_type: "none", photo: 0, evidence: "" } }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => labelOcr(["MADE IN VIETNAM"])
    };
    const primary = { photoId: "p1", requestPhotoNumber: 1, dataUrl: "data:image/jpeg;base64,AA==", role: "front overview" };
    const label = { photoId: "p2", requestPhotoNumber: 2, dataUrl: "data:image/jpeg;base64,BB==", role: "detail" };
    const customPayload = {
      imagesPrepared: true,
      images: [primary],
      allImages: [primary, label],
      questions: ["Country of Origin"],
      fields: [{ name: "Country of Origin", type: "single", options: ["Vietnam", "China"] }],
      settings: { tokenMode: "balanced", smartLocalOcrVerify: true, maxOutputTokens: "4000" },
      allowRecovery: true
    };
    const response = await context.EbayCoreAiV800.analyzeListing(customPayload);
    assert.strictEqual(calls.length, 1, "strong direct OCR evidence should recover the missing country without a paid repair");
    assert.deepStrictEqual(calls[0].imageIds, ["p1"], "non-selected label photo must not expand the primary GPT request");
    assert.strictEqual(response.fastRepairPhotoCount, 0);
    assert(response.fastOcrRecoveredQuestions.includes("Country of Origin"), "local OCR recovery must be reported diagnostically");
    assert.strictEqual(response.answers["Country of Origin"], "Vietnam");
  }


  // Case 6: real V8.23.21 UNIQLO regression. eBay virtualizes the Size dropdown, so
  // the compact field snapshot may contain options=[]/optionsComplete=false even though
  // the live menu contains XS. A strong direct OCR label read must recover XS locally,
  // avoid the second GPT repair, and leave exact live-option confirmation to Fill.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        if (args.stage === "recovery") {
          return successResponse({
            fill_response_schema_version: 3,
            answers: { Size: "XS" },
            support: { Size: { source_type: "physical_tag", photo: 2, evidence: "Size label reads XS" } }
          });
        }
        return successResponse({
          fill_response_schema_version: 3,
          answers: { Size: "" },
          support: { Size: { source_type: "none", photo: 0, evidence: "" } }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => labelOcr(["UNIQLO U", "XS", "MADE IN VIETNAM"])
    };
    const response = await context.EbayCoreAiV800.analyzeListing(payload(
      ["Size"],
      [{ name: "Size", type: "single", options: [], optionsComplete: false, optionTotal: 50 }]
    ));
    assert.strictEqual(calls.length, 1, "strong XS label OCR must eliminate the otherwise useless Size repair request");
    assert(response.fastOcrRecoveredQuestions.includes("Size"), "Size must be reported as local OCR recovery");
    assert.strictEqual(response.answers.Size, "XS");
    assert.deepStrictEqual(Array.from(response.fastRepairQuestions), []);
    assert.strictEqual(response.fastRepairUsed, false);
  }

  // Case 7: V8.23.21 Local Evidence Engine regression. GPT may cite one product photo while
  // an independent label photo contains the same deterministic Brand fact. Strong OCR on
  // that second photo must close the field locally instead of spending a repair request.
  {
    const context = makeContext();
    const calls = [];
    context.EbayAiAnalyzeV711 = {
      analyzePhotos: async args => {
        calls.push({ stage: args.stage, questions: Array.from(args.questions), imageIds: Array.from(args.images || []).map(image => image.photoId) });
        if (args.stage === "recovery") throw new Error("cross-photo deterministic evidence should have suppressed recovery");
        return successResponse({
          fill_response_schema_version: 3,
          answers: { Brand: "Nike" },
          support: { Brand: { source_type: "physical_tag", photo: 1, evidence: "Neck label reads Nike" } }
        });
      }
    };
    context.EbayOcrClientV860 = {
      likelyEvidenceImages: images => images,
      analyzeSmart: async () => labelOcr(["NIKE"])
    };
    const overview = { photoId: "p1", requestPhotoNumber: 1, dataUrl: "data:image/jpeg;base64,AA==", role: "front overview" };
    const tag = { photoId: "p2", requestPhotoNumber: 2, dataUrl: "data:image/jpeg;base64,BB==", role: "brand tag" };
    const response = await context.EbayCoreAiV800.analyzeListing({
      imagesPrepared: true, images: [overview, tag], allImages: [overview, tag],
      questions: ["Brand"], fields: [{ name: "Brand", type: "single", options: ["Nike"] }],
      settings: { tokenMode: "balanced", smartLocalOcrVerify: true, maxOutputTokens: "4000" }, allowRecovery: true
    });
    assert.strictEqual(calls.length, 1, "strong independent Brand OCR on another gallery label must stay single-pass");
    assert(response.fastOcrVerifiedQuestions.includes("Brand"));
    assert.strictEqual(response.modelResults.Brand.localEvidenceMode, "cross_photo_local_evidence");
    assert.strictEqual(response.fastRepairUsed, false);
  }

  console.log("PASS V8.23.21 local OCR pipeline: direct Size can recover through a virtualized catalog, strong missing/cross-photo facts stay local, and conflicts/rejections retain bounded GPT repair");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
