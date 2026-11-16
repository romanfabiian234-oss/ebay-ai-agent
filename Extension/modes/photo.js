/* Photo/Autopilot orchestration using the shared core — V8.23.21. Root-cause accuracy guards added without changing the Fill Engine. */

/* ===== modes/photo.js ===== */
/* BLOCK 01 — OPEN DRAFT. Owns only locating/opening the eBay draft tab. */
(function initOpenDraftBlock(global) {
  "use strict";

  function extractDraftId(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      for (const [name, candidate] of url.searchParams.entries()) {
        if (name.toLowerCase().replace(/[^a-z0-9]/g, "") === "draftid" && /^[a-z0-9_-]{4,}$/i.test(candidate)) return candidate;
      }
    } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    const match = text.match(/[?&](?:draftId|draft_id)=([a-z0-9_-]{4,})/i);
    return match ? match[1] : "";
  }

  function isSupportedEbayUrl(value, { draftOnly = false } = {}) {
    try {
      const url = new URL(String(value || ""));
      if (!/(^|\.)ebay\.(com|ca|co\.uk)$/i.test(url.hostname)) return false;
      if (/\/sh\/lst\/active(?:\/|$)/i.test(url.pathname)) return false;
      return !draftOnly || Boolean(extractDraftId(url.href));
    } catch (_) { return false; }
  }

  async function current({ draftOnly = true } = {}) {
    if (!global.chrome?.tabs?.query) return null;
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs.find(tab => Number.isInteger(tab?.id) && isSupportedEbayUrl(tab.url, { draftOnly })) || null;
  }

  async function open({ tabId = null, url = "", active = false } = {}) {
    if (!isSupportedEbayUrl(url, { draftOnly: true })) throw new Error("Draft URL is not supported.");
    if (Number.isInteger(tabId)) return chrome.tabs.update(tabId, { url, active: Boolean(active) });
    return chrome.tabs.create({ url, active: Boolean(active) });
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.openDraft = Object.freeze({ extractDraftId, isSupportedEbayUrl, current, open });
})(globalThis);

/* ===== READ PHOTOS ===== */
/* BLOCK 02 — READ PHOTOS. Reads one stable snapshot of the current draft. */
(function initReadPhotosBlock(global) {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 45000;

  async function run({ tabId, draftId = "", strictCurrentDraft = true, timeoutMs = DEFAULT_TIMEOUT_MS, shouldContinue = null } = {}) {
    if (!Number.isInteger(tabId)) throw new Error("READ_PHOTOS requires an eBay tab.");
    const core = global.EbayCore?.ebay;
    if (!core?.readListing) throw new Error("Core eBay reader is not loaded.");
    if (typeof shouldContinue === "function" && !(await shouldContinue())) throw new Error("Operation stopped before READ_PHOTOS started.");

    // V8.11.0: the content-side reader performs lightweight readiness/stability checks
    // and then creates exactly one heavy listing snapshot. Do not repeatedly rebuild
    // the whole draft every few hundred milliseconds from the background worker.
    const safeTimeout = Math.max(7000, Math.min(Number(timeoutMs || DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS));
    const result = await core.readListing(tabId, {
      expectedDraftId: draftId || undefined,
      strictCurrentDraft: Boolean(strictCurrentDraft && draftId),
      photoLimit: 25,
      requirePhotos: true,
      readinessTimeoutMs: Math.min(12000, safeTimeout),
      photoReadinessTimeoutMs: Math.min(3500, safeTimeout)
    }, safeTimeout);

    if (typeof shouldContinue === "function" && !(await shouldContinue())) throw new Error("Operation stopped after READ_PHOTOS.");
    if (result?.actualDraftId && draftId && result.actualDraftId !== draftId) {
      throw new Error(`Safety check stopped: expected draft ${draftId}, but draft ${result.actualDraftId} is open.`);
    }
    const questions = Array.isArray(result?.routeQuestions) && result.routeQuestions.length
      ? result.routeQuestions
      : Object.keys(result?.pageContext?.fieldSummary || {});
    if (result?.ok && result?.ready !== false && questions.length && Array.isArray(result.photos) && result.photos.length) return result;
    throw new Error(result?.message || "READ_PHOTOS could not create a stable current-draft snapshot before its timeout.");
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.readPhotos = Object.freeze({ run, DEFAULT_TIMEOUT_MS });
})(globalThis);

/* ===== READ FIELDS ===== */
/* BLOCK 03 — READ FIELDS. Converts the draft snapshot into the exact eBay question route. */
(function initReadFieldsBlock(global) {
  "use strict";

  function clean(value, limit = 140) { return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }
  function key(value) { return clean(value, 140).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  function shouldAlwaysSkip(label) {
    return Boolean(global.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label));
  }

  function hasMeaningfulCurrentValue(value) {
    const normalized = key(value);
    if (!normalized) return false;
    return ![
      "select", "select option", "choose", "choose option", "search", "enter your own",
      "add custom value", "not selected", "none selected"
    ].includes(normalized);
  }

  function run(read = {}, { excludedQuestions = [], reviewMode = false, includeFilled = false } = {}) {
    const excluded = new Set((Array.isArray(excludedQuestions) ? excludedQuestions : []).map(key).filter(Boolean));
    const route = Array.isArray(read.routeQuestions) && read.routeQuestions.length
      ? read.routeQuestions
      : Object.keys(read.pageContext?.fieldSummary || {});
    const fieldCatalog = Array.isArray(read.pageContext?.fieldCatalog) && read.pageContext.fieldCatalog.length
      ? read.pageContext.fieldCatalog
      : (Array.isArray(read.pageContext?.fields) ? read.pageContext.fields : (Array.isArray(read.fields) ? read.fields : []));
    const byField = new Map(fieldCatalog.map(field => [key(field?.name || field?.label), field]));

    const seen = new Set();
    const visible = [];
    for (const raw of route) {
      const question = clean(raw);
      const normalized = key(question);
      if (!question || !normalized || seen.has(normalized) || excluded.has(normalized)) continue;
      seen.add(normalized);
      visible.push(question);
    }

    const policy = global.EbayAiItemSpecificsV7100;
    const skipped = visible.filter(shouldAlwaysSkip);
    const policySkippedQuestions = [];
    const textSkippedQuestions = [];
    const lowValueSkippedQuestions = [];
    const evidenceOnlyQuestions = [];
    const contextRequiredQuestions = [];
    const preservedQuestions = [];
    const questions = [];

    for (const question of visible) {
      if (shouldAlwaysSkip(question)) continue;
      const field = byField.get(key(question)) || { name: question, label: question };
      const type = String(field.type || "").toLowerCase();
      let decision = null;
      if (!reviewMode) {
        decision = policy?.automaticDecision
          ? policy.automaticDecision(field)
          : { allow: true, reason: "allowed", evidenceOnly: false, contextRequired: false };
        if (!decision.allow) {
          policySkippedQuestions.push(question);
          if (decision.reason === "text_field" || decision.reason === "never_auto_fill") textSkippedQuestions.push(question);
          if (decision.reason === "low_value_optional") lowValueSkippedQuestions.push(question);
          continue;
        }
        if (decision.evidenceOnly) evidenceOnlyQuestions.push(question);
        if (decision.contextRequired) contextRequiredQuestions.push(question);
      }
      // V8.23.21 accuracy rule: every safe Item Specific is analyzed even when eBay
      // already contains a value. Existing form values are not evidence and may be
      // stale/wrong. The shared Fill Engine remains idempotent: if GPT confirms the
      // same value it reports already-set; if GPT cannot support a strict field it
      // returns no answer and the existing value is left untouched.
      // `includeFilled` is kept in the public signature for backward compatibility,
      // but normal Photo/Queue no longer skip filled safe fields.
      questions.push(question);
    }

    return {
      questions,
      visibleQuestions: visible,
      skippedQuestions: skipped,
      policySkippedQuestions,
      textSkippedQuestions,
      lowValueSkippedQuestions,
      evidenceOnlyQuestions: evidenceOnlyQuestions.filter(question => questions.includes(question)),
      contextRequiredQuestions: contextRequiredQuestions.filter(question => questions.includes(question)),
      preservedQuestions,
      fieldCatalog,
      requestedQuestionCount: questions.length,
      preservedQuestionCount: preservedQuestions.length,
      policySkippedCount: policySkippedQuestions.length
    };
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.readFields = Object.freeze({ run, key, shouldAlwaysSkip, hasMeaningfulCurrentValue });
})(globalThis);

/* ===== AI ANALYSIS ===== */
/* BLOCK 04 — AI ANALYSIS. One primary GPT request plus at most one small targeted repair; full verification is reserved for Review Mode. */
(function initAiAnalysisBlock(global) {
  "use strict";

  function clean(value, limit = 500) { return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }

  const SHARED_CACHE_KEY = "ebayAiSharedAnalysisCacheV8193";
  const SHARED_CACHE_TTL_MS = 30 * 60 * 1000;
  const SHARED_CACHE_MAX = 12;

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function imageIdentity(image = {}) {
    return clean(image.photoId || image.canonicalUrl || image.url || image.src || image.name || "", 1600);
  }

  function normalizedCurrentState(prepared = {}) {
    const summary = prepared.pageContext?.fieldSummary && typeof prepared.pageContext.fieldSummary === "object"
      ? prepared.pageContext.fieldSummary
      : {};
    const catalog = Array.isArray(prepared.pageContext?.fieldCatalog)
      ? prepared.pageContext.fieldCatalog
      : Array.isArray(prepared.fields) ? prepared.fields : [];
    const byKey = new Map();
    for (const field of catalog) {
      const label = clean(field?.label || field?.field || field?.name || "", 180);
      if (!label) continue;
      const value = clean(field?.currentValue ?? field?.value ?? "", 500);
      byKey.set(label.toLowerCase(), value);
    }
    const questionLabels = Array.isArray(prepared.questions)
      ? prepared.questions.map(question => clean(question?.label || question?.field || question?.name || question, 180)).filter(Boolean)
      : [];
    const labels = questionLabels.length ? questionLabels : Array.from(new Set([
      ...Object.keys(summary),
      ...catalog.map(field => clean(field?.label || field?.field || field?.name || "", 180)).filter(Boolean)
    ]));
    return labels
      .map(label => {
        const direct = Object.prototype.hasOwnProperty.call(summary, label) ? summary[label] : undefined;
        return [label.toLowerCase(), clean(direct ?? byKey.get(label.toLowerCase()) ?? "", 500)];
      })
      .sort((left, right) => left[0].localeCompare(right[0]));
  }

  function cacheFingerprint(prepared = {}) {
    const draftId = clean(prepared.pageContext?.actualDraftId || prepared.pageContext?.draftId || prepared.pageContext?.url?.match?.(/[?&](?:draftId|draft_id)=([^&#]+)/i)?.[1] || "", 180);
    const images = (prepared.images || []).map(imageIdentity).filter(Boolean);
    const allImages = (prepared.allImages || prepared.images || []).map(imageIdentity).filter(Boolean);
    const model = clean(prepared.requestSettings?.apiModel || "", 180);
    const endpoint = clean(`${prepared.requestSettings?.apiBaseUrl || ""}|${prepared.requestSettings?.apiPath || ""}`, 500);
    // V8.23.21: a manual correction must invalidate an old AI result. Current
    // values are fingerprint-only data; Fast Fill still does not expose them to GPT.
    const currentState = normalizedCurrentState(prepared);
    const material = JSON.stringify({ schema: "root-accuracy-v8.23.0", draftId, model, endpoint, prompt: prepared.prompt || "", images, allImages, currentState });
    return { key: hashText(material), draftId, cacheable: !prepared.reviewMode && Boolean(draftId) && images.length > 0 && allImages.every(value => !/^data:/i.test(value)) };
  }

  async function readCache() {
    try {
      const storage = global.chrome?.storage?.session;
      if (!storage?.get) return [];
      const stored = await storage.get(SHARED_CACHE_KEY);
      return Array.isArray(stored?.[SHARED_CACHE_KEY]) ? stored[SHARED_CACHE_KEY] : [];
    } catch (_) { return []; }
  }

  async function writeCache(entries) {
    try {
      const storage = global.chrome?.storage?.session;
      if (!storage?.set) return false;
      await storage.set({ [SHARED_CACHE_KEY]: entries.slice(0, SHARED_CACHE_MAX) });
      return true;
    } catch (_) { return false; }
  }

  async function loadCached(prepared = {}) {
    const fingerprint = cacheFingerprint(prepared);
    if (!fingerprint.cacheable) return null;
    const now = Date.now();
    const entries = (await readCache()).filter(entry => now - Number(entry?.createdAt || 0) <= SHARED_CACHE_TTL_MS);
    const hit = entries.find(entry => entry?.key === fingerprint.key && entry?.draftId === fingerprint.draftId);
    if (!hit?.response) return null;
    return {
      ...hit.response,
      usage: { ...(hit.response.usage || {}), cached: true, cost: 0 },
      cacheHit: true,
      cacheKey: fingerprint.key,
      prepared
    };
  }

  async function storeCached(prepared = {}, response = {}) {
    const fingerprint = cacheFingerprint(prepared);
    if (!fingerprint.cacheable || !response?.ok) return false;
    let serialized = "";
    let safeResponse = null;
    try {
      safeResponse = { ...response };
      delete safeResponse.prepared;
      delete safeResponse.raw;
      serialized = JSON.stringify(safeResponse);
    } catch (_) { return false; }
    if (!serialized || serialized.length > 500000 || /data:image\//i.test(serialized)) return false;
    try { safeResponse = JSON.parse(serialized); } catch (_) { return false; }
    const now = Date.now();
    const entries = (await readCache()).filter(entry => now - Number(entry?.createdAt || 0) <= SHARED_CACHE_TTL_MS && entry?.key !== fingerprint.key);
    entries.unshift({ key: fingerprint.key, draftId: fingerprint.draftId, createdAt: now, response: safeResponse });
    return writeCache(entries);
  }

  function normalSettings(settings = {}, reviewMode = false) {
    const modeCap = settings.tokenMode === "cheap" ? 4 : settings.tokenMode === "quality" ? 8 : 6;
    const requestedPhotos = Number(settings.maxPhotosPerRequest);
    const legacyPhotoPolicy = String(settings.analysisPhotoPolicyVersion || "") !== "3";
    // V8.23.21 keeps the V8.23.12 cost-aware caps that reversed the expensive
    // V8.23.11 10-photo migration. Balanced defaults to six carefully selected
    // photos; Quality keeps eight, Cheap four.
    // Existing custom values are preserved only when they are already inside the
    // new cap; older 10-photo defaults migrate down automatically.
    const safePhotoCount = legacyPhotoPolicy
      ? modeCap
      : (Number.isFinite(requestedPhotos) && requestedPhotos > 0 ? requestedPhotos : modeCap);
    const next = {
      ...settings,
      webResearchEnabled: false,
      autoFillDescriptionCondition: false,
      maxPhotosPerRequest: String(Math.max(1, Math.min(safePhotoCount, modeCap))),
      analysisPhotoPolicyVersion: "3",
      reviewFillMode: reviewMode ? "safe" : "best_answer"
    };
    if (!reviewMode) {
      next.claudeReviewEnabled = false;
      next.localOcrValidationEnabled = false;
    }
    return next;
  }

  function selectImages(photos = [], settings = {}) {
    const selector = global.EbayAiPhotoSelectorV790;
    const list = Array.isArray(photos) ? photos : [];
    if (selector?.selectPhotos) return selector.selectPhotos(list, settings).map((photo, index) => ({ ...photo, requestPhotoNumber: index + 1 }));
    return list.slice(0, Math.max(1, Math.min(Number(settings.maxPhotosPerRequest || 6), 10))).map((photo, index) => ({ ...photo, requestPhotoNumber: index + 1 }));
  }

  function estimate(prompt, images, settings, questions = [], fields = []) {
    const request = global.EbayAiRequestV711;
    const policy = global.EbayAiItemSpecificsV7100;
    const textTokens = Math.max(1, Math.ceil(String(prompt || "").length / 4));
    const perImage = settings.tokenMode === "quality" ? 1400 : settings.tokenMode === "cheap" ? 350 : 500;
    const primaryInputTokens = textTokens + (images || []).length * perImage;
    const maxOut = request?.effectiveOutputTokenLimit ? request.effectiveOutputTokenLimit(settings) : Number(settings.maxOutputTokens || 8000);
    const primaryOutputTokens = Math.min(maxOut, settings.tokenMode === "quality" ? 2600 : settings.tokenMode === "cheap" ? 700 : 1700);
    const primaryEstimatedCost = request?.costFromTokens ? request.costFromTokens(primaryInputTokens, primaryOutputTokens, settings) : 0;

    const byKey = new Map((Array.isArray(fields) ? fields : []).map(field => [clean(field?.name || field?.label || "", 180).toLowerCase(), field]));
    const strictQuestionCount = (Array.isArray(questions) ? questions : []).filter(question => {
      const label = clean(question?.label || question?.field || question, 180);
      return policy?.requiresIndependentVerification?.(byKey.get(label.toLowerCase()) || { name: label }) === true;
    }).length;
    // V8.23.21 reserves a bounded worst-case repair budget without assuming that
    // every strict field will be re-read. Normal Fill now accepts valid direct primary
    // support; repair is for unresolved/rejected/conflicting evidence only.
    const repairQuestionCount = Math.min(8, strictQuestionCount);
    const repairImageCap = settings.tokenMode === "quality" ? 3 : 2;
    const repairImageCount = repairQuestionCount ? Math.min(repairImageCap, Math.max(1, (images || []).length)) : 0;
    const repairInputTokens = repairQuestionCount ? Math.ceil(textTokens * 0.55) + repairImageCount * perImage : 0;
    const repairOutputTokens = repairQuestionCount ? Math.min(maxOut, Math.max(500, 220 + repairQuestionCount * 90)) : 0;
    const repairEstimatedCost = request?.costFromTokens ? request.costFromTokens(repairInputTokens, repairOutputTokens, settings) : 0;
    return {
      estimatedInputTokens: primaryInputTokens + repairInputTokens,
      estimatedOutputTokens: primaryOutputTokens + repairOutputTokens,
      primaryEstimatedCost,
      repairEstimatedCost,
      estimatedCost: primaryEstimatedCost + repairEstimatedCost,
      photoCount: (images || []).length,
      repairPhotoCount: repairImageCount,
      repairQuestionCount,
      includesPossibleRepair: repairQuestionCount > 0,
      mode: settings.tokenMode || "balanced"
    };
  }

  function prepare({ settings = {}, read = {}, questions = [], reviewMode = false, customInstruction = "" } = {}) {
    const requestSettings = normalSettings(settings, reviewMode);
    const selector = global.EbayAiPhotoSelectorV790;
    const allImages = selector?.filterPhotos ? selector.filterPhotos(read.photos || []) : (Array.isArray(read.photos) ? read.photos : []);
    const images = selectImages(allImages, requestSettings);
    if (!images.length) throw new Error("AI_ANALYSIS received no usable product photos.");
    if (!Array.isArray(questions) || !questions.length) throw new Error("AI_ANALYSIS received no Item Specific questions.");
    const pageContext = { ...(read.pageContext || {}), actualDraftId: read.actualDraftId || read.draftId || read.pageContext?.actualDraftId || "", draftId: read.draftId || read.actualDraftId || read.pageContext?.draftId || "" };
    const prompt = global.EbayAiPromptV711.buildItemSpecificsPrompt({
      existingTitle: pageContext.currentTitle || "not available",
      category: pageContext.category || "not available",
      questions,
      fields: pageContext.fieldCatalog || pageContext.fields || [],
      pageContext,
      currentValues: pageContext.fieldSummary || {},
      customInstruction: customInstruction || requestSettings.customAiInstruction || "",
      purpose: reviewMode ? "review" : "fill"
    });
    return { requestSettings, images, allImages, questions, pageContext, prompt, customInstruction, estimate: estimate(prompt, images, requestSettings, questions, pageContext.fieldCatalog || pageContext.fields || []), reviewMode };
  }

  async function runPrepared(prepared = {}, { onStage = null, primaryTimeoutMs = 75000, skipCacheLookup = false } = {}) {
    if (!skipCacheLookup) {
      const cached = await loadCached(prepared);
      if (cached) return cached;
    }
    const core = global.EbayCore?.ai;
    if (!core) throw new Error("Core AI is not loaded.");
    const payload = {
      mode: prepared.reviewMode ? "review" : "fill",
      reviewMode: prepared.reviewMode === true,
      settings: prepared.requestSettings,
      images: prepared.images,
      allImages: prepared.allImages || prepared.images,
      imagesPrepared: true,
      prompt: prepared.prompt,
      questions: prepared.questions,
      pageContext: prepared.pageContext,
      existingTitle: prepared.pageContext?.currentTitle || "not available",
      category: prepared.pageContext?.category || "not available",
      customInstruction: prepared.customInstruction || prepared.requestSettings?.customAiInstruction || "",
      estimate: prepared.estimate,
      allowRecovery: prepared.reviewMode === true || prepared.requestSettings?.fastFillRepairEnabled !== false,
      primaryTimeoutMs: Math.max(30000, Math.min(Number(primaryTimeoutMs || 75000), 90000)),
      recoveryTimeoutMs: Math.max(25000, Math.min(Number(prepared.requestSettings?.claudeTimeoutMs || 45000), 75000)),
      onStage
    };
    const response = global.document ? await core.run(payload) : await core.analyzeListing(payload);
    if (!response?.ok) throw new Error(clean(response?.message || "AI analysis failed.", 700));
    const result = { ...response, usage: { ...(response.usage || {}), cached: false }, cacheHit: false, prepared };
    await storeCached(prepared, result);
    return result;
  }

  async function run(options = {}) {
    const prepared = prepare(options);
    const cached = await loadCached(prepared);
    if (cached) return cached;
    if (typeof options.beforeRequest === "function") await options.beforeRequest(prepared);
    return runPrepared(prepared, { ...options, skipCacheLookup: true });
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.aiAnalysis = Object.freeze({ prepare, runPrepared, run, selectImages, normalSettings, estimate, cacheFingerprint, loadCached });
})(globalThis);

/* ===== modes/photo.js ===== */
/* ONE ITEM PROCESS — the single automatic listing route used by Autopilot and Queue. */
(function initOneItemProcess(global) {
  "use strict";

  const now = () => Date.now();
  async function emit(options, block, status, details = {}) {
    if (typeof options.onStage !== "function") return;
    try { await options.onStage({ block, status, at: new Date().toISOString(), ...details }); }
    catch (error) { console.warn("[ONE_ITEM_PROCESS] stage observer failed", block, status, error?.message || error); }
  }
  async function ensureRunning(options) {
    if (typeof options.shouldContinue === "function" && !(await options.shouldContinue())) throw new Error("Operation stopped safely.");
  }

  async function run(options = {}) {
    const blocks = global.EbayBlocksV890;
    if (!blocks?.readPhotos || !blocks?.readFields || !blocks?.aiAnalysis || !blocks?.matchEbay || !blocks?.fillFields || !blocks?.save) {
      throw new Error("ONE_ITEM_PROCESS blocks are not fully loaded.");
    }
    const timings = {};
    const started = now();
    await ensureRunning(options);

    let t = now();
    await emit(options, "02_READ_PHOTOS", "started");
    const read = options.read || await blocks.readPhotos.run({
      tabId: options.tabId,
      draftId: options.draftId || "",
      strictCurrentDraft: options.strictCurrentDraft !== false,
      timeoutMs: options.readTimeoutMs || 45000,
      shouldContinue: options.shouldContinue
    });
    timings.readPhotosMs = now() - t;
    await emit(options, "02_READ_PHOTOS", "completed", { durationMs: timings.readPhotosMs, photoCount: read.photos?.length || 0 });
    await ensureRunning(options);

    t = now();
    await emit(options, "03_READ_FIELDS", "started");
    const fields = blocks.readFields.run(read, { excludedQuestions: options.excludedQuestions || [], reviewMode: false, includeFilled: options.includeFilled === true });
    timings.readFieldsMs = now() - t;
    await emit(options, "03_READ_FIELDS", "completed", {
      durationMs: timings.readFieldsMs,
      questionCount: fields.questions.length,
      preservedQuestionCount: fields.preservedQuestions?.length || 0,
      skippedQuestions: fields.skippedQuestions,
      policySkippedQuestions: fields.policySkippedQuestions,
      evidenceOnlyQuestions: fields.evidenceOnlyQuestions
    });
    await ensureRunning(options);

    if (!fields.questions.length) {
      timings.totalMs = now() - started;
      const analysis = { ok: true, skipped: true, cacheHit: false, answers: {}, usage: { cached: false, cost: 0 }, message: "All non-multi Item Specifics are already set; GPT was not needed." };
      const matched = { answers: {}, unresolved: [], fallbackCandidates: {}, answerCount: 0 };
      const fill = { ok: true, filled: 0, already: 0, partial: 0, review: 0, skipped: 0, valuesFilled: 0, answerCount: 0, changed: false, message: "No eligible Item Specifics required GPT/Fill." };
      const save = { ok: true, confirmed: true, changed: false, message: "No new field values required autosave." };
      if (typeof options.afterAnalysis === "function") await options.afterAnalysis(analysis);
      await emit(options, "04_AI_ANALYSIS", "completed", { durationMs: 0, answerCount: 0, cacheHit: false, skipped: true, final: true });
      await emit(options, "06_FILL_FIELDS", "completed", { durationMs: 0, fill });
      await emit(options, "07_SAVE", "completed", { durationMs: 0, save });
      return { ok: true, read, fields, analysis, matched, answers: {}, fill, save, timings, message: `ONE_ITEM_PROCESS finished without GPT: no eligible Item Specifics; ${(timings.totalMs / 1000).toFixed(1)}s.` };
    }

    t = now();
    await emit(options, "04_AI_ANALYSIS", "started", { questionCount: fields.questions.length });
    const analysis = await blocks.aiAnalysis.run({
      settings: options.settings || {},
      read,
      questions: fields.questions,
      reviewMode: false,
      customInstruction: options.customInstruction || "",
      primaryTimeoutMs: options.primaryTimeoutMs || 75000,
      beforeRequest: options.beforeRequest,
      onStage: async event => emit(options, "04_AI_ANALYSIS", event?.status || "progress", { aiStage: event?.stage || "primary", ...event })
    });
    timings.aiMs = now() - t;
    timings.primaryMs = Number(analysis.timings?.primaryMs || 0);
    timings.recoveryMs = Number(analysis.timings?.recoveryMs || 0);
    timings.validationMs = Number(analysis.timings?.validationMs || 0);
    await emit(options, "04_AI_ANALYSIS", "completed", {
      durationMs: timings.aiMs,
      answerCount: Object.keys(analysis.answers || {}).length,
      estimate: analysis.prepared?.estimate || {},
      cacheHit: analysis.cacheHit === true,
      promptChars: Number(analysis.prepared?.prompt?.length || 0),
      photoCount: Number(analysis.prepared?.images?.length || 0),
      repairUsed: analysis.recoveryUsed === true,
      repairCount: Number(analysis.recoveryQuestions?.length || 0),
      repairPhotoCount: Number(analysis.fastRepairPhotoCount || 0),
      repairSkippedDirectCount: Number(analysis.fastRepairSkippedDirect?.length || 0),
      repairFields: Array.isArray(analysis.fastRepairQuestions) ? analysis.fastRepairQuestions.slice(0, 12) : [],
      repairReasons: Array.isArray(analysis.fastRepairDecisions) ? analysis.fastRepairDecisions.filter(item => item?.action === "repair").map(item => ({ field: item.field, code: item.code })).slice(0, 12) : [],
      requestCosts: Array.isArray(analysis.confirmations) ? analysis.confirmations.map(item => ({ stage: item.stage, inputTokens: Number(item.inputTokens || 0), outputTokens: Number(item.outputTokens || 0), totalTokens: Number(item.totalTokens || 0), cost: Number(item.cost || 0) })) : [],
      openAiRequestsAttempted: Number(analysis.openAiRequestsAttempted || 0),
      openAiRequestLimit: Number(analysis.openAiRequestLimit || 2),
      itemCost: Number(analysis.itemCost || 0),
      itemCostKnown: analysis.itemCostKnown === true,
      itemCostTarget: Number(analysis.itemCostTarget || 0.07),
      itemCostTargetMet: analysis.itemCostTargetMet,
      primaryMs: timings.primaryMs,
      recoveryMs: timings.recoveryMs,
      aiTotalMs: timings.aiMs,
      final: true
    });
    if (typeof options.afterAnalysis === "function") await options.afterAnalysis(analysis);
    await ensureRunning(options);

    t = now();
    await emit(options, "05_MATCH_EBAY", "started");
    const matched = blocks.matchEbay.run({ analysis, questions: fields.questions, fields: fields.fieldCatalog, pageContext: read.pageContext || {}, reviewMode: false, automaticPolicy: true });
    timings.matchMs = now() - t;
    await emit(options, "05_MATCH_EBAY", "completed", { durationMs: timings.matchMs, answerCount: matched.answerCount, unresolved: matched.unresolved, policyOmitted: matched.policyOmitted });
    await ensureRunning(options);

    t = now();
    await emit(options, "06_FILL_FIELDS", "started", { answerCount: matched.answerCount });
    const fill = await blocks.fillFields.run({
      tabId: options.tabId,
      draftId: options.draftId || read.actualDraftId || "",
      answers: matched.answers,
      questions: fields.questions,
      omittedQuestions: [],
      mode: options.mode || "automatic",
      timeoutMs: options.fillTimeoutMs || 70000
    });
    timings.fillMs = now() - t;
    await emit(options, "06_FILL_FIELDS", "completed", { durationMs: timings.fillMs, fill });
    await ensureRunning(options);

    t = now();
    await emit(options, "07_SAVE", "started");
    const save = await blocks.save.run({
      tabId: options.tabId,
      draftId: options.draftId || read.actualDraftId || "",
      fill,
      timeoutMs: options.saveTimeoutMs || 12000,
      baselineValues: read.pageContext?.fieldSummary || {},
      expectedAnswers: matched.answers || {}
    });
    timings.saveMs = now() - t;
    timings.totalMs = now() - started;
    await emit(options, "07_SAVE", "completed", { durationMs: timings.saveMs, save });

    return {
      ok: fill?.ok !== false && save?.ok !== false,
      read,
      fields,
      analysis,
      matched,
      answers: matched.answers,
      fill,
      save,
      timings,
      message: `ONE_ITEM_PROCESS finished: ${matched.answerCount}/${fields.questions.length} requested answer(s), ${fields.policySkippedQuestions?.length || 0} policy-skipped, ${matched.policyOmitted?.length || 0} safely omitted, ${Number(fill?.filled || 0)} filled, ${Number(fill?.already || 0)} already, ${Number(fill?.review || 0) + Number(fill?.partial || 0)} need fill review, AI ${analysis.cacheHit ? "cache" : "request"}, save ${save?.ok === false ? "warning" : (save?.confirmed ? "confirmed" : "no visible transition")}, ${(timings.totalMs / 1000).toFixed(1)}s total [read ${((timings.readPhotosMs + timings.readFieldsMs) / 1000).toFixed(1)}s, AI ${(timings.aiMs / 1000).toFixed(1)}s, match ${(timings.matchMs / 1000).toFixed(1)}s, fill ${(timings.fillMs / 1000).toFixed(1)}s, save ${(timings.saveMs / 1000).toFixed(1)}s].`
    };
  }

  global.EbayOneItemProcessV890 = Object.freeze({ run });
})(globalThis);

/* ===== AUTOPILOT MODE ===== */
/* Autopilot Mode: current draft -> ONE_ITEM_PROCESS. It owns no read/AI/fill logic. */
(function initAutopilotMode(global) {
  "use strict";
  async function run(options = {}) {
    if (!global.EbayOneItemProcessV890?.run) throw new Error("ONE_ITEM_PROCESS is not loaded.");
    return global.EbayOneItemProcessV890.run({ ...options, mode: "autopilot" });
  }
  global.EbayAutopilotModeV890 = Object.freeze({ run, processOwner: "modes/photo.js" });
})(globalThis);

/* ===== PHOTO MODE ===== */
/* Photo Mode: manual buttons launch the same shared blocks; no private analyzer or Fill exists here. */
(function initPhotoMode(global) {
  "use strict";
  global.EbayPhotoModeV890 = Object.freeze({
    owners: Object.freeze({ photos: "02_READ_PHOTOS", fields: "03_READ_FIELDS", ai: "04_AI_ANALYSIS", match: "05_MATCH_EBAY", fill: "06_FILL_FIELDS", save: "07_SAVE" })
  });
})(globalThis);

/* ===== MANUAL MODE ===== */
/* Manual Mode ownership map. Buttons launch the same shared blocks used by Autopilot/Queue. */
(function initManualMode(global) {
  "use strict";
  global.EbayManualModeV890 = Object.freeze({
    readPhotos: options => global.EbayBlocksV890.readPhotos.run(options),
    readFields: (read, options = {}) => global.EbayBlocksV890.readFields.run(read, options),
    analyze: options => global.EbayBlocksV890.aiAnalysis.run(options),
    match: options => global.EbayBlocksV890.matchEbay.run(options),
    fillAll: options => global.EbayBlocksV890.fillFields.run(options),
    save: options => global.EbayBlocksV890.save.run(options),
    owners: Object.freeze({ photos: "02_READ_PHOTOS", fields: "03_READ_FIELDS", ai: "04_AI_ANALYSIS", match: "05_MATCH_EBAY", fill: "06_FILL_FIELDS", save: "07_SAVE" })
  });
})(globalThis);
