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

function block(text, x, y, confidence = 0.96, votes = 2, photoId = "tag4") {
  return { text, confidence, votes, photoId, photo: 4, role: "size label", box: { x, y, width: 0.11, height: 0.035 } };
}
function ocrFromBlocks(blocks) {
  return {
    ok: true, available: true, healthy: true, engine: "macos_vision", photoCount: 1, blockCount: blocks.length,
    photos: [{ ok: true, photoId: "tag4", displayNumber: 4, role: "size label", blocks: blocks.map(({photoId,photo,role,...rest}) => rest) }]
  };
}

// 1) Real target shape: a regional table has several valid numbers. Generic Size must
// choose the explicitly printed US row and must not treat UK/EU conversions as conflicts.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const blocks = [
    block("USA", 0.10, 0.75), block("14", 0.30, 0.75),
    block("UK", 0.10, 0.69), block("18", 0.30, 0.69),
    block("EUROPE", 0.10, 0.63), block("44", 0.30, 0.63)
  ];
  const rows = validator.regionalSizeRows(blocks);
  assert(rows.some(row => row.region === "us" && row.value === "14"), "US 14 regional row must be detected");
  assert(rows.some(row => row.region === "uk" && row.value === "18"), "UK 18 regional row must be detected");
  assert(rows.some(row => row.region === "eu" && row.value === "44"), "EU 44 regional row must be detected");
  const candidate = validator.deriveOcrCandidate("Size", blocks, { name: "Size", type: "single", options: ["12", "14", "16"] });
  assert(candidate, "regional Size candidate missing");
  assert.strictEqual(candidate.value, "14");
  assert.strictEqual(candidate.region, "us");
  assert.strictEqual(validator.evidenceForField("Size", "14", blocks).status, "confirmed");
  assert.strictEqual(validator.evidenceForField("Size", "18", blocks).status, "conflict", "UK size must not be accepted as generic US eBay Size");
}

// 2) Same-block observations are supported; this is common after perspective correction.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const blocks = [
    block("US 14", 0.1, 0.7),
    block("UK 18", 0.1, 0.64),
    block("EU 44", 0.1, 0.58)
  ];
  const regional = validator.regionalSizeForMarket(blocks, "us");
  assert(regional && !regional.conflict);
  assert.strictEqual(regional.value, "14");
}

// 3) No US row means no conversion. EU 44 must never be converted/inferred into US Size.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const blocks = [block("UK",0.1,0.7),block("18",0.3,0.7),block("EU",0.1,0.64),block("44",0.3,0.64)];
  assert.strictEqual(validator.regionalSizeForMarket(blocks, "us"), null);
  // Because this is a regional table without a US row, the direct regional resolver does
  // not fabricate a US candidate. Generic parser safety still decides whether any unrelated
  // standalone tag token exists; there is no deterministic conversion here.
  const candidate = validator.deriveOcrCandidate("Size", blocks, { name: "Size", options: ["14"] });
  assert.strictEqual(candidate, null, "EU/UK-only table must not infer US Size");
}

// 4) Conflicting US rows are unsafe.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const blocks = [block("US 14",0.1,0.7), block("US 16",0.1,0.62), block("UK 18",0.1,0.55)];
  const regional = validator.regionalSizeForMarket(blocks, "us");
  assert(regional && regional.conflict, "two different US values must conflict");
  assert.strictEqual(validator.deriveOcrCandidate("Size", blocks, { name: "Size", options: ["14","16"] }), null);
}

// 5) Weak split OCR cannot auto-fill even if geometry is perfect.
{
  const context = makeContext();
  const core = context.EbayCoreAiV800;
  const validator = context.EbayEvidenceValidatorV860;
  const weak = [block("USA",0.1,0.7,0.95,2), block("14",0.3,0.7,0.67,1), block("UK",0.1,0.64,0.95,2), block("18",0.3,0.64,0.96,2)];
  const field = { name: "Size", type: "single", options: [], optionsComplete: false, optionTotal: 50 };
  const result = core.applyFastOcrMissingRecovery({ answers:{}, evidence:{}, modelResults:{}, rejectionReasons:{}, warnings:[] }, ["Size"], ocrFromBlocks(weak), validator, [field]);
  assert.deepStrictEqual(Array.from(result.recovered), [], "weak US value block must not auto-fill Size");
}

// 6) Strong regional OCR can cross a virtualized compact snapshot, but only as a
// physical-tag fact; the shared Fill Engine still verifies the exact live option later.
{
  const context = makeContext();
  const core = context.EbayCoreAiV800;
  const validator = context.EbayEvidenceValidatorV860;
  const strong = [block("USA",0.1,0.7,0.96,2), block("14",0.3,0.7,0.94,2), block("UK",0.1,0.64,0.95,2), block("18",0.3,0.64,0.95,2)];
  const field = { name: "Size", type: "single", options: [], optionsComplete: false, optionTotal: 50 };
  const result = core.applyFastOcrMissingRecovery({ answers:{}, evidence:{}, modelResults:{}, rejectionReasons:{}, warnings:[] }, ["Size"], ocrFromBlocks(strong), validator, [field]);
  assert.deepStrictEqual(Array.from(result.recovered), ["Size"]);
  assert.strictEqual(result.bundle.answers.Size, "14");
  assert.strictEqual(result.bundle.modelResults.Size.localOcrRecovery, true);
  assert.strictEqual(result.bundle.modelResults.Size.evidenceType, "physical_tag");
}

// 7) Whole-row text and alphabetical XS remain backward compatible.
{
  const context = makeContext();
  const validator = context.EbayEvidenceValidatorV860;
  const regional = [block("USA XS",0.1,0.7), block("UK 6",0.1,0.64)];
  assert.strictEqual(validator.deriveOcrCandidate("Size", regional, { name:"Size", options:["XS","S"] }).value, "XS");
  const ordinary = [block("SIZE XS",0.1,0.7)];
  assert.strictEqual(validator.deriveOcrCandidate("Size", ordinary, { name:"Size", options:["XS","S"] }).value, "XS");
}

function successResponse(body) {
  return { ok:true, requestConfirmed:true, text:JSON.stringify(body), usage:{totalTokens:100,inputTokens:80,outputTokens:20}, transport:{upstreamStatus:200} };
}

(async () => {
  // 8) End-to-end cost regression for the Adrianna Papell class of label: Primary GPT
  // may leave Size blank, but strong US-row OCR recovers it locally before repair.
  const context = makeContext();
  const calls=[];
  context.EbayAiAnalyzeV711={ analyzePhotos: async args => {
    calls.push({stage:args.stage,questions:Array.from(args.questions||[])});
    return successResponse({
      fill_response_schema_version:3,
      answers:{Size:""},
      support:{Size:{source_type:"none",photo:0,evidence:""}}
    });
  }};
  const regionalBlocks=[
    block("USA",0.10,0.75,0.96,2), block("14",0.30,0.75,0.95,2),
    block("UK",0.10,0.69,0.96,2), block("18",0.30,0.69,0.95,2),
    block("EUROPE",0.10,0.63,0.96,2), block("44",0.30,0.63,0.95,2)
  ];
  context.EbayOcrClientV860={
    likelyEvidenceImages: images => images,
    analyzeSmart: async () => ocrFromBlocks(regionalBlocks)
  };
  const image={photoId:"tag4",requestPhotoNumber:4,dataUrl:"data:image/jpeg;base64,AA==",role:"size label"};
  const result=await context.EbayCoreAiV800.analyzeListing({
    imagesPrepared:true, images:[image], allImages:[image], questions:["Size"],
    fields:[{name:"Size",type:"single",options:[],optionsComplete:false,optionTotal:50}],
    settings:{tokenMode:"balanced",smartLocalOcrVerify:true,maxOutputTokens:"4000"}, allowRecovery:true
  });
  assert.strictEqual(result.ok,true);
  assert.strictEqual(calls.length,1,"regional direct Size must not trigger a second GPT request");
  assert.strictEqual(result.answers.Size,"14");
  assert(result.fastOcrRecoveredQuestions.includes("Size"));
  assert.strictEqual(result.fastRepairUsed,false);
  console.log("PASS V8.23.21 regional Size OCR: US row wins without conversion, conflicts/weak OCR stay blocked, virtualized live-option verification remains required, and strong labels stay single-pass");
})().catch(error=>{console.error(error);process.exitCode=1;});
