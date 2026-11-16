// Main entry: analyzePhotos(). Manual uses Blocks 03/04/05; Autopilot and Queue use ONE_ITEM_PROCESS with those same blocks.
function dataUrlFromFile(file, maxSide = 1280, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unsupported image. Use JPEG, PNG, WEBP or GIF."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not prepare image.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function previewPhotos() {
  renderAllPhotos();
  scheduleSave();
  setPhotoReport("Uploaded photos are ready. You can Analyze Photos or add eBay photos too.");
}






function isPlainObjectA537(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}









function normalizedApiKeyV641(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function firstOwnValueA537(obj, aliases) {
  for (const key of aliases || []) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  const wanted = new Set((aliases || []).map(normalizedApiKeyV641));
  for (const [key, value] of Object.entries(obj || {})) {
    if (wanted.has(normalizedApiKeyV641(key))) return value;
  }
  return undefined;
}

function unwrapApiListingObjectV641(value) {
  if (!isPlainObjectA537(value)) return value;
  const meaningfulAliases = [
    "brand", "size", "color", "condition", "price", "description",
    "conditionDescription", "conditionNote", "category", "specifics", "itemSpecifics", "shipping"
  ];
  if (firstOwnValueA537(value, meaningfulAliases) !== undefined) return value;
  const wrappers = ["listing", "listingData", "listing_data", "result", "data", "product", "item", "fields", "analysis", "output"];
  for (const key of wrappers) {
    const child = value[key];
    if (isPlainObjectA537(child)) {
      const unwrapped = unwrapApiListingObjectV641(child);
      if (isPlainObjectA537(unwrapped) && firstOwnValueA537(unwrapped, meaningfulAliases) !== undefined) return unwrapped;
    }
  }
  for (const child of Object.values(value)) {
    if (isPlainObjectA537(child)) {
      const unwrapped = unwrapApiListingObjectV641(child);
      if (isPlainObjectA537(unwrapped) && firstOwnValueA537(unwrapped, meaningfulAliases) !== undefined) return unwrapped;
    }
  }
  return value;
}
















// Protected listing fields (Description/Condition) have no writer in the Item Specifics workflow.


async function analyzePhotos(useEbayOnly = false) {
  const settings = getSettingsFromUi();
  if (!settings.apiEnabled || settings.apiMode === "off") { setStatus("API is OFF. Turn it ON in Settings."); return; }
  if (!settings.apiBaseUrl || !settings.apiModel) { switchTab("settingsTab"); setStatus("Add API Base URL and Model first."); return; }

  $("analyzeBtn").disabled = true;
  if ($("analyzeEbayBtn")) $("analyzeEbayBtn").disabled = true;
  $("apiStatusBox").textContent = "[04] Preparing fast GPT Fill analysis…";
  try {
    if (!currentItemSpecificQuestionsV670().length) {
      const refreshed = await refreshItemSpecificContextV670({ quiet: true });
      if (!refreshed?.ok) throw new Error(refreshed?.message || "Could not read Item Specific questions from eBay.");
    }
    // Normal Manual/Photo uses the same all-fields Block 03 as Autopilot and Queue.
    // Saved legacy question exclusions do not silently make Fast Fill incomplete.
    const fieldRouteV890 = globalThis.EbayBlocksV890.readFields.run({
      routeQuestions: currentItemSpecificQuestionsV670(),
      pageContext: ebayPageContextV639
    }, { excludedQuestions: [] });
    const selectedQuestions = fieldRouteV890.questions;
    if (!selectedQuestions.length) throw new Error("No current Item Specific questions are available for GPT.");
    const rawImages = await buildRawImagesForSharedAiV890(useEbayOnly);
    if (!rawImages.length) throw new Error(useEbayOnly ? "No eBay photos loaded. Click Read Photos + Listing Fields first." : "No photos loaded. Upload photos or click Read Photos + Listing Fields.");

    const read = {
      photos: rawImages,
      routeQuestions: currentItemSpecificQuestionsV670(),
      pageContext: ebayPageContextV639,
      actualDraftId: ebayPageContextV639.draftId || ""
    };
    const prepared = globalThis.EbayBlocksV890.aiAnalysis.prepare({
      settings: settingsWithoutApiKeyV637(settings),
      read,
      questions: selectedQuestions,
      reviewMode: false,
      customInstruction: settings.customAiInstruction || ""
    });
    const estimate = prepared.estimate;
    await checkBudgetBeforeAnalyze(estimate, settings, { confirmCost: message => globalThis.EbayUI?.notifications?.confirm?.(message) ?? false });
    const cacheKey = `v8192-fill-${imageCacheKey(prepared.images, settings, prepared.prompt)}`;

    if (settings.cacheEnabled) {
      const cached = await getAiCache(cacheKey);
      if (cached?.answers && typeof cached.answers === "object" && Object.keys(cached.answers).length) {
        const previous = mergedItemSpecificAnswersV670();
        for (const question of selectedQuestions) delete previous[question];
        const merged = { ...previous, ...cached.answers };
        setData(itemSpecificsOnlyDataV670(merged));
        $("chatgptText").value = selectedQuestions.filter(q => cached.answers[q]).map(q => `${q} - ${cached.answers[q]}`).join("\n");
        await saveDraft();
        await saveUsageRecord({ title: "Cached Fast Fill", mode: settings.tokenMode, photoCount: prepared.images.length, estimatedInputTokens: estimate.estimatedInputTokens, estimatedOutputTokens: 0, estimatedCost: 0, cost: 0, cached: true });
        $("apiStatusBox").textContent = `[04+05] Cached Fast Fill: ${Object.keys(cached.answers).length}/${selectedQuestions.length} answer(s). OCR/Claude verification not run. No API cost.`;
        await saveDraftHistory("AI cached Fast Fill");
        switchTab("listingTab");
        return;
      }
    }

    await saveSettings();
    $("apiStatusBox").textContent = `[04] GPT analyzing ${prepared.images.length} smart photo(s) for ${selectedQuestions.length} question(s)…`;
    const response = await globalThis.EbayBlocksV890.aiAnalysis.runPrepared(prepared, { primaryTimeoutMs: 75000 });
    const matched = globalThis.EbayBlocksV890.matchEbay.run({
      analysis: response,
      questions: selectedQuestions,
      fields: fieldRouteV890.fieldCatalog || ebayPageContextV639.fields || [],
      pageContext: ebayPageContextV639,
      reviewMode: false,
      automaticPolicy: true
    });
    const answers = matched.answers || {};
    const answerCount = Object.keys(answers).length;
    const previous = mergedItemSpecificAnswersV670();
    for (const question of selectedQuestions) delete previous[question];
    const merged = { ...previous, ...answers };
    const analysisData = itemSpecificsOnlyDataV670(merged);
    analysisData.aiWarnings = [
      matched.policyOmitted?.length ? `Left untouched without direct product evidence: ${matched.policyOmitted.join(", ")}` : "",
      matched.unresolved?.length ? `eBay option match needs Fill attempt: ${matched.unresolved.join(", ")}` : ""
    ].filter(Boolean).join("\n");
    setData(analysisData);
    const text = selectedQuestions.filter(q => answers[q]).map(q => `${q} - ${answers[q]}`).join("\n");
    $("chatgptText").value = text;

    if (settings.cacheEnabled && answerCount) await setAiCache(cacheKey, { answers, text, createdBy: "V8.23.21", estimate });
    const usage = response.usage || {};
    await saveUsageRecord({
      title: "Fast Fill Item Specifics", mode: settings.tokenMode, photoCount: prepared.images.length,
      inputTokens: usage.inputTokens || usage.prompt_tokens || estimate.estimatedInputTokens,
      outputTokens: usage.outputTokens || usage.completion_tokens || estimate.estimatedOutputTokens,
      estimatedInputTokens: estimate.estimatedInputTokens, estimatedOutputTokens: estimate.estimatedOutputTokens,
      cost: usage.cost ?? costFromTokens(usage.inputTokens || usage.prompt_tokens || estimate.estimatedInputTokens, usage.outputTokens || usage.completion_tokens || estimate.estimatedOutputTokens, settings),
      estimatedCost: estimate.estimatedCost, cached: false
    });
    await saveDraft();
    await saveDraftHistory("AI Fast Fill analyzed");
    const totalSeconds = (Number(response.timings?.totalMs || response.timings?.primaryMs || 0) / 1000).toFixed(1);
    const primarySeconds = (Number(response.timings?.primaryMs || 0) / 1000).toFixed(1);
    const strictSeconds = (Number(response.timings?.recoveryMs || 0) / 1000).toFixed(1);
    const runCostText = response.itemCostKnown === true ? ` Cost $${Number(response.itemCost || 0).toFixed(4)}${response.itemCostTargetMet === false ? ` (above $${Number(response.itemCostTarget || 0.07).toFixed(2)} target)` : ""}.` : "";
    const requestBudgetText = ` OpenAI ${Number(response.openAiRequestsAttempted || response.requests || 0)}/${Number(response.openAiRequestLimit || 2)} request budget.`;
    const fastOcrVerified = Number(response.fastOcrVerifiedCount || response.fastOcrVerifiedQuestions?.length || 0);
    const fastOcrConflicts = Number(response.fastOcrConflictQuestions?.length || 0);
    $("apiStatusBox").textContent = `[04+05] Fast Fill ready: ${answerCount}/${selectedQuestions.length} answer(s). Primary GPT ${primarySeconds}s.${fastOcrVerified ? ` Local OCR independently verified ${fastOcrVerified} strict field(s).` : ""}${fastOcrConflicts ? ` OCR flagged ${fastOcrConflicts} conflict(s) for GPT re-check.` : ""}${response.fastRepairUsed ? ` Strict GPT verification ${strictSeconds}s for ${Number(response.fastRepairQuestions?.length || 0)} remaining field(s) with ${Number(response.fastRepairPhotoCount || 0)} photo(s), recovered ${Number(response.fastRepairRecoveredCount || 0)}.` : ""}${Number(response.fastRepairSkippedDirect?.length || 0) ? ` ${Number(response.fastRepairSkippedDirect.length)} lower-impact strict field(s) kept from validated direct evidence.` : ""}${requestBudgetText}${runCostText} AI total ${totalSeconds}s. Full Claude Review was not run.${matched.policyOmitted?.length ? ` ${matched.policyOmitted.length} safely omitted field(s) left untouched.` : ""}${matched.unresolved?.length ? ` ${matched.unresolved.length} value(s) will be tried by the shared Fill Engine.` : ""}`;
    setStatus(`[04+05] ${answerCount}/${selectedQuestions.length} answers ready for Fill All.`);
    await addLog("BLOCK 04+05 Fast Fill analysis", `${answerCount}/${selectedQuestions.length} answers; ${prepared.images.length} smart photo(s); primary ${primarySeconds}s; local OCR verified ${fastOcrVerified}, conflicts ${fastOcrConflicts}; strict GPT verification ${response.fastRepairUsed ? `${strictSeconds}s / ${Number(response.fastRepairQuestions?.length || 0)} field(s)` : "not needed"}; full Claude Review not run; AI total ${totalSeconds}s.`);
    switchTab("listingTab");
  } catch (error) {
    const rawMessage = String(error?.message || error || "Unknown AI error");
    const timedOut = /timed out|timeout|aborted/i.test(rawMessage);
    const publicMessage = timedOut ? "GPT analysis reached its hard timeout and was stopped. Try again or use Cheap mode." : rawMessage;
    $("apiStatusBox").textContent = `AI error: ${publicMessage}\nFallback: paste Field - Value lines and use Fill All.`;
    if ($("workflowStatusBox")) $("workflowStatusBox").textContent = publicMessage;
    await addLog(timedOut ? "AI hard timeout" : "AI photo analysis error", publicMessage);
  } finally {
    $("analyzeBtn").disabled = false;
    if ($("analyzeEbayBtn")) $("analyzeEbayBtn").disabled = false;
    await renderUsageHistory();
  }
}

async function testApi() {
  let settings;
  try {
    settings = await saveSettings();
  } catch (error) {
    $("settingsStatus").textContent = `Not connected: ${error.message || String(error)}`;
    await refreshLocalSetupStatusV8131();
    return;
  }
  $("settingsStatus").textContent = "Testing API connection through the secure local backend...";
  const response = await sendRuntimeMessage({ type: "AI_TEST_CONNECTION", payload: { settings: settingsWithoutApiKeyV637(settings) } });
  await refreshLocalSetupStatusV8131();
  if (response?.ok) $("settingsStatus").textContent = `Connected. GPT key remains in macOS Keychain. ${response.message || "API responded."}`;
  else $("settingsStatus").textContent = `Not connected: ${response?.message || "Unknown error"}`;
}
