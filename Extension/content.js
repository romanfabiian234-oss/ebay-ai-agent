/* V8.23.21 — single marketplace page runtime.
   eBay keeps its verified reader/Queue/Review path. Depop and Poshmark reuse the same
   Fill Engine through isolated platform adapters and never publish listings. */
(function initEbayPageRuntime(global) {
  "use strict";

  const VERSION = "8.23.21";
  const MESSAGES = global.EbayAiMessagesV800 || {};
  const PLATFORM = global.MarketplacePlatformV8200?.detect?.() || "ebay";
  const PLATFORM_LABEL = global.MarketplacePlatformV8200?.label?.(PLATFORM) || "eBay";
  const marketplaceAdapter = () => global.MarketplaceAdaptersV8200?.get?.(PLATFORM) || null;
  const reloadPageMessage = () => PLATFORM === "ebay"
    ? "Extension was reloaded. Refresh this eBay tab once."
    : `Extension was reloaded. Refresh this ${PLATFORM_LABEL} tab once.`;
  if (global.__EBAY_AI_PAGE_RUNTIME_VERSION__ === VERSION) return;
  global.__EBAY_AI_PAGE_RUNTIME_VERSION__ = VERSION;
  if (global.top !== global) return;

  let stopRequested = false;
  let preparedMap = null;
  let activeFillCount = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

  function clean(value, limit = 300) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function runtimeContextAlive() {
    try { return Boolean(global.chrome?.runtime?.id); }
    catch (_) { return false; }
  }

  function safeRuntimeMessage(message, callback = null) {
    if (!runtimeContextAlive()) {
      if (typeof callback === "function") callback(null, reloadPageMessage());
      return false;
    }
    try {
      chrome.runtime.sendMessage(message, response => {
        let errorMessage = "";
        try { errorMessage = chrome.runtime.lastError?.message || ""; }
        catch (_) { errorMessage = "Extension context was invalidated."; }
        if (typeof callback === "function") callback(response, errorMessage);
      });
      return true;
    } catch (_) {
      if (typeof callback === "function") callback(null, reloadPageMessage());
      return false;
    }
  }

  function visible(element) {
    if (!element || element.isConnected === false) return false;
    try {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    } catch (_) {
      return false;
    }
  }

  async function closePreparedMenus() {
    if (!(preparedMap instanceof Map)) return;
    for (const field of preparedMap.values()) {
      try {
        await field.close?.();
      } catch (error) {
        console.warn("[eBay AI] menu cleanup failed", field?.label || field?.name || "field", error?.message || error);
      }
    }
  }

  function autosaveSignal() {
    const nodes = Array.from(document.querySelectorAll("[role='status'],[aria-live],[data-testid*='save' i],[class*='save-status' i],[class*='autosave' i]")).slice(0, 100);
    let positive = "", negative = "", pending = "";
    for (const node of nodes) {
      if (!visible(node)) continue;
      const text = clean(node.getAttribute?.("aria-label") || node.textContent || "", 160);
      if (!text) continue;
      if (/\b(error|failed|could not save|not saved)\b/i.test(text)) negative ||= text;
      else if (/\b(saving|updating|please wait)\b/i.test(text)) pending ||= text;
      else if (/\b(saved|changes saved|updated)\b/i.test(text)) positive ||= text;
    }
    return { positive, negative, pending };
  }

  async function waitAutosave({ expectedDraftId = "", changed = false, timeoutMs = 10000, baselineValues = {}, expectedAnswers = {} } = {}) {
    const pageFields = global.EbayPageFieldsV810;
    const actualDraftId = pageFields?.draftIdFromUrl?.() || "";
    if (expectedDraftId && actualDraftId && expectedDraftId !== actualDraftId) {
      return { ok: false, confirmed: false, message: `Draft safety check failed: expected ${expectedDraftId}, open page is ${actualDraftId}.` };
    }
    if (!changed) return { ok: true, confirmed: true, changed: false, stabilized: true, message: "No new field values required autosave." };

    const deadline = Date.now() + Math.max(1800, Math.min(Number(timeoutMs || 10000), 12000));
    const stableWindowMs = 1800;
    let sawPending = false;
    let sawPositive = false;
    let valueChangesObserved = 0;
    let lastSignature = pageFields?.fieldValueSignature?.() || "";
    let valueStableSince = Date.now();
    let last = autosaveSignal();

    while (Date.now() < deadline) {
      last = autosaveSignal();
      if (last.negative) return { ok: false, confirmed: false, stabilized: false, sawPending, valueChangesObserved, ...last, message: `eBay autosave reported a problem: ${last.negative}` };
      if (last.pending) sawPending = true;
      if (last.positive) sawPositive = true;

      const signature = pageFields?.fieldValueSignature?.() || "";
      if (signature && lastSignature && signature !== lastSignature) {
        valueChangesObserved += 1;
        valueStableSince = Date.now();
      } else if (signature && !lastSignature) {
        valueStableSince = Date.now();
      }
      if (signature) lastSignature = signature;

      const stableForMs = Date.now() - valueStableSince;
      if (!last.pending && stableForMs >= stableWindowMs) {
        const finalValues = pageFields?.fieldValueMap?.() || {};
        const normalize = value => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
        const finalByKey = new Map(Object.entries(finalValues).map(([label, value]) => [normalize(label), { label, value }]));
        const expectedKeys = new Set(Object.keys(expectedAnswers || {}).map(normalize));
        const unexpectedChanges = [];
        for (const [label, before] of Object.entries(baselineValues || {})) {
          const normalizedLabel = normalize(label);
          if (!normalizedLabel || expectedKeys.has(normalizedLabel)) continue;
          const final = finalByKey.get(normalizedLabel);
          if (!final) continue;
          if (normalize(before) !== normalize(final.value)) unexpectedChanges.push({ field: final.label || label, before: String(before ?? ""), after: String(final.value ?? "") });
        }
        if (unexpectedChanges.length) {
          return {
            ok: false, confirmed: false, stabilized: true, reviewRequired: true, sawPending, sawPositive, valueChangesObserved, stableForMs, unexpectedChanges, ...last,
            message: `eBay changed ${unexpectedChanges.length} unrequested Item Specific field(s) after Fill; review this draft before continuing.`
          };
        }
        return {
          ok: true, confirmed: true, stabilized: true, sawPending, sawPositive, valueChangesObserved, stableForMs, unexpectedChanges: [], ...last,
          message: sawPositive
            ? "eBay autosave confirmed and Item Specifics remained stable."
            : "Item Specifics remained stable and no Saving/error state remained."
        };
      }
      await sleep(80);
    }

    const stableForMs = Date.now() - valueStableSince;
    return {
      ok: false,
      confirmed: false,
      stabilized: false,
      reviewRequired: true,
      sawPending, sawPositive, valueChangesObserved, stableForMs,
      ...last,
      message: last.pending
        ? "Autosave is still showing Saving; review this draft before continuing."
        : "Item Specifics did not remain stable long enough to confirm the final saved state."
    };
  }

  function registerCoreAdapters() {
    const engine = global.EbayAiFillEngineV790;
    if (!engine?.registerAdapters) return false;
    if (PLATFORM === "ebay") {
      const pageFields = global.EbayPageFieldsV810;
      if (!pageFields) return false;
      engine.registerAdapters({
        beginFill: async () => { stopRequested = false; await closePreparedMenus(); return { ok: true }; },
        getPreparedFieldMap: async ({ force = false } = {}) => { preparedMap = await pageFields.collectFieldMap({ force: Boolean(force), expand: true }); return preparedMap; },
        shouldStop: async () => stopRequested,
        closeOpenMenus: async () => { await closePreparedMenus(); return { ok: true }; },
        waitAutosave,
        showResult: () => ({ ok: true })
      });
      return true;
    }

    const adapter = marketplaceAdapter();
    if (!adapter?.collectFieldMap) return false;
    engine.registerAdapters({
      beginFill: async () => { stopRequested = false; await adapter.closeOpenMenus?.(); return { ok: true }; },
      getPreparedFieldMap: async () => { preparedMap = await adapter.collectFieldMap({ force: true }); return preparedMap; },
      shouldStop: async () => stopRequested,
      closeOpenMenus: async () => adapter.closeOpenMenus?.() || { ok: true },
      waitAutosave: async () => ({ ok: true, confirmed: true, message: `${PLATFORM_LABEL} values were verified. No publish/save action was performed.` }),
      showResult: () => ({ ok: true })
    });
    return true;
  }

  registerCoreAdapters();

  function runtimeMessagePromise(message) {
    return new Promise(resolve => {
      safeRuntimeMessage(message, (response, runtimeError) => {
        if (runtimeError) resolve({ ok: false, message: runtimeError });
        else resolve(response || { ok: false, message: "No response from extension background." });
      });
    });
  }

  async function marketplaceSettings() {
    const constants = global.EbayAiConstantsV790 || {};
    const key = constants.STORAGE_KEYS?.SETTINGS || "ebayFillerV50Settings";
    const stored = await global.EbayAiStorageV790?.get?.(key) || {};
    const settings = { ...(constants.DEFAULT_SETTINGS || {}), ...(stored?.[key] || {}) };
    // Secrets stay in macOS Keychain/native backend. Never copy a legacy secret
    // through the page/content-script message payload.
    delete settings.apiKey;
    delete settings.claudeApiKey;
    delete settings.saveApiKey;
    delete settings.claudeKeyStored;
    settings.webResearchEnabled = false;
    settings.autoFillDescriptionCondition = false;
    settings.exactOnly = true;
    settings.neverPublish = true;
    return settings;
  }

  function answerSubset(answers = {}, questions = []) {
    const allowed = new Map((Array.isArray(questions) ? questions : []).map(question => [global.EbayAiFieldMapperV790?.normalizeKey?.(question) || clean(question).toLowerCase(), question]));
    const out = {};
    for (const [label, value] of Object.entries(answers || {})) {
      const key = global.EbayAiFieldMapperV790?.normalizeKey?.(label) || clean(label).toLowerCase();
      const exact = allowed.get(key);
      if (!exact || !clean(value)) continue;
      out[exact] = value;
    }
    return out;
  }

  async function analyzeMarketplaceListing(listing, questions, { stage = "analysis", onProgress = null } = {}) {
    const wanted = Array.isArray(questions) ? questions.filter(Boolean) : [];
    if (!wanted.length) return { ok: true, answers: {}, summary: { questionCount: 0, answerCount: 0 } };
    const byKey = new Map((listing.fields || []).map(field => [global.EbayAiFieldMapperV790?.normalizeKey?.(field.name || field.label) || clean(field.name || field.label).toLowerCase(), field]));
    const fields = wanted.map(question => byKey.get(global.EbayAiFieldMapperV790?.normalizeKey?.(question) || clean(question).toLowerCase())).filter(Boolean);
    const settings = await marketplaceSettings();
    if (typeof onProgress === "function") onProgress({ stage, message: `Analyzing ${wanted.length} ${PLATFORM_LABEL} field(s)…`, current: 0, total: wanted.length });
    const response = await runtimeMessagePromise({
      type: "CORE_AI_ANALYZE_LISTING",
      payload: {
        images: listing.photos || [], allImages: listing.photos || [], questions: wanted, fields,
        pageContext: { ...(listing.pageContext || {}), fields }, settings, reviewMode: false,
        allowRecovery: false, primaryTimeoutMs: 75000
      }
    });
    if (!response?.ok) throw new Error(response?.message || `${PLATFORM_LABEL} AI analysis failed.`);
    return { ...response, answers: answerSubset(response.answers || {}, wanted) };
  }

  function combineFillResults(results = []) {
    const combined = { filled: 0, already: 0, partial: 0, review: 0, skipped: 0, details: [] };
    for (const result of results.filter(Boolean)) {
      for (const key of ["filled", "already", "partial", "review", "skipped"]) combined[key] += Number(result?.[key] || 0);
      if (Array.isArray(result?.details)) combined.details.push(...result.details);
    }
    combined.ok = results.every(result => result?.ok !== false);
    combined.done = combined.filled + combined.already;
    combined.needsReview = combined.partial + combined.review > 0;
    return combined;
  }

  async function marketplaceSmartFillAll(options = {}) {
    if (PLATFORM === "ebay") return { ok: false, message: "Marketplace Smart Fill is only for Depop/Poshmark; eBay keeps its existing Fill route." };
    const adapter = marketplaceAdapter();
    const engine = global.EbayAiFillEngineV790;
    if (!adapter?.collectListing || !engine?.fillAll || !engine.adaptersRegistered) return { ok: false, message: `${PLATFORM_LABEL} adapter or shared Fill Engine is not ready.` };
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    stopRequested = false;
    const first = await adapter.collectListing({ requirePhotos: true, photoLimit: PLATFORM === "depop" ? 8 : 16 });
    if (!first?.ok) return { ok: false, message: first?.message || `Transfer photos to ${PLATFORM_LABEL} first.` };
    onProgress?.({ stage: "snapshot", message: `${first.photos.length} photo(s), ${first.routeQuestions.length} field(s) found.`, current: 0, total: first.routeQuestions.length });

    const passes = [];
    const initialCategory = first.routeQuestions.find(question => (global.EbayAiFieldMapperV790?.normalizeKey?.(question) || "") === "category");
    const currentCategory = first.pageContext?.fieldSummary?.[initialCategory || "Category"] || "";
    if (initialCategory && !clean(currentCategory)) {
      const categoryAi = await analyzeMarketplaceListing(first, [initialCategory], { stage: "category_analysis", onProgress });
      const categoryAnswers = answerSubset(categoryAi.answers, [initialCategory]);
      if (Object.keys(categoryAnswers).length) {
        const before = adapter.fieldSignature?.() || "";
        onProgress?.({ stage: "category_fill", message: `Setting ${PLATFORM_LABEL} category…`, current: 0, total: 1 });
        const categoryFill = await engine.fillAll({ mode: "marketplace_category", payload: { answers: categoryAnswers, questions: [initialCategory], fieldMap: first.fieldMap, waitForAutosave: false } });
        passes.push(categoryFill);
        if (categoryFill?.filled || categoryFill?.already) await adapter.waitForDynamicFields?.(before);
      }
    }

    if (stopRequested) return { ok: true, stopped: true, message: "Fill All stopped safely before the main field pass.", ...combineFillResults(passes) };
    const listing = await adapter.collectListing({ requirePhotos: true, photoLimit: PLATFORM === "depop" ? 8 : 16 });
    if (!listing?.ok) return { ok: false, message: listing?.message || `Could not refresh ${PLATFORM_LABEL} fields after category selection.` };
    const categoryKey = global.EbayAiFieldMapperV790?.normalizeKey?.("Category") || "category";
    const questions = listing.routeQuestions.filter(question => {
      const qk = global.EbayAiFieldMapperV790?.normalizeKey?.(question) || "";
      if (qk === categoryKey && clean(listing.pageContext?.fieldSummary?.[question])) return false;
      return true;
    });
    const analysis = await analyzeMarketplaceListing(listing, questions, { stage: "analysis", onProgress });
    const answers = answerSubset(analysis.answers, questions);
    onProgress?.({ stage: "fill", message: `Filling ${Object.keys(answers).length}/${questions.length} answered field(s)…`, current: 0, total: questions.length });
    if (Object.keys(answers).length) {
      const fill = await engine.fillAll({
        mode: "marketplace_smart",
        payload: { answers, questions, fieldMap: listing.fieldMap, waitForAutosave: false, onProgress(detail) { onProgress?.({ stage: "fill", message: `${detail?.label || "Field"}: ${detail?.reason || detail?.status || "processing"}`, current: Number(detail?.current || 0), total: Number(detail?.totalFields || questions.length), detail }); } }
      });
      passes.push(fill);
    }
    const combined = combineFillResults(passes);
    const unanswered = Math.max(0, questions.length - Object.keys(answers).length);
    const message = `${PLATFORM_LABEL} Fill All complete. Filled/already ${combined.done}; review ${combined.review + combined.partial}; no AI answer ${unanswered}. Nothing was published.`;
    onProgress?.({ stage: "completed", message, current: questions.length, total: questions.length, result: { ...combined, unanswered } });
    return { ...combined, ok: true, platform: PLATFORM, platformLabel: PLATFORM_LABEL, questionCount: questions.length + (initialCategory ? 1 : 0), answerCount: Object.keys(answers).length, unanswered, message, analysisSummary: analysis.summary || null };
  }

  global.MarketplacePageRuntimeV8200 = Object.freeze({ version: VERSION, platform: PLATFORM, platformLabel: PLATFORM_LABEL, adapter: marketplaceAdapter(), collectListing: options => marketplaceAdapter()?.collectListing?.(options), smartFillAll: marketplaceSmartFillAll });


  function toggleControlPanel(payload = {}) {
    return global.EbayUI?.controlPanel?.toggle?.(payload) || { ok: false, message: "Control Panel UI is not available." };
  }

  function showProgress(payload = {}) {
    return global.EbayUI?.progress?.show?.(payload) || { ok: false, message: "Progress UI is not available." };
  }

  function helperLoaded() {
    return Boolean(global.EbayHelperRuntimeV8130?.handleMessage);
  }

  async function clearAllItemSpecifics(payload = {}) {
    const pageFields = global.EbayPageFieldsV810;
    const engine = global.EbayAiFillEngineV790;
    if (!pageFields?.collectFieldMap) throw new Error("Item Specifics reader is not ready on this eBay page.");
    if (!engine?.withOperation) throw new Error("Item Specifics operation lock is not ready on this eBay page.");

    return engine.withOperation("clear_all", async () => {
      const expectedDraftId = clean(payload.expectedDraftId || "", 120);
      const actualDraftId = pageFields.draftIdFromUrl?.() || "";
      if (expectedDraftId && actualDraftId && expectedDraftId !== actualDraftId) {
        throw new Error(`Draft safety check failed: expected ${expectedDraftId}, open page is ${actualDraftId}.`);
      }
      stopRequested = false;
      preparedMap = await pageFields.collectFieldMap({ force: true, expand: true });
      const skipPolicy = global.EbayAiItemSpecificsV7100;
      let cleared = 0;
      let alreadyEmpty = 0;
      let protectedSkipped = 0;
      let review = 0;
      const details = [];

      for (const field of preparedMap.values()) {
        if (stopRequested) break;
        const label = clean(field?.name || field?.label || "", 140);
        if (!label) continue;
        if (skipPolicy?.shouldAlwaysSkip?.(label)) {
          protectedSkipped += 1;
          details.push({ label, status: "protected", reason: "UPC/MPN are never changed." });
          continue;
        }
        const before = clean(await field.read?.(), 500);
        if (!before) {
          alreadyEmpty += 1;
          details.push({ label, status: "already_empty" });
          continue;
        }
        const result = await field.clear?.();
        const after = clean(await field.read?.(), 500);
        if (result?.ok && !after) {
          cleared += 1;
          details.push({ label, status: "cleared", before, reason: result?.reason || "confirmed_empty" });
        } else {
          review += 1;
          details.push({ label, status: "review", before, after, reason: result?.reason || "Clear was not confirmed by eBay." });
        }
      }

      await closePreparedMenus();
      const save = await waitAutosave({ expectedDraftId, changed: cleared > 0, timeoutMs: 10000 });
      const stopped = stopRequested;
      return {
        ok: !stopped && review === 0 && save?.ok !== false,
        stopped,
        cleared,
        alreadyEmpty,
        protectedSkipped,
        review,
        save,
        details,
        message: stopped
          ? `Clear All stopped safely. Cleared ${cleared}; ${review} need review. UPC/MPN were untouched.`
          : `Clear All Item Specifics finished: ${cleared} cleared, ${alreadyEmpty} already empty, ${review} need review, ${protectedSkipped} protected (UPC/MPN).`
      };
    }, { mode: "clear_all" });
  }

  function requestSafeStop() {
    stopRequested = true;
    try { global.EbayHelperRuntimeV8130?.requestStop?.(); }
    catch (error) { console.warn("[eBay AI] Helper stop request failed", error?.message || error); }
    return closePreparedMenus();
  }

  // Single message router for the eBay page. The Helper runtime is delegated to
  // as a plain function only after all core messages have been handled here.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    const type = String(message.type || "");

    if (type === "CONTENT_BRIDGE_PING_V890") {
      sendResponse({
        ok: true,
        version: VERSION,
        fullRuntime: helperLoaded(),
        helperRuntime: helperLoaded(),
        sharedFillReady: Boolean(global.EbayAiFillEngineV790?.adaptersRegistered),
        operation: global.EbayAiFillEngineV790?.operationStatus?.() || null,
        platform: PLATFORM, platformLabel: PLATFORM_LABEL,
        actualDraftId: PLATFORM === "ebay" ? String(global.EbayPageFieldsV810?.draftIdFromUrl?.() || "") : ""
      });
      return false;
    }
    if (type === "AI_QUEUE_PROGRESS_V802" || type === "HOTKEY_STATUS_V880") {
      sendResponse(showProgress(message.payload || { message: message.payload?.message || "Completed." }));
      return false;
    }
    if (type === "CORE_MARKETPLACE_READ_LISTING_V8200") {
      const adapter = marketplaceAdapter();
      if (!adapter?.collectListing) { sendResponse({ ok: false, message: "This page is not a supported Depop/Poshmark listing form." }); return false; }
      adapter.collectListing(message.payload || {}).then(result => { const safe = { ...result }; delete safe.fieldMap; sendResponse(safe); }).catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    if (type === "CORE_MARKETPLACE_SMART_FILL_ALL_V8200") {
      marketplaceSmartFillAll(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    if (type === "CORE_EBAY_READ_LISTING") {
      if (PLATFORM !== "ebay" || !global.EbayPageFieldsV810?.collectListing) { sendResponse({ ok: false, message: "This command is eBay-only." }); return false; }
      global.EbayPageFieldsV810.collectListing(message.payload || {})
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, message: error?.message || String(error), photos: [], routeQuestions: [] }));
      return true;
    }
    if (type === "CORE_EBAY_READ_CONTEXT") {
      if (PLATFORM !== "ebay" || !global.EbayPageFieldsV810?.collectListing) { sendResponse({ ok: false, message: "This command is eBay-only." }); return false; }
      global.EbayPageFieldsV810.collectListing({ ...(message.payload || {}), photoLimit: 0, requirePhotos: false })
        .then(result => sendResponse({ ok: result.ok, message: result.message, pageContext: result.pageContext, routeQuestions: result.routeQuestions, fields: result.fields }))
        .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    if (type === "CORE_EBAY_FILL_ALL") {
      if (PLATFORM !== "ebay") { sendResponse({ ok: false, message: "Use Marketplace Fill All on Depop/Poshmark." }); return false; }
      const payload = message.payload || {};
      const mode = String(payload.mode || "automatic").toLowerCase();
      const engine = global.EbayAiFillEngineV790;
      activeFillCount += 1;
      const promise = engine?.fillAll && engine.adaptersRegistered
        ? engine.fillAll({ mode, payload })
        : Promise.resolve({ ok: false, message: "Shared Fill Engine is not ready on this eBay page." });
      promise
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }))
        .finally(() => { activeFillCount = Math.max(0, activeFillCount - 1); });
      return true;
    }
    if (type === "CORE_EBAY_CLEAR_ALL_ITEM_SPECIFICS_V920") {
      if (PLATFORM !== "ebay") { sendResponse({ ok: false, message: "Clear All Item Specifics is eBay-only." }); return false; }
      clearAllItemSpecifics(message.payload || {})
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    if (type === "CORE_EBAY_WAIT_AUTOSAVE") {
      if (PLATFORM !== "ebay") { sendResponse({ ok: true, confirmed: true, message: `${PLATFORM_LABEL} values verified; no publish action was performed.` }); return false; }
      waitAutosave(message.payload || {})
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, confirmed: false, message: error?.message || String(error) }));
      return true;
    }
    if (type === "CORE_EBAY_STOP" || type === "STOP_ALL_ACTIONS_V5") {
      requestSafeStop()
        .then(() => sendResponse({ ok: true, message: "Safe Stop requested." }))
        .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    if (type === (MESSAGES.CONTROL_PANEL_TOGGLE || "CONTROL_PANEL_TOGGLE")) {
      sendResponse(toggleControlPanel(message.payload || {}));
      return false;
    }

    const queuePanel = global.EbayQueuePage;
    if (queuePanel?.handles?.(type)) {
      queuePanel.handleMessage(message)
        .then(result => sendResponse(result || { ok: false, message: "Queue panel did not return a result." }))
        .catch(error => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }

    const helper = global.EbayHelperRuntimeV8130;
    if (helper?.handleMessage) return Boolean(helper.handleMessage(message, sender, sendResponse));
    return false;
  });

  // Local eBay-page Mac shortcuts. Global Chrome commands are reserved for A/Q/R/O;
  // Clear All and Fill All stay page-local and use physical key codes across layouts.
  function localShortcutCommand(event) {
    if (!event || !(event.ctrlKey && event.shiftKey) || event.altKey || event.metaKey) return "";
    const code = String(event.code || "");
    const keyName = String(event.key || "").toLowerCase();
    if (code === "KeyX" || keyName === "x") return "clear-all-item-specifics";
    if (code === "KeyF" || keyName === "f") return "fill-all-ready";
    return "";
  }

  document.addEventListener("keydown", event => {
    if (!event?.isTrusted || event.repeat) return;
    const keyName = String(event.key || "").toLowerCase();
    if (keyName === "escape") {
      const progressActive = Boolean(global.EbayUI?.progress?.isActive?.());
      const operationActive = Boolean(global.EbayAiFillEngineV790?.operationStatus?.());
      if (!progressActive && !operationActive && activeFillCount <= 0) return;
      stopRequested = true;
      event.preventDefault();
      const sent = safeRuntimeMessage({ type: "HOTKEY_SAFE_STOP_V880" });
      showProgress({
        titlePrefix: "Safe Stop",
        message: sent ? "Safe Stop requested. No new Fill stage will start." : reloadPageMessage(),
        finished: true,
        autoHideMs: 7000
      });
      return;
    }

    const command = localShortcutCommand(event);
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    if (PLATFORM !== "ebay" && command === "fill-all-ready") {
      showProgress({ titlePrefix: "Fill All", message: `Analyzing ${PLATFORM_LABEL} photos and fields…`, finished: false });
      marketplaceSmartFillAll().then(response => showProgress({ titlePrefix: "Fill All", message: response?.message || "Marketplace Fill All finished.", finished: true, autoHideMs: 10000 })).catch(error => showProgress({ titlePrefix: "Fill All", message: error?.message || String(error), finished: true, autoHideMs: 12000 }));
      return;
    }
    if (PLATFORM !== "ebay" && command === "clear-all-item-specifics") {
      showProgress({ titlePrefix: "Clear All", message: "Clear All Item Specifics is eBay-only.", finished: true, autoHideMs: 7000 });
      return;
    }
    showProgress({
      titlePrefix: command === "clear-all-item-specifics" ? "Clear All" : "Fill All",
      message: command === "clear-all-item-specifics" ? "Clearing Item Specifics…" : "Filling prepared answers without AI…",
      finished: false
    });
    safeRuntimeMessage({ type: "HOTKEY_LOCAL_COMMAND_V920", payload: { command } }, (response, runtimeError) => {
      const message = response?.message || runtimeError || "Hotkey command finished.";
      showProgress({
        titlePrefix: command === "clear-all-item-specifics" ? "Clear All" : "Fill All",
        message,
        finished: true,
        autoHideMs: 10000
      });
    });
  }, true);
})(globalThis);
