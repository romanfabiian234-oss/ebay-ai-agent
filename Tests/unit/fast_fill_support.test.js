#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
const context = { console, URL, globalThis: null };
context.globalThis = context;
vm.createContext(context);
for (const rel of [
  "Extension/shared/config.js",
  "Extension/core/policy.js",
  "Extension/core/snapshot.js",
  "Extension/core/ai.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
}

const prompt = context.EbayAiPromptV711 || context.EbayAiPromptV7100 || context.EbayAiPromptV790 || context.EbayCoreAiPromptV800;
const processor = context.EbayCoreAiAnswerProcessorV800;
assert(prompt, "prompt API missing");
assert(processor, "answer processor missing");

const questions = ["Style", "Country of Origin", "Character", "Brand", "Material", "Vintage"];
const fields = [
  { name: "Style", type: "single", options: ["Biker", "Classic"] },
  { name: "Country of Origin", type: "single", options: ["Italy", "Vietnam"] },
  { name: "Character", type: "single", options: ["Mickey Mouse", "None"] },
  { name: "Brand", type: "single", options: ["Topshop", "Zara"] },
  { name: "Material", type: "multi", options: ["Leather", "Polyester"] },
  { name: "Vintage", type: "yesno", options: ["Yes", "No"] }
];

const schema = prompt.getItemSpecificsFastFillJsonSchema({ questions, fields, maxPhotos: 10 });
assert.strictEqual(JSON.stringify(schema.properties.fill_response_schema_version.enum), JSON.stringify([3]));
assert(schema.properties.support, "V3 fast Fill schema must require compact strict support metadata");
assert.strictEqual(JSON.stringify(Array.from(schema.properties.support.required).sort()), JSON.stringify(["Brand", "Character", "Country of Origin", "Material", "Vintage"].sort()));
assert(!schema.properties.support.properties.Style, "ordinary fields must not spend output tokens on support metadata");

// Request builders must send the canonical high-resolution eBay URL, not a saved thumbnail URL.
const requestApi = context.EbayAiRequestV711;
const hiRes = "https://i.ebayimg.com/00/s/MTYwMFgxMjAw/z/ABC/$_12.JPG";
const body = requestApi.buildItemSpecificsChatBody(
  { apiBaseUrl: "https://api.openai.com", apiModel: "gpt-5.6", tokenMode: "balanced", maxOutputTokens: "8000" },
  "test prompt",
  [{ kind: "ebay", url: "https://i.ebayimg.com/00/s/MTYwMFgxMjAw/z/ABC/$_2.JPG", canonicalUrl: hiRes, photoId: "photo:test" }],
  { schemaQuestions: ["Style"], schemaFields: [fields[0]], reviewMode: false, stage: "primary" }
);
const sentImage = body.messages[1].content.find(item => item.type === "image_url");
assert.strictEqual(sentImage.image_url.url, hiRes, "OpenAI request must use canonical high-resolution evidence photo URL");

// Fast Fill must analyze independently instead of anchoring on an existing eBay value.
const independentPrompt = prompt.buildItemSpecificsPrompt({
  existingTitle: "Generic winter boots",
  category: "Shoes",
  questions: ["Brand"],
  fields: [{ name: "Brand", type: "single", currentValue: "See Kai Run", options: ["BOGS", "See Kai Run"] }],
  currentValues: { Brand: "See Kai Run" },
  purpose: "fill"
});
assert(!independentPrompt.includes("CURRENT (existing eBay value; context only, NEVER evidence): See Kai Run"), "Fast Fill prompt must not expose the existing wrong field value as CURRENT context");
const reviewPrompt = prompt.buildItemSpecificsPrompt({
  existingTitle: "Generic winter boots",
  category: "Shoes",
  questions: ["Brand"],
  fields: [{ name: "Brand", type: "single", currentValue: "See Kai Run", options: ["BOGS", "See Kai Run"] }],
  currentValues: { Brand: "See Kai Run" },
  purpose: "review"
});
assert(reviewPrompt.includes("CURRENT (existing eBay value; context only, NEVER evidence): See Kai Run"), "Review Mode must still be able to compare the current form value");

function parse(payload, options = {}) {
  return processor.parseAnswerBundle(JSON.stringify(payload), questions, fields, {
    reviewMode: false,
    modelProvider: "openai",
    existingTitle: "Topshop jacket",
    ...options
  });
}

let bundle = parse({
  fill_response_schema_version: 3,
  answers: { Style: "Biker", "Country of Origin": "Italy", Character: "Mickey Mouse", Brand: "Topshop", Material: "Leather", Vintage: "No" },
  support: {
    "Country of Origin": { source_type: "none", photo: 0, evidence: "" },
    Character: { source_type: "visual", photo: 1, evidence: "Mickey Mouse graphic is visibly printed on the product." },
    Brand: { source_type: "seller_context", photo: 0, evidence: "Seller title explicitly identifies Brand Topshop." },
    Material: { source_type: "visual", photo: 2, evidence: "Leather-like surface is visible." },
    Vintage: { source_type: "none", photo: 0, evidence: "" }
  }
});
assert.strictEqual(bundle.answers.Style, "Biker", "ordinary safe field should remain best-probable without support metadata");
assert.strictEqual(bundle.answers.Character, "Mickey Mouse", "visible Character is the strict visual exception");
assert.strictEqual(bundle.answers.Brand, "Topshop", "context-required Brand may use explicit seller context");
assert(!bundle.answers["Country of Origin"], "Country without direct support must be rejected");
assert(!bundle.answers.Material, "Material may not be accepted from visual appearance alone");
assert(!bundle.answers.Vintage, "Vintage No may not be inferred from absence of evidence");

bundle = parse({
  fill_response_schema_version: 3,
  answers: { Style: "Classic", "Country of Origin": "Italy", Character: "", Brand: "Topshop", Material: "Leather", Vintage: "No" },
  support: {
    "Country of Origin": { source_type: "physical_tag", photo: 2, evidence: "Care label reads Made in Italy; Country of Origin Italy." },
    Character: { source_type: "none", photo: 0, evidence: "" },
    Brand: { source_type: "physical_tag", photo: 1, evidence: "Brand label reads Topshop." },
    Material: { source_type: "physical_tag", photo: 3, evidence: "Composition/upper label states Leather." },
    Vintage: { source_type: "physical_tag", photo: 4, evidence: "Product label explicitly states Vintage: No." }
  }
});
assert.strictEqual(bundle.answers["Country of Origin"], "Italy");
assert.strictEqual(bundle.answers.Brand, "Topshop");
assert.strictEqual(bundle.answers.Material, "Leather");
assert.strictEqual(bundle.answers.Vintage, "No");
assert(bundle.evidence.Material?.sources?.length === 1, "strict accepted value must retain compact support metadata");


// Context support must come from actual seller title/note, never from CURRENT form values.
bundle = parse({
  fill_response_schema_version: 3,
  answers: { Style: "Biker", "Country of Origin": "", Character: "", Brand: "Topshop", Material: "", Vintage: "" },
  support: {
    "Country of Origin": { source_type: "none", photo: 0, evidence: "" },
    Character: { source_type: "none", photo: 0, evidence: "" },
    Brand: { source_type: "seller_context", photo: 0, evidence: "Seller context says Brand Topshop." },
    Material: { source_type: "none", photo: 0, evidence: "" },
    Vintage: { source_type: "none", photo: 0, evidence: "" }
  }
}, { existingTitle: "Generic women's jacket" });
assert(!bundle.answers.Brand, "CURRENT/self-reported Brand must not self-confirm through seller_context support");

// Shoe sizes require a readable physical size tag; title/context conversions are not enough.
const shoeQuestions = ["US Shoe Size"];
const shoeFields = [{ name: "US Shoe Size", type: "single", options: ["3.5", "5", "7", "8"] }];
function parseShoe(sourceType, evidence, title = "Vans shoes size 3.5") {
  return processor.parseAnswerBundle(JSON.stringify({
    fill_response_schema_version: 3,
    answers: { "US Shoe Size": "3.5" },
    support: { "US Shoe Size": { source_type: sourceType, photo: sourceType === "physical_tag" ? 2 : 0, evidence } }
  }), shoeQuestions, shoeFields, { reviewMode: false, modelProvider: "openai", existingTitle: title });
}
assert(!parseShoe("seller_context", "Seller title states US Shoe Size 3.5.").answers["US Shoe Size"], "shoe size may not be accepted from seller-context conversion");
assert.strictEqual(parseShoe("physical_tag", "Physical size tag reads US Shoe Size 3.5.").answers["US Shoe Size"], "3.5");

// Hidden technical properties are evidence-only: appearance is never sufficient.
const technicalQuestions = ["Cushioning Level"];
const technicalFields = [{ name: "Cushioning Level", type: "single", options: ["Light", "Moderate", "Maximum"] }];
function parseTechnical(sourceType, evidence) {
  return processor.parseAnswerBundle(JSON.stringify({
    fill_response_schema_version: 3,
    answers: { "Cushioning Level": "Moderate" },
    support: { "Cushioning Level": { source_type: sourceType, photo: sourceType === "physical_tag" ? 3 : 1, evidence } }
  }), technicalQuestions, technicalFields, { reviewMode: false, modelProvider: "openai" });
}
assert(!parseTechnical("visual", "The sole looks moderately cushioned.").answers["Cushioning Level"], "technical hidden property must not be inferred visually");
assert.strictEqual(parseTechnical("physical_tag", "Product label states Cushioning Level Moderate.").answers["Cushioning Level"], "Moderate");

// Component-scoped material evidence must not leak from one part of the item to another.
const materialQuestions = ["Exterior Material", "Lining Material", "Handle/Strap Material"];
const materialFields = [
  { name: "Exterior Material", type: "single", options: ["Leather", "Polyester"] },
  { name: "Lining Material", type: "single", options: ["Leather", "Polyester"] },
  { name: "Handle/Strap Material", type: "single", options: ["Leather", "Polyester"] }
];
function parseMaterials(answers, support) {
  return processor.parseAnswerBundle(JSON.stringify({
    fill_response_schema_version: 3,
    answers,
    support
  }), materialQuestions, materialFields, { reviewMode: false, modelProvider: "openai" });
}
bundle = parseMaterials(
  { "Exterior Material": "Leather", "Lining Material": "Polyester", "Handle/Strap Material": "Leather" },
  {
    "Exterior Material": { source_type: "physical_tag", photo: 3, evidence: "Product label states BODY: 100% Genuine Leather." },
    "Lining Material": { source_type: "physical_tag", photo: 3, evidence: "Product label states LINING: 100% Polyester." },
    "Handle/Strap Material": { source_type: "physical_tag", photo: 3, evidence: "Product label states BODY: 100% Genuine Leather." }
  }
);
assert.strictEqual(bundle.answers["Exterior Material"], "Leather", "BODY/outer label may support exterior material");
assert.strictEqual(bundle.answers["Lining Material"], "Polyester", "LINING label must support lining material");
assert(!bundle.answers["Handle/Strap Material"], "BODY leather must not be reused as proof of handle/strap material");
assert(/required component/i.test(bundle.rejectionReasons["Handle/Strap Material"] || ""), "component-scope rejection should be explicit");

// Strong-support and safe text fields may be blank; the structured schema must never force filler.
const optionalQuestions = ["Style", "Occasion", "Custom Attribute"];
const optionalFields = [
  { name: "Style", type: "single", options: ["Classic", "Biker"] },
  { name: "Occasion", type: "single", options: ["Casual", "Travel"] },
  { name: "Custom Attribute", type: "text", options: [] }
];
const optionalSchema = prompt.getItemSpecificsFastFillJsonSchema({ questions: optionalQuestions, fields: optionalFields, maxPhotos: 10 });
assert.strictEqual(optionalSchema.properties.answers.properties.Style.minLength, 1, "direct visual ordinary fields should still request a usable answer");
assert.strictEqual(optionalSchema.properties.answers.properties.Occasion.minLength, undefined, "strong-support fields may be blank instead of generic filler");
assert.strictEqual(optionalSchema.properties.answers.properties["Custom Attribute"].minLength, undefined, "safe text fields may be blank instead of speculative text");

// Old cached V2 responses are still parseable for ordinary fields, but must not bypass
// the current strict policy because V2 did not carry support metadata.
bundle = parse({
  fill_response_schema_version: 2,
  answers: { Style: "Biker", "Country of Origin": "Italy", Character: "Mickey Mouse", Brand: "Topshop", Material: "Leather", Vintage: "No" }
});
assert.strictEqual(bundle.answers.Style, "Biker");
for (const field of ["Country of Origin", "Character", "Brand", "Material", "Vintage"]) {
  assert(!bundle.answers[field], `obsolete V2 strict answer must not auto-fill: ${field}`);
}

console.log("PASS V8.23.21 compact strict-support Fast Fill contract");
