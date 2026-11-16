/* Shared configuration and contracts — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== shared/constants.js ===== */
/* V8.23.21 shared constants — one source of truth for version and defaults. */
(function initEbayAiConstants(global) {
  "use strict";

  const VERSION = "8.23.21";
  const VERSION_LABEL = "V8.23.21";

  const MODES = Object.freeze({
    TEXT: "text",
    PHOTO: "photo",
    AUTOPILOT: "autopilot",
    QUEUE: "queue",
    REVIEW: "review"
  });

  const FILL_MODES = Object.freeze({
    MANUAL: "manual",
    TEXT: "text",
    PHOTO: "photo",
    AUTOPILOT: "autopilot",
    QUEUE: "queue",
    REVIEW: "review"
  });

  const DEFAULT_SETTINGS = Object.freeze({
    workflowMode: "hybrid",
    apiPreset: "openai-quality",
    apiEnabled: true,
    apiMode: "openai-compatible",
    apiBaseUrl: "https://api.openai.com",
    apiPath: "/v1/responses",
    apiModel: "gpt-5.6",
    apiKey: "",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    customHeaders: "",
    saveApiKey: true,
    claudeReviewEnabled: false,
    claudeModel: "claude-sonnet-5",
    claudeApiKey: "",
    claudeKeyStored: false,
    claudeMaxFields: "6",
    claudeMaxOutputTokens: "3000",
    claudeTimeoutMs: "45000",
    reviewFillMode: "safe",
    themeMode: "light",
    panelSizeMode: "auto",
    panelCustomWidth: "460",
    panelCustomHeight: "680",
    imageMaxSide: "1280",
    exactOnly: true,
    autoReadEbayPhotos: false,
    webResearchEnabled: false,
    autoFillDescriptionCondition: false,
    customAiInstruction: "",
    tokenMode: "balanced",
    maxPhotosPerRequest: "6",
    analysisPhotoPolicyVersion: "3",
    maxOutputTokens: "8000",
    imageQuality: "0.82",
    cacheEnabled: true,
    smartPhotoSelection: true,
    smartLocalOcrVerify: true,
    warnItemCost: "0.10",
    dailyBudget: "1.00",
    monthlyBudget: "20.00",
    inputCostPer1M: "5.00",
    outputCostPer1M: "30.00"
  });

  const PANEL_SIZE = Object.freeze({
    MODES: Object.freeze(["auto", "compact", "medium", "large", "custom"]),
    PRESETS: Object.freeze({
      compact: Object.freeze({ width: 340, height: 520 }),
      medium: Object.freeze({ width: 420, height: 640 }),
      large: Object.freeze({ width: 500, height: 760 })
    }),
    AUTO: Object.freeze({
      widthRatio: 0.36, minWidth: 380, maxWidth: 520,
      heightRatio: 0.86, minHeight: 520, maxHeight: 780
    }),
    LIMITS: Object.freeze({
      minWidth: 320, maxWidth: 700,
      minHeight: 420, maxHeight: 900,
      edgeGap: 12
    })
  });

  const STORAGE_KEYS = Object.freeze({
    DRAFT: "ebayFillerV50Draft",
    RAW: "ebayFillerV50RawText",
    SETTINGS: "ebayFillerV50Settings",
    LOGS: "ebayFillerV50Logs",
    EBAY_PHOTOS: "ebayFillerV50A2EbayPhotos",
    SCREENSHOT_PHOTOS: "ebayFillerV50A2ScreenshotPhotos",
    CHECKLIST: "ebayFillerV50A2Checklist",
    USAGE: "ebayFillerV50A3UsageHistory",
    AI_CACHE: "ebayFillerV50A3AiCache",
    DRAFT_HISTORY: "ebayFillerV50A3DraftHistory",
    LAST_DIAGNOSTICS: "ebayFillerV50A3Diagnostics",
    PAGE_CONTEXT: "ebayFillerV639PageContext",
    EXCLUDED_QUESTIONS: "ebayFillerV680ExcludedItemSpecificQuestions",
    QUEUE: "ebayAiQueueV700Beta1",
    QUEUE_RUNNER: "ebayAiQueueRunnerV710",
    SETUP_SYNC: "ebayFillerV873PersistentSetupSynchronized"
  });

  global.EbayAiConstantsV790 = Object.freeze({
    VERSION,
    VERSION_LABEL,
    MODES,
    FILL_MODES,
    DEFAULT_SETTINGS,
    PANEL_SIZE,
    STORAGE_KEYS
  });
})(globalThis);

/* ===== shared/contracts_v3.js ===== */
/* Generated from Shared/contracts/v3/*.json. Do not edit by hand. */
(function initEbayContractsV3(global) {
  "use strict";
  const ENUMS = Object.freeze({"ai_status":["confirmed","needs_review"],"resolver_status":["confirmed_by_tag","confirmed_by_photo","supported_by_two_models","likely_correct","suggested","needs_review","conflict","not_filled","user_confirmed","user_corrected","cleared_by_user"],"evidence_type":["physical_tag","measurement","visual","none"],"evidence_scope":["whole_item","outer_shell","lining","trim","component","unknown"],"photo_role":["front","back","brand_size_tag","material_care_tag","measurement","detail","fabric_closeup","defect","none"],"review_reason":["none","no_evidence","low_confidence","ambiguous_visual_classification","invalid_ebay_option","conflicting_photos","missing_required_photo","unsupported_inference"],"validation_issue":["missing_field_response","duplicate_field_id","unknown_field_id","unknown_photo_source","invalid_confidence","multiple_values_for_single_select","invalid_enum","schema_repaired","missing_evidence_scope_defaulted","model_incomplete","model_refusal","parsed_output_missing"]});
  const FIELD_POLICIES = Object.freeze({"automatic":{"never_touch_control_type":[],"always_skip":["UPC","MPN"],"never_auto_fill":["California Prop 65 Warning","Personalization Instructions"],"low_value_optional":["Unit Quantity","Unit Type"],"evidence_only":["Material","Garment Care","Country of Origin","Country/Region of Manufacture","Country/Region of Origin","Year Manufactured","Year of Manufacture","Authenticity","Certification","Character","Character Family","Vintage","Handmade","Personalize","Customized","Fabric Weight","Performance/Activity","Cushioning Level","Midsole Type","Pronation","Heel to Toe Drop","Insulation Weight","Fill Power","Waterproof Rating"],"context_required":["Brand","Size","US Shoe Size","UK Shoe Size","EU Shoe Size","AU Shoe Size","Model","Product Line"],"strong_support":["Fit","Occasion","Theme","Season"]},"objective_visual":{"fields":["type","color","colour","pattern","closure","sleeve length"],"confidence_threshold":0.8,"allowed_evidence_types":["visual","physical_tag"]},"interpretational_visual":{"fields":["neckline","sleeve type","style","fabric type","features","accents"],"confidence_threshold":0.85,"allowed_evidence_types":["visual","physical_tag"]},"high_risk":{"fields":["brand","size","material","country of origin","country region of manufacture","garment care","model","product line"],"confidence_threshold":null,"required_evidence_type":"physical_tag","required_evidence_scope":"whole_item","review_assisted_autofill":false},"strict_both_modes":{"fields":["brand","size","us shoe size","uk shoe size","eu shoe size","au shoe size","material","country of origin","country region of manufacture","country region of origin","garment care","vintage","handmade","personalize","model","product line","fabric weight","performance activity","cushioning level","midsole type","pronation","heel to toe drop","insulation weight","fill power","waterproof rating"]}});
  global.EbayContractsV3 = Object.freeze({ AI_RESPONSE_SCHEMA_VERSION: 3, REVIEW_FILE_SCHEMA_VERSION: 3, ENUMS, FIELD_POLICIES });
})(globalThis);

/* Extension-resource URL boundary so UI containers do not depend on chrome.runtime. */
(function initExtensionUrlsV82310(global) {
  "use strict";
  if (global.EbayExtensionUrlsV82310) return;
  function get(path) {
    if (!global.chrome?.runtime?.getURL) return String(path || "");
    return chrome.runtime.getURL(String(path || ""));
  }
  global.EbayExtensionUrlsV82310 = Object.freeze({ get });
})(globalThis);
