/* V8.23.21 Fill/Helper action controller. UI rendering is delegated to ui/fill-actions. */
async function oneButtonFillEbay() {
  const tab = await activeEbayTab();
  if (!tab?.id) { setStatus("Open an eBay draft page first."); return; }
  const injected = await injectContentScript(tab.id);
  if (!injected) { setStatus("Could not connect to the eBay draft. Refresh eBay and try again."); return; }
  if (!currentItemSpecificQuestionsV670().length) {
    const refreshed = await refreshItemSpecificContextV670({ quiet: true });
    if (!refreshed?.ok) { setStatus(`Could not read Item Specific fields: ${refreshed?.message || "unknown error"}`); return; }
  }

  const pasted = String(globalThis.EbayUI?.fillActions?.inputText?.() || "").trim();
  const questions = currentItemSpecificQuestionsV670();
  let answers = {};
  try {
    const parsed = globalThis.EbayBlocksV890.textInput.run(pasted || getData().specifics || "", { questions });
    answers = parsed.answers || {};
  } catch (error) {
    setStatus(`Fill error: ${error.message || error}`);
    return;
  }
  if (!Object.keys(answers).length) { setStatus("No Field - Value answers are ready to fill."); return; }

  const matched = globalThis.EbayBlocksV890.matchEbay.run({
    analysis: { answers },
    questions,
    fields: ebayPageContextV639.fields || [],
    pageContext: ebayPageContextV639,
    reviewMode: false
  });
  setStatus(`[06] Filling ${Object.keys(matched.answers).length} Item Specific field(s)…`);
  const result = await globalThis.EbayManualModeV890.fillAll({
    tabId: tab.id,
    draftId: extractDraftIdV701(tab.url),
    answers: matched.answers,
    questions,
    omittedQuestions: [],
    timeoutMs: 70000
  });
  const save = result?.ok !== false ? await globalThis.EbayManualModeV890.save({
    tabId: tab.id,
    draftId: extractDraftIdV701(tab.url),
    fill: result,
    timeoutMs: 12000
  }).catch(error => ({ ok: false, confirmed: false, message: error?.message || String(error) })) : null;

  const baseText = result?.message || (result?.ok ? "Fill completed." : "Fill did not complete.");
  const reviewLines = (Array.isArray(result?.details) ? result.details : [])
    .filter(item => ["review", "partial", "skipped"].includes(String(item?.status || "")))
    .map(item => `${String(item.status).toUpperCase()}: ${item.label} - ${item.value || ""} (${item.reason || "Not confirmed by eBay"})`);
  const text = [baseText, reviewLines.length ? `Fields needing Fill review:\n${reviewLines.join("\n")}` : "", save?.message ? `Save: ${save.message}` : ""].filter(Boolean).join("\n");
  globalThis.EbayUI?.fillActions?.renderReport?.(text);
  const reviewCount = Number(result?.review || 0) + Number(result?.partial || 0) + Number(result?.skipped || 0);
  setStatus(result?.ok ? `[06+07] Fill completed. ${reviewCount ? `${reviewCount} field(s) could not be confirmed by eBay.` : "All supplied fields processed."}` : `[06] Fill needs attention: ${baseText}`);
  await addLog(result?.ok ? "BLOCK 06+07 Fill completed" : "BLOCK 06 Fill review", text);
}
async function fillAllCurrentListingV8200() {
  const tab = await activeMarketplaceTabV8200();
  if (!tab?.id) { setStatus("Open an eBay, Depop, or Poshmark listing page first."); return; }
  const platform = marketplacePlatformV8200(tab.url);
  if (platform === "ebay") return oneButtonFillEbay();
  const platformLabel = platform === "depop" ? "Depop" : "Poshmark";
  const injected = await injectContentScript(tab.id);
  if (!injected) { setStatus(`Could not connect to ${platformLabel}. Refresh the page and try again.`); return; }
  setStatus(`${platformLabel}: reading transferred photos, fields, and exact options…`);
  globalThis.EbayUI?.fillActions?.renderReport?.(`${platformLabel} Fill All is running. Nothing will be published automatically.`);
  const result = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { type: "CORE_MARKETPLACE_SMART_FILL_ALL_V8200", payload: {} }, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, message: "No response from marketplace page." });
    });
  });
  const text = result?.message || `${platformLabel} Fill All finished.`;
  globalThis.EbayUI?.fillActions?.renderReport?.(text);
  setStatus(result?.ok ? text : `${platformLabel} Fill All needs attention: ${text}`);
  await addLog(result?.ok ? `${platformLabel} Fill All completed` : `${platformLabel} Fill All error`, text);
}
async function enableHoverAssistant() {
  const tab = await activeMarketplaceTabV8200();
  if (!tab?.id) { setStatus("Open an eBay, Depop, or Poshmark listing page first."); return; }
  const platform = marketplacePlatformV8200(tab.url);
  const platformLabel = platform === "depop" ? "Depop" : platform === "poshmark" ? "Poshmark" : "eBay";
  const injected = await injectContentScript(tab.id);
  if (!injected) { setStatus(`Could not connect to ${platformLabel}. Refresh the page and try again.`); return; }

  let exactAnswers = {};
  if (platform === "ebay") {
    // eBay Helper Fill All keeps the existing prepared Text/Photo answer route.
    const pasted = String(globalThis.EbayUI?.fillActions?.inputText?.() || "").trim();
    try { exactAnswers = globalThis.EbayBlocksV890.textInput.run(pasted || getData().specifics || "", { questions: currentItemSpecificQuestionsV670() }).answers || {}; }
    catch (error) { setStatus(`Helper error: ${error.message || error}`); return; }
    if (!Object.keys(exactAnswers).length) { setStatus("No safe Field - Value answers are ready for the eBay Helper."); return; }
  }
  const payload = {
    data: platform === "ebay" ? itemSpecificsOnlyDataV670(exactAnswers) : { specifics: "", specificsObject: {} },
    settings: { ...getSettingsFromUi(), exactOnly: true, neverPublish: true, webResearchEnabled: false, autoFillDescriptionCondition: false }
  };
  setStatus(platform === "ebay" ? `Enabling Helper for ${Object.keys(exactAnswers).length} exact answer(s)…` : `Enabling ${platformLabel} Helper. Transfer photos, then press Fill All…`);
  const result = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { type: "ENABLE_HOVER_ASSISTANT_V5", payload }, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, message: "No response." });
    });
  });
  const text = result.ok ? result.message || "On-Demand Field Assistant enabled." : `On-Demand Helper error: ${result.message || "unknown"}`;
  globalThis.EbayUI?.fillActions?.renderReport?.(text);
  setStatus(text);
  await addLog(result.ok ? "On-Demand Field Assistant enabled" : "On-Demand Field Assistant error", text);
  if (result.ok) globalThis.EbayUI?.fillActions?.closeIfStandalone?.(450);
}
async function disableHoverAssistant() {
  const tab = await activeMarketplaceTabV8200();
  if (!tab?.id) { setStatus("Open an eBay, Depop, or Poshmark listing page first."); return; }
  const injected = await injectContentScript(tab.id);
  if (!injected) { setStatus("Could not connect to the marketplace page."); return; }
  const result = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { type: "DISABLE_HOVER_ASSISTANT_V5" }, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, message: "No response." });
    });
  });
  const text = result.ok ? result.message || "Hover AI helper hidden." : `Hide Hover Assistant error: ${result.message || "unknown"}`;
  globalThis.EbayUI?.fillActions?.renderReport?.(text);
  setStatus(text);
}
async function stopAllActions() {
  const tab = await activeMarketplaceTabV8200();
  if (!tab?.id || !isSupportedMarketplaceUrlV8200(tab.url)) { setStatus("Open an eBay, Depop, or Poshmark listing page first."); return; }
  const injected = await injectContentScript(tab.id);
  if (!injected) { setStatus("Could not connect to the marketplace page."); return; }
  await sendRuntimeMessage({ type: "HOTKEY_SAFE_STOP_V880", payload: { tabId: tab.id } }).catch(() => null);
  const result = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { type: "STOP_ALL_ACTIONS_V5" }, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, message: "No response." });
    });
  });
  const text = result.ok ? result.message || "Stop Actions requested." : `Stop error: ${result.message || "unknown"}`;
  globalThis.EbayUI?.fillActions?.renderReport?.(text);
  setStatus(text);
  await addLog(result.ok ? "Stop Actions requested" : "Stop Actions error", text);
}
