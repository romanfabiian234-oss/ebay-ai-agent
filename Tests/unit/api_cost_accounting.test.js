#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const { webcrypto } = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const store = {};
const context = {
  console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise,
  crypto: webcrypto,
  chrome: {
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: store[key] };
          return { ...store };
        },
        async set(values) { Object.assign(store, values); },
        async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key]; }
      }
    }
  }
};
context.globalThis = context;
vm.createContext(context);
for (const rel of ["Extension/shared/config.js", "Extension/shared/usage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
}

const usage = context.EbayUsageV8237;
assert(usage, "usage ledger missing");
const settings = { apiBaseUrl: "https://api.openai.com", apiModel: "gpt-5.6" };

// Responses API token details: cached/cache-write tokens are priced separately,
// while reasoning tokens are only a breakdown of output tokens and must not be added twice.
const normalized = usage.normalizeProviderUsage({
  input_tokens: 10000,
  input_tokens_details: { cached_tokens: 2000, cache_write_tokens: 1000, image_tokens: 6000, text_tokens: 4000 },
  output_tokens: 1000,
  output_tokens_details: { reasoning_tokens: 400 },
  total_tokens: 11000
}, "", settings, {});
assert.strictEqual(normalized.reported, true);
assert.strictEqual(normalized.inputTokens, 10000);
assert.strictEqual(normalized.cachedInputTokens, 2000);
assert.strictEqual(normalized.cacheWriteTokens, 1000);
assert.strictEqual(normalized.uncachedInputTokens, 7000);
assert.strictEqual(normalized.reasoningTokens, 400);
assert.strictEqual(normalized.imageInputTokens, 6000);
assert(Math.abs(normalized.cost - 0.07225) < 1e-12, `unexpected short-context cost ${normalized.cost}`);

// Chat Completions aliases use prompt/completion detail objects.
const chat = usage.normalizeProviderUsage({
  prompt_tokens: 20000,
  prompt_tokens_details: { cached_tokens: 5000, cache_write_tokens: 2000 },
  completion_tokens: 1500,
  completion_tokens_details: { reasoning_tokens: 700 },
  total_tokens: 21500
}, "", settings, {});
const chatExpected = (13000 * 5 + 5000 * 0.5 + 2000 * 6.25 + 1500 * 30) / 1e6;
assert(Math.abs(chat.cost - chatExpected) < 1e-12, `unexpected chat cost ${chat.cost}`);

// GPT-5.6 requests above 272K input use the documented long-context rates.
const longContext = usage.normalizeProviderUsage({
  input_tokens: 300000,
  input_tokens_details: { cached_tokens: 50000, cache_write_tokens: 10000 },
  output_tokens: 10000,
  total_tokens: 310000
}, "", settings, {});
assert.strictEqual(longContext.rates.longContext, true);
assert(Math.abs(longContext.cost - 3.025) < 1e-12, `unexpected long-context cost ${longContext.cost}`);

(async () => {
  const id = "openai-ledger-test";
  await usage.startRequest({
    id,
    provider: "openai",
    model: "gpt-5.6",
    stage: "primary",
    estimatedCost: 0.20,
    estimatedInputTokens: 10000,
    estimatedOutputTokens: 1000
  });
  let summary = usage.summarize(await usage.history());
  assert(Math.abs(summary.today.budgetCost - 0.20) < 1e-12, "in-flight request must reserve its estimate");
  assert.strictEqual(summary.today.uncertainCount, 1);

  await usage.finishRequest(id, {
    status: "success",
    inputTokens: normalized.inputTokens,
    cachedInputTokens: normalized.cachedInputTokens,
    cacheWriteTokens: normalized.cacheWriteTokens,
    outputTokens: normalized.outputTokens,
    reasoningTokens: normalized.reasoningTokens,
    totalTokens: normalized.totalTokens,
    cost: normalized.cost,
    costKnown: true,
    uncertainCharge: false,
    providerRequestId: "req_test",
    clientRequestId: id
  });
  summary = usage.summarize(await usage.history());
  assert(Math.abs(summary.today.budgetCost - normalized.cost) < 1e-12, "actual request cost must replace the reservation, not add to it");
  assert.strictEqual(summary.today.uncertainCount, 0);

  await usage.upsert({ id: "summary-only", kind: "item_summary", countsTowardBudget: false, cost: 9.99, createdAt: new Date().toISOString() });
  summary = usage.summarize(await usage.history());
  assert(Math.abs(summary.today.budgetCost - normalized.cost) < 1e-12, "item summary must not double-count request spend");

  await usage.startRequest({ id: "timeout-test", provider: "openai", model: "gpt-5.6", stage: "recovery", estimatedCost: 0.15 });
  await usage.finishRequest("timeout-test", { status: "transport_error", costKnown: false, uncertainCharge: true });
  summary = usage.summarize(await usage.history());
  assert(Math.abs(summary.today.budgetCost - (normalized.cost + 0.15)) < 1e-12, "unknown transport outcome must remain conservatively reserved");

  await usage.startRequest({ id: "http-error-test", provider: "openai", model: "gpt-5.6", stage: "primary", estimatedCost: 0.25 });
  await usage.finishRequest("http-error-test", { status: "http_error", costKnown: false, uncertainCharge: false, cost: 0 });
  summary = usage.summarize(await usage.history());
  assert(Math.abs(summary.today.budgetCost - (normalized.cost + 0.15)) < 1e-12, "known HTTP error must not reserve estimated spend");

  await usage.startRequest({ id: "http-5xx-test", provider: "openai", model: "gpt-5.6", stage: "primary", estimatedCost: 0.30 });
  await usage.finishRequest("http-5xx-test", { status: "http_error_uncertain", costKnown: false, uncertainCharge: true, cost: 0 });
  summary = usage.summarize(await usage.history());
  assert(Math.abs(summary.today.budgetCost - (normalized.cost + 0.15 + 0.30)) < 1e-12, "uncertain upstream 5xx must conservatively reserve the request estimate");

  const aiSource = fs.readFileSync(path.join(ROOT, "Extension/core/ai.js"), "utf8");
  const backendSource = fs.readFileSync(path.join(ROOT, "Backend/server.py"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "Extension/background.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(ROOT, "Extension/ui/popup/popup.html"), "utf8");
  assert(aiSource.includes("safeLedgerStart"), "AI transport is not request-ledger aware");
  assert(aiSource.includes("cachedInputTokens"), "AI aggregate usage lost cached-token detail");
  assert(backendSource.includes('headers["X-Client-Request-Id"] = client_request_id'), "OpenAI client request ID header missing");
  assert(backendSource.includes('endpoint_host == "api.openai.com"'), "client request ID must be scoped to OpenAI only");
  assert(backgroundSource.includes('"shared/usage.js"'), "background does not load usage ledger");
  assert(popupHtml.includes('../../shared/usage.js'), "popup does not load usage ledger");

  console.log("PASS V8.23.21 reliable per-request API accounting, cached/cache-write/long-context pricing, request IDs, and no double counting");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
