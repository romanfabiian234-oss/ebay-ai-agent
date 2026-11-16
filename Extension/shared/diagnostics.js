/* V8.23.21 diagnostics/data container. No UI DOM ownership. */
async function addLog(message, detail = "") {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.logs);
  const logs = stored[STORAGE.logs] || [];
  logs.unshift({ time: new Date().toLocaleString(), message, detail });
  await globalThis.EbayAiStorageV790.set({ [STORAGE.logs]: logs.slice(0, 80) });
  globalThis.EbayEventsV82310?.emit?.("diagnostics:logs");
}
function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return date.toISOString().slice(0, 7); }
function approximateTextTokens(text) { return Math.max(1, Math.ceil(String(text || "").length / 4)); }

function money(value) { return `$${Number(value || 0).toFixed(4)}`; }
function pricingForSettingsV821(settings = {}, inputTokens = 0) {
  const shared = globalThis.EbayUsageV8237?.pricingForSettings?.(settings, inputTokens);
  if (shared) return shared;
  const input = Number(settings.inputCostPer1M || 0);
  return { input, cachedInput: input, cacheWrite: input, output: Number(settings.outputCostPer1M || 0) };
}
function costFromTokens(inputTokens, outputTokens, settings) {
  const shared = globalThis.EbayUsageV8237?.calculateCost?.({ inputTokens, outputTokens, totalTokens: Number(inputTokens || 0) + Number(outputTokens || 0) }, settings);
  if (shared?.costAvailable) return Number(shared.cost || 0);
  const rates = pricingForSettingsV821(settings, inputTokens);
  return (inputTokens / 1000000) * Number(rates.input || 0) + (outputTokens / 1000000) * Number(rates.output || 0);
}

function effectiveOutputTokenLimitA538(settings = {}) {
  const raw = Number(settings.maxOutputTokens);
  const modeCap = settings.tokenMode === "quality" ? 10000 : settings.tokenMode === "cheap" ? 4500 : 8000;
  const requested = Math.max(1200, Math.min(Number.isFinite(raw) ? raw : modeCap, modeCap));
  return Math.min(requested, modeCap);
}
async function getUsageHistory() {
  if (globalThis.EbayUsageV8237?.history) return globalThis.EbayUsageV8237.history();
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.usageHistory);
  return stored[STORAGE.usageHistory] || [];
}
async function saveUsageRecord(record) {
  // API requests are now recorded at transport time. These legacy/manual records
  // remain useful as item summaries but must never double-count the same spend.
  if (globalThis.EbayUsageV8237?.upsert) {
    await globalThis.EbayUsageV8237.upsert({
      id: record.id || `summary-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: "item_summary",
      countsTowardBudget: false,
      ...record
    });
  } else {
    const history = await getUsageHistory();
    const next = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date().toISOString(), ...record }, ...history].slice(0, 300);
    await globalThis.EbayAiStorageV790.set({ [STORAGE.usageHistory]: next });
  }
  globalThis.EbayEventsV82310?.emit?.("diagnostics:usage");
}
function summarizeUsage(history) {
  const shared = globalThis.EbayUsageV8237?.summarize?.(history);
  if (shared) {
    return {
      todayCost: shared.today.budgetCost, monthCost: shared.month.budgetCost, totalCost: shared.all.budgetCost,
      todayCalculatedCost: shared.today.calculatedCost, monthCalculatedCost: shared.month.calculatedCost, totalCalculatedCost: shared.all.calculatedCost,
      todayUncertainCost: shared.today.estimatedOrUncertainCost, monthUncertainCost: shared.month.estimatedOrUncertainCost,
      todayCount: shared.today.requestCount, monthCount: shared.month.requestCount, totalCount: shared.all.requestCount,
      todayTokens: shared.today.tokens, monthTokens: shared.month.tokens,
      todayUncertainCount: shared.today.uncertainCount, monthUncertainCount: shared.month.uncertainCount
    };
  }
  const today = todayKey();
  const month = monthKey();
  const todayItems = history.filter(x => todayKey(new Date(x.createdAt)) === today);
  const monthItems = history.filter(x => monthKey(new Date(x.createdAt)) === month);
  const total = arr => arr.reduce((sum, item) => sum + Number(item.cost || item.estimatedCost || 0), 0);
  const tokens = arr => arr.reduce((sum, item) => sum + Number(item.inputTokens || item.estimatedInputTokens || 0) + Number(item.outputTokens || item.estimatedOutputTokens || 0), 0);
  return { todayCost: total(todayItems), monthCost: total(monthItems), totalCost: total(history), todayCount: todayItems.length, monthCount: monthItems.length, totalCount: history.length, todayTokens: tokens(todayItems), monthTokens: tokens(monthItems), todayUncertainCount: 0, monthUncertainCount: 0 };
}
async function checkBudgetBeforeAnalyze(estimate, settings, { confirmCost } = {}) {
  const history = await getUsageHistory();
  const sum = summarizeUsage(history);
  const dailyBudget = Number(settings.dailyBudget || 0);
  const monthlyBudget = Number(settings.monthlyBudget || 0);
  const warnItemCost = Number(settings.warnItemCost || 0);
  if (dailyBudget && sum.todayCost + estimate.estimatedCost > dailyBudget) {
    throw new Error(`Daily API budget would be exceeded. Today ${money(sum.todayCost)}, this request about ${money(estimate.estimatedCost)}, limit ${money(dailyBudget)}.`);
  }
  if (monthlyBudget && sum.monthCost + estimate.estimatedCost > monthlyBudget) {
    throw new Error(`Monthly API budget would be exceeded. Month ${money(sum.monthCost)}, this request about ${money(estimate.estimatedCost)}, limit ${money(monthlyBudget)}.`);
  }
  if (costWarningRequiresApproval(estimate.estimatedCost, warnItemCost)) {
    const excess = Math.max(0, Number(estimate.estimatedCost || 0) - warnItemCost);
    if (typeof confirmCost !== "function") throw new Error("Analysis requires cost-warning approval, but no approval UI is available.");
    const ok = await confirmCost(`Estimated API cost is about ${money(estimate.estimatedCost)}, over your warning limit ${money(warnItemCost)} by ${money(excess)}. This is a conservative estimate that may include targeted Claude review. Continue?`);
    if (!ok) throw new Error("Analysis cancelled by cost warning.");
  }
}
function costWarningRequiresApproval(estimatedCost, warningLimit) {
  const estimated = Number(estimatedCost || 0);
  const warning = Number(warningLimit || 0);
  if (!(warning > 0) || !(estimated > warning)) return false;
  const excess = estimated - warning;
  const tolerance = Math.max(0.005, warning * 0.05);
  return excess + 1e-9 >= tolerance;
}
function simpleHash(text) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function compactImageSignatureA538(image = {}) {
  const data = String(image.dataUrl || "");
  const middle = data ? Math.floor(data.length / 2) : 0;
  return [
    image.kind || "image", image.name || "", image.url || image.src || "", image.role || "", image.alt || "",
    data ? `${data.length}:${data.slice(0, 96)}:${data.slice(middle, middle + 96)}:${data.slice(-96)}` : ""
  ].join("|");
}
function imageCacheKey(images, settings, prompt = "") {
  const basis = (images || []).map(compactImageSignatureA538).join("||");
  const requestRules = [
    settings.apiMode || "", settings.apiBaseUrl || "", settings.apiPath || "", settings.apiModel || "",
    settings.tokenMode || "balanced", settings.imageMaxSide || "", settings.imageQuality || "",
    effectiveOutputTokenLimitA538(settings), simpleHash(prompt)
  ].join("|");
  return `v866-beta80-smart-tag-ocr-${simpleHash(`${requestRules}|${basis}`)}`;
}
async function getAiCache(key) {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.aiCache);
  const cache = stored[STORAGE.aiCache] || {};
  return cache[key] || null;
}
async function setAiCache(key, value) {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.aiCache);
  const cache = stored[STORAGE.aiCache] || {};
  cache[key] = { ...value, savedAt: new Date().toISOString() };
  const entries = Object.entries(cache).sort((a,b) => (b[1].savedAt || "").localeCompare(a[1].savedAt || "")).slice(0, 80);
  await globalThis.EbayAiStorageV790.set({ [STORAGE.aiCache]: Object.fromEntries(entries) });
}





async function readDraftHistoryV82310() {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.draftHistory);
  return stored[STORAGE.draftHistory] || [];
}

async function clearUsageDataV82310() {
  await globalThis.EbayAiStorageV790?.remove?.([STORAGE.usageHistory, STORAGE.aiCache]);
}

async function readLogsV82310() {
  const stored = await globalThis.EbayAiStorageV790?.get?.(STORAGE.logs) || {};
  return stored[STORAGE.logs] || [];
}

async function clearLogsDataV82310() {
  await globalThis.EbayAiStorageV790?.remove?.(STORAGE.logs);
}
