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

const processor = context.EbayCoreAiAnswerProcessorV800;
assert(processor, "answer processor missing");

function parse(questions, fields, answers, support, options = {}) {
  return processor.parseAnswerBundle(JSON.stringify({
    fill_response_schema_version: 3,
    answers,
    support
  }), questions, fields, {
    reviewMode: false,
    modelProvider: "openai",
    existingTitle: options.existingTitle || "",
    customInstruction: options.customInstruction || ""
  });
}

// Regression from the BOGS draft: readable product identity/size/country must win,
// while hidden technical guesses must not auto-fill from appearance.
{
  const questions = ["Brand", "US Shoe Size", "Country of Origin", "Midsole Type", "Cushioning Level", "Performance/Activity"];
  const fields = [
    { name: "Brand", type: "single", options: ["BOGS", "See Kai Run"] },
    { name: "US Shoe Size", type: "single", options: ["7", "8"] },
    { name: "Country of Origin", type: "single", options: ["China", "Vietnam"] },
    { name: "Midsole Type", type: "single", options: ["Shank", "Foam"] },
    { name: "Cushioning Level", type: "single", options: ["Light", "Moderate", "Maximum"] },
    { name: "Performance/Activity", type: "multi", options: ["School", "Hiking", "Walking"] }
  ];
  const bundle = parse(questions, fields, {
    Brand: "BOGS",
    "US Shoe Size": "8",
    "Country of Origin": "China",
    "Midsole Type": "Shank",
    "Cushioning Level": "Moderate",
    "Performance/Activity": "School"
  }, {
    Brand: { source_type: "physical_tag", photo: 1, evidence: "Readable BOGS logo is printed on the physical boot." },
    "US Shoe Size": { source_type: "physical_tag", photo: 4, evidence: "Physical size tag reads US Shoe Size 8." },
    "Country of Origin": { source_type: "physical_tag", photo: 5, evidence: "Product label reads MADE IN CHINA." },
    "Midsole Type": { source_type: "visual", photo: 2, evidence: "The boot looks like it may use a Shank." },
    "Cushioning Level": { source_type: "visual", photo: 2, evidence: "The sole looks like Moderate cushioning." },
    "Performance/Activity": { source_type: "visual", photo: 1, evidence: "The boots could be used for School." }
  }, { existingTitle: "Kids winter boots" });

  assert.strictEqual(bundle.answers.Brand, "BOGS", "readable physical brand mark must be accepted");
  assert.strictEqual(bundle.answers["US Shoe Size"], "8", "readable size-tag value must be accepted");
  assert.strictEqual(bundle.answers["Country of Origin"], "China", "Made in China label must be accepted");
  assert(!bundle.answers["Midsole Type"], "Midsole Type must not be inferred visually");
  assert(!bundle.answers["Cushioning Level"], "Cushioning Level must not be inferred visually");
  assert(!bundle.answers["Performance/Activity"], "Performance/Activity must not use generic visual plausibility");
}

// Regression from the Vans draft: multiple regional shoe sizes and country are valid
// only when the physical size/production label directly states them.
{
  const questions = ["Brand", "US Shoe Size", "UK Shoe Size", "EU Shoe Size", "Country of Origin"];
  const fields = [
    { name: "Brand", type: "single", options: ["Vans"] },
    { name: "US Shoe Size", type: "single", options: ["3.5", "5"] },
    { name: "UK Shoe Size", type: "single", options: ["2.5"] },
    { name: "EU Shoe Size", type: "single", options: ["34.5"] },
    { name: "Country of Origin", type: "single", options: ["China"] }
  ];
  const bundle = parse(questions, fields, {
    Brand: "Vans",
    "US Shoe Size": "3.5",
    "UK Shoe Size": "2.5",
    "EU Shoe Size": "34.5",
    "Country of Origin": "China"
  }, {
    Brand: { source_type: "physical_tag", photo: 1, evidence: "Readable Vans logo is printed on the physical shoe." },
    "US Shoe Size": { source_type: "physical_tag", photo: 4, evidence: "Physical size tag reads US 3.5." },
    "UK Shoe Size": { source_type: "physical_tag", photo: 4, evidence: "Physical size tag reads UK 2.5." },
    "EU Shoe Size": { source_type: "physical_tag", photo: 4, evidence: "Physical size tag reads EUR 34.5." },
    "Country of Origin": { source_type: "physical_tag", photo: 4, evidence: "Physical label reads Made in China." }
  });
  assert.strictEqual(bundle.answers.Brand, "Vans");
  assert.strictEqual(bundle.answers["US Shoe Size"], "3.5");
  assert.strictEqual(bundle.answers["UK Shoe Size"], "2.5");
  assert.strictEqual(bundle.answers["EU Shoe Size"], "34.5");
  assert.strictEqual(bundle.answers["Country of Origin"], "China");
}

// Regression from the Børn bag draft: component-specific material evidence must stay
// scoped to the component named on the physical label.
{
  const questions = ["Brand", "Exterior Material", "Lining Material", "Handle/Strap Material", "Country of Origin"];
  const fields = [
    { name: "Brand", type: "single", options: ["Børn"] },
    { name: "Exterior Material", type: "single", options: ["Leather", "Polyester"] },
    { name: "Lining Material", type: "single", options: ["Leather", "Polyester"] },
    { name: "Handle/Strap Material", type: "single", options: ["Leather", "Polyester"] },
    { name: "Country of Origin", type: "single", options: ["India"] }
  ];
  const bundle = parse(questions, fields, {
    Brand: "Børn",
    "Exterior Material": "Leather",
    "Lining Material": "Polyester",
    "Handle/Strap Material": "Leather",
    "Country of Origin": "India"
  }, {
    Brand: { source_type: "physical_tag", photo: 1, evidence: "Readable Børn brand mark appears on the physical bag." },
    "Exterior Material": { source_type: "physical_tag", photo: 3, evidence: "Product label states BODY: 100% Genuine Leather." },
    "Lining Material": { source_type: "physical_tag", photo: 3, evidence: "Product label states LINING: 100% Polyester." },
    "Handle/Strap Material": { source_type: "physical_tag", photo: 3, evidence: "Product label states BODY: 100% Genuine Leather." },
    "Country of Origin": { source_type: "physical_tag", photo: 3, evidence: "Product label reads Made in India." }
  });
  assert.strictEqual(bundle.answers.Brand, "Børn");
  assert.strictEqual(bundle.answers["Exterior Material"], "Leather");
  assert.strictEqual(bundle.answers["Lining Material"], "Polyester");
  assert(!bundle.answers["Handle/Strap Material"], "body material must not auto-confirm handle/strap material");
  assert.strictEqual(bundle.answers["Country of Origin"], "India");
}

console.log("PASS V8.23.21 real draft evidence regressions: BOGS, Vans and Børn");
