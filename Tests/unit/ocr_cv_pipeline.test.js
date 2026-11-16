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

const client = context.EbayOcrClientV860;
assert(client, "OCR client unavailable");

(async () => {
  const calls = [];
  context.EbayLocalOcrBridgeV860 = {
    analyze: async payload => {
      calls.push(payload);
      const accurate = payload.accurate === true;
      const photos = payload.images.map((image, index) => {
        if (image.photoId !== "p4") {
          return { ok: true, photoId: image.photoId, displayNumber: index + 1, role: image.role || "", blocks: [] };
        }
        if (!accurate) {
          return {
            ok: true,
            photoId: "p4",
            displayNumber: 4,
            role: "Product photo 4",
            rectangleDetected: true,
            rectangleConfidence: 0.71,
            labelBox: { x: 0.22, y: 0.18, width: 0.55, height: 0.48 },
            blocks: [
              { text: "LEATHER UPPER", confidence: 0.72, votes: 1, box: { x: 0.30, y: 0.44, width: 0.34, height: 0.04 } },
              { text: "P", confidence: 0.63, votes: 2, box: { x: 0.35, y: 0.25, width: 0.03, height: 0.03 } },
              { text: "CARE", confidence: 0.70, votes: 1, box: { x: 0.28, y: 0.30, width: 0.12, height: 0.03 } }
            ]
          };
        }
        return {
          ok: true,
          photoId: "p4",
          displayNumber: 4,
          role: "Product photo 4",
          preprocessUsed: true,
          preprocessVariants: ["original", "focused_crop", "contrast", "sharpen"],
          blocks: [
            { text: "LEATHER UPPER", confidence: 0.97, votes: 3, passVotes: 2, variantVotes: 3, variant: "contrast", box: { x: 0.30, y: 0.44, width: 0.34, height: 0.04 } },
            { text: "MADE IN CHINA", confidence: 0.96, votes: 2, passVotes: 2, variantVotes: 2, variant: "sharpen", box: { x: 0.30, y: 0.36, width: 0.36, height: 0.04 } }
          ]
        };
      });
      return {
        ok: true,
        available: true,
        engine: "macos_vision",
        helperVersion: "8.23.21",
        photos,
        photoCount: photos.length,
        successfulPhotoCount: photos.length,
        textPhotoCount: photos.filter(p => p.blocks.length).length,
        blockCount: photos.reduce((sum, p) => sum + p.blocks.length, 0),
        preprocessVariantCount: accurate ? 2 : 0,
        preprocessedPhotoCount: accurate ? 1 : 0,
        smartPreprocess: accurate,
        durationMs: accurate ? 20 : 8,
        warnings: []
      };
    }
  };

  const images = Array.from({ length: 7 }, (_, i) => ({
    photoId: `p${i + 1}`,
    requestPhotoNumber: i + 1,
    role: `Product photo ${i + 1}`,
    dataUrl: "data:image/jpeg;base64,AA=="
  }));

  assert.strictEqual(client.likelyEvidenceImages(images).length, 0, "generic eBay photo names must not pretend to be known label photos");
  const result = await client.analyzeSmart(images, { maxPhotos: 12, accurateRetry: true, accurateRetryPhotos: 3, smartPreprocess: true });
  assert.strictEqual(calls.length, 2, "generic mid-gallery label discovered by Fast OCR must receive one Accurate retry");
  assert.strictEqual(calls[0].images.length, 7, "local Fast OCR should scan the whole bounded gallery, not only pre-labelled photos");
  assert.strictEqual(calls[1].images.length, 1, "only the discovered difficult label should receive expensive local preprocessing");
  assert.strictEqual(calls[1].images[0].photoId, "p4");
  assert(calls[1].images[0].focusBox && calls[1].images[0].focusBox.width > 0.3, "discovered label should receive a bounded focus box from text geometry or machine vision");

  const p4 = result.photos.find(photo => photo.photoId === "p4");
  assert(p4, "merged label photo missing");
  assert(p4.blocks.some(block => block.text === "LEATHER UPPER" && Number(block.votes) >= 3), "accurate pass/variant consensus must survive merge");
  assert(p4.blocks.some(block => block.text === "MADE IN CHINA"), "accurate OCR may contribute a new block even when it returns fewer blocks overall");
  assert.strictEqual(p4.preprocessUsed, true);
  assert(p4.preprocessVariants.includes("contrast") && p4.preprocessVariants.includes("sharpen"), "contrast/sharpen evidence should remain visible in diagnostics");

  assert.strictEqual(client.labelTextSignal(p4), true, "direct label wording should be detected independently of eBay photo metadata");
  assert.strictEqual(client.careSymbolHint({ blocks: [
    { text: "CARE", confidence: 0.8 },
    { text: "P", confidence: 0.8 }
  ]}), true, "isolated care tokens may route a label for closer inspection but are not direct facts by themselves");

  const weakGeometryOnly = {
    labelBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    rectangleConfidence: 0.58,
    blocks: []
  };
  assert.strictEqual(client.needsAccurateRetry({ role: "Product photo" }, weakGeometryOnly), true, "machine-vision label geometry should be allowed to request a local Accurate OCR retry");

  console.log("PASS V8.23.21 OCR/CV pipeline: bounded full-gallery Fast scan, rectangle-assisted retry, contrast/sharpen preprocessing, and consensus-preserving merge");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
