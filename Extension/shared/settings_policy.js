/* V8.23.21 settings policy/normalization container. No DOM or storage side effects. */
const OPENAI_AUTO_SETTINGS_V873 = Object.freeze({
  apiPreset: "openai-quality", apiEnabled: true, apiMode: "openai-compatible",
  apiBaseUrl: "https://api.openai.com", apiPath: "/v1/responses", apiModel: "gpt-5.6",
  authHeader: "Authorization", authPrefix: "Bearer", customHeaders: "", saveApiKey: true,
  inputCostPer1M: "5.00", outputCostPer1M: "30.00", webResearchEnabled: false,
  autoFillDescriptionCondition: false
});
const PANEL_SIZE_CONFIG_V8190 = globalThis.EbayAiConstantsV790?.PANEL_SIZE || {};
function settingsForPersistentProfileV873(settings = {}) {
  const safe = settingsWithoutApiKeyV637(settings);
  const result = {};
  for (const key of SETTINGS_KEYS) {
    if (["apiKey", "claudeApiKey", "claudeKeyStored"].includes(key)) continue;
    if (Object.prototype.hasOwnProperty.call(safe, key)) result[key] = safe[key];
  }
  result.webResearchEnabled = false;
  result.autoFillDescriptionCondition = false;
  return result;
}
function apiSettingsConfiguredV873(settings = {}) {
  const base = String(settings.apiBaseUrl || "").trim();
  const model = String(settings.apiModel || "").trim();
  const path = String(settings.apiPath || "").trim();
  if (!settings.apiEnabled || settings.apiMode === "off") return false;
  if (!base || !model || !path) return false;
  if (/api\.example\.com/i.test(base) || /vision-model-name/i.test(model)) return false;
  return true;
}
function settingsWithoutApiKeyV637(settings = {}) {
  const safe = { ...settings, apiKey: "", claudeApiKey: "" };
  delete safe.apiKey;
  delete safe.claudeApiKey;
  delete safe.claudeKeyStored;
  return safe;
}
function normalizeBaseUrl(input) {
  let value = String(input || "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, "").replace(/\/v1\/(?:chat\/completions|responses)$/i, "").replace(/\/(?:chat\/completions|responses)$/i, "");
}
function normalizePath(input) {
  let value = String(input || "").trim() || "/v1/chat/completions";
  if (!value.startsWith("/")) value = `/${value}`;
  return value;
}
function validateImportedApiSettings(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid JSON file.");
  }
  if (payload.format !== "ebay-filler-api-settings" || ![1, 2].includes(payload.version)) {
    throw new Error("This is not a supported eBay Filler API settings file.");
  }
  if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
    throw new Error("API settings are missing from the file.");
  }

  const imported = {};
  for (const key of API_FILE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload.settings, key)) imported[key] = payload.settings[key];
  }
  if (payload.version === 1 && typeof payload.settings.apiKey === "string" && payload.settings.apiKey.trim()) {
    imported.apiKey = payload.settings.apiKey.trim();
  }
  if (!Object.keys(imported).length) throw new Error("No API settings were found in the file.");
  return imported;
}
function validateUnifiedApiProfileV638(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid API profile JSON file.");

  if (payload.format === "ebay-filler-api-settings") {
    const ai = validateImportedApiSettings(payload);
    return { ai, ebay: null, importedLegacy: "GPT" };
  }
  if (payload.format === "ebay-filler-ebay-api-profile") {
    const ebay = validateImportedEbayProfileV636(payload);
    return { ai: null, ebay, importedLegacy: "eBay" };
  }
  if (payload.format !== "ebay-filler-unified-api-profile" || Number(payload.version) !== 1) {
    throw new Error("This is not a supported unified eBay Filler API profile.");
  }
  if (payload.containsSecrets !== false) throw new Error("The profile file is not marked secret-free.");

  const aiPayload = payload.ai;
  const ebayPayload = payload.ebay;
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) throw new Error("GPT API settings are missing.");
  if (!ebayPayload || typeof ebayPayload !== "object" || Array.isArray(ebayPayload)) throw new Error("eBay API settings are missing.");

  const ai = {};
  for (const key of API_FILE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(aiPayload, key)) ai[key] = aiPayload[key];
  }
  if (!Object.keys(ai).length) throw new Error("GPT API settings are empty.");
  const ebay = validateImportedEbayProfileV636({
    format: "ebay-filler-ebay-api-profile",
    version: 1,
    containsSecrets: false,
    profile: ebayPayload,
  });
  return { ai, ebay, importedLegacy: "" };
}
function clampPanelNumberV8190(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(max, Math.max(min, numeric)));
}
function normalizedPanelSizeSettingsV8190(settings = {}) {
  const limits = PANEL_SIZE_CONFIG_V8190.LIMITS || { minWidth: 320, maxWidth: 700, minHeight: 420, maxHeight: 900 };
  const modes = Array.isArray(PANEL_SIZE_CONFIG_V8190.MODES) ? PANEL_SIZE_CONFIG_V8190.MODES : ["auto", "compact", "medium", "large", "custom"];
  const mode = modes.includes(String(settings.panelSizeMode || "")) ? String(settings.panelSizeMode) : "auto";
  return {
    panelSizeMode: mode,
    panelCustomWidth: String(clampPanelNumberV8190(settings.panelCustomWidth, limits.minWidth, limits.maxWidth, 460)),
    panelCustomHeight: String(clampPanelNumberV8190(settings.panelCustomHeight, limits.minHeight, limits.maxHeight, 680))
  };
}
