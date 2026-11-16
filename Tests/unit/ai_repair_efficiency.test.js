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

const promptApi = context.EbayAiPromptV711;
const processor = context.EbayCoreAiAnswerProcessorV800;
const requestBuilder = context.EbayAiRequestBuilderV711;
assert(promptApi && processor && requestBuilder, "AI repair APIs missing");

const questions = [
  "Brand", "US Shoe Size", "Material", "Garment Care", "Country of Origin", "Model",
  "Product Line", "Vintage", "Handmade", "Customized", "Fabric Weight", "Platform Height",
  "Signed", "Character", "Character Family", "Performance/Activity", "Cushioning Level", "Midsole Type"
];
const fields = questions.map(name => ({
  name,
  type: ["Material", "Garment Care"].includes(name) ? "multi" : ["Vintage", "Handmade", "Customized", "Signed"].includes(name) ? "yesno" : "single",
  options: ["Yes", "No", "China", "Leather", "Synthetic", "7", "8", "Nike", "Other"]
}));
const reasons = Object.fromEntries(questions.map(name => [name, "Independently re-read the direct evidence. Do not assume the primary value; return blank if the exact fact is not directly supported."]));

// V8.23.21 accepts validated direct strict support in normal Fill and reserves repair for weak/rejected evidence.
const bundle = {
  answers: { Brand: "Nike", "US Shoe Size": "7", Material: "Leather", Color: "Black" },
  modelResults: {
    Brand: { value: "Nike", confidence: 0.9, evidenceType: "physical_tag", evidence: "Brand label reads Nike", photoSources: [1] },
    "US Shoe Size": { value: "7", confidence: 0.9, evidenceType: "physical_tag", evidence: "Size label reads US 7", photoSources: [1] },
    Material: { value: "Leather", confidence: 0.9, evidenceType: "physical_tag", evidence: "Material label reads Leather", photoSources: [1] }
  },
  rejectionReasons: {}
};
const selectionFields = [...fields, { name: "Color", type: "single", options: ["Black", "Red"] }];
const selected = Array.from(processor.smartStrictVerificationPlan(bundle, [...questions, "Color"], selectionFields, 8).questions);
assert(!selected.includes("Brand"), "validated direct Brand should stay single-pass");
assert(!selected.includes("US Shoe Size"), "validated direct shoe size should stay single-pass");
assert(!selected.includes("Material"), "validated direct Material should stay single-pass");
assert(!selected.includes("Color"), "ordinary visual Color must remain single-pass");
const weak = JSON.parse(JSON.stringify(bundle));
weak.modelResults.Brand.photoSources = [];
assert(processor.smartStrictVerificationPlan(weak, [...questions, "Color"], selectionFields, 8).questions.includes("Brand"), "weak Brand support must still enter repair");

const legacyPrompt = promptApi.buildItemSpecificsRecoveryPrompt({
  category: "Shoes", questions, recoveryQuestions: questions, fields, currentValues: {},
  pageContext: { category: "Shoes" }, rejectionReasons: reasons, purpose: "fill", independentVerification: true
});
const compactPrompt = promptApi.buildStrictVerificationPrompt({
  category: "Shoes", questions, recoveryQuestions: questions, fields,
  pageContext: { category: "Shoes" }, rejectionReasons: reasons
});
const primarySystem = promptApi.getItemSpecificsStructuredSystemInstructions({ repair: false, reviewMode: false });
const strictSystem = promptApi.getStrictVerificationStructuredSystemInstructions();
const routedRepairSystem = promptApi.getItemSpecificsStructuredSystemInstructions({ repair: true, reviewMode: false });

assert.strictEqual(routedRepairSystem, strictSystem, "recovery stage must use the compact strict-verification system instructions");
assert(compactPrompt.length < legacyPrompt.length * 0.60, `strict repair user prompt should be materially smaller (${compactPrompt.length} vs ${legacyPrompt.length})`);
assert(strictSystem.length < primarySystem.length * 0.55, `strict repair system prompt should be materially smaller (${strictSystem.length} vs ${primarySystem.length})`);
assert((compactPrompt.length + strictSystem.length) < (legacyPrompt.length + primarySystem.length) * 0.55, "combined repair instructions should be at least ~45% smaller without changing field policy");
assert(!compactPrompt.includes("For ordinary directly visible fields"), "repair prompt must not repeat ordinary visual Fill guidance");
assert(!compactPrompt.includes("Existing title"), "strict verification must not re-introduce seller-title anchoring");
assert(compactPrompt.includes("STRICT FIELDS TO VERIFY:"), "compact prompt must explicitly scope verification fields");
assert(compactPrompt.includes("Brand | TYPE: single") && compactPrompt.includes("POLICY: CONTEXT_REQUIRED"), "compact prompt must retain field type/policy metadata");
assert(strictSystem.includes("absence is never evidence of No"), "binary negative-evidence safety rule must remain");
assert(strictSystem.includes("Never invent label text"), "anti-hallucination strict evidence rule must remain");
assert(strictSystem.includes("UPC, MPN"), "protected identifiers must remain forbidden");

// V8.23.21 keeps the compact strict repair contract; repair itself is now exceptional rather than routine.
const body = requestBuilder.buildItemSpecificsChatBody({
  apiBaseUrl: "https://api.openai.com", apiPath: "/v1/chat/completions", apiModel: "gpt-5.6",
  tokenMode: "balanced", maxOutputTokens: "4000"
}, compactPrompt, [{ dataUrl: "data:image/jpeg;base64,AA==", photoId: "p1" }], {
  stage: "recovery", questions: ["Brand"], fields: [fields[0]]
});
assert.strictEqual(body.reasoning_effort, "low", "Balanced strict verification reasoning must remain LOW");
assert.strictEqual(body.messages[0].content, strictSystem, "OpenAI recovery body must carry the compact strict system instructions");
assert.strictEqual(body.messages[1].content.find(part => part.type === "image_url")?.image_url?.detail, "high", "strict verification images must remain HIGH detail");

const aiSource = fs.readFileSync(path.join(ROOT, "Extension/core/ai.js"), "utf8");
assert(aiSource.includes("const verificationLimit = 8;"), "normal-Fill strict repair must be bounded to eight unresolved fields");
assert(aiSource.includes("const repairPhotoLimit = settings.tokenMode === \"quality\" ? 3 : 2;"), "Balanced/Cheap strict repair must use at most two evidence photos");

console.log(`PASS V8.23.21 AI repair efficiency: combined instructions ${legacyPrompt.length + primarySystem.length} -> ${compactPrompt.length + strictSystem.length} chars; strict policy/photo quality unchanged; Balanced recovery reasoning LOW`);
