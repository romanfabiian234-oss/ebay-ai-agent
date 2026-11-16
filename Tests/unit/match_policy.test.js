"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const extension = path.resolve(__dirname, "../../Extension");
const context = vm.createContext({ console, Map, Set, Object, Array, String, Number, Boolean, Math, Date });
context.globalThis = context;
for (const relative of [
  "core/policy.js",
  "core/match.js"
]) vm.runInContext(fs.readFileSync(path.join(extension, relative), "utf8"), context, { filename: relative });

const policy = context.EbayAiItemSpecificsV7100;
assert.strictEqual(policy.shouldAlwaysSkip("UPC"), true);
assert.strictEqual(policy.shouldAlwaysSkip("MPN"), true);
assert.strictEqual(policy.automaticDecision({ name: "California Prop 65 Warning", type: "text" }).allow, false);
assert.strictEqual(policy.automaticDecision({ name: "Personalization Instructions", type: "text" }).allow, false);
assert.strictEqual(policy.automaticDecision({ name: "Custom Attribute", type: "text" }).allow, true, "ordinary free-form Item Specifics should be available when supported");
assert.strictEqual(policy.automaticDecision({ name: "Custom Attribute", type: "text" }).safeText, true);
for (const label of ["Vintage", "Handmade", "Personalize", "Customized", "Country of Origin", "Material", "Performance/Activity", "Cushioning Level", "Midsole Type"]) {
  const decision = policy.automaticDecision({ name: label, type: label === "Material" ? "multi" : "yesno" });
  assert.strictEqual(decision.allow, true, `${label} should remain available when supported`);
  assert.strictEqual(decision.evidenceOnly, true, `${label} must be evidence-only`);
}
for (const label of ["Style", "Features", "Accents"]) {
  const decision = policy.automaticDecision({ name: label, type: "dropdown" });
  assert.strictEqual(decision.allow, true);
  assert.strictEqual(decision.evidenceMode, "best_probable");
}
for (const label of ["Theme", "Season", "Occasion", "Fit"]) {
  const decision = policy.automaticDecision({ name: label, type: "dropdown" });
  assert.strictEqual(decision.allow, true);
  assert.strictEqual(decision.evidenceMode, "strong_support");
}
for (const label of ["Brand", "Size", "US Shoe Size", "UK Shoe Size", "EU Shoe Size", "AU Shoe Size", "Model", "Product Line"]) {
  const decision = policy.automaticDecision({ name: label, type: "dropdown" });
  assert.strictEqual(decision.contextRequired, true, `${label} must be revalidated from identity/size evidence`);
  assert.strictEqual(policy.shouldVerifyExisting(label), true, `${label} existing value is context only, not proof`);
}

const resolver = context.EbayUniversalResolverV860;
assert.strictEqual(resolver.resolveField("Occasion", "Work", { type: "dropdown", options: ["Workwear"] }).value, "", "semantic alias Work -> Workwear is forbidden");
assert.strictEqual(resolver.resolveField("Fit", "Loose", { type: "dropdown", options: ["Relaxed"] }).value, "", "semantic alias Loose -> Relaxed is forbidden");
assert.strictEqual(resolver.resolveField("Material", "Rayon", { type: "dropdown", options: ["Viscose"] }).value, "", "semantic material alias is forbidden in matcher");
assert.strictEqual(resolver.resolveField("Color", "Gray", { type: "dropdown", options: ["Gray", "Black"] }).value, "Gray");
assert.strictEqual(resolver.resolveField("Size", "XXL", { type: "dropdown", options: ["2XL", "XL"] }).value, "2XL", "explicit composite size resolver may map equivalent size token");
const virtual = resolver.resolveField("Style", "Biker", { type: "dropdown", options: [] });
assert.strictEqual(virtual.value, "Biker");
assert.strictEqual(virtual.requiresFillVerification, true);

const match = context.EbayBlocksV890.matchEbay;
let result = match.run({
  analysis: { answers: { Style: "Sweatshirt" } },
  questions: ["Style"],
  fields: [{ name: "Style", type: "dropdown", options: ["Hoodie"] }],
  automaticPolicy: true
});
assert.deepStrictEqual(Object.keys(result.answers), [], "complete option catalog mismatch must not be sent to Fill");
assert.ok(result.unresolved.includes("Style"));

result = match.run({
  analysis: { answers: { Style: "Biker" } },
  questions: ["Style"],
  fields: [{ name: "Style", type: "dropdown", options: [] }],
  automaticPolicy: true
});
assert.strictEqual(result.answers.Style, "Biker", "virtualized/unknown option catalog may defer exact verification to Fill");
assert.strictEqual(result.unresolved.length, 0);

result = match.run({
  analysis: { answers: {} },
  questions: ["Country of Origin", "Vintage"],
  fields: [
    { name: "Country of Origin", type: "dropdown", options: ["Italy", "India"] },
    { name: "Vintage", type: "yesno", options: ["Yes", "No"] }
  ],
  automaticPolicy: true
});
assert.ok(result.policyOmitted.includes("Country of Origin"));
assert.ok(result.policyOmitted.includes("Vintage"));
assert.strictEqual(result.unresolved.length, 0, "evidence-only omissions should not be reported as ordinary Fill failures");

result = match.run({
  analysis: { answers: {} },
  questions: ["Occasion", "Theme", "Season", "Fit"],
  fields: [
    { name: "Occasion", type: "dropdown", options: ["Casual", "Travel"] },
    { name: "Theme", type: "dropdown", options: ["Classic"] },
    { name: "Season", type: "multi", options: ["Fall", "Winter"] },
    { name: "Fit", type: "dropdown", options: ["Regular"] }
  ],
  automaticPolicy: true
});
assert.deepStrictEqual(Array.from(result.policyOmitted).sort(), ["Fit", "Occasion", "Season", "Theme"].sort(), "strong-support blanks should be safe omissions, not Fill failures");
assert.strictEqual(result.unresolved.length, 0);

// V8.23.21 regression: a high-confidence local OCR Size fact may cross an incomplete
// virtualized size catalog only when the provenance explicitly says localOcrRecovery.
// Ordinary GPT size guesses must still wait for a real option catalog.
const unknownSize = resolver.resolveField("Size", "XS", { type: "dropdown", options: [], optionsComplete: false });
assert.strictEqual(unknownSize.value, "", "ordinary Size must stay blocked when the compact catalog is unavailable");
const trustedLocalSize = resolver.resolveField(
  "Size",
  "XS",
  { type: "dropdown", options: [], optionsComplete: false },
  { allowLiveExactSize: true }
);
assert.strictEqual(trustedLocalSize.value, "XS", "direct local OCR Size may defer exact validation to the live dropdown");
assert.strictEqual(trustedLocalSize.requiresFillVerification, true);

result = match.run({
  analysis: {
    answers: { Size: "XS" },
    modelResults: { Size: { value: "XS", localOcrRecovery: true, evidenceType: "physical_tag", status: "confirmed_by_tag" } }
  },
  questions: ["Size"],
  fields: [{ name: "Size", type: "dropdown", options: [], optionsComplete: false }],
  automaticPolicy: true
});
assert.strictEqual(result.answers.Size, "XS", "OCR-confirmed XS must reach the Fill Engine for exact live-option verification");
assert.strictEqual(result.unresolved.length, 0);

result = match.run({
  analysis: { answers: { Size: "XS" }, modelResults: { Size: { value: "XS", evidenceType: "visual" } } },
  questions: ["Size"],
  fields: [{ name: "Size", type: "dropdown", options: [], optionsComplete: false }],
  automaticPolicy: true
});
assert.deepStrictEqual(Object.keys(result.answers), [], "non-OCR Size must not bypass the missing option catalog safety gate");
assert.ok(result.unresolved.includes("Size"));

console.log("PASS V8.23.21 field policy, deterministic exact matcher, and OCR-confirmed live Size fallback");
