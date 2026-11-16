#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const { webcrypto } = require("crypto");
const ROOT = path.resolve(__dirname, "../..");

function makeTransportContext() {
  const localStore = {};
  const sessionStore = {};
  let calls = 0;
  const context = {
    console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise,
    setTimeout, clearTimeout, crypto: webcrypto,
    chrome: { storage: {
      local: { async get(k){ return typeof k === "string" ? { [k]: localStore[k] } : { ...localStore }; }, async set(v){ Object.assign(localStore,v); } },
      session: { async get(k){ return typeof k === "string" ? { [k]: sessionStore[k] } : { ...sessionStore }; }, async set(v){ Object.assign(sessionStore,v); } }
    } },
    async callLocalBackendV637(route, method, payload) {
      assert.strictEqual(route, "/v1/ai/proxy");
      calls += 1;
      if (calls === 1) {
        return {
          upstreamStatus: 400,
          upstreamStatusText: "Bad Request",
          responseText: JSON.stringify({ error: { message: "Unsupported parameter: max_completion_tokens" } }),
          requestConfirmed: true,
          clientRequestId: payload.clientRequestId,
          confirmedAt: Date.now()
        };
      }
      return {
        upstreamStatus: 200,
        upstreamStatusText: "OK",
        responseText: JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
        requestConfirmed: true,
        clientRequestId: payload.clientRequestId,
        confirmedAt: Date.now()
      };
    },
    getCallCount: () => calls
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const rel of ["Extension/shared/config.js","Extension/shared/usage.js","Extension/core/policy.js","Extension/core/snapshot.js","Extension/core/ai.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
  return context;
}

(async () => {
  // Normal analysis stage: never hide a second upstream attempt inside one logical stage.
  {
    const c = makeTransportContext();
    const api = c.EbayAiRequestV711;
    const settings = { apiEnabled:true, apiMode:"openai-compatible", apiBaseUrl:"https://api.openai.com", apiPath:"/v1/chat/completions", apiModel:"gpt-5.6", tokenMode:"balanced" };
    let failed = false;
    try {
      await api.callApi(settings, { model:"gpt-5.6", messages:[{role:"user",content:"x"}], max_completion_tokens:100 }, {}, { stage:"primary", allowCompatibilityRetry:false, timeoutMs:30000 });
    } catch (error) {
      failed = /400/.test(String(error.message || error));
    }
    assert.strictEqual(failed, true, "normal analysis must surface a compatibility error rather than creating a hidden extra upstream request");
    assert.strictEqual(c.getCallCount(), 1, "one logical primary stage must equal one upstream OpenAI attempt");
  }

  // Explicit connection test may probe the alternate token parameter once so setup can learn capability safely.
  {
    const c = makeTransportContext();
    const api = c.EbayAiRequestV711;
    const settings = { apiEnabled:true, apiMode:"openai-compatible", apiBaseUrl:"https://api.openai.com", apiPath:"/v1/chat/completions", apiModel:"gpt-5.6", tokenMode:"balanced" };
    const result = await api.callApi(settings, { model:"gpt-5.6", messages:[{role:"user",content:"x"}], max_completion_tokens:100 }, {}, { stage:"connection_test", allowCompatibilityRetry:true, timeoutMs:30000 });
    assert.strictEqual(result.text, "OK");
    assert.strictEqual(c.getCallCount(), 2, "only explicit connection testing may use the one compatibility probe");
  }

  const source = fs.readFileSync(path.join(ROOT, "Extension/core/ai.js"), "utf8");
  assert(source.includes("allowCompatibilityRetry: false"), "Item Specific analysis must disable transport compatibility retry");
  assert(source.includes("maxOpenAiRequests: reviewMode ? 1 : 2"), "Normal Fill must have a hard 2-request OpenAI budget");
  assert(source.includes("ANALYSIS_REQUEST_BUDGET_EXHAUSTED"), "Request budget must fail closed to review instead of creating request 3");
  console.log("PASS V8.23.21 hard request invariant: normal Fill has <=2 OpenAI upstream attempts; compatibility probing is setup-only");
})().catch(error => { console.error(error); process.exit(1); });
