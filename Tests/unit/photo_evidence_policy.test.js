#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
const context = {
  console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date,
  setTimeout, clearTimeout, Promise
};
context.globalThis = context;
vm.createContext(context);
for (const rel of [
  "Extension/shared/config.js",
  "Extension/core/policy.js",
  "Extension/core/snapshot.js",
  "Extension/modes/photo.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
}

const identity = context.EbayIdentityV3;
const selector = context.EbayAiPhotoSelectorV790;
const blocks = context.EbayBlocksV890;
assert(identity && selector && blocks?.readFields && blocks?.aiAnalysis, "photo pipeline APIs missing");

const legacy = "https://i.ebayimg.com/00/s/MTYwMFgxMjAw/z/ABC123/$_2.JPG?set_id=880000500F";
const upgradedLegacy = identity.canonicalPhotoUrl(legacy);
assert(upgradedLegacy.endsWith("/$_12.JPG"), `legacy thumbnail should upgrade to $_12.JPG, got ${upgradedLegacy}`);
assert(!upgradedLegacy.includes("set_id="), "canonical evidence URL should remove transient query parameters");
assert.strictEqual(
  identity.canonicalPhotoUrl("https://i.ebayimg.com/images/g/abc/s-l300.jpg"),
  "https://i.ebayimg.com/images/g/abc/s-l1600.jpg"
);

assert.strictEqual(selector.modePhotoCap({ tokenMode: "cheap" }), 4);
assert.strictEqual(selector.modePhotoCap({ tokenMode: "balanced" }), 6);
assert.strictEqual(selector.modePhotoCap({ tokenMode: "quality" }), 8);

const gallery = Array.from({ length: 10 }, (_, index) => ({
  kind: "ebay",
  url: `https://i.ebayimg.com/images/g/photo${index}/s-l300.jpg`,
  alt: `Product photo ${index + 1}`
}));
const selected = selector.selectPhotos(gallery, { tokenMode: "balanced", maxPhotosPerRequest: "10", smartPhotoSelection: true });
assert.strictEqual(selected.length, 6, "Balanced mode must cap a ten-photo gallery at six evidence-aware photos");
assert.strictEqual(new Set(selected.map(photo => photo.originalIndex)).size, 6, "evidence coverage must not duplicate gallery positions");
assert(selected.some(photo => photo.originalIndex === 0), "front overview must stay in the reduced request");
assert(selected.some(photo => photo.originalIndex >= 8), "late-sequence label candidates must stay represented");
assert(selected.filter(photo => photo.forceHighDetail === true).length <= 1, "generic gallery heuristics must not mark most photos HIGH detail");
for (const photo of selected) assert(/s-l1600\.jpg$/i.test(photo.canonicalUrl), "selected eBay photos should carry upgraded canonical URLs");

const legacySettings = blocks.aiAnalysis.normalSettings({ tokenMode: "balanced", maxPhotosPerRequest: "10", analysisPhotoPolicyVersion: "2" }, false);
assert.strictEqual(legacySettings.maxPhotosPerRequest, "6", "old 10-photo policy must migrate down before popup is opened");
assert.strictEqual(legacySettings.analysisPhotoPolicyVersion, "3");
const userSettings = blocks.aiAnalysis.normalSettings({ tokenMode: "balanced", maxPhotosPerRequest: "5", analysisPhotoPolicyVersion: "3" }, false);
assert.strictEqual(userSettings.maxPhotosPerRequest, "5", "a post-migration user photo limit inside the new cap should be preserved");
const cheapLegacy = blocks.aiAnalysis.normalSettings({ tokenMode: "cheap", maxPhotosPerRequest: "5" }, false);
assert.strictEqual(cheapLegacy.maxPhotosPerRequest, "4");

const read = {
  routeQuestions: ["Brand", "Style", "US Shoe Size", "Material", "Country of Origin", "Custom Attribute", "UPC"],
  pageContext: {
    fieldCatalog: [
      { name: "Brand", type: "single", currentValue: "See Kai Run", options: ["BOGS", "See Kai Run"] },
      { name: "Style", type: "single", currentValue: "Snow Boot", options: ["Snow Boot"] },
      { name: "US Shoe Size", type: "single", currentValue: "7", options: ["7", "8"] },
      { name: "Material", type: "multi", currentValue: "Synthetic", options: ["Synthetic", "Neoprene"] },
      { name: "Country of Origin", type: "single", currentValue: "China", options: ["China"] },
      { name: "Custom Attribute", type: "text", currentValue: "", options: [] },
      { name: "UPC", type: "text", currentValue: "123", options: [] }
    ]
  }
};
const routed = blocks.readFields.run(read, { reviewMode: false, includeFilled: false });
assert.deepStrictEqual(
  Array.from(routed.questions),
  ["Brand", "Style", "US Shoe Size", "Material", "Country of Origin", "Custom Attribute"],
  "every safe Item Specific must be rechecked; an existing eBay value is context, not proof"
);
assert.deepStrictEqual(Array.from(routed.preservedQuestions), [], "normal Photo must not silently trust already-filled safe fields");
assert(Array.from(routed.skippedQuestions).includes("UPC"), "UPC must stay excluded from the entire automatic path");

console.log("PASS V8.23.21 cost-aware photo evidence coverage, legacy image upgrade, and full safe-field revalidation");
