/* Reliable per-request API usage ledger — V8.23.21.
 * One source of truth for provider token breakdown, calculated model cost,
 * request IDs, and hard-budget accounting. No API keys or payload text are stored.
 */
(function initEbayUsageV8237(global) {
  "use strict";

  const STORAGE_KEY = global.EbayAiConstantsV790?.STORAGE_KEYS?.USAGE || "ebayFillerV50A3UsageHistory";
  const MAX_RECORDS = 1000;
  const LONG_CONTEXT_THRESHOLD = 272000;

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function text(value, limit = 220) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function isOpenAi(settings = {}) {
    try {
      return new URL(String(settings.apiBaseUrl || "")).hostname.toLowerCase() === "api.openai.com";
    } catch (_) {
      return false;
    }
  }

  function modelFamily(settings = {}) {
    const model = String(settings.apiModel || "").trim().toLowerCase();
    if (model === "gpt-5.6" || model === "gpt-5.6-sol" || model.startsWith("gpt-5.6-sol-")) return "gpt-5.6-sol";
    if (model === "gpt-5.6-terra" || model.startsWith("gpt-5.6-terra-")) return "gpt-5.6-terra";
    if (model === "gpt-5.6-luna" || model.startsWith("gpt-5.6-luna-")) return "gpt-5.6-luna";
    return model;
  }

  function openAiRates(settings = {}, inputTokens = 0) {
    if (!isOpenAi(settings)) return null;
    const model = modelFamily(settings);
    const longContext = number(inputTokens) > LONG_CONTEXT_THRESHOLD;
    const table = {
      "gpt-5.6-sol": longContext
        ? { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 45 }
        : { input: 5, cachedInput: 0.5, cacheWrite: 6.25, output: 30 },
      "gpt-5.6-terra": longContext
        ? { input: 4, cachedInput: 0.4, cacheWrite: 5, output: 18 }
        : { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 },
      "gpt-5.6-luna": longContext
        ? { input: 0.4, cachedInput: 0.04, cacheWrite: 0.5, output: 1.8 }
        : { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 }
    };
    const rates = table[model];
    if (!rates) return null;
    return { ...rates, model, longContext, source: "openai-standard-2026-08-18" };
  }

  function pricingForSettings(settings = {}, inputTokens = 0) {
    const openAi = openAiRates(settings, inputTokens);
    if (openAi) return openAi;
    const input = number(settings.inputCostPer1M);
    const output = number(settings.outputCostPer1M);
    return {
      input,
      cachedInput: input,
      cacheWrite: input,
      output,
      model: String(settings.apiModel || ""),
      longContext: false,
      source: input || output ? "custom-settings" : "unavailable"
    };
  }

  function rawDetails(raw = {}) {
    const inputDetails = raw.input_tokens_details || raw.prompt_tokens_details || raw.inputTokensDetails || raw.promptTokensDetails || {};
    const outputDetails = raw.output_tokens_details || raw.completion_tokens_details || raw.outputTokensDetails || raw.completionTokensDetails || {};
    return { inputDetails, outputDetails };
  }

  function tokenBreakdown(raw = {}) {
    const { inputDetails, outputDetails } = rawDetails(raw);
    const inputTokens = number(raw.inputTokens || raw.input_tokens || raw.prompt_tokens || raw.promptTokens);
    const outputTokens = number(raw.outputTokens || raw.output_tokens || raw.completion_tokens || raw.completionTokens);
    const totalTokens = number(raw.totalTokens || raw.total_tokens) || inputTokens + outputTokens;
    const cachedInputTokens = Math.min(inputTokens, number(inputDetails.cached_tokens || inputDetails.cachedTokens || raw.cachedInputTokens));
    const remainingAfterCache = Math.max(0, inputTokens - cachedInputTokens);
    const cacheWriteTokens = Math.min(remainingAfterCache, number(inputDetails.cache_write_tokens || inputDetails.cacheWriteTokens || raw.cacheWriteTokens));
    const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens);
    return {
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens,
      cacheWriteTokens,
      uncachedInputTokens,
      reasoningTokens: number(outputDetails.reasoning_tokens || outputDetails.reasoningTokens || raw.reasoningTokens),
      imageInputTokens: number(inputDetails.image_tokens || inputDetails.imageTokens || raw.imageInputTokens),
      textInputTokens: number(inputDetails.text_tokens || inputDetails.textTokens || raw.textInputTokens)
    };
  }

  function calculateCost(usage = {}, settings = {}) {
    const tokens = tokenBreakdown(usage);
    const rates = pricingForSettings(settings, tokens.inputTokens);
    const cost = (
      tokens.uncachedInputTokens * rates.input
      + tokens.cachedInputTokens * rates.cachedInput
      + tokens.cacheWriteTokens * rates.cacheWrite
      + tokens.outputTokens * rates.output
    ) / 1000000;
    const available = [rates.input, rates.cachedInput, rates.cacheWrite, rates.output].some(rate => number(rate) > 0);
    return { ...tokens, rates, cost: available ? cost : 0, costAvailable: available };
  }

  function normalizeProviderUsage(rawUsage = {}, responseText = "", settings = {}, estimate = {}) {
    const raw = rawUsage && typeof rawUsage === "object" ? rawUsage : {};
    const reported = tokenBreakdown(raw);
    const hasProviderUsage = reported.inputTokens > 0 || reported.outputTokens > 0 || reported.totalTokens > 0;
    if (hasProviderUsage) {
      const calculated = calculateCost(raw, settings);
      return {
        ...calculated,
        reported: true,
        source: "provider",
        cost: calculated.cost,
        costSource: calculated.costAvailable ? "provider-usage-calculated" : "provider-usage-cost-unavailable"
      };
    }
    const inputTokens = number(estimate.estimatedInputTokens);
    const outputTokens = number(estimate.estimatedOutputTokens) || Math.max(1, Math.ceil(String(responseText || "").length / 4));
    const estimatedRaw = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    const calculated = calculateCost(estimatedRaw, settings);
    const explicitEstimate = number(estimate.estimatedCost);
    return {
      ...calculated,
      reported: false,
      source: "estimate",
      cost: explicitEstimate || calculated.cost,
      costSource: "estimate"
    };
  }

  function newRequestId(prefix = "api") {
    try {
      if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID()}`.slice(0, 160);
    } catch (error) {
      globalThis.EbayLogger?.debug?.("crypto.randomUUID unavailable for usage request id", { message: error?.message || String(error) });
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`.slice(0, 160);
  }

  async function history() {
    if (!global.chrome?.storage?.local?.get) return [];
    const stored = await global.chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(stored?.[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  }

  async function write(items) {
    if (!global.chrome?.storage?.local?.set) return;
    await global.chrome.storage.local.set({ [STORAGE_KEY]: items.slice(0, MAX_RECORDS) });
  }

  async function upsert(record = {}) {
    const id = text(record.id || record.clientRequestId || newRequestId("usage"), 180);
    const items = await history();
    const index = items.findIndex(item => String(item?.id || "") === id);
    const previous = index >= 0 ? items[index] : {};
    const now = new Date().toISOString();
    const nextRecord = {
      createdAt: previous.createdAt || record.createdAt || now,
      ...previous,
      ...record,
      id,
      updatedAt: now
    };
    if (index >= 0) items.splice(index, 1);
    items.unshift(nextRecord);
    await write(items);
    return nextRecord;
  }

  async function startRequest(meta = {}) {
    const id = text(meta.id || meta.clientRequestId || newRequestId(meta.provider === "anthropic" ? "claude" : "openai"), 180);
    return upsert({
      id,
      clientRequestId: id,
      kind: "api_request",
      countsTowardBudget: true,
      status: "started",
      provider: text(meta.provider || "openai", 40),
      model: text(meta.model || "", 120),
      stage: text(meta.stage || "api", 80),
      analysisRunId: text(meta.analysisRunId || "", 180),
      photoCount: number(meta.photoCount),
      questionCount: number(meta.questionCount),
      estimatedCost: number(meta.estimatedCost),
      estimatedInputTokens: number(meta.estimatedInputTokens),
      estimatedOutputTokens: number(meta.estimatedOutputTokens),
      questionNames: (Array.isArray(meta.questionNames) ? meta.questionNames : []).map(value => text(value, 120)).filter(Boolean).slice(0, 40),
      repairReasons: (Array.isArray(meta.repairReasons) ? meta.repairReasons : []).map(item => ({
        field: text(item?.field || "", 120),
        code: text(item?.code || "", 80),
        reason: text(item?.reason || "", 240)
      })).filter(item => item.field || item.code).slice(0, 20),
      photoIds: (Array.isArray(meta.photoIds) ? meta.photoIds : []).map(value => text(value, 180)).filter(Boolean).slice(0, 12),
      highDetailPhotoCount: number(meta.highDetailPhotoCount),
      cost: 0,
      costKnown: false,
      uncertainCharge: true,
      source: "request-ledger"
    });
  }

  async function finishRequest(id, patch = {}) {
    return upsert({ id, ...patch });
  }

  function recordBudgetCost(record = {}) {
    if (record.countsTowardBudget === false || record.kind === "item_summary") return 0;
    if (!record.kind) return number(record.cost || record.estimatedCost);
    if (record.kind !== "api_request") return number(record.cost || record.estimatedCost);
    if (record.costKnown === true) return number(record.cost);
    if (["http_error", "cancelled_before_send"].includes(String(record.status || ""))) return 0;
    return number(record.estimatedCost);
  }

  function summarize(items = [], date = new Date()) {
    const today = date.toISOString().slice(0, 10);
    const month = date.toISOString().slice(0, 7);
    const included = items.filter(item => item?.countsTowardBudget !== false && item?.kind !== "item_summary");
    const todayItems = included.filter(item => String(item?.createdAt || "").slice(0, 10) === today);
    const monthItems = included.filter(item => String(item?.createdAt || "").slice(0, 7) === month);
    const sum = (arr, fn) => arr.reduce((total, item) => total + number(fn(item)), 0);
    const requestCount = arr => arr.filter(item => item.kind === "api_request" || !item.kind).length;
    const result = arr => ({
      budgetCost: sum(arr, recordBudgetCost),
      calculatedCost: sum(arr, item => item.costKnown === true ? item.cost : (!item.kind ? item.cost : 0)),
      estimatedOrUncertainCost: sum(arr, item => item.costKnown === true ? 0 : recordBudgetCost(item)),
      tokens: sum(arr, item => number(item.inputTokens || item.estimatedInputTokens) + number(item.outputTokens || item.estimatedOutputTokens)),
      requestCount: requestCount(arr),
      uncertainCount: arr.filter(item => item.kind === "api_request" && item.costKnown !== true && recordBudgetCost(item) > 0).length
    });
    return { today: result(todayItems), month: result(monthItems), all: result(included) };
  }

  global.EbayUsageV8237 = Object.freeze({
    STORAGE_KEY,
    LONG_CONTEXT_THRESHOLD,
    isOpenAi,
    modelFamily,
    pricingForSettings,
    tokenBreakdown,
    calculateCost,
    normalizeProviderUsage,
    newRequestId,
    history,
    upsert,
    startRequest,
    finishRequest,
    recordBudgetCost,
    summarize
  });
})(globalThis);
