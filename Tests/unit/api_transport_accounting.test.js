#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const { webcrypto } = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const localStore = {};
const sessionStore = {};
let lastProxyPayload = null;
const context = {
  console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise,
  setTimeout, clearTimeout, crypto: webcrypto,
  chrome: {
    storage: {
      local: {
        async get(key) { return typeof key === "string" ? { [key]: localStore[key] } : { ...localStore }; },
        async set(values) { Object.assign(localStore, values); }
      },
      session: {
        async get(key) { return typeof key === "string" ? { [key]: sessionStore[key] } : { ...sessionStore }; },
        async set(values) { Object.assign(sessionStore, values); }
      }
    }
  },
  async callLocalBackendV637(route, method, payload) {
    assert.strictEqual(route, "/v1/ai/proxy");
    assert.strictEqual(method, "POST");
    lastProxyPayload = payload;
    return {
      upstreamStatus: 200,
      upstreamStatusText: "OK",
      responseText: JSON.stringify({
        id: "resp_test",
        output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 100, cache_write_tokens: 50 },
          output_tokens: 100,
          output_tokens_details: { reasoning_tokens: 20 },
          total_tokens: 1100
        }
      }),
      requestConfirmed: true,
      providerRequestId: "req_provider_test",
      proxyRequestId: "proxy_test",
      clientRequestId: payload.clientRequestId,
      confirmedAt: Date.now()
    };
  }
};
context.globalThis = context;
vm.createContext(context);
for (const rel of [
  "Extension/shared/config.js",
  "Extension/shared/usage.js",
  "Extension/core/policy.js",
  "Extension/core/snapshot.js",
  "Extension/core/ai.js"
]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

(async () => {
  const api = context.EbayAiRequestV711;
  assert(api, "AI request API missing");
  const settings = {
    apiEnabled: true,
    apiMode: "openai-compatible",
    apiBaseUrl: "https://api.openai.com",
    apiPath: "/v1/responses",
    apiModel: "gpt-5.6",
    tokenMode: "balanced"
  };
  const estimate = { estimatedInputTokens: 1500, estimatedOutputTokens: 200, estimatedCost: 0.02 };
  const result = await api.callApi(settings, { model: "gpt-5.6", input: "test" }, estimate, {
    stage: "primary",
    analysisRunId: "run-test",
    photoCount: 3,
    questionCount: 17,
    timeoutMs: 30000
  });
  assert.strictEqual(result.text, "OK");
  assert(lastProxyPayload?.clientRequestId, "client request ID was not forwarded to backend");
  assert(!Object.prototype.hasOwnProperty.call(lastProxyPayload.settings, "apiKey"), "API secret leaked into browser proxy payload");

  const history = await context.EbayUsageV8237.history();
  const record = history.find(item => item.kind === "api_request" && item.stage === "primary");
  assert(record, "completed request ledger record missing");
  assert.strictEqual(record.status, "success");
  assert.strictEqual(record.providerRequestId, "req_provider_test");
  assert.strictEqual(record.proxyRequestId, "proxy_test");
  assert.strictEqual(record.clientRequestId, lastProxyPayload.clientRequestId);
  assert.strictEqual(record.inputTokens, 1000);
  assert.strictEqual(record.cachedInputTokens, 100);
  assert.strictEqual(record.cacheWriteTokens, 50);
  assert.strictEqual(record.uncachedInputTokens, 850);
  assert.strictEqual(record.outputTokens, 100);
  assert.strictEqual(record.reasoningTokens, 20);
  assert.strictEqual(record.photoCount, 3);
  assert.strictEqual(record.questionCount, 17);
  assert.strictEqual(record.costKnown, true);
  const expected = (850 * 5 + 100 * 0.5 + 50 * 6.25 + 100 * 30) / 1e6;
  assert(Math.abs(record.cost - expected) < 1e-12, `unexpected request cost ${record.cost}`);

  const summary = context.EbayUsageV8237.summarize(history);
  assert.strictEqual(summary.today.requestCount, 1);
  assert(Math.abs(summary.today.budgetCost - expected) < 1e-12, "budget must use completed request cost, not preflight estimate");
  console.log("PASS V8.23.21 AI transport writes one completed provider-usage ledger record with request IDs and no double counting");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
