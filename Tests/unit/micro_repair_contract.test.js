#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const ROOT = path.resolve(__dirname, "../..");
const context = { console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise };
context.globalThis = context;
vm.createContext(context);
for (const rel of ["Extension/shared/config.js", "Extension/core/policy.js", "Extension/core/snapshot.js", "Extension/core/ai.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

const prompts = context.EbayAiPromptV711;
const req = context.EbayAiRequestBuilderV711;
assert(prompts && req?.itemSpecificsOutputLimit && req?.imageDetail, "micro repair APIs missing");

const largeOptions = Array.from({ length: 244 }, (_, i) => `Country ${i + 1}`);
const fields = [
  { name: "Country of Origin", type: "single", options: largeOptions },
  { name: "Material", type: "multi", options: ["Cotton", "Wool", "Polyester", "Silk"] }
];
const prompt = prompts.buildStrictVerificationPrompt({
  category: "Sweaters",
  questions: ["Country of Origin", "Material"], recoveryQuestions: ["Country of Origin", "Material"], fields,
  pageContext: { platform: "eBay", category: "Sweaters" },
  rejectionReasons: { "Country of Origin": "Local OCR conflicts.", Material: "Primary candidate rejected." }
});
assert(prompt.includes("LARGE LIVE CATALOG (244 values)"), "large catalogs must be summarized instead of copied into repair prompt");
assert(!prompt.includes("Country 200"), "large repair catalog should not spend tokens listing hundreds of options");
assert(prompt.includes("OPTIONS: Cotton | Wool | Polyester | Silk"), "small exact vocabularies should remain available to repair GPT");

const settings = { apiBaseUrl: "https://api.openai.com", apiPath: "/v1/chat/completions", apiModel: "gpt-5.6", tokenMode: "balanced", maxOutputTokens: "8000" };
const recoveryLimit = req.itemSpecificsOutputLimit(settings, { stage: "recovery", questions: ["Country of Origin", "Material"], questionCount: 2, reviewMode: false });
const primaryLimit = req.itemSpecificsOutputLimit(settings, { stage: "primary", questions: Array.from({ length: 25 }, (_, i) => `F${i}`), questionCount: 25, reviewMode: false });
// V8.23.21 reduces repair INPUT and avoids unnecessary repair calls. Keep safe output headroom
// because GPT-5.x reasoning tokens share the output budget and truncation would trade accuracy for cost.
assert(recoveryLimit >= 2000 && recoveryLimit < primaryLimit, `2-field recovery should stay compact but safe, got ${recoveryLimit}`);
assert(primaryLimit >= 2000, "primary listing analysis must retain larger output headroom");

const body = req.buildItemSpecificsChatBody(settings, prompt, [{ dataUrl: "data:image/jpeg;base64,AA==", photoId: "tag" }], {
  stage: "recovery", questions: ["Country of Origin", "Material"], fields
});
assert(Number(body.max_completion_tokens || body.max_tokens || 0) === recoveryLimit, "actual recovery request must use the stage-aware safe output budget");
assert.strictEqual(body.messages[1].content.find(part => part.type === "image_url")?.image_url?.detail, "high", "repair evidence image must remain HIGH detail");
const schema = body.response_format?.json_schema?.schema;
assert(schema?.properties?.answers?.required?.length === 2, "repair JSON schema must contain only requested repair fields");
assert.deepStrictEqual(Array.from(schema.properties.answers.required), ["Country of Origin", "Material"]);

console.log(`PASS V8.23.21 micro-repair contract: large catalog compressed, 2-field recovery budget ${recoveryLimit}, HIGH-detail evidence preserved`);
