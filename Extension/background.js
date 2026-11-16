// eBay AI Listing Filler V8.23.21 background service worker
// AI prompt, request, response parsing and analysis live in core/ai/.
try {
  importScripts(
    "shared/config.js",
    "shared/messages.js",
    "shared/logger.js",
    "shared/usage.js",
    "shared/storage.js",
    "core/policy.js",
    "core/snapshot.js",
    "core/ai.js",
    "core/match.js",
    "core/verify.js",
    "core/fill.js",
    "core/save.js",
    "modes/photo.js",
    "modes/text.js",
    "modes/queue.js",
    "modes/review.js"
  );
} catch (error) {
  console.warn("[eBay Filler V8.23.21] module map unavailable", error);
}


try {
  chrome.storage?.local?.remove?.(["ebayFillerV638BackendPairingCode", "ebayFillerV63OAuthPairingCode"]);
} catch (error) {
  globalThis.EbayLogger?.debug?.("Legacy pairing storage cleanup skipped", { message: error?.message || String(error) });
}

// Shared AI aliases retained so the proven Queue runtime does not change its call sites.
const effectiveOutputTokenLimitA538 = (...args) => globalThis.EbayAiRequestV711.effectiveOutputTokenLimit(...args);
const costFromTokens = (...args) => globalThis.EbayAiRequestV711.costFromTokens(...args);
async function analyzePhotos(payload) { return globalThis.EbayAiAnalyzeV711.analyzePhotos(payload); }
async function testConnection(payload) { return globalThis.EbayAiAnalyzeV711.testConnection(payload); }

// #region SECURE NATIVE MESSAGING BACKEND BRIDGE
// V8.23.21: the extension no longer stores, imports, fetches or sees a pairing code.
// Chrome authenticates this fixed extension ID to one user-installed Native Messaging
// host. The native host keeps the separate localhost credential inside macOS Keychain.
const NATIVE_BACKEND_V8180 = Object.freeze({
  hostName: "com.fabiian.ebay_ai_agent",
  timeoutMs: 30000,
  maxResponseChars: 884736,
  oauthResultUrl: "http://127.0.0.1:8790/ebay/oauth/result"
});

const EBAY_OAUTH_HOSTED_RELAY_IN_FLIGHT_V632 = new Set();
const ACTIVE_AI_NATIVE_PORTS_V8180 = new Set();

function isAiBackendPathV890(path) {
  return ["/v1/ai/proxy", "/v1/claude/proxy"].includes(String(path || ""));
}

function abortActiveAiBackendV890(reason = "safe-stop") {
  let count = 0;
  for (const port of [...ACTIVE_AI_NATIVE_PORTS_V8180]) {
    try {
      port.__ebayStopReason = reason;
      port.disconnect();
      count += 1;
    } catch (error) {
      globalThis.EbayLogger?.debug?.("Non-critical native disconnect skipped", { message: error?.message || String(error) });
    }
  }
  return count;
}

function callNativeBackendV8180(path, method = "GET", payload = {}, timeoutMs = 30000, maximumChars = 262144) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.connectNative) {
      reject(new Error("Chrome Native Messaging is unavailable. Run START.command, then Reload the installed extension."));
      return;
    }
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_BACKEND_V8180.hostName);
    } catch (error) {
      reject(new Error(`Native Backend could not start: ${error?.message || String(error)}`));
      return;
    }
    const aiRequest = isAiBackendPathV890(path);
    if (aiRequest) ACTIVE_AI_NATIVE_PORTS_V8180.add(port);
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (aiRequest) ACTIVE_AI_NATIVE_PORTS_V8180.delete(port);
    };
    const fail = message => {
      if (settled) return;
      settled = true;
      cleanup();
      try { port.disconnect(); } catch (error) { globalThis.EbayLogger?.debug?.("Native port disconnect skipped", { message: error?.message || String(error) }); }
      reject(new Error(String(message || "Native Backend request failed.").slice(0, 500)));
    };
    const succeed = data => {
      if (settled) return;
      settled = true;
      cleanup();
      try { port.disconnect(); } catch (error) { globalThis.EbayLogger?.debug?.("Native port disconnect skipped", { message: error?.message || String(error) }); }
      resolve(data);
    };

    port.onMessage.addListener(response => {
      if (!response || typeof response !== "object" || Array.isArray(response)) {
        fail("Native Backend returned an invalid response.");
        return;
      }
      if (response.ok !== true || !response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
        fail(response.message || "Native Backend request failed.");
        return;
      }
      succeed(response.data);
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      const stopReason = port.__ebayStopReason;
      const runtimeMessage = chrome.runtime.lastError?.message || "";
      if (stopReason === "safe-stop" || stopReason === "queue-stop") {
        fail("AI request stopped safely.");
        return;
      }
      fail(runtimeMessage
        ? `Native Backend disconnected: ${runtimeMessage}`
        : "Native Backend disconnected. Run START.command, then Reload the installed extension.");
    });

    const boundedTimeout = Math.max(1000, Math.min(Number(timeoutMs) || NATIVE_BACKEND_V8180.timeoutMs, 180000));
    timer = setTimeout(() => {
      try { port.__ebayStopReason = "hard-timeout"; port.disconnect(); } catch (error) { globalThis.EbayLogger?.debug?.("Native timeout disconnect skipped", { message: error?.message || String(error) }); }
      fail("Native Backend request timed out.");
    }, boundedTimeout);

    try {
      port.postMessage({
        type: "backend_request",
        method: String(method || "GET").toUpperCase(),
        path: String(path || ""),
        payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
        timeoutMs: boundedTimeout,
        maximumChars: Math.max(4096, Math.min(Number(maximumChars) || 262144, NATIVE_BACKEND_V8180.maxResponseChars))
      });
    } catch (error) {
      fail(error?.message || String(error));
    }
  });
}

async function callLocalBackendV637(path, method = "GET", payload = {}, timeoutMs = 30000, maximumChars = 1048576) {
  return callNativeBackendV8180(path, method, payload, timeoutMs, maximumChars);
}

async function nativeBackendStatusV8180() {
  return callLocalBackendV637("/v1/setup/status", "GET", {}, 12000, 262144);
}

// Local OCR stays behind the Native Messaging bridge. It has no Fill or publishing access.
globalThis.EbayLocalOcrBridgeV860 = Object.freeze({
  analyze(payload = {}) {
    return callLocalBackendV637("/v1/ocr/analyze", "POST", payload, 65000, 8 * 1024 * 1024);
  },
  status() {
    return callLocalBackendV637("/v1/ocr/status", "GET", {}, 30000, 262144);
  }
});

async function saveAiKeyToKeychainV637(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Paste the API key first.");
  return callLocalBackendV637("/v1/ai/key", "POST", { apiKey }, 30000, 262144);
}

async function getAiKeyStatusV637() {
  return callLocalBackendV637("/v1/ai/status", "GET", {}, 30000, 262144);
}

async function removeAiKeyFromKeychainV637() {
  return callLocalBackendV637("/v1/ai/remove-key", "POST", {}, 30000, 262144);
}

async function getAgentSetupStatusV873() {
  return callLocalBackendV637("/v1/setup/status", "GET", {}, 30000, 524288);
}

async function saveAgentSetupProfileV873(settings = {}) {
  return callLocalBackendV637("/v1/setup/profile", "POST", { settings }, 30000, 524288);
}


async function saveClaudeKeyToKeychainV850(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Paste the Claude API key first.");
  return callLocalBackendV637("/v1/claude/key", "POST", { apiKey }, 30000, 262144);
}

async function getClaudeKeyStatusV850() {
  return callLocalBackendV637("/v1/claude/status", "GET", {}, 30000, 262144);
}

async function removeClaudeKeyFromKeychainV850() {
  return callLocalBackendV637("/v1/claude/remove-key", "POST", {}, 30000, 262144);
}

// V8.23.21: local Review folder bridge. Each listing is one JSON file;
// Review data contains only listing identifiers, answers, evidence and corrections.
const REVIEW_ROUTES_V830 = Object.freeze({
  REVIEW_STATUS_V830: { method: "GET", path: "/v1/review/status" },
  REVIEW_SELECT_FOLDER_V840: { method: "POST", path: "/v1/review/folder/select" },
  REVIEW_SELECT_DATABASE_V830: { method: "POST", path: "/v1/review/database/select" },
  REVIEW_SAVE_ITEM_V830: { method: "POST", path: "/v1/review/item/save" },
  REVIEW_GET_ITEM_V830: { method: "POST", path: "/v1/review/item/get" },
  REVIEW_LIST_ITEMS_V830: { method: "POST", path: "/v1/review/item/list" },
  REVIEW_UPDATE_FIELD_V830: { method: "POST", path: "/v1/review/item/update-field" }
});

async function callReviewBackendV830(type, payload = {}) {
  const route = REVIEW_ROUTES_V830[type];
  if (!route) throw new Error("Unsupported Review operation.");
  return callLocalBackendV637(route.path, route.method, payload, ["REVIEW_SELECT_FOLDER_V840", "REVIEW_SELECT_DATABASE_V830"].includes(type) ? 130000 : 30000, 2 * 1024 * 1024);
}

const EBAY_OAUTH_ROUTES_V63 = Object.freeze({
  EBAY_OAUTH_STATUS_V63: { method: "GET", path: "/v1/ebay/status" },
  EBAY_OAUTH_PROFILE_GET_V63: { method: "GET", path: "/v1/ebay/profile" },
  EBAY_OAUTH_PROFILE_SAVE_V63: { method: "POST", path: "/v1/ebay/profile" },
  EBAY_OAUTH_CREDENTIALS_SAVE_V63: { method: "POST", path: "/v1/ebay/credentials" },
  EBAY_OAUTH_START_V63: { method: "POST", path: "/v1/ebay/oauth/start" },
  EBAY_OAUTH_READ_ACCOUNT_V63: { method: "GET", path: "/v1/ebay/account" },
  EBAY_OAUTH_DISCONNECT_V63: { method: "POST", path: "/v1/ebay/disconnect" },
  EBAY_OAUTH_REMOVE_CREDENTIALS_V63: { method: "POST", path: "/v1/ebay/remove-credentials" }
});



function safeEbayAuthorizationUrlV63(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (_) { throw new Error("Backend returned an invalid authorization URL."); }
  const allowedHosts = new Set(["auth.ebay.com", "auth.sandbox.ebay.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || url.pathname !== "/oauth2/authorize") {
    throw new Error("Backend authorization URL was rejected by the eBay allowlist.");
  }
  return url.href;
}

async function callEbayOauthProxyV63(type, payload = {}) {
  const route = EBAY_OAUTH_ROUTES_V63[type];
  if (!route) throw new Error("Unsupported eBay OAuth operation.");
  try {
    return await callLocalBackendV637(route.path, route.method, payload, 30000, NATIVE_BACKEND_V8180.maxResponseChars);
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

async function handleEbayOauthMessageV63(type, payload = {}) {
  const result = await callEbayOauthProxyV63(type, payload);
  if (!result?.ok) return result;
  if (type !== "EBAY_OAUTH_START_V63") return result;
  const authorizationUrl = safeEbayAuthorizationUrlV63(result.authorizationUrl);
  await chrome.tabs.create({ url: authorizationUrl, active: true });
  return {
    ok: true,
    message: "eBay authorization opened in a new tab.",
    environment: result.environment || "unknown",
    stateExpiresIn: result.stateExpiresIn || 0
  };
}

function hostedEbayOauthResultV632(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (_) { return null; }
  if (url.protocol !== "https:") return null;

  const hostedResult = url.hostname === "auth2.ebay.com"
    && url.pathname === "/oauth2/ThirdPartyAuthSuccessFailure";
  const legacyHostedResult = url.hostname === "signin.ebay.com"
    && url.pathname === "/ws/eBayISAPI.dll"
    && (url.searchParams.has("ThirdPartyAuthSucessFailure") || url.searchParams.has("ThirdPartyAuthSuccessFailure"));
  if (!hostedResult && !legacyHostedResult) return null;

  const state = String(url.searchParams.get("state") || "");
  const code = String(url.searchParams.get("code") || "");
  const successful = String(url.searchParams.get("isAuthSuccessful") || "").toLowerCase();
  const errorDescription = String(url.searchParams.get("error_description") || "").slice(0, 240);
  const error = String(url.searchParams.get("error") || "").slice(0, 120);

  if (!state || state.length > 512) return null;
  if (code && code.length <= 2048) return { state, code, error: "" };
  if (errorDescription || error || successful === "false") {
    return { state, code: "", error: errorDescription || error || "access_denied" };
  }
  return null;
}

async function relayHostedEbayOauthResultV632(payload) {
  try {
    await callLocalBackendV637("/v1/ebay/oauth/complete", "POST", payload, 30000, 262144);
    return { backendReached: true, ok: true };
  } catch (_) {
    throw new Error("Local eBay OAuth backend could not receive the hosted callback.");
  }
}

function handleHostedEbayOauthRedirectV632(details) {
  if (details?.type && details.type !== "main_frame") return;
  const payload = hostedEbayOauthResultV632(details?.url || "");
  if (!payload) return;

  // onBeforeRequest sees the official eBay redirect before the hosted page can
  // replace its address with a clean URL. No page DOM or content script is used.
  const requestId = String(details?.requestId || "");
  if (requestId && EBAY_OAUTH_HOSTED_RELAY_IN_FLIGHT_V632.has(requestId)) return;
  if (requestId) EBAY_OAUTH_HOSTED_RELAY_IN_FLIGHT_V632.add(requestId);

  relayHostedEbayOauthResultV632(payload)
    .then(result => {
      const tabId = Number(details?.tabId);
      if (result?.backendReached && Number.isInteger(tabId) && tabId >= 0) {
        return chrome.tabs.update(tabId, { url: NATIVE_BACKEND_V8180.oauthResultUrl });
      }
      return null;
    })
    .catch(() => {
      try { console.warn("[OAuth V8.23.21] hosted callback relay failed; no OAuth values were logged."); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    })
    .finally(() => {
      if (requestId) EBAY_OAUTH_HOSTED_RELAY_IN_FLIGHT_V632.delete(requestId);
    });
}

if (chrome.webRequest?.onBeforeRequest?.addListener) {
  chrome.webRequest.onBeforeRequest.addListener(
    handleHostedEbayOauthRedirectV632,
    {
      urls: [
        "https://auth2.ebay.com/oauth2/ThirdPartyAuthSuccessFailure*",
        "https://signin.ebay.com/ws/eBayISAPI.dll*"
      ],
      types: ["main_frame"]
    }
  );
}
// #endregion

// #region QUEUE MODE — SAFE SEQUENTIAL MULTI-LISTING RUNNER
// V8.23.21 safe sequential AI Queue runner.
// One dedicated background tab is reused. Only exact current-page Item Specifics
// are filled. The runner never clicks Publish/List/Pay/Delete and never writes
// title, condition, description, price, quantity, shipping or category.
// ------------------------------
const QUEUE_RUNNER_VERSION_V710 = "8.23.21";
const QUEUE_STORAGE_KEY_V710 = globalThis.EbayAiConstantsV790.STORAGE_KEYS.QUEUE;
const QUEUE_RUNNER_STORAGE_KEY_V710 = globalThis.EbayAiConstantsV790.STORAGE_KEYS.QUEUE_RUNNER;
const QUEUE_SETTINGS_STORAGE_KEY_V710 = globalThis.EbayAiConstantsV790.STORAGE_KEYS.SETTINGS;
const QUEUE_USAGE_STORAGE_KEY_V710 = "ebayFillerV50A3UsageHistory";
const QUEUE_MAX_ITEMS_V710 = 50;
const QUEUE_PROCESSING_TABS_V710 = new Set();
// V8.23.21: queue wake-ups are tied to a specific run + draft. A tab-only
// pending flag allowed a late wake-up from draft A to fire after navigation to
// draft B, which could start B before its content bridge was ready.
const QUEUE_ACTIVE_TICKETS_V8232 = new Map();
const QUEUE_PENDING_TICKETS_V8232 = new Map();
const QUEUE_WORKER_SESSION_ID_V8100 = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const QUEUE_DRAFT_READY_TIMEOUT_MS_V8232 = 20000;

function queueTicketV8232(runId = "", draftId = "") {
  return {
    runId: queueCleanTextV710(runId, 120),
    draftId: queueCleanTextV710(draftId, 120)
  };
}

function queueTicketMatchesV8232(left, right) {
  const a = queueTicketV8232(left?.runId, left?.draftId);
  const b = queueTicketV8232(right?.runId, right?.draftId);
  return Boolean(a.runId && a.draftId && a.runId === b.runId && a.draftId === b.draftId);
}

function queueTransitionDecisionV8232(currentTicket, activeTicket, incomingTicket) {
  if (!queueTicketMatchesV8232(currentTicket, incomingTicket)) return "stale";
  if (!activeTicket) return "start";
  return queueTicketMatchesV8232(activeTicket, incomingTicket) ? "duplicate" : "pending";
}

function queueScheduleRunnerTabV8232(tabId, delayMs = 0, ticket = null) {
  if (!Number.isInteger(tabId)) return;
  const safeTicket = queueTicketV8232(ticket?.runId, ticket?.draftId);
  if (!safeTicket.runId || !safeTicket.draftId) return;
  setTimeout(() => queueProcessRunnerTabV710(tabId, safeTicket), Math.max(0, Number(delayMs) || 0));
}

async function queueScheduleCurrentDraftV8232(tabId, draftId, delayMs = 0) {
  if (!Number.isInteger(tabId)) return false;
  const state = await queueGetRunnerStateV710();
  if (state.status !== "running" || state.tabId !== tabId) return false;
  const item = state.items?.[state.currentIndex];
  const expectedDraftId = queueCleanTextV710(item?.draftId || "", 120);
  const observedDraftId = queueCleanTextV710(draftId || "", 120);
  if (!state.runId || !expectedDraftId || (observedDraftId && observedDraftId !== expectedDraftId)) return false;
  queueScheduleRunnerTabV8232(tabId, delayMs, queueTicketV8232(state.runId, expectedDraftId));
  return true;
}

function queueDelayV8232(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function queueWaitForExpectedDraftReadyV8232(tabId, state, item, timeoutMs = QUEUE_DRAFT_READY_TIMEOUT_MS_V8232) {
  const expected = queueTicketV8232(state?.runId, item?.draftId);
  const deadline = Date.now() + Math.max(2000, Number(timeoutMs) || QUEUE_DRAFT_READY_TIMEOUT_MS_V8232);
  let lastMessage = "Waiting for the eBay draft page…";

  while (Date.now() < deadline) {
    const latest = await queueGetRunnerStateV710();
    const live = latest.items?.[latest.currentIndex];
    if (latest.status !== "running" || latest.tabId !== tabId || !queueTicketMatchesV8232(expected, queueTicketV8232(latest.runId, live?.draftId))) {
      throw queueRunnerErrorV8231("QUEUE_TRANSITION_CANCELLED", "Queue moved to another draft before this page became ready.", "item");
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      const actualDraftId = queueCleanTextV710(globalThis.EbayBlocksV890.openDraft.extractDraftId(tab?.url || ""), 120);
      if (actualDraftId === expected.draftId) {
        const ping = await queueSendTabMessageV710(tabId, { type: "CONTENT_BRIDGE_PING_V890" }, 1200);
        const bridgeDraftId = queueCleanTextV710(ping?.actualDraftId || "", 120);
        if (ping?.ok === true && ping?.platform === "ebay" && ping?.sharedFillReady === true && bridgeDraftId === expected.draftId) {
          return { ok: true, actualDraftId, tabStatus: tab?.status || "" };
        }
        lastMessage = bridgeDraftId && bridgeDraftId !== expected.draftId
          ? `Waiting for the new draft content bridge; old bridge is still on ${bridgeDraftId}.`
          : queueCleanTextV710(ping?.message || "eBay content bridge is still loading.", 300);
      } else if (actualDraftId) {
        lastMessage = `Waiting for draft ${expected.draftId}; tab is still on ${actualDraftId}.`;
      }
    } catch (error) {
      lastMessage = queueCleanTextV710(error?.message || String(error), 300) || lastMessage;
    }

    // This is bounded state polling, not a fixed workflow delay: continue as
    // soon as the expected URL and content bridge are both ready.
    await queueDelayV8232(160);
  }

  throw queueRunnerErrorV8231(
    "DRAFT_NOT_READY",
    `Draft ${expected.draftId} did not become ready for Queue processing within ${Math.round(timeoutMs / 1000)}s. ${lastMessage}`,
    "item"
  );
}

const QUEUE_DEFAULT_SETTINGS_V710 = Object.freeze({ ...(globalThis.EbayAiConstantsV790?.DEFAULT_SETTINGS || {}) });

function queueCleanTextV710(value, limit = 500) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function queueRunnerErrorV8231(code, message, scope = "item") {
  const error = new Error(queueCleanTextV710(message, 1000) || "Queue operation failed.");
  error.queueCode = queueCleanTextV710(code || "QUEUE_ITEM_ERROR", 80);
  error.queueScope = scope === "queue" ? "queue" : "item";
  return error;
}

function queueFailureInfoV8231(error) {
  const message = queueCleanTextV710(error?.message || error || "Queue operation failed.", 1000);
  if (error?.queueScope === "queue") {
    return { scope: "queue", code: queueCleanTextV710(error.queueCode || "QUEUE_BLOCKED", 80), message };
  }
  const normalized = message.toLowerCase();
  const blockingRules = [
    ["API_AUTH", /(?:\b401\b|unauthori[sz]ed|authentication failed|invalid api key|api key[^.]{0,40}(?:invalid|missing|rejected))/i],
    ["API_RATE_LIMIT", /(?:\b429\b|rate limit|insufficient[_ -]?quota|quota exceeded)/i],
    ["API_CONFIG", /(?:api is off|api base url or model is missing|save api base url and model)/i],
    ["BACKEND_UNAVAILABLE", /(?:secure backend unavailable|local backend is unavailable|could not reach the .*backend|native backend.*unavailable)/i]
  ];
  for (const [code, pattern] of blockingRules) {
    if (pattern.test(normalized)) return { scope: "queue", code, message };
  }
  return { scope: "item", code: queueCleanTextV710(error?.queueCode || "QUEUE_ITEM_ERROR", 80), message };
}

function queueResultFailureMessageV8231(result, fallbackSummary = "") {
  const candidates = [
    result?.fill?.ok === false ? result.fill.message : "",
    result?.save?.ok === false ? result.save.message : "",
    result?.message,
    fallbackSummary
  ];
  return queueCleanTextV710(candidates.find(value => queueCleanTextV710(value, 1000)) || "Queue item failed without a detailed reason.", 1000);
}

function queueTodayKeyV710(date = new Date()) { return date.toISOString().slice(0, 10); }
function queueMonthKeyV710(date = new Date()) { return date.toISOString().slice(0, 7); }

async function queueCheckBudgetV710(estimate, settings, approvedCostWarning) {
  const stored = await chrome.storage.local.get(QUEUE_USAGE_STORAGE_KEY_V710);
  const history = Array.isArray(stored?.[QUEUE_USAGE_STORAGE_KEY_V710]) ? stored[QUEUE_USAGE_STORAGE_KEY_V710] : [];
  const shared = globalThis.EbayUsageV8237?.summarize?.(history);
  const today = queueTodayKeyV710();
  const month = queueMonthKeyV710();
  const total = items => items.reduce((sum, item) => sum + Number(item.cost || item.estimatedCost || 0), 0);
  const todayCost = shared ? Number(shared.today.budgetCost || 0) : total(history.filter(item => queueTodayKeyV710(new Date(item.createdAt)) === today));
  const monthCost = shared ? Number(shared.month.budgetCost || 0) : total(history.filter(item => queueMonthKeyV710(new Date(item.createdAt)) === month));
  const dailyBudget = Number(settings.dailyBudget || 0);
  const monthlyBudget = Number(settings.monthlyBudget || 0);
  const warning = Number(settings.warnItemCost || 0);
  if (dailyBudget && todayCost + estimate.estimatedCost > dailyBudget) {
    throw queueRunnerErrorV8231("DAILY_BUDGET_BLOCKED", `Daily API budget would be exceeded. Ledger today $${todayCost.toFixed(4)}, next item estimate about $${estimate.estimatedCost.toFixed(4)}, limit $${dailyBudget.toFixed(4)}.`, "queue");
  }
  if (monthlyBudget && monthCost + estimate.estimatedCost > monthlyBudget) {
    throw queueRunnerErrorV8231("MONTHLY_BUDGET_BLOCKED", `Monthly API budget would be exceeded. Ledger month $${monthCost.toFixed(4)}, next item estimate about $${estimate.estimatedCost.toFixed(4)}, limit $${monthlyBudget.toFixed(4)}.`, "queue");
  }
  // Simple Queue never pauses for a per-item warning. Daily and monthly hard budgets above remain enforced.
  return { requiresApproval: false, estimatedCost: estimate.estimatedCost, warningLimit: warning };
}

async function queueSaveUsageV710(item, estimate, usage) {
  const record = {
    id: `queue-summary-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    kind: "item_summary",
    countsTowardBudget: false,
    title: `Queue: ${queueCleanTextV710(item?.title || "eBay draft", 120)}`,
    mode: estimate.mode,
    photoCount: estimate.photoCount,
    inputTokens: Number(usage?.inputTokens || usage?.prompt_tokens || estimate.estimatedInputTokens),
    cachedInputTokens: Number(usage?.cachedInputTokens || 0),
    cacheWriteTokens: Number(usage?.cacheWriteTokens || 0),
    outputTokens: Number(usage?.outputTokens || usage?.completion_tokens || estimate.estimatedOutputTokens),
    reasoningTokens: Number(usage?.reasoningTokens || 0),
    estimatedInputTokens: estimate.estimatedInputTokens,
    estimatedOutputTokens: estimate.estimatedOutputTokens,
    cost: usage?.cached === true ? 0 : Number(usage?.cost ?? estimate.estimatedCost),
    estimatedCost: estimate.estimatedCost,
    cached: usage?.cached === true,
    queueRun: true
  };
  if (globalThis.EbayUsageV8237?.upsert) {
    await globalThis.EbayUsageV8237.upsert(record);
    return;
  }
  const stored = await chrome.storage.local.get(QUEUE_USAGE_STORAGE_KEY_V710);
  const history = Array.isArray(stored?.[QUEUE_USAGE_STORAGE_KEY_V710]) ? stored[QUEUE_USAGE_STORAGE_KEY_V710] : [];
  await chrome.storage.local.set({ [QUEUE_USAGE_STORAGE_KEY_V710]: [record, ...history].slice(0, 300) });
}

function queueNormalizeItemV710(entry, index = 0) {
  const url = String(entry?.url || "").slice(0, 3000);
  const draftId = queueCleanTextV710(entry?.draftId || globalThis.EbayBlocksV890.openDraft.extractDraftId(url), 120);
  return {
    id: queueCleanTextV710(entry?.id || draftId || `item-${index + 1}`, 160),
    draftId,
    url,
    title: queueCleanTextV710(entry?.title || `eBay draft ${draftId || index + 1}`, 180),
    processStatus: ["pending", "loading", "analyzing", "filling", "saving", "completed", "review", "error", "stopped"].includes(entry?.processStatus) ? entry.processStatus : "pending",
    message: queueCleanTextV710(entry?.message || "", 700),
    answered: Number(entry?.answered || 0),
    questionsFound: Number(entry?.questionsFound || 0),
    safelyOmittedByAi: Number(entry?.safelyOmittedByAi || 0),
    missingAfterAi: Number(entry?.missingAfterAi || 0),
    filled: Number(entry?.filled || 0),
    already: Number(entry?.already || 0),
    partial: Number(entry?.partial || 0),
    review: Number(entry?.review || 0),
    skipped: Number(entry?.skipped || 0),
    omitted: Number(entry?.omitted || 0),
    valuesFilled: Number(entry?.valuesFilled || 0),
    reviewFields: (Array.isArray(entry?.reviewFields) ? entry.reviewFields : []).slice(0, 10).map(value => queueCleanTextV710(value, 220)),
    requiredReviewFields: (Array.isArray(entry?.requiredReviewFields) ? entry.requiredReviewFields : []).slice(0, 4).map(value => queueCleanTextV710(value, 220)),
    evidenceWarnings: (Array.isArray(entry?.evidenceWarnings) ? entry.evidenceWarnings : []).slice(0, 12).map(value => queueCleanTextV710(value, 260)),
    excludedQuestions: (Array.isArray(entry?.excludedQuestions) ? entry.excludedQuestions : []).slice(0, 12).map(value => queueCleanTextV710(value, 120)),
    stage: queueCleanTextV710(entry?.stage || "", 80),
    stageStartedAt: String(entry?.stageStartedAt || ""),
    stageTimings: entry?.stageTimings && typeof entry.stageTimings === "object" ? {
      readPhotosMs: Number(entry.stageTimings.readPhotosMs || 0),
      readFieldsMs: Number(entry.stageTimings.readFieldsMs || 0),
      aiMs: Number(entry.stageTimings.aiMs || 0),
      matchMs: Number(entry.stageTimings.matchMs || 0),
      fillMs: Number(entry.stageTimings.fillMs || 0),
      saveMs: Number(entry.stageTimings.saveMs || 0),
      loadingMs: Number(entry.stageTimings.loadingMs || 0),
      primaryMs: Number(entry.stageTimings.primaryMs || 0),
      validationMs: Number(entry.stageTimings.validationMs || 0),
      recoveryMs: Number(entry.stageTimings.recoveryMs || 0),
      fillingMs: Number(entry.stageTimings.fillingMs || 0),
      savingMs: Number(entry.stageTimings.savingMs || 0),
      totalMs: Number(entry.stageTimings.totalMs || 0)
    } : {},
    aiRequests: Number(entry?.aiRequests || 0),
    recoveryUsed: Boolean(entry?.recoveryUsed),
    recoveryError: queueCleanTextV710(entry?.recoveryError || "", 500),
    startedAt: String(entry?.startedAt || ""),
    restoredAfterReset: Number(entry?.restoredAfterReset || 0),
    autosaveConfirmed: Boolean(entry?.autosaveConfirmed),
    cost: Number(entry?.cost || 0),
    estimatedCost: Number(entry?.estimatedCost || 0),
    costApprovalRequired: Boolean(entry?.costApprovalRequired),
    failureCode: queueCleanTextV710(entry?.failureCode || "", 80),
    failureScope: entry?.failureScope === "queue" ? "queue" : (entry?.failureScope === "item" ? "item" : ""),
    completedAt: String(entry?.completedAt || "")
  };
}

function queueNormalizeRunnerStateV710(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const allowedStatuses = new Set(["idle", "starting", "running", "paused", "blocked", "stopping", "stopped", "completed", "error"]);
  return {
    version: QUEUE_RUNNER_VERSION_V710,
    runId: queueCleanTextV710(source.runId || "", 120),
    status: allowedStatuses.has(source.status) ? source.status : "idle",
    tabId: Number.isInteger(source.tabId) ? source.tabId : null,
    currentIndex: Math.max(0, Number(source.currentIndex || 0)),
    items: (Array.isArray(source.items) ? source.items : []).slice(0, QUEUE_MAX_ITEMS_V710).map(queueNormalizeItemV710),
    startedAt: String(source.startedAt || ""),
    updatedAt: String(source.updatedAt || ""),
    finishedAt: String(source.finishedAt || ""),
    lastMessage: queueCleanTextV710(source.lastMessage || "Queue is idle.", 1000),
    failureCode: queueCleanTextV710(source.failureCode || "", 80),
    failureScope: source.failureScope === "queue" ? "queue" : (source.failureScope === "item" ? "item" : ""),
    approvedCostWarning: Boolean(source.approvedCostWarning),
    processingLease: source.processingLease && typeof source.processingLease === "object" ? {
      runId: queueCleanTextV710(source.processingLease.runId || "", 120),
      draftId: queueCleanTextV710(source.processingLease.draftId || "", 120),
      tabId: Number.isInteger(source.processingLease.tabId) ? source.processingLease.tabId : null,
      workerSessionId: queueCleanTextV710(source.processingLease.workerSessionId || "", 120),
      stage: queueCleanTextV710(source.processingLease.stage || "", 80),
      startedAt: String(source.processingLease.startedAt || ""),
      updatedAt: String(source.processingLease.updatedAt || "")
    } : null,
    safeMode: true
  };
}

async function queueGetRunnerStateV710() {
  const stored = await chrome.storage.local.get(QUEUE_RUNNER_STORAGE_KEY_V710);
  return queueNormalizeRunnerStateV710(stored?.[QUEUE_RUNNER_STORAGE_KEY_V710]);
}

async function queueSetRunnerStateV710(state) {
  const safe = queueNormalizeRunnerStateV710({ ...state, updatedAt: new Date().toISOString() });
  await chrome.storage.local.set({ [QUEUE_RUNNER_STORAGE_KEY_V710]: safe });
  return safe;
}

async function queueReadSettingsV710() {
  const stored = await chrome.storage.local.get(QUEUE_SETTINGS_STORAGE_KEY_V710);
  const settings = { ...QUEUE_DEFAULT_SETTINGS_V710, ...(stored?.[QUEUE_SETTINGS_STORAGE_KEY_V710] || {}) };
  delete settings.apiKey;
  delete settings.saveApiKey;
  delete settings.claudeApiKey;
  delete settings.claudeKeyStored;
  settings.webResearchEnabled = false;
  settings.autoFillDescriptionCondition = false;
  settings.exactOnly = true;
  settings.neverPublish = true;
  settings.queueRecoveryPassEnabled = false;
  if ([900, 1200, 3200, 4000, 4200, 6000, 10000].includes(Number(settings.maxOutputTokens))) settings.maxOutputTokens = settings.tokenMode === "quality" ? "10000" : settings.tokenMode === "cheap" ? "4500" : "8000";
  const officialRates = globalThis.EbayAiRequestV711.pricingForSettings?.(settings);
  if (officialRates && /^https:\/\/api\.openai\.com\/?$/i.test(String(settings.apiBaseUrl || "").trim())) {
    settings.inputCostPer1M = String(officialRates.input);
    settings.outputCostPer1M = String(officialRates.output);
  }
  settings.maxOutputTokens = String(effectiveOutputTokenLimitA538(settings));
  return settings;
}

async function queueSendTabMessageV710(tabId, message, timeoutMs = 30000) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, message: "eBay page response timed out." });
    }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        // Always read lastError before an early return. Chrome may close a late
        // message channel after the tab enters back/forward cache; leaving that
        // error unread creates the noisy "Unchecked runtime.lastError" entry.
        const runtimeError = chrome.runtime.lastError;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (runtimeError) resolve({ ok: false, message: runtimeError.message });
        else resolve(response || { ok: false, message: "No response from eBay page." });
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, message: error?.message || String(error) });
      }
    }
  });
}

function queueStageMessageV802(stage, details = {}) {
  if (stage === "primary" && details.requestConfirmed) {
    return `GPT request confirmed: HTTP ${Number(details.upstreamStatus || 0)}, ${Number(details.totalTokens || 0)} token(s).`;
  }
  if (stage === "primary") return "Analyzing selected photos with the primary GPT request…";
  if (stage === "recovery") return `Checking ${Number(details.questionCount || 0)} missing critical field(s)…`;
  if (stage === "filling") return `Filling ${Number(details.answerCount || 0)} Item Specific answer(s)…`;
  if (stage === "saving") return "Waiting briefly for eBay autosave…";
  if (stage === "completed") return "Queue finished this draft.";
  if (stage === "review") return "Draft finished and needs manual review.";
  if (stage === "error") return String(details.message || "Queue stopped on an error.");
  return "Reading photos and Item Specifics from eBay…";
}

async function queueShowDraftProgressV802(tabId, state, item, stage, details = {}) {
  if (!Number.isInteger(tabId)) return { ok: false };
  const payload = {
    stage,
    message: details.message || queueStageMessageV802(stage, details),
    index: Number(state?.currentIndex || 0),
    total: Array.isArray(state?.items) ? state.items.length : 0,
    title: queueCleanTextV710(item?.title || "eBay draft", 180),
    titlePrefix: String(state?.runId || "").startsWith("hotkey-autopilot-") ? "Autopilot" : "AI Queue",
    stageStartedAt: details.stageStartedAt || item?.stageStartedAt || new Date().toISOString(),
    timeoutMs: Number(details.timeoutMs || 0),
    durationMs: Number(details.durationMs || 0),
    finished: Boolean(details.finished),
    autoHideMs: Number(details.autoHideMs || 0)
  };
  return queueSendTabMessageV710(tabId, { type: "AI_QUEUE_PROGRESS_V802", payload }, 2500);
}

async function queueAdvanceRunnerV710(state) {
  state.approvedCostWarning = false;
  state.processingLease = null;
  state.currentIndex += 1;
  if (state.currentIndex >= state.items.length) {
    const completed = state.items.filter(item => item.processStatus === "completed").length;
    const review = state.items.filter(item => item.processStatus === "review").length;
    const errors = state.items.filter(item => item.processStatus === "error").length;
    const processed = completed + review;
    const filled = state.items.reduce((sum, item) => sum + Number(item.filled || 0), 0);
    const partial = state.items.reduce((sum, item) => sum + Number(item.partial || 0), 0);
    const fieldReview = state.items.reduce((sum, item) => sum + Number(item.review || 0), 0);
    const skipped = state.items.reduce((sum, item) => sum + Number(item.skipped || 0), 0);
    const omitted = state.items.reduce((sum, item) => sum + Number(item.omitted || 0), 0);
    state.status = "completed";
    state.finishedAt = new Date().toISOString();
    state.lastMessage = `Queue finished: ${processed}/${state.items.length} processed; ${review} draft(s) need review; ${filled} fields filled; ${partial} partial; ${fieldReview} field review; ${skipped} skipped; ${omitted} omitted; ${errors} error(s). Nothing was published.`;
    return queueSetRunnerStateV710(state);
  }
  state.status = "running";
  const next = state.items[state.currentIndex];
  next.processStatus = "loading";
  next.message = "Opening draft…";
  state.lastMessage = `Opening ${state.currentIndex + 1}/${state.items.length}: ${next.title}`;
  state = await queueSetRunnerStateV710(state);
  const tab = await globalThis.EbayBlocksV890.openDraft.open({ tabId: state.tabId, url: next.url, active: false });
  // Start the next draft from an explicit run+draft ticket. The worker waits on
  // the real content bridge, so no arbitrary 5-second delay is required.
  queueScheduleRunnerTabV8232(tab.id, 0, queueTicketV8232(state.runId, next.draftId));
  return state;
}

async function queueFinishCurrentV720(state, item, processStatus, message) {
  state.processingLease = null;
  if (item) {
    item.processStatus = processStatus;
    item.completedAt = new Date().toISOString();
    item.message = queueCleanTextV710(message, 700);
  }
  state.lastMessage = `${state.currentIndex + 1}/${state.items.length} finished: ${item?.title || "eBay draft"}`;
  state = await queueSetRunnerStateV710(state);
  return queueAdvanceRunnerV710(state);
}

async function queueFailRunnerV720(state, item, message, failureCode = "QUEUE_FATAL_ERROR") {
  state.processingLease = null;
  if (item) {
    item.processStatus = "error";
    item.failureCode = queueCleanTextV710(failureCode, 80);
    item.failureScope = "queue";
    item.message = queueCleanTextV710(message, 700);
  }
  state.status = "error";
  state.failureCode = queueCleanTextV710(failureCode, 80);
  state.failureScope = "queue";
  state.lastMessage = queueCleanTextV710(message, 1000);
  return queueSetRunnerStateV710(state);
}

async function queueBlockRunnerV8231(state, item, error) {
  const failure = queueFailureInfoV8231(error);
  state.processingLease = null;
  state.status = "blocked";
  state.failureCode = failure.code;
  state.failureScope = "queue";
  if (item) {
    // The queue-level blocker happened before this draft completed. Keep it pending
    // so raising the budget/fixing API settings can resume from this exact item.
    item.processStatus = "pending";
    item.stage = "blocked";
    item.completedAt = "";
    item.failureCode = failure.code;
    item.failureScope = "queue";
    item.message = queueCleanTextV710(`Blocked before completion: ${failure.message}`, 700);
  }
  const remaining = state.items.filter(candidate => !["completed", "review", "error"].includes(candidate.processStatus)).length;
  state.lastMessage = queueCleanTextV710(`Queue blocked: ${failure.message} ${remaining} draft(s) remain pending. Fix Settings and press Start to resume. Nothing was published.`, 1000);
  return queueSetRunnerStateV710(state);
}

function queueSameSelectionV8231(leftItems, rightItems) {
  const left = (Array.isArray(leftItems) ? leftItems : []).map(item => queueCleanTextV710(item?.draftId || "", 120)).filter(Boolean);
  const right = (Array.isArray(rightItems) ? rightItems : []).map(item => queueCleanTextV710(item?.draftId || "", 120)).filter(Boolean);
  return left.length === right.length && left.every((draftId, index) => draftId === right[index]);
}

function sharedBlockStageV890(block) {
  return ({
    "02_READ_PHOTOS": "loading",
    "03_READ_FIELDS": "fields",
    "04_AI_ANALYSIS": "primary",
    "05_MATCH_EBAY": "matching",
    "06_FILL_FIELDS": "filling",
    "07_SAVE": "saving"
  })[String(block || "")] || "loading";
}

function sharedBlockMessageV890(event = {}) {
  const status = String(event.status || "");
  const block = String(event.block || "");
  if (block === "02_READ_PHOTOS") return status === "completed" ? `Photos ready: ${Number(event.photoCount || 0)}.` : "Reading current draft photos…";
  if (block === "03_READ_FIELDS") return status === "completed" ? `eBay questions ready: ${Number(event.questionCount || 0)}.` : "Reading Item Specific questions and options…";
  if (block === "04_AI_ANALYSIS") {
    const aiStage = String(event.aiStage || event.stage || "primary");
    const final = event.final === true || Number.isFinite(Number(event.answerCount)) && event.answerCount !== undefined;
    if (status === "completed" && final) {
      const repairText = event.repairUsed === true
        ? ` Strict verification checked ${Number(event.repairCount || 0)} field(s) with ${Number(event.repairPhotoCount || 0)} photo(s) in ${(Number(event.recoveryMs || 0) / 1000).toFixed(1)}s.`
        : "";
      const directText = Number(event.repairSkippedDirectCount || 0) > 0
        ? ` ${Number(event.repairSkippedDirectCount || 0)} lower-impact strict field(s) kept from validated direct evidence.`
        : "";
      const timingText = Number(event.primaryMs || 0) > 0
        ? ` Primary ${(Number(event.primaryMs || 0) / 1000).toFixed(1)}s; AI total ${(Number(event.aiTotalMs || event.durationMs || 0) / 1000).toFixed(1)}s.`
        : "";
      return `GPT finished: ${Number(event.answerCount || 0)} candidate answer(s).${repairText}${directText}${timingText}`;
    }
    if (aiStage === "recovery") {
      const count = Number(event.questionCount || 0);
      if (status === "completed") return `Strict verification finished in ${(Number(event.durationMs || 0) / 1000).toFixed(1)}s; finalizing accepted answers…`;
      return `Independently verifying ${count || "requested"} strict field${count === 1 ? "" : "s"} with GPT…`;
    }
    if (status === "completed") return "Primary GPT request finished; validating accepted answers…";
    return "Analyzing photos and Item Specifics with GPT…";
  }
  if (block === "05_MATCH_EBAY") return status === "completed" ? `Matched ${Number(event.answerCount || 0)} answer(s) to current eBay fields.` : "Matching GPT answers to current eBay options…";
  if (block === "06_FILL_FIELDS") return status === "completed" ? "Shared Fill Engine finished this batch." : `Filling ${Number(event.answerCount || 0)} Item Specific answer(s)…`;
  if (block === "07_SAVE") return status === "completed" ? "Autosave check finished." : "Waiting briefly for eBay autosave…";
  return "Processing current draft…";
}

async function queueProcessRunnerTabV710(tabId, incomingTicket = null) {
  if (!Number.isInteger(tabId)) return;

  let state = await queueGetRunnerStateV710();
  if (state.status !== "running" || state.tabId !== tabId) return;
  const item = state.items[state.currentIndex];
  if (!item) {
    state.status = "completed"; state.finishedAt = new Date().toISOString(); state.lastMessage = "Queue finished.";
    await queueSetRunnerStateV710(state); return;
  }

  const currentTicket = queueTicketV8232(state.runId, item.draftId);
  const ticket = queueTicketV8232(incomingTicket?.runId, incomingTicket?.draftId);
  const activeTicket = QUEUE_ACTIVE_TICKETS_V8232.get(tabId) || null;
  const decision = queueTransitionDecisionV8232(currentTicket, activeTicket, ticket);
  if (decision === "stale" || decision === "duplicate") return;
  if (decision === "pending") {
    QUEUE_PENDING_TICKETS_V8232.set(tabId, ticket);
    return;
  }

  QUEUE_PENDING_TICKETS_V8232.delete(tabId);
  QUEUE_PROCESSING_TABS_V710.add(tabId);
  QUEUE_ACTIVE_TICKETS_V8232.set(tabId, currentTicket);
  try {
    // Re-read after acquiring the per-tab lock; an awaited storage read above may
    // have overlapped another event. The ticket must still identify this exact item.
    state = await queueGetRunnerStateV710();
    const liveItem = state.items?.[state.currentIndex];
    if (state.status !== "running" || state.tabId !== tabId || !queueTicketMatchesV8232(currentTicket, queueTicketV8232(state.runId, liveItem?.draftId))) return;
    const item = liveItem;
    if (!globalThis.EbayBlocksV890.openDraft.isSupportedEbayUrl(item.url, { draftOnly: true }) || !item.draftId) {
      await queueFinishCurrentV720(state, item, "error", "Draft URL or Draft ID is invalid. This item was skipped."); return;
    }

    item.processStatus = "loading";
    item.stage = "loading";
    item.message = "Waiting for this exact draft page to become ready…";
    state.lastMessage = `Preparing ${state.currentIndex + 1}/${state.items.length}: ${item.title}`;
    state = await queueSetRunnerStateV710(state);
    await queueWaitForExpectedDraftReadyV8232(tabId, state, item);

    const priorLease = state.processingLease;
    const recoveredAfterWorkerRestart = Boolean(priorLease?.draftId === item.draftId && priorLease?.workerSessionId && priorLease.workerSessionId !== QUEUE_WORKER_SESSION_ID_V8100);
    state.processingLease = {
      runId: state.runId,
      draftId: item.draftId,
      tabId,
      workerSessionId: QUEUE_WORKER_SESSION_ID_V8100,
      stage: "loading",
      startedAt: priorLease?.draftId === item.draftId && priorLease.startedAt ? priorLease.startedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (recoveredAfterWorkerRestart) item.message = "Resuming the same draft after service-worker restart; shared AI cache and exact existing-value checks prevent duplicate work.";
    state = await queueSetRunnerStateV710(state);

    const settings = await queueReadSettingsV710();
    if (!settings.apiEnabled || settings.apiMode === "off") {
      await queueBlockRunnerV8231(state, item, queueRunnerErrorV8231("API_OFF", "API is OFF. Turn it ON in Settings, then press Start again.", "queue"));
      return;
    }
    if (!settings.apiBaseUrl || !settings.apiModel) {
      await queueBlockRunnerV8231(state, item, queueRunnerErrorV8231("API_CONFIG", "API Base URL or Model is missing. Save Settings, then press Start again.", "queue"));
      return;
    }

    // Automatic Queue preserves already-set single/text/Yes-No fields, keeps multi-select eligible for missing additions, and centrally excludes UPC/MPN.
    const excludedQuestions = [];
    const startedAt = Date.now();
    item.processStatus = "loading"; item.stage = "loading"; item.stageStartedAt = new Date().toISOString(); item.stageTimings = {}; item.startedAt = item.stageStartedAt;
    item.message = "Opening shared ONE_ITEM_PROCESS…";
    state.lastMessage = `Processing ${state.currentIndex + 1}/${state.items.length}: ${item.title}`;
    state = await queueSetRunnerStateV710(state);
    await queueShowDraftProgressV802(tabId, state, item, "loading", { message: "Starting shared listing process…", stageStartedAt: item.stageStartedAt, timeoutMs: 45000 });

    let preparedEstimate = null;
    const shouldContinue = async () => {
      const latest = await queueGetRunnerStateV710();
      const live = latest.items?.[latest.currentIndex];
      const lease = latest.processingLease;
      return latest.status === "running"
        && latest.tabId === tabId
        && live?.draftId === item.draftId
        && (!lease || (lease.runId === latest.runId && lease.draftId === item.draftId && lease.tabId === tabId));
    };

    const result = await globalThis.EbayQueueModeV890.runItem({
      tabId,
      draftId: item.draftId,
      settings,
      excludedQuestions,
      readTimeoutMs: 45000,
      primaryTimeoutMs: 75000,
      fillTimeoutMs: 70000,
      saveTimeoutMs: 12000,
      shouldContinue,
      beforeRequest: async prepared => {
        preparedEstimate = prepared.estimate || null;
        await queueCheckBudgetV710(prepared.estimate || {}, settings, true);
        let latest = await queueGetRunnerStateV710();
        const live = latest.items?.[latest.currentIndex];
        if (live?.draftId === item.draftId) {
          live.estimatedCost = Number(prepared.estimate?.estimatedCost || 0);
          live.costApprovalRequired = false;
          await queueSetRunnerStateV710(latest);
        }
      },
      onStage: async event => {
        let latest = await queueGetRunnerStateV710();
        if (latest.status !== "running" || latest.tabId !== tabId) return;
        const live = latest.items?.[latest.currentIndex];
        if (!live || live.draftId !== item.draftId) return;
        const stage = sharedBlockStageV890(event.block);
        if (event.status === "started") live.stageStartedAt = event.at || new Date().toISOString();
        live.stage = stage;
        live.processStatus = stage === "primary" ? "analyzing" : stage === "filling" ? "filling" : stage === "saving" ? "saving" : "loading";
        live.message = sharedBlockMessageV890(event);
        if (event.block === "04_AI_ANALYSIS" && event.status === "completed" && event.final === true) live.answered = Number(event.answerCount || 0);
        if (latest.processingLease?.draftId === item.draftId) {
          latest.processingLease = { ...latest.processingLease, stage, updatedAt: new Date().toISOString() };
        }
        latest.lastMessage = `${live.message} (${latest.currentIndex + 1}/${latest.items.length})`;
        latest = await queueSetRunnerStateV710(latest);
        const timeoutMs = event.block === "04_AI_ANALYSIS" ? 75000 : event.block === "06_FILL_FIELDS" ? 70000 : event.block === "07_SAVE" ? 12000 : 45000;
        await queueShowDraftProgressV802(tabId, latest, live, stage, { message: live.message, stageStartedAt: live.stageStartedAt, timeoutMs, durationMs: Number(event.durationMs || 0) });
      }
    });

    state = await queueGetRunnerStateV710();
    if (state.status !== "running" || state.tabId !== tabId) return;
    const done = state.items[state.currentIndex];
    if (!done || done.draftId !== item.draftId) return;

    const fill = result.fill || {};
    done.questionsFound = Number(result.fields?.questions?.length || 0) + Number(result.fields?.preservedQuestions?.length || 0);
    done.answered = Number(result.matched?.answerCount || Object.keys(result.answers || {}).length || 0);
    done.safelyOmittedByAi = 0;
    done.missingAfterAi = Number(result.matched?.unresolved?.length || 0);
    done.filled = Number(fill.filled || 0); done.already = Number(fill.already || 0); done.partial = Number(fill.partial || 0); done.review = Number(fill.review || 0); done.skipped = Number(fill.skipped || 0); done.omitted = Number(fill.omitted || 0); done.valuesFilled = Number(fill.valuesFilled || 0);
    done.reviewFields = (Array.isArray(fill.reviewFields) ? fill.reviewFields : []).slice(0, 10);
    done.requiredReviewFields = (Array.isArray(fill.requiredReviewFields) ? fill.requiredReviewFields : []).slice(0, 4);
    done.autosaveConfirmed = Boolean(result.save?.confirmed);
    done.stageTimings = { ...(done.stageTimings || {}), ...(result.timings || {}) };
    const usageEstimate = preparedEstimate || result.analysis?.prepared?.estimate || null;
    done.cost = result.analysis?.usage?.cached === true ? 0 : Number(result.analysis?.usage?.cost ?? usageEstimate?.estimatedCost ?? 0);
    if (usageEstimate) await queueSaveUsageV710(done, usageEstimate, result.analysis?.usage || {});

    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const fillReview = done.review + done.partial;
    const timing = done.stageTimings || {};
    const timingText = `read ${((Number(timing.readPhotosMs || 0) + Number(timing.readFieldsMs || 0)) / 1000).toFixed(1)}s, AI ${(Number(timing.aiMs || 0) / 1000).toFixed(1)}s, match ${(Number(timing.matchMs || 0) / 1000).toFixed(1)}s, fill ${(Number(timing.fillMs || 0) / 1000).toFixed(1)}s, save ${(Number(timing.saveMs || 0) / 1000).toFixed(1)}s`;
    const summary = `questions ${done.questionsFound}, answers ${done.answered}, ${done.filled} filled, ${done.already} already set, ${fillReview} Fill review, ${done.skipped} skipped, ${seconds}s; ${timingText}${done.autosaveConfirmed ? ", autosave confirmed" : ", autosave not visibly confirmed"}.`;
    const processStatus = result.ok && fill?.ok !== false ? "completed" : "error";
    const finalMessage = processStatus === "error" ? queueResultFailureMessageV8231(result, summary) : summary;
    if (processStatus === "error") {
      done.failureCode = "ITEM_PROCESS_FAILED";
      done.failureScope = "item";
    }
    await queueShowDraftProgressV802(tabId, state, done, processStatus, { message: finalMessage, durationMs: Date.now() - startedAt, finished: true, autoHideMs: 10000 });
    await queueFinishCurrentV720(state, done, processStatus, finalMessage);
  } catch (error) {
    let state = await queueGetRunnerStateV710();
    if (state.tabId === tabId && state.status === "running") {
      const item = state.items[state.currentIndex];
      const failure = queueFailureInfoV8231(error);
      const message = failure.message;
      try {
        await globalThis.EbayBlocksV890?.fillFields?.stop?.(tabId).catch(() => {});
        await queueShowDraftProgressV802(tabId, state, item, "error", { message, stageStartedAt: item?.stageStartedAt, finished: true, autoHideMs: 15000 });
        if (failure.scope === "queue") {
          await queueBlockRunnerV8231(state, item, error);
        } else {
          if (item) {
            item.failureCode = failure.code;
            item.failureScope = "item";
          }
          await queueFinishCurrentV720(state, item, "error", message);
        }
      } catch (advanceError) {
        state = await queueGetRunnerStateV710();
        const fatal = queueFailureInfoV8231(advanceError);
        await queueFailRunnerV720(state, state.items[state.currentIndex], fatal.message, fatal.code);
      }
    }
  } finally {
    QUEUE_PROCESSING_TABS_V710.delete(tabId);
    QUEUE_ACTIVE_TICKETS_V8232.delete(tabId);
    const pendingTicket = QUEUE_PENDING_TICKETS_V8232.get(tabId) || null;
    QUEUE_PENDING_TICKETS_V8232.delete(tabId);
    if (pendingTicket) queueScheduleRunnerTabV8232(tabId, 0, pendingTicket);
  }
}

async function queueStartRunnerV710(payload = {}) {
  if (payload.confirmedSafety !== true) return { ok: false, message: "Start request was not accepted." };
  const existing = await queueGetRunnerStateV710();
  if (["starting", "running"].includes(existing.status)) return { ok: false, message: "AI Queue is already running.", runner: existing };
  const stored = await chrome.storage.local.get(QUEUE_STORAGE_KEY_V710);
  const source = stored?.[QUEUE_STORAGE_KEY_V710];
  const seen = new Set();
  const items = [];
  for (const [index, entry] of (Array.isArray(source?.items) ? source.items : []).slice(0, QUEUE_MAX_ITEMS_V710).entries()) {
    const item = queueNormalizeItemV710(entry, index);
    if (!item.draftId || !globalThis.EbayBlocksV890.openDraft.isSupportedEbayUrl(item.url, { draftOnly: true }) || seen.has(item.draftId)) continue;
    seen.add(item.draftId);
    item.processStatus = "pending";
    item.message = "Waiting in queue.";
    items.push(item);
  }
  if (!items.length) return { ok: false, message: "No valid eBay drafts are selected. Return to Drafts and select at least one checkbox." };
  const settings = await queueReadSettingsV710();
  if (!settings.apiEnabled || settings.apiMode === "off") return { ok: false, message: "API is OFF. Turn it ON in Settings before starting the queue." };
  if (!settings.apiBaseUrl || !settings.apiModel) return { ok: false, message: "Save API Base URL and Model before starting the queue." };

  // V8.23.21: queue-level blockers (budget/auth/rate limit/backend) do not turn
  // every remaining draft into an error. Pressing Start after fixing Settings
  // resumes the exact blocked draft when the selected queue has not changed.
  if (existing.status === "blocked" && queueSameSelectionV8231(existing.items, items) && existing.currentIndex < existing.items.length) {
    let state = queueNormalizeRunnerStateV710(existing);
    const current = state.items[state.currentIndex];
    if (current) {
      state.status = "starting";
      state.processingLease = null;
      state.failureCode = "";
      state.failureScope = "";
      current.processStatus = "loading";
      current.stage = "loading";
      current.message = "Resuming the draft that was blocked by a queue-level condition…";
      current.failureCode = "";
      current.failureScope = "";
      state.lastMessage = `Resuming ${state.currentIndex + 1}/${state.items.length}: ${current.title}`;
      state = await queueSetRunnerStateV710(state);
      try {
        let tab = null;
        if (Number.isInteger(state.tabId)) {
          try { tab = await globalThis.EbayBlocksV890.openDraft.open({ tabId: state.tabId, url: current.url, active: false }); }
          catch (error) { globalThis.EbayLogger?.debug?.("Blocked Queue tab could not be reused", { message: error?.message || String(error) }); }
        }
        if (!tab) tab = await globalThis.EbayBlocksV890.openDraft.open({ url: current.url, active: false });
        state.tabId = tab.id;
        state.status = "running";
        state.lastMessage = `Resumed ${state.currentIndex + 1}/${state.items.length}: ${current.title}`;
        state = await queueSetRunnerStateV710(state);
        queueScheduleRunnerTabV8232(tab.id, 0, queueTicketV8232(state.runId, current.draftId));
        return { ok: true, message: `Queue resumed from draft ${state.currentIndex + 1}/${state.items.length}.`, runner: state };
      } catch (error) {
        state.status = "error";
        state.failureCode = "PROCESSING_TAB_OPEN_FAILED";
        state.failureScope = "queue";
        state.lastMessage = `Could not reopen the safe processing tab: ${error?.message || String(error)}`;
        state = await queueSetRunnerStateV710(state);
        return { ok: false, message: state.lastMessage, runner: state };
      }
    }
  }

  let state = queueNormalizeRunnerStateV710({
    runId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: "starting",
    currentIndex: 0,
    items,
    startedAt: new Date().toISOString(),
    lastMessage: `Starting queue with ${items.length} draft(s)…`,
    // A generic Start confirmation never bypasses the per-item cost warning.
    approvedCostWarning: false
  });
  state.items[0].processStatus = "loading";
  state = await queueSetRunnerStateV710(state);
  try {
    const tab = await globalThis.EbayBlocksV890.openDraft.open({ url: state.items[0].url, active: false });
    state.tabId = tab.id;
    state.status = "running";
    state.lastMessage = `Opening 1/${state.items.length}: ${state.items[0].title}`;
    state = await queueSetRunnerStateV710(state);
    queueScheduleRunnerTabV8232(tab.id, 0, queueTicketV8232(state.runId, state.items[0].draftId));
    return { ok: true, message: `Queue started. ${items.length} draft(s) selected.`, runner: state };
  } catch (error) {
    state.status = "error";
    state.lastMessage = `Could not open the safe processing tab: ${error?.message || String(error)}`;
    state = await queueSetRunnerStateV710(state);
    return { ok: false, message: state.lastMessage, runner: state };
  }
}

async function queueStopRunnerV710() {
  abortActiveAiBackendV890("queue-stop");
  let state = await queueGetRunnerStateV710();
  if (!["starting", "running", "paused"].includes(state.status)) return { ok: true, message: "AI Queue is not running.", runner: state };
  state.status = "stopped";
  state.processingLease = null;
  state.lastMessage = "AI Queue stopped safely. The processing tab was left open. Nothing was published or deleted.";
  const item = state.items[state.currentIndex];
  if (item && !["completed", "review", "error"].includes(item.processStatus)) item.processStatus = "stopped";
  state = await queueSetRunnerStateV710(state);
  if (state.tabId) await queueSendTabMessageV710(state.tabId, { type: "STOP_ALL_ACTIONS_V5" }, 5000);
  return { ok: true, message: state.lastMessage, runner: state };
}







// MV3 service workers can be terminated between queue stages. Resume from the
// persistent runner record whenever a fresh worker instance is created instead
// of relying on in-memory Sets/timers from the previous worker lifetime.
async function queueResumePersistedRunnerV8100() {
  const state = await queueGetRunnerStateV710();
  if (state.status !== "running" || !Number.isInteger(state.tabId)) return;
  try {
    let tab = await chrome.tabs.get(state.tabId);
    if (!tab?.id) return;
    const item = state.items?.[state.currentIndex];
    if (!item?.draftId || !item?.url) return;
    const actualDraftId = globalThis.EbayBlocksV890.openDraft.extractDraftId(tab.url || "");
    if (actualDraftId !== item.draftId) {
      tab = await globalThis.EbayBlocksV890.openDraft.open({ tabId: state.tabId, url: item.url, active: false });
    }
    queueScheduleRunnerTabV8232(tab.id, 0, queueTicketV8232(state.runId, item.draftId));
  } catch (_) {
    state.status = "paused";
    state.processingLease = null;
    state.lastMessage = "Queue processing tab disappeared after a service-worker restart. Open/retry the current draft; nothing was published.";
    await queueSetRunnerStateV710(state);
  }
}
queueResumePersistedRunnerV8100().catch(error => {
  try { console.warn("[Queue V8.23.21] persisted-runner resume failed", error?.message || error); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
});
// #endregion

// #region HOTKEY AUTOPILOT AND STANDALONE CONTROL WINDOW
// V8.23.21: Autopilot runtime state lives in extension storage.session so a
// Manifest V3 service-worker restart cannot silently forget that a run is active.
const HOTKEY_AUTOPILOT_STATE_KEY_V8130 = "ebayAiAutopilotRuntimeV8130";
const HOTKEY_AUTOPILOT_WORKER_SESSION_V8130 = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function hotkeyAutopilotStorageV8130() {
  return chrome.storage.session || chrome.storage.local;
}

async function hotkeyReadAutopilotStateV8130() {
  const storage = hotkeyAutopilotStorageV8130();
  const stored = await storage.get(HOTKEY_AUTOPILOT_STATE_KEY_V8130);
  const value = stored?.[HOTKEY_AUTOPILOT_STATE_KEY_V8130];
  return value && typeof value === "object" ? value : { status: "idle", tabId: null, draftId: "", cancelRequested: false };
}

async function hotkeyWriteAutopilotStateV8130(next = {}) {
  const value = {
    status: String(next.status || "idle"),
    tabId: Number.isInteger(next.tabId) ? next.tabId : null,
    draftId: String(next.draftId || "").slice(0, 160),
    cancelRequested: next.cancelRequested === true,
    startedAt: String(next.startedAt || ""),
    workerSessionId: String(next.workerSessionId || HOTKEY_AUTOPILOT_WORKER_SESSION_V8130),
    updatedAt: new Date().toISOString()
  };
  await hotkeyAutopilotStorageV8130().set({ [HOTKEY_AUTOPILOT_STATE_KEY_V8130]: value });
  return value;
}

async function hotkeyClearAutopilotStateV8130(tabId = null) {
  const current = await hotkeyReadAutopilotStateV8130();
  if (Number.isInteger(tabId) && Number.isInteger(current.tabId) && current.tabId !== tabId) return false;
  await hotkeyAutopilotStorageV8130().remove(HOTKEY_AUTOPILOT_STATE_KEY_V8130);
  return true;
}

async function hotkeyAutopilotRunningV8130(tabId = null) {
  const state = await hotkeyReadAutopilotStateV8130();
  if (state.status !== "running") return false;
  return !Number.isInteger(tabId) || state.tabId === tabId;
}

async function hotkeyAutopilotCancelledV8130(tabId) {
  const state = await hotkeyReadAutopilotStateV8130();
  return state.status === "running" && state.tabId === tabId && state.cancelRequested === true;
}

async function hotkeyRequestAutopilotCancelV8130(tabId = null) {
  const state = await hotkeyReadAutopilotStateV8130();
  if (state.status !== "running") return state;
  if (Number.isInteger(tabId) && Number.isInteger(state.tabId) && state.tabId !== tabId) return state;
  return hotkeyWriteAutopilotStateV8130({ ...state, cancelRequested: true });
}

async function hotkeyRecoverAutopilotStateV8130() {
  const state = await hotkeyReadAutopilotStateV8130();
  if (state.status !== "running" || !state.workerSessionId || state.workerSessionId === HOTKEY_AUTOPILOT_WORKER_SESSION_V8130) return;
  // The previous MV3 worker disappeared mid-run. No new stage can safely be
  // assumed, so stop the page writer and clear the stale lease before accepting
  // a new command.
  if (Number.isInteger(state.tabId)) {
    try {
      await queueSendTabMessageV710(state.tabId, { type: "CORE_EBAY_STOP", payload: { reason: "service_worker_restart" } }, 2500);
      await hotkeyShowStatusV880(state.tabId, "error", "Autopilot stopped after the extension service worker restarted. Review the current draft before retrying.", { finished: true, autoHideMs: 15000 });
    } catch (error) {
      console.warn("[Autopilot V8.23.21] restart recovery could not reach the old tab", error?.message || error);
    }
  }
  await hotkeyClearAutopilotStateV8130(state.tabId);
}

hotkeyRecoverAutopilotStateV8130().catch(error => {
  console.warn("[Autopilot V8.23.21] persisted-state recovery failed", error?.message || error);
});

function hotkeySupportedEbayUrlV880(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && /(^|\.)ebay\.(com|ca|co\.uk)$/i.test(parsed.hostname);
  } catch (_) { return false; }
}

function hotkeySupportedMarketplaceUrlV8200(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return /(^|\.)ebay\.(com|ca|co\.uk)$/i.test(host) || host === "depop.com" || host.endsWith(".depop.com") || host === "poshmark.com" || host.endsWith(".poshmark.com") || host === "vinted.com" || host.endsWith(".vinted.com");
  } catch (_) { return false; }
}

async function hotkeyActiveMarketplaceTabV8200() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs.find(tab => tab?.id && hotkeySupportedMarketplaceUrlV8200(tab.url)) || null;
}

async function hotkeyActiveEbayTabV880({ draftOnly = false } = {}) {
  const block = globalThis.EbayBlocksV890?.openDraft;
  if (draftOnly && block?.current) return block.current({ draftOnly: true });
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs.find(tab => tab?.id && hotkeySupportedEbayUrlV880(tab.url)) || null;
}

async function hotkeyShowStatusV880(tabId, stage, message, details = {}) {
  if (!Number.isInteger(tabId)) return { ok: false };
  return queueSendTabMessageV710(tabId, {
    type: "AI_QUEUE_PROGRESS_V802",
    payload: {
      titlePrefix: "Autopilot",
      stage,
      message,
      index: 0,
      total: 1,
      stageStartedAt: details.stageStartedAt || new Date().toISOString(),
      timeoutMs: Number(details.timeoutMs || 0),
      durationMs: Number(details.durationMs || 0),
      finished: Boolean(details.finished),
      autoHideMs: Number(details.autoHideMs || 0)
    }
  }, 2500);
}

async function hotkeyToastV880(tabId, message) {
  if (!Number.isInteger(tabId)) return { ok: false };
  return queueSendTabMessageV710(tabId, { type: "HOTKEY_STATUS_V880", payload: { message } }, 2500);
}

async function hotkeyRunAutopilotV880() {
  const tab = await globalThis.EbayBlocksV890?.openDraft?.current?.({ draftOnly: true });
  if (!tab?.id) throw new Error("Open an eBay draft first, then press Autopilot again.");
  const tabId = tab.id;
  const draftId = globalThis.EbayBlocksV890.openDraft.extractDraftId(tab.url);
  if (!draftId) throw new Error("The current eBay page is not a supported draft.");

  const queueState = await queueGetRunnerStateV710();
  if (["starting", "running", "paused"].includes(queueState.status)) throw new Error("AI Queue is active. Stop Queue before starting single-item Autopilot.");
  if (await hotkeyAutopilotRunningV8130()) throw new Error("Autopilot is already running on a draft.");

  const settings = await queueReadSettingsV710();
  if (!settings.apiEnabled || settings.apiMode === "off") throw new Error("API is OFF. Turn it ON in Settings.");
  if (!settings.apiBaseUrl || !settings.apiModel) throw new Error("API Base URL or Model is missing. Save Settings first.");

  // Autopilot is the all-fields route; manual question exclusions do not silently carry into it.
  const excludedQuestions = [];
  await hotkeyWriteAutopilotStateV8130({
    status: "running",
    tabId,
    draftId,
    cancelRequested: false,
    startedAt: new Date().toISOString(),
    workerSessionId: HOTKEY_AUTOPILOT_WORKER_SESSION_V8130
  });
  let estimate = null;
  try {
    const result = await globalThis.EbayAutopilotModeV890.run({
      tabId,
      draftId,
      settings,
      excludedQuestions,
      shouldContinue: async () => !(await hotkeyAutopilotCancelledV8130(tabId)),
      beforeRequest: async prepared => { estimate = prepared.estimate || null; await queueCheckBudgetV710(prepared.estimate || {}, settings, true); },
      onStage: async event => {
        const stage = sharedBlockStageV890(event.block);
        const timeoutMs = event.block === "04_AI_ANALYSIS" ? 75000 : event.block === "06_FILL_FIELDS" ? 70000 : event.block === "07_SAVE" ? 12000 : 45000;
        await hotkeyShowStatusV880(tabId, stage, sharedBlockMessageV890(event), { stageStartedAt: event.at, timeoutMs, durationMs: event.durationMs, finished: event.block === "07_SAVE" && event.status === "completed" });
      }
    });
    if (estimate) await queueSaveUsageV710({ title: tab.title || `eBay draft ${draftId}` }, estimate, result.analysis?.usage || {});
    if (await hotkeyAutopilotCancelledV8130(tabId)) return { ok: false, stopped: true, message: "Autopilot stopped safely. Nothing was published or deleted." };
    const message = result.message || "Autopilot finished.";
    await hotkeyShowStatusV880(tabId, result.ok ? "completed" : "error", message, { finished: true, autoHideMs: 12000, durationMs: result.timings?.totalMs || 0 });
    return { ok: result.ok, needsReview: Number(result.fill?.review || 0) + Number(result.fill?.partial || 0) > 0, message, result };
  } catch (error) {
    const message = error?.message || String(error);
    await globalThis.EbayBlocksV890?.fillFields?.stop?.(tabId).catch(() => {});
    await hotkeyShowStatusV880(tabId, "error", message, { finished: true, autoHideMs: 15000 });
    return { ok: false, message };
  } finally {
    await hotkeyClearAutopilotStateV8130(tabId);
  }
}

async function hotkeyOpenControlWindowV880({ tab = "aiTab", sourceTabId = null, notice = "" } = {}) {
  let target = null;
  if (Number.isInteger(sourceTabId)) {
    try { target = await chrome.tabs.get(sourceTabId); }
    catch (error) { globalThis.EbayLogger?.debug?.("Control panel source lookup skipped", { message: error?.message || String(error) }); }
  }
  if (!target?.id || !hotkeySupportedMarketplaceUrlV8200(target.url)) target = await hotkeyActiveMarketplaceTabV8200();
  if (!target?.id) return { ok: false, message: "Open an eBay, Depop, or Poshmark listing page first, then open the Control Panel." };
  const type = globalThis.EbayAiMessagesV800?.CONTROL_PANEL_TOGGLE || "CONTROL_PANEL_TOGGLE";
  const result = await queueSendTabMessageV710(target.id, {
    type,
    payload: { tab, sourceTabId: target.id, notice }
  }, 5000);
  return result?.ok ? { ...result, tabId: target.id } : result;
}

async function hotkeyToggleQueueV880() {
  const state = await queueGetRunnerStateV710();
  if (["starting", "running", "paused"].includes(state.status)) return queueStopRunnerV710();
  if (await hotkeyAutopilotRunningV8130()) return { ok: false, message: "Autopilot is running. Stop it before starting Queue." };
  const sourceTab = await hotkeyActiveEbayTabV880();
  if (sourceTab?.id && /\/sh\/lst(?:\/|$)/i.test(new URL(sourceTab.url).pathname)) {
    await queueSendTabMessageV710(sourceTab.id, { type: "AI_QUEUE_SYNC_V721" }, 5000);
  }
  return queueStartRunnerV710({ confirmedSafety: true, simpleMode: true });
}

async function hotkeySafeStopV880(tabId = null) {
  abortActiveAiBackendV890("safe-stop");
  await hotkeyRequestAutopilotCancelV8130(tabId);
  const stopTargets = new Set();
  if (Number.isInteger(tabId)) stopTargets.add(tabId);
  const state = await queueGetRunnerStateV710().catch(() => null);
  if (Number.isInteger(state?.tabId)) stopTargets.add(state.tabId);
  for (const target of stopTargets) await globalThis.EbayBlocksV890?.fillFields?.stop?.(target).catch(() => {});
  let queue = null;
  try { queue = await queueStopRunnerV710(); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  return { ok: true, message: "Safe Stop requested. Current shared Fill was stopped and no new stage will start.", queue };
}


async function hotkeyFillAllReadyV920(tabOverride = null) {
  const tab = tabOverride?.id && hotkeySupportedEbayUrlV880(tabOverride.url) ? tabOverride : await globalThis.EbayBlocksV890?.openDraft?.current?.({ draftOnly: true });
  if (!tab?.id) throw new Error("Open an eBay draft first, then press Fill All again.");
  if (await hotkeyAutopilotRunningV8130()) throw new Error("Autopilot is running. Wait for it or press Esc before Fill All.");
  const queueState = await queueGetRunnerStateV710();
  if (["starting", "running", "paused"].includes(queueState.status)) throw new Error("AI Queue is active. Stop Queue before manual Fill All.");
  const draftId = globalThis.EbayBlocksV890.openDraft.extractDraftId(tab.url);
  const context = await queueSendTabMessageV710(tab.id, { type: "CORE_EBAY_READ_CONTEXT", payload: { expectedDraftId: draftId, requirePhotos: false } }, 15000);
  if (!context?.ok) throw new Error(context?.message || "Could not read Item Specifics from the current draft.");
  const questions = (Array.isArray(context.routeQuestions) ? context.routeQuestions : []).map(item => String(item?.name || item?.label || item || "").trim()).filter(Boolean);
  if (!questions.length) throw new Error("No Item Specifics are visible on this draft.");

  const keys = ["ebayFillerV50Draft", "ebayFillerV50RawText", "ebayFillerV639PageContext"];
  const stored = await chrome.storage.local.get(keys);
  const storedContext = stored.ebayFillerV639PageContext || {};
  const storedDraftId = globalThis.EbayBlocksV890.openDraft.extractDraftId(storedContext.url || "");
  if (storedDraftId && storedDraftId !== draftId) throw new Error("Prepared answers belong to a different draft. Analyze/import answers for this draft first.");
  const savedSpecifics = String(stored.ebayFillerV50Draft?.specifics || "").trim();
  const rawText = String(stored.ebayFillerV50RawText || "").trim();
  const source = savedSpecifics || rawText;
  if (!source) throw new Error("No prepared Field - Value answers are ready. Analyze photos or import answers first.");

  const parsed = globalThis.EbayBlocksV890.textInput.run(source, { questions });
  const preparedAnswers = parsed?.answers || {};
  if (!Object.keys(preparedAnswers).length) throw new Error("No prepared Item Specific answers matched the current eBay questions.");
  const matched = globalThis.EbayBlocksV890.matchEbay.run({
    analysis: { answers: preparedAnswers },
    questions,
    fields: context.fields || [],
    pageContext: context.pageContext || {},
    reviewMode: false
  });
  if (!Object.keys(matched.answers || {}).length) throw new Error("Prepared answers were found, but none can be sent to the shared Fill Engine.");
  await hotkeyToastV880(tab.id, `Fill All: ${Object.keys(matched.answers).length} prepared answer(s), no AI analysis.`);
  const fill = await globalThis.EbayBlocksV890.fillFields.run({
    tabId: tab.id,
    draftId,
    answers: matched.answers,
    questions,
    omittedQuestions: [],
    mode: "manual_hotkey",
    timeoutMs: 70000
  });
  const save = fill?.ok !== false ? await globalThis.EbayBlocksV890.save.run({ tabId: tab.id, draftId, fill, timeoutMs: 12000 }).catch(error => ({ ok: false, confirmed: false, message: error?.message || String(error) })) : null;
  const review = Number(fill?.review || 0) + Number(fill?.partial || 0) + Number(fill?.skipped || 0);
  const message = `Fill All finished without AI: ${Number(fill?.filled || 0)} filled, ${Number(fill?.already || 0)} already set${review ? `, ${review} need review` : ""}.${save?.message ? ` ${save.message}` : ""}`;
  await hotkeyToastV880(tab.id, message);
  return { ok: fill?.ok !== false && save?.ok !== false, message, fill, save };
}

async function hotkeyClearAllItemSpecificsV920(tabOverride = null) {
  const tab = tabOverride?.id && hotkeySupportedEbayUrlV880(tabOverride.url) ? tabOverride : await globalThis.EbayBlocksV890?.openDraft?.current?.({ draftOnly: true });
  if (!tab?.id) throw new Error("Open an eBay draft first, then press Clear All again.");
  if (await hotkeyAutopilotRunningV8130()) throw new Error("Autopilot is running. Press Esc before clearing Item Specifics.");
  const queueState = await queueGetRunnerStateV710();
  if (["starting", "running", "paused"].includes(queueState.status)) throw new Error("AI Queue is active. Stop Queue before clearing Item Specifics.");
  const draftId = globalThis.EbayBlocksV890.openDraft.extractDraftId(tab.url);
  const result = await queueSendTabMessageV710(tab.id, { type: "CORE_EBAY_CLEAR_ALL_ITEM_SPECIFICS_V920", payload: { expectedDraftId: draftId } }, 70000);
  const message = result?.message || "Clear All Item Specifics finished.";
  await hotkeyToastV880(tab.id, message);
  return { ...result, message };
}

async function hotkeyHandleCommandV880(command, { sourceTab: providedSourceTab = null } = {}) {
  const sourceTab = providedSourceTab?.id && hotkeySupportedMarketplaceUrlV8200(providedSourceTab.url) ? providedSourceTab : await hotkeyActiveMarketplaceTabV8200();
  try {
    if (command === "autopilot-current-draft") return await hotkeyRunAutopilotV880();
    if (command === "toggle-ai-queue") {
      const result = await hotkeyToggleQueueV880();
      if (sourceTab?.id) await hotkeyToastV880(sourceTab.id, result?.message || "Queue command completed.");
      return result;
    }
    if (command === "open-review") {
      const reviewTab = await hotkeyActiveEbayTabV880({ draftOnly: true });
      return hotkeyOpenControlWindowV880({ tab: "reviewTab", sourceTabId: reviewTab?.id || sourceTab?.id || null, notice: reviewTab ? "" : "Open an eBay draft to load its Review record." });
    }
    if (command === "open-control-window") return hotkeyOpenControlWindowV880({ tab: "aiTab", sourceTabId: sourceTab?.id || null });
    if (command === "fill-all-ready") return await hotkeyFillAllReadyV920(sourceTab);
    if (command === "clear-all-item-specifics") return await hotkeyClearAllItemSpecificsV920(sourceTab);
    return { ok: false, message: `Unknown command: ${command}` };
  } catch (error) {
    const message = error?.message || String(error);
    if (sourceTab?.id) await hotkeyToastV880(sourceTab.id, message);
    else await hotkeyOpenControlWindowV880({ tab: "aiTab", notice: message });
    return { ok: false, message };
  }
}

chrome.commands?.onCommand?.addListener(command => {
  hotkeyHandleCommandV880(command).catch(error => console.warn("[Hotkeys V8.23.21] command failed", error?.message || error));
});

// V8.23.21: the toolbar icon and Ctrl+Shift+O are one route. There is no
// browser-action popup with a second, independent viewport/size owner.
chrome.action?.onClicked?.addListener(tab => {
  hotkeyHandleCommandV880("open-control-window", { sourceTab: tab })
    .catch(error => console.warn("[Control Panel V8.23.21] toolbar action failed", error?.message || error));
});
// #endregion

// #region MARKETPLACE PHOTO TRANSFER V8.23.21
const PHOTO_TRANSFER_MAX_BYTES_V8210 = 16 * 1024 * 1024;
const PHOTO_TRANSFER_SESSION_KEY_V8220 = "marketplacePhotoTransferV8220";
const PHOTO_TRANSFER_SESSION_TTL_MS_V8220 = 5 * 60 * 1000;

function sanitizePhotoTransferPayloadV8220(value) {
  const source = value && typeof value === "object" ? value : {};
  if (source.kind !== "marketplace_ai_photo_transfer" || source.source !== "ebay" || !Array.isArray(source.photos)) return null;
  const photos = source.photos.slice(0, 25).map((photo, index) => {
    const url = safeEbayPhotoTransferUrlV8210(photo?.url);
    if (!url) return null;
    return {
      url,
      name: String(photo?.name || `ebay-photo-${index + 1}.jpg`).replace(/[\r\n\0]/g, " ").slice(0, 160),
      index: Number.isFinite(Number(photo?.index)) ? Number(photo.index) : index,
      photoId: String(photo?.photoId || "").replace(/[\r\n\0]/g, " ").slice(0, 220)
    };
  }).filter(Boolean);
  if (!photos.length) return null;
  return {
    kind: "marketplace_ai_photo_transfer",
    version: 2,
    transferId: String(source.transferId || `${Date.now()}`).replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 180),
    createdAt: Number(source.createdAt || Date.now()),
    expiresAt: Date.now() + PHOTO_TRANSFER_SESSION_TTL_MS_V8220,
    source: "ebay",
    selectionMode: source.selectionMode === "selected" ? "selected" : "all",
    selectedCount: Math.max(0, Math.min(25, Number(source.selectedCount || 0))),
    photos
  };
}

async function setPhotoTransferSessionV8220(payload) {
  const safe = sanitizePhotoTransferPayloadV8220(payload);
  if (!safe) return { ok: false, message: "Photo transfer session contains no valid eBay photos." };
  await chrome.storage.session.set({ [PHOTO_TRANSFER_SESSION_KEY_V8220]: safe });
  return { ok: true, transferId: safe.transferId, photoCount: safe.photos.length };
}

async function getPhotoTransferSessionV8220() {
  const stored = await chrome.storage.session.get(PHOTO_TRANSFER_SESSION_KEY_V8220);
  const payload = stored?.[PHOTO_TRANSFER_SESSION_KEY_V8220] || null;
  if (!payload || Number(payload.expiresAt || 0) <= Date.now()) {
    await chrome.storage.session.remove(PHOTO_TRANSFER_SESSION_KEY_V8220);
    return { ok: false, message: "No active photo transfer session." };
  }
  const safe = sanitizePhotoTransferPayloadV8220(payload);
  if (!safe) {
    await chrome.storage.session.remove(PHOTO_TRANSFER_SESSION_KEY_V8220);
    return { ok: false, message: "Stored photo transfer session is invalid." };
  }
  safe.expiresAt = Number(payload.expiresAt || Date.now() + PHOTO_TRANSFER_SESSION_TTL_MS_V8220);
  return { ok: true, payload: safe };
}

async function clearPhotoTransferSessionV8220(transferId = "") {
  if (transferId) {
    const current = await getPhotoTransferSessionV8220();
    if (current?.ok && current.payload?.transferId && current.payload.transferId !== String(transferId)) return { ok: true, cleared: false };
  }
  await chrome.storage.session.remove(PHOTO_TRANSFER_SESSION_KEY_V8220);
  return { ok: true, cleared: true };
}

function safeEbayPhotoTransferUrlV8210(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return "";
    if (host !== "i.ebayimg.com") return "";
    if (!/^\/(?:images\/g\/[^/]+\/|00\/s\/)/i.test(url.pathname)) return "";
    if (!/\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname)) return "";
    url.hash = "";
    return url.href;
  } catch (error) {
    try { globalThis.EbayLogger?.debug?.("Rejected invalid photo transfer URL", { message: error?.message || String(error) }); }
    catch (loggerError) { console.debug("[Photo Transfer V8.23.21] invalid URL", loggerError?.message || loggerError); }
    return "";
  }
}

function arrayBufferToBase64V8210(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function fetchMarketplacePhotoV8210(value) {
  const url = safeEbayPhotoTransferUrlV8210(value);
  if (!url) return { ok: false, message: "Photo transfer accepts only validated eBay image URLs." };
  const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit", redirect: "follow" });
  if (!response.ok) return { ok: false, message: `eBay photo download failed (${response.status}).` };
  const finalUrl = safeEbayPhotoTransferUrlV8210(response.url || url);
  if (!finalUrl) return { ok: false, message: "eBay photo redirected to an unsupported host." };
  const mime = String(response.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (!/^image\/(?:jpeg|png|webp|gif)$/.test(mime)) return { ok: false, message: `Unsupported eBay photo type: ${mime || "unknown"}.` };
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > PHOTO_TRANSFER_MAX_BYTES_V8210) return { ok: false, message: "An eBay photo is too large to transfer safely." };
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > PHOTO_TRANSFER_MAX_BYTES_V8210) return { ok: false, message: "An eBay photo is empty or exceeds the transfer size limit." };
  return { ok: true, mime, size: buffer.byteLength, base64: arrayBufferToBase64V8210(buffer) };
}
// #endregion

// #region BROWSER EVENTS AND MESSAGE ROUTING
// This is the only service-worker entry point for popup/content-script messages.
chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const draftId = globalThis.EbayBlocksV890.openDraft.extractDraftId(tab?.url || changeInfo.url || "");
  if (!draftId) return;
  queueScheduleCurrentDraftV8232(tabId, draftId, 0).catch(error => {
    globalThis.EbayLogger?.debug?.("Queue tab-ready event skipped", { message: error?.message || String(error) });
  });
});

chrome.tabs?.onRemoved?.addListener(tabId => {
  queueGetRunnerStateV710().then(async state => {
    if (state.tabId !== tabId || !["starting", "running", "paused"].includes(state.status)) return;
    state.status = "error";
    state.tabId = null;
    state.lastMessage = "Processing tab was closed. Press Start to run the selected drafts again.";
    const item = state.items[state.currentIndex];
    if (item && !["completed", "review"].includes(item.processStatus)) item.processStatus = "error";
    await queueSetRunnerStateV710(state);
  }).catch(() => {});
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;
  if (message.type === "MARKETPLACE_PHOTO_SESSION_SET_V8220") {
    setPhotoTransferSessionV8220(message.payload || {})
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }
  if (message.type === "MARKETPLACE_PHOTO_SESSION_GET_V8220") {
    getPhotoTransferSessionV8220()
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }
  if (message.type === "MARKETPLACE_PHOTO_SESSION_CLEAR_V8220") {
    clearPhotoTransferSessionV8220(message.payload?.transferId || "")
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }
  if (message.type === "MARKETPLACE_PHOTO_FETCH_V8210") {
    fetchMarketplacePhotoV8210(message.payload?.url)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }
  if (message.type === "HOTKEY_LOCAL_COMMAND_V920") {
    const command = String(message.payload?.command || "");
    hotkeyHandleCommandV880(command, { sourceTab: sender?.tab || null }).then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }
  if (message.type === "HOTKEY_SAFE_STOP_V880") {
    const requestedTabId = Number(message.payload?.tabId);
    const tabId = Number.isInteger(requestedTabId) ? requestedTabId : (Number.isInteger(sender?.tab?.id) ? sender.tab.id : null);
    hotkeySafeStopV880(tabId).then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }
  if (message.type === "AI_QUEUE_RUNNER_GET_V710") {
    queueGetRunnerStateV710().then(runner => sendResponse({ ok: true, runner })).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_QUEUE_RUNNER_START_V710") {
    hotkeyAutopilotRunningV8130().then(running => {
      if (running) { sendResponse({ ok: false, message: "Autopilot is running. Stop it before starting Queue." }); return; }
      queueStartRunnerV710(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    }).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_QUEUE_RUNNER_STOP_V710") {
    queueStopRunnerV710().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_QUEUE_TAB_READY_V710") {
    const tabId = sender?.tab?.id;
    const draftId = queueCleanTextV710(message.payload?.draftId || globalThis.EbayBlocksV890.openDraft.extractDraftId(sender?.tab?.url || ""), 120);
    if (Number.isInteger(tabId) && draftId) {
      queueScheduleCurrentDraftV8232(tabId, draftId, 0).catch(error => {
        globalThis.EbayLogger?.debug?.("Queue helper-ready event skipped", { message: error?.message || String(error) });
      });
    }
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "CORE_AI_ANALYZE_LISTING") {
    globalThis.EbayCore.ai.analyzeListing(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_ANALYZE_PHOTOS") {
    // Compatibility route. New Photo and Queue modes use CORE_AI_ANALYZE_LISTING.
    const payload = message.payload || {};
    const runner = Array.isArray(payload.questions) && payload.questions.length
      ? globalThis.EbayCore.ai.analyzeListing(payload)
      : analyzePhotos(payload);
    runner.then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_TEST_CONNECTION") {
    testConnection(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_KEY_SAVE_V637") {
    saveAiKeyToKeychainV637(message.payload?.apiKey).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "LOCAL_NATIVE_BACKEND_STATUS_V8180") {
    nativeBackendStatusV8180()
      .then(() => sendResponse({ ok: true, paired: true, message: "Native Backend connected." }))
      .catch(error => sendResponse({ ok: false, paired: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_KEY_STATUS_V637") {
    getAiKeyStatusV637().then(sendResponse).catch(error => sendResponse({ ok: false, keyStored: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AI_KEY_REMOVE_V637") {
    removeAiKeyFromKeychainV637().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AGENT_SETUP_STATUS_V873") {
    getAgentSetupStatusV873().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "AGENT_SETUP_SAVE_V873") {
    saveAgentSetupProfileV873(message.payload?.settings || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "CLAUDE_KEY_SAVE_V850") {
    saveClaudeKeyToKeychainV850(message.payload?.apiKey).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "CLAUDE_KEY_STATUS_V850") {
    getClaudeKeyStatusV850().then(sendResponse).catch(error => sendResponse({ ok: false, keyStored: false, message: error.message || String(error) }));
    return true;
  }
  if (message.type === "CLAUDE_KEY_REMOVE_V850") {
    removeClaudeKeyFromKeychainV850().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(REVIEW_ROUTES_V830, message.type)) {
    callReviewBackendV830(message.type, message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(EBAY_OAUTH_ROUTES_V63, message.type)) {
    handleEbayOauthMessageV63(message.type, message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
    return true;
  }
  return false;
});
// #endregion
