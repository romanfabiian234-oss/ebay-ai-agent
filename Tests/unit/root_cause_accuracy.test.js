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
  "Extension/core/ai.js",
  "Extension/modes/photo.js"
]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

const policy = context.EbayAiItemSpecificsV7100;
const processor = context.EbayCoreAiAnswerProcessorV800;
const blocks = context.EbayBlocksV890;
assert(policy && processor && blocks?.aiAnalysis, "root-cause accuracy APIs missing");

function parseOne(name, type, options, value, sourceType, evidence, photo = 1) {
  const questions = [name];
  const fields = [{ name, type, options }];
  const payload = {
    fill_response_schema_version: 3,
    answers: { [name]: value },
    support: { [name]: { source_type: sourceType, photo: sourceType === "seller_context" ? 0 : photo, evidence } }
  };
  return processor.parseAnswerBundle(JSON.stringify(payload), questions, fields, { reviewMode: false, modelProvider: "openai", existingTitle: "" });
}

// Behavior class 1: exact dimensions/fit widths need a ruler or an explicit physical label.
assert(policy.isMeasurementOnly("Platform Height"));
assert(policy.isMeasurementOnly("Bag Width"));
assert(policy.isMeasurementOnly("Shoe Width"));
let bundle = parseOne("Platform Height", "single", ["0.25 in", "1 in"], "1 in", "visual", "The platform looks about 1 in high.");
assert(!bundle.answers["Platform Height"], "perspective must never prove an exact platform measurement");
bundle = parseOne("Platform Height", "single", ["0.25 in", "1 in"], "1 in", "measurement", "Ruler directly shows Platform Height 1 in.");
assert.strictEqual(bundle.answers["Platform Height"], "1 in");
bundle = parseOne("Shoe Width", "single", ["Narrow", "Standard", "Wide"], "Standard", "visual", "The shoe looks like a standard width.");
assert(!bundle.answers["Shoe Width"], "visual appearance must never prove manufacturer shoe width");
bundle = parseOne("Shoe Width", "single", ["Narrow", "Standard", "Wide"], "Standard", "physical_tag", "Physical size label explicitly states Shoe Width Standard.");
assert.strictEqual(bundle.answers["Shoe Width"], "Standard");

// Behavior class 2: absence is never evidence for a negative binary answer.
assert(policy.requiresStrictSupport({ name: "Signed", type: "yesno", options: ["Yes", "No"] }));
bundle = parseOne("Signed", "yesno", ["Yes", "No"], "No", "visual", "No signature is visible in the photos.");
assert(!bundle.answers.Signed, "not seeing a signature must not prove Signed=No");
bundle = parseOne("Signed", "yesno", ["Yes", "No"], "No", "physical_tag", "Physical product label explicitly states Signed: No.");
assert.strictEqual(bundle.answers.Signed, "No");

// Behavior class 3: strict facts are accepted only after an independent second read agrees.
const strictQuestions = ["US Shoe Size", "Brand", "Color"];
const strictFields = [
  { name: "US Shoe Size", type: "single", options: ["6", "9.5"] },
  { name: "Brand", type: "single", options: ["Alpha", "Beta"] },
  { name: "Color", type: "single", options: ["Black", "Red"] }
];
const primary = {
  answers: { "US Shoe Size": "6", Brand: "Alpha", Color: "Black" },
  evidence: { "US Shoe Size": { sources: [{ photo: 2, type: "physical_tag", evidence: "tag reads 6" }] }, Brand: { sources: [{ photo: 1, type: "physical_tag", evidence: "label Alpha" }] } },
  modelResults: {}, rejectionReasons: {}, reviewDetails: [], warnings: []
};
const verifyQuestions = processor.strictVerificationQuestions(primary, strictQuestions, strictFields, 24);
assert(verifyQuestions.includes("US Shoe Size") && verifyQuestions.includes("Brand"), "accepted strict facts must be independently re-read");
assert(!verifyQuestions.includes("Color"), "ordinary visual fields must remain single-pass");
let merged = processor.mergeStrictVerification(primary, {
  answers: { "US Shoe Size": "9.5", Brand: "Alpha" },
  evidence: { "US Shoe Size": { sources: [{ photo: 2, type: "physical_tag", evidence: "tag reads 9.5" }] }, Brand: { sources: [{ photo: 1, type: "physical_tag", evidence: "label Alpha" }] } },
  modelResults: {}
}, verifyQuestions, strictQuestions);
assert(!merged.answers["US Shoe Size"], "conflicting independent shoe-size read must be Review, never auto-fill");
assert.strictEqual(merged.answers.Brand, "Alpha", "matching independent strict read may be kept");
assert.strictEqual(merged.answers.Color, "Black", "ordinary visual answer must be unaffected by strict verification");
assert(merged.strictVerification.conflicts.includes("US Shoe Size"));

// Behavior class 4: manual correction changes the cache identity even though CURRENT is not sent to GPT.
const basePrepared = {
  reviewMode: false,
  prompt: "same prompt",
  questions: ["Brand", "US Shoe Size"],
  images: [{ photoId: "photo:1", canonicalUrl: "https://i.ebayimg.com/images/g/x/s-l1600.jpg" }],
  allImages: [{ photoId: "photo:1", canonicalUrl: "https://i.ebayimg.com/images/g/x/s-l1600.jpg" }],
  requestSettings: { apiModel: "gpt-5.6", apiBaseUrl: "https://api.openai.com", apiPath: "/v1/chat/completions" },
  pageContext: { actualDraftId: "123", fieldSummary: { Brand: "Alpha", "US Shoe Size": "6" } }
};
const firstKey = blocks.aiAnalysis.cacheFingerprint(basePrepared).key;
const correctedKey = blocks.aiAnalysis.cacheFingerprint({ ...basePrepared, pageContext: { ...basePrepared.pageContext, fieldSummary: { Brand: "Alpha", "US Shoe Size": "9.5" } } }).key;
assert.notStrictEqual(firstKey, correctedKey, "manual field correction must invalidate cached AI result");

console.log("PASS V8.23.21 generic root-cause guards: measurements, binary evidence, independent strict verification, cache safety");
