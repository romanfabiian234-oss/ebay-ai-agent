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
  "Extension/core/ai.js",
  "Extension/modes/photo.js"
]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

const selector = context.EbayAiPhotoSelectorV790;
const builder = context.EbayAiRequestBuilderV711;
const blocks = context.EbayBlocksV890;
assert(selector && builder && blocks?.aiAnalysis, "cost-optimization APIs missing");

assert.strictEqual(selector.modePhotoCap({ tokenMode: "cheap" }), 4);
assert.strictEqual(selector.modePhotoCap({ tokenMode: "balanced" }), 6);
assert.strictEqual(selector.modePhotoCap({ tokenMode: "quality" }), 8);

const gallery = Array.from({ length: 10 }, (_, index) => ({
  kind: "ebay",
  url: `https://i.ebayimg.com/images/g/cost${index}/s-l1600.jpg`,
  alt: `Product photo ${index + 1}`
}));
const selected = selector.selectPhotos(gallery, { tokenMode: "balanced", maxPhotosPerRequest: "10", smartPhotoSelection: true });
assert.strictEqual(selected.length, 6, "Balanced must never silently expand back to ten photos");
assert(selected.filter(photo => photo.forceHighDetail === true).length <= 1, "generic gallery heuristics must not force most photos to HIGH detail");

const base = { apiBaseUrl: "https://api.openai.com", apiPath: "/v1/chat/completions", apiModel: "gpt-5.6", tokenMode: "balanced", maxOutputTokens: "4000" };
const genericBody = builder.buildItemSpecificsChatBody(base, "Analyze Color", [{ dataUrl: "data:image/jpeg;base64,AA==", photoId: "p1", role: "detail" }], { stage: "primary", questions: ["Color"], fields: [{ name: "Color", type: "single", options: ["Black"] }] });
assert.strictEqual(genericBody.messages[1].content.find(part => part.type === "image_url")?.image_url?.detail, "low", "ordinary Balanced visual photo must use LOW detail");

const labelBody = builder.buildItemSpecificsChatBody(base, "Analyze Brand", [{ dataUrl: "data:image/jpeg;base64,AA==", photoId: "p2", role: "brand size tag" }], { stage: "primary", questions: ["Brand"], fields: [{ name: "Brand", type: "single", options: ["Nike"] }] });
assert.strictEqual(labelBody.messages[1].content.find(part => part.type === "image_url")?.image_url?.detail, "high", "real label evidence must retain HIGH detail");

const migrated = blocks.aiAnalysis.normalSettings({ tokenMode: "balanced", maxPhotosPerRequest: "10", analysisPhotoPolicyVersion: "2" }, false);
assert.strictEqual(migrated.maxPhotosPerRequest, "6", "V8.23.11 ten-photo profiles must migrate to the new Balanced cap");
assert.strictEqual(migrated.analysisPhotoPolicyVersion, "3");

const estimate = blocks.aiAnalysis.estimate("x".repeat(4000), selected, { ...base, maxPhotosPerRequest: "6" }, ["Brand", "Color"], [{ name: "Brand" }, { name: "Color" }]);
assert(estimate.photoCount <= 6, "cost estimate must use the reduced primary photo count");
assert(estimate.repairPhotoCount <= 2, "Balanced cost estimate must reserve no more than two repair photos");

const aiSource = fs.readFileSync(path.join(ROOT, "Extension/core/ai.js"), "utf8");
assert(aiSource.includes("const verificationLimit = 8;"), "normal Fill repair must remain bounded to eight strict fields");
assert(aiSource.includes('const repairPhotoLimit = settings.tokenMode === "quality" ? 3 : 2;'), "Balanced/Cheap repair must stay capped at two HIGH-detail photos");
assert(aiSource.includes("fastRepairSkippedNoEvidence"), "missing strict fields without direct evidence must not trigger speculative paid repair");

console.log(`PASS V8.23.21 AI cost guard: Balanced=${selected.length} photos, generic visual LOW detail, label HIGH detail, repair<=${estimate.repairPhotoCount}, speculative no-evidence repair blocked`);
