/* V8.23.21 Review workflow controller. Visual state is delegated to ui/review. */
async function saveReviewAnalysisV830(bundle = {}) {
  try {
    const item = buildReviewItemV830(bundle);
    const response = await sendRuntimeMessage({ type: "REVIEW_SAVE_ITEM_V830", payload: item });
    if (response?.ok && response.item) currentReviewItemV830 = response.item;
    return response;
  } catch (error) {
    await addLog("Review database save skipped", error?.message || String(error));
    return { ok: false, message: error?.message || String(error) };
  }
}
async function runCurrentReviewAnalysisV890() {
  const settings = getSettingsFromUi();
  if (!settings.apiEnabled || settings.apiMode === "off") throw new Error("API is OFF. Turn it ON in Settings.");
  if (!settings.apiBaseUrl || !settings.apiModel) throw new Error("API Base URL or Model is missing. Save Settings first.");
  const tab = await activeEbayTab();
  if (!tab?.id) throw new Error("Open the eBay draft you want to review first.");
  if (!await injectContentScript(tab.id)) throw new Error("Could not connect to the current eBay draft.");
  const draftId = globalThis.EbayBlocksV890?.openDraft?.extractDraftId?.(tab.url || "") || "";
  if (!draftId) throw new Error("The current eBay page is not a supported draft.");

  globalThis.EbayUI?.review?.setRunning?.(true);
  globalThis.EbayUI?.review?.setStage?.("Review running", "warn");
  globalThis.EbayUI?.review?.setCurrentText?.("[02] Reading photos and current draft snapshot…");
  setStatus("Review Mode: reading the current draft. Verification runs only here.");
  try {
    const read = await globalThis.EbayBlocksV890.readPhotos.run({
      tabId: tab.id,
      draftId,
      strictCurrentDraft: true,
      timeoutMs: 45000
    });
    ebayPageContextV639 = read.pageContext || ebayPageContextV639;
    const fields = globalThis.EbayBlocksV890.readFields.run(read, { excludedQuestions: [], reviewMode: true });
    if (!fields.questions.length) throw new Error("No Item Specific questions are available for Review.");

    globalThis.EbayUI?.review?.setCurrentText?.(`[08] Review: GPT + OCR${settings.claudeReviewEnabled ? " + Claude" : ""} for ${fields.questions.length} field(s)…`);
    const response = await globalThis.EbayReviewModeV890.analyze({
      settings: settingsWithoutApiKeyV637(settings),
      read,
      questions: fields.questions,
      customInstruction: settings.customAiInstruction || "",
      primaryTimeoutMs: 75000,
      onStage: event => {
        const stage = String(event?.stage || "review").replace(/_/g, " ");
        const status = String(event?.status || "running");
        globalThis.EbayUI?.review?.setCurrentText?.(`[08] ${stage}: ${status}…`);
      }
    });
    if (!response?.ok) throw new Error(response?.message || "Review analysis failed.");

    const saved = await saveReviewAnalysisV830({
      ...response,
      questions: fields.questions,
      fieldCatalog: fields.fieldCatalog,
      photoCatalog: Array.isArray(response.photoCatalog) && response.photoCatalog.length ? response.photoCatalog : (read.photos || []),
      fillPolicy: settings.reviewFillMode || "safe"
    });
    if (!saved?.ok) throw new Error(saved?.message || "Review analysis finished, but its local review file could not be saved.");
    await refreshReviewWorkspaceV830();
    switchTab("reviewTab");
    setStatus(response.message || "Review analysis completed and saved.");
    return response;
  } finally {
    globalThis.EbayUI?.review?.setRunning?.(false);
  }
}
async function loadCurrentReviewV830({ quiet = false } = {}) {
  const context = await refreshItemSpecificContextV670({ quiet: true });
  if (!context?.ok) throw new Error(context?.message || "Could not read current eBay draft.");
  const response = await sendRuntimeMessage({ type: "REVIEW_GET_ITEM_V830", payload: reviewIdentityPayloadV830() });
  currentReviewItemV830 = response?.found ? response.item : null;
  globalThis.EbayUI?.review?.renderCurrent?.(currentReviewItemV830);
  if (!quiet) setStatus(response?.found ? "Current item review record loaded." : "No review record found. Run Review Analysis first.");
  return response;
}
async function chooseReviewFolderV840() {
  setStatus("Opening native folder picker…");
  const response = await sendRuntimeMessage({ type: "REVIEW_SELECT_FOLDER_V840", payload: {} });
  if (!response?.ok) throw new Error(response?.message || "Review folder selection cancelled.");
  currentReviewItemV830 = null;
  await refreshReviewWorkspaceV830();
  setStatus("Review folder selected. Each listing will be saved in its own JSON file.");
}
async function enableReviewAssistantV830() {
  if (!currentReviewItemV830) await loadCurrentReviewV830();
  if (!currentReviewItemV830) throw new Error("No saved review record for this item.");
  const tab = await activeEbayTab();
  if (!tab?.id) throw new Error("Open the matching eBay draft first.");
  if (!await injectContentScript(tab.id)) throw new Error("Could not connect to the eBay draft page.");
  const response = await sendEbayTabMessageV639(tab.id, "ENABLE_REVIEW_ASSISTANT_V830", {
    item: currentReviewItemV830,
    filter: globalThis.EbayUI?.review?.filterValue?.() || "needs_attention"
  });
  if (!response?.ok) throw new Error(response?.message || "Review Assistant could not start.");
  setStatus(response.message || "Review Assistant enabled. Click an Item Specific field.");
}
async function disableReviewAssistantV830() {
  const tab = await activeEbayTab();
  if (!tab?.id) return;
  const response = await sendEbayTabMessageV639(tab.id, "DISABLE_REVIEW_ASSISTANT_V830", {});
  setStatus(response?.message || "Review Assistant closed.");
}

async function fetchReviewDatabaseV82310() {
  const response = await sendRuntimeMessage({ type: "REVIEW_STATUS_V830" });
  reviewDatabaseStatusV830 = response;
  if (!response?.ok) throw new Error(response?.message || "Review database unavailable.");
  return response;
}
async function fetchReviewItemsV82310() {
  const response = await sendRuntimeMessage({ type: "REVIEW_LIST_ITEMS_V830", payload: { limit: 50 } });
  if (!response?.ok && response?.message) throw new Error(response.message);
  return response;
}

async function refreshReviewDatabaseV830() {
  const response=await fetchReviewDatabaseV82310(); globalThis.EbayUI?.review?.renderDatabase?.(response); return response;
}
async function renderReviewItemsV830() {
  const response=await fetchReviewItemsV82310(); globalThis.EbayUI?.review?.renderItems?.(response); return response;
}
async function refreshReviewWorkspaceV830() {
  try { await refreshReviewDatabaseV830(); } catch(error) { globalThis.EbayUI?.review?.renderDatabaseError?.(error?.message||String(error)); }
  try { await loadCurrentReviewV830({quiet:true}); } catch(error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped",{message:error?.message||String(error)}); }
  try { await renderReviewItemsV830(); } catch(error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped",{message:error?.message||String(error)}); }
}
