/* V8.23.21 popup application state. No DOM rendering. */
const FIELD_IDS = [
  "profile", "title", "brand", "size", "color", "condition", "price", "suggestedPrice", "quantity",
  "category", "conditionDescription", "description", "measurements", "specifics", "shipping", "aiWarnings"
];
const SETTINGS_KEYS = [
  "workflowMode", "apiPreset", "apiEnabled", "apiMode", "apiBaseUrl", "apiPath", "apiModel", "apiKey", "authHeader", "authPrefix",
  "customHeaders", "saveApiKey", "claudeReviewEnabled", "claudeModel", "claudeApiKey", "claudeKeyStored", "claudeMaxFields", "claudeMaxOutputTokens", "claudeTimeoutMs", "reviewFillMode", "themeMode", "panelSizeMode", "panelCustomWidth", "panelCustomHeight", "imageMaxSide", "exactOnly", "autoReadEbayPhotos", "webResearchEnabled", "autoFillDescriptionCondition", "customAiInstruction",
  "tokenMode", "maxPhotosPerRequest", "maxOutputTokens", "imageQuality", "cacheEnabled", "smartPhotoSelection", "smartLocalOcrVerify",
  "warnItemCost", "dailyBudget", "monthlyBudget", "inputCostPer1M", "outputCostPer1M"
];
const API_FILE_KEYS = [
  "apiPreset", "apiEnabled", "apiMode", "apiBaseUrl", "apiPath", "apiModel",
  "authHeader", "authPrefix", "customHeaders", "saveApiKey", "webResearchEnabled", "maxOutputTokens", "claudeReviewEnabled", "claudeModel", "claudeMaxFields", "claudeMaxOutputTokens", "claudeTimeoutMs", "reviewFillMode"
];
const STORAGE_KEYS = globalThis.EbayAiConstantsV790?.STORAGE_KEYS || {};
const STORAGE = Object.freeze({
  draft: STORAGE_KEYS.DRAFT, raw: STORAGE_KEYS.RAW, settings: STORAGE_KEYS.SETTINGS, logs: STORAGE_KEYS.LOGS,
  ebayPhotos: STORAGE_KEYS.EBAY_PHOTOS, screenshotPhotos: STORAGE_KEYS.SCREENSHOT_PHOTOS, checklist: STORAGE_KEYS.CHECKLIST,
  usageHistory: STORAGE_KEYS.USAGE, aiCache: STORAGE_KEYS.AI_CACHE, draftHistory: STORAGE_KEYS.DRAFT_HISTORY,
  lastDiagnostics: STORAGE_KEYS.LAST_DIAGNOSTICS, pageContext: STORAGE_KEYS.PAGE_CONTEXT,
  excludedQuestions: STORAGE_KEYS.EXCLUDED_QUESTIONS, queue: STORAGE_KEYS.QUEUE, queueRunner: STORAGE_KEYS.QUEUE_RUNNER
});
const PERSISTENT_SETUP_SYNC_STORAGE_KEY_V873 = STORAGE_KEYS.SETUP_SYNC;
const PENDING_EBAY_PROFILE_STORAGE_KEY_V715 = "ebayFillerV715PendingEbayApiProfile";
const DEFAULT_SETTINGS = { ...(globalThis.EbayAiConstantsV790?.DEFAULT_SETTINGS || {}) };
let ebayOauthBusyV63 = false;
let ebayPhotoCache = [];
let currentPhotoSourcePlatformV8220 = "ebay";
let screenshotPhotoCache = [];
let ebayPageContextV639 = {};
let lastPhotoChecklist = null;
let excludedQuestionKeysV680 = new Set();
let currentReviewItemV830 = null;
let reviewDatabaseStatusV830 = null;
const DEFAULT_CHECKLIST = [
  { key: "front", label: "Front/main photo", state: "review", note: "Need clear front/main photo" },
  { key: "back", label: "Back photo", state: "review", note: "Recommended for clothing" },
  { key: "brandTag", label: "Brand tag", state: "review", note: "Needed to confirm brand" },
  { key: "sizeTag", label: "Size tag", state: "review", note: "Needed to confirm size" },
  { key: "materialTag", label: "Material tag", state: "review", note: "Needed before material claims" },
  { key: "flaws", label: "Flaws / condition closeups", state: "review", note: "Needed if pre-owned" },
  { key: "measurements", label: "Measurements", state: "review", note: "Optional but useful" }
];
