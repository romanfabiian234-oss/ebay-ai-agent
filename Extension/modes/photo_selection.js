/* V8.23.21 photo/listing workflow container. Visual rendering remains in ui/photo-selection. */
async function activeEbayTab() {
  const params = new URLSearchParams(location.search);
  const preferredId = Number(params.get("sourceTabId"));
  if (Number.isInteger(preferredId) && preferredId > 0) {
    try {
      const preferred = await chrome.tabs.get(preferredId);
      if (preferred?.id && isSupportedEbayUrlV600(preferred.url)) return preferred;
    } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && isSupportedEbayUrlV600(tab.url)) return tab;
  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs
    .filter(item => item?.id && isSupportedEbayUrlV600(item.url))
    .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0] || null;
}
function isSupportedEbayUrlV600(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return ["ebay.com", "ebay.ca", "ebay.co.uk"].some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch (_) { return false; }
}
function marketplacePlatformV8200(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase().replace(/\.$/, "");
    if (["ebay.com", "ebay.ca", "ebay.co.uk"].some(domain => host === domain || host.endsWith(`.${domain}`))) return "ebay";
    if (host === "depop.com" || host.endsWith(".depop.com")) return "depop";
    if (host === "poshmark.com" || host.endsWith(".poshmark.com")) return "poshmark";
  } catch (error) { globalThis.EbayLogger?.debug?.("Marketplace URL detection skipped", { message: error?.message || String(error) }); }
  return "unknown";
}
function isSupportedMarketplaceUrlV8200(value) { return marketplacePlatformV8200(value) !== "unknown"; }
async function activeMarketplaceTabV8200() {
  const params = new URLSearchParams(location.search);
  const preferredId = Number(params.get("sourceTabId"));
  if (Number.isInteger(preferredId) && preferredId > 0) {
    try { const preferred = await chrome.tabs.get(preferredId); if (preferred?.id && isSupportedMarketplaceUrlV8200(preferred.url)) return preferred; }
    catch (error) { globalThis.EbayLogger?.debug?.("Preferred marketplace tab lookup skipped", { message: error?.message || String(error) }); }
  }
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current?.id && isSupportedMarketplaceUrlV8200(current.url)) return current;
  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs.filter(tab => tab?.id && isSupportedMarketplaceUrlV8200(tab.url)).sort((a,b)=>Number(b.lastAccessed||0)-Number(a.lastAccessed||0))[0] || null;
}
function pingContentBridgeV890(tabId, timeoutMs = 1200) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve({ ok: false, message: "Content bridge ping timed out." }); } }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, { type: "CONTENT_BRIDGE_PING_V890" }, response => {
        const runtimeError = chrome.runtime.lastError;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (runtimeError) resolve({ ok: false, message: runtimeError.message });
        else resolve(response || { ok: false, message: "No content bridge response." });
      });
    } catch (error) {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ ok: false, message: error?.message || String(error) }); }
    }
  });
}
async function injectContentScript(tabId) {
  // Normal case: the manifest page runtime is already alive. Only the optional
  // Helper UI is injected; core modules are never executed twice on a live page.
  let ready = await pingContentBridgeV890(tabId);
  if (!(ready?.ok && ready.version === "8.23.21")) {
    const pageFiles = pageRuntimeFilesFromManifestV8130();
    if (!pageFiles.length) return false;
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: pageFiles });
    } catch (error) {
      console.warn("[eBay AI] page runtime bootstrap failed", error?.message || error);
      return false;
    }
    ready = await pingContentBridgeV890(tabId, 2000);
    if (!(ready?.ok && ready.version === "8.23.21")) return false;
  }

  if (ready.helperRuntime === true || ready.fullRuntime === true) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: HELPER_RUNTIME_FILES_V8130 });
  } catch (error) {
    console.warn("[eBay AI] Helper runtime injection failed", error?.message || error);
    return false;
  }
  const afterInject = await pingContentBridgeV890(tabId, 2000);
  return afterInject?.ok === true
    && afterInject.version === "8.23.21"
    && (afterInject.helperRuntime === true || afterInject.fullRuntime === true);
}
function sendEbayTabMessageV639(tabId, type, payload = {}) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type, payload }, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, message: "No response." });
    });
  });
}
function sanitizePageContextV639(value = {}) {
  const ctx = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = input => String(input || "").replace(/\u0000/g, "").trim();
  const blocked = label => Boolean(globalThis.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label));
  const fields = (Array.isArray(ctx.fields) ? ctx.fields : []).slice(0, 100).map(field => {
    const name = text(field?.name || field?.label).slice(0, 120);
    const type = ["text", "dropdown", "multi", "choice", "yesno"].includes(String(field?.type || "")) ? String(field.type) : "dropdown";
    const options = (Array.isArray(field?.options) ? field.options : [])
      .map(option => text(option).slice(0, 80))
      .filter(Boolean)
      .slice(0, 80);
    return {
      name,
      label: name,
      type,
      currentValue: text(field?.currentValue).slice(0, 160),
      required: field?.required === true,
      customValueAllowed: field?.customValueAllowed === true,
      options
    };
  }).filter(field => field.name && !blocked(field.name));
  const fieldSummary = {};
  for (const [label, rawValue] of Object.entries((ctx.fieldSummary && typeof ctx.fieldSummary === "object" && !Array.isArray(ctx.fieldSummary)) ? ctx.fieldSummary : {})) {
    const name = text(label).slice(0, 120);
    if (name && !blocked(name)) fieldSummary[name] = text(rawValue).slice(0, 160);
  }
  const safeUrl = text(ctx.url).slice(0, 2000);
  const draftMatch = safeUrl.match(/[?&](?:draftId|draft_id)=([^&#]+)/i);
  return {
    platform: ["ebay", "depop", "poshmark"].includes(String(ctx.platform || "").toLowerCase()) ? String(ctx.platform).toLowerCase() : marketplacePlatformV8200(safeUrl),
    platformLabel: text(ctx.platformLabel).slice(0, 80),
    url: safeUrl,
    draftId: draftMatch ? decodeURIComponent(draftMatch[1]).slice(0, 180) : "",
    pageTitle: text(ctx.pageTitle).slice(0, 500),
    currentTitle: text(ctx.currentTitle).slice(0, 160),
    category: text(ctx.category).slice(0, 500),
    // V8.23.21 keeps only compact Item Specific metadata in the AI path.
    condition: "",
    conditionDescription: "",
    description: "",
    visibleText: "",
    fieldSummary,
    fields,
    capturedAt: new Date().toISOString()
  };
}



async function refreshItemSpecificContextV670({ quiet = false } = {}) {
  const tab = await activeEbayTab();
  if (!tab) return { ok: false, message: "Open an eBay draft page first." };
  const injected = await injectContentScript(tab.id);
  if (!injected) return { ok: false, message: "Could not connect to the eBay draft page." };
  const result = await globalThis.EbayCore.ebay.readContext(tab.id, {}, 30000);
  if (!result?.ok) return { ok: false, message: result?.message || "Could not read Item Specific questions." };
  const previousUrl = String(ebayPageContextV639.url || "");
  const nextContext = sanitizePageContextV639(result.pageContext || {});
  const sameDraft = !!previousUrl && previousUrl === String(nextContext.url || "");
  ebayPageContextV639 = nextContext;
  const existingData = sameDraft ? getData() : { ...getData(), specifics: "" };
  const answers = mergedItemSpecificAnswersV670(existingData);
  setData(itemSpecificsOnlyDataV670(answers));
  await savePhotoCaches();
  if (!quiet) setStatus(`Loaded ${currentItemSpecificQuestionsV670().length} Item Specific question(s) from eBay.`);
  return { ok: true, count: currentItemSpecificQuestionsV670().length };
}
async function readCurrentMarketplacePhotosV8220() {
  const tab = await activeMarketplaceTabV8200();
  if (!tab) {
    setStatus("Open an eBay, Depop, or Poshmark listing page first.");
    globalThis.EbayUI?.photoSelection?.setReport?.("Open the current marketplace listing, then click Read Photos + Listing Fields.");
    return;
  }
  const platform = marketplacePlatformV8200(tab.url);
  const platformLabel = platform === "depop" ? "Depop" : platform === "poshmark" ? "Poshmark" : "eBay";
  const injected = await injectContentScript(tab.id);
  if (!injected) { setStatus(`Could not connect to ${platformLabel}. Refresh the listing page and try again.`); return; }
  setStatus(`[02] Reading ${platformLabel} photos and listing fields…`);

  try {
    let result;
    if (platform === "ebay") {
      result = await globalThis.EbayManualModeV890.readPhotos({
        tabId: tab.id,
        draftId: extractDraftIdV701(tab.url),
        strictCurrentDraft: false,
        timeoutMs: 45000
      });
    } else {
      result = await new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, {
          type: "CORE_MARKETPLACE_READ_LISTING_V8200",
          payload: { requirePhotos: false, photoLimit: platform === "depop" ? 8 : 16 }
        }, response => {
          if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, message: `No response from ${platformLabel}.` });
        });
      });
      if (!result?.ok) throw new Error(result?.message || `${platformLabel} listing could not be read.`);
    }

    const selector = globalThis.EbayAiPhotoSelectorV790;
    const rawPhotos = Array.isArray(result.photos) ? result.photos : [];
    const uniquePhotos = platform === "ebay" && selector?.filterPhotos ? selector.filterPhotos(rawPhotos) : rawPhotos;
    currentPhotoSourcePlatformV8220 = platform;
    ebayPhotoCache = uniquePhotos.slice(0, platform === "depop" ? 8 : platform === "poshmark" ? 16 : 25).map((photo, index) => ({
      ...photo,
      marketplaceSource: photo?.marketplaceSource || platform,
      trustedMarketplacePhoto: true,
      kind: photo?.kind || (platform === "ebay" ? "ebay" : "marketplace"),
      name: photo?.name || `${platform}-photo-${index + 1}.jpg`
    }));
    screenshotPhotoCache = [];

    const previousUrl = String(ebayPageContextV639.url || "");
    const nextContext = sanitizePageContextV639(result.pageContext || { url: tab.url, pageTitle: tab.title, fields: result.fields || [], fieldSummary: Object.fromEntries((result.fields || []).map(field => [field.name || field.label, field.currentValue || ""])) });
    const sameListing = !!previousUrl && previousUrl === String(nextContext.url || "");
    ebayPageContextV639 = nextContext;
    const existingData = sameListing ? getData() : { ...getData(), specifics: "" };
    setData(itemSpecificsOnlyDataV670(mergedItemSpecificAnswersV670(existingData)));
    await savePhotoCaches();
    globalThis.EbayUI?.photoSelection?.renderAll?.();

    const debug = result.debug || {};
    const report = [
      `Platform: ${platformLabel}`,
      `Detected photos: ${ebayPhotoCache.length}`,
      `Detected listing fields: ${currentItemSpecificQuestionsV670().length}`,
      `Page: ${result.pageTitle || tab.title || `${platformLabel} listing`}`
    ];
    if (platform === "ebay") {
      report.push(`Photo count on eBay: ${result.uploadedPhotoCount || debug.uploadedCount || ebayPhotoCache.length}`);
      report.push(`Photo sources: DOM ${debug.domCandidates || 0}, section HTML ${debug.htmlCandidates || 0}, resources ${debug.resourceCandidates || 0}`);
    }
    report.push("Shared photo reader completed.");
    globalThis.EbayUI?.photoSelection?.setReport?.(report.join("\n"));
    setStatus(`[02] Ready: ${ebayPhotoCache.length} photo(s), ${currentItemSpecificQuestionsV670().length} ${platformLabel} field(s).`);
    await addLog("BLOCK 02 Read Photos", `${platformLabel}: ${ebayPhotoCache.length} photo(s); ${currentItemSpecificQuestionsV670().length} field(s)`);
  } catch (error) {
    const message = error?.message || String(error);
    setStatus(`[02] Read error: ${message}`);
    globalThis.EbayUI?.photoSelection?.setReport?.(`Could not read the current marketplace listing: ${message}`);
  }
}

async function captureVisibleArea() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setStatus("No active tab."); return; }
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 82 });
    screenshotPhotoCache = [{ kind: "screenshot", dataUrl, name: "visible-ebay-area.jpg", createdAt: new Date().toISOString() }];
    await savePhotoCaches();
    globalThis.EbayUI?.photoSelection?.renderAll?.();
    globalThis.EbayUI?.photoSelection?.setReport?.("Captured visible browser area as fallback. It may include non-product UI, so eBay photo URLs are better when available.");
    setStatus("Visible area captured.");
  } catch (error) {
    setStatus(`Capture failed: ${error.message || error}`);
  }
}

async function buildRawImagesForSharedAiV890(useEbayOnly = false) {
  const settings = getSettingsFromUi();
  const maxSide = Number(settings.imageMaxSide || 1280);
  const quality = Number(settings.imageQuality || 0.82);
  const images = [];
  for (const [index, photo] of ebayPhotoCache.slice(0, 25).entries()) {
    const source = String(photo?.marketplaceSource || currentPhotoSourcePlatformV8220 || "ebay").toLowerCase();
    if (photo.dataUrl) images.push({ kind: source === "ebay" ? "ebay" : "marketplace", marketplaceSource: source, name: photo.name || `${source}-photo-${index + 1}.jpg`, dataUrl: photo.dataUrl, alt: photo.alt || "", role: photo.role || "" });
    else if (photo.url || photo.src) images.push({ kind: source === "ebay" ? "ebay" : "marketplace", marketplaceSource: source, name: photo.name || `${source}-photo-${index + 1}.jpg`, url: photo.url || photo.src, alt: photo.alt || "", role: photo.role || "" });
  }
  if (!useEbayOnly) {
    for (const [index, shot] of screenshotPhotoCache.slice(0, 4).entries()) images.push({ kind: "screenshot", name: shot.name || `screenshot-${index + 1}.jpg`, dataUrl: shot.dataUrl });
    const files = Array.from($("photoInput")?.files || []);
    for (const file of files.slice(0, 8)) images.push({ kind: "upload", name: file.name, dataUrl: await dataUrlFromFile(file, maxSide, quality) });
  }
  const selector = globalThis.EbayAiPhotoSelectorV790;
  return selector?.filterPhotos ? selector.filterPhotos(images) : images;
}

async function clearAllPhotosV780() {
  if ($("photoInput")) $("photoInput").value = "";
  ebayPhotoCache = [];
  currentPhotoSourcePlatformV8220 = "ebay";
  screenshotPhotoCache = [];
  ebayPageContextV639 = {};
  lastPhotoChecklist = null;
  dynamicSpecificsSignatureV670 = "";
  await globalThis.EbayAiStorageV790.remove([
    STORAGE.ebayPhotos,
    STORAGE.screenshotPhotos,
    STORAGE.pageContext,
    STORAGE.checklist
  ]);
  globalThis.EbayUI?.photoSelection?.renderAll?.();
  globalThis.EbayUI?.textImport?.updateAll?.();
  globalThis.EbayUI?.photoSelection?.setReport?.("All photos and loaded listing fields were removed. Use Read Photos + Listing Fields or Choose Files to add them again.");
  setStatus("All AI photos and Item Specific questions removed.");
}

async function removePhotoFromAnalysisV642(kind, sourceIndex, label = "photo") {
  const index=Number(sourceIndex); if(!Number.isInteger(index)||index<0)return;
  if(kind==="ebay"||kind==="marketplace") ebayPhotoCache.splice(index,1);
  else if(kind==="screenshot") screenshotPhotoCache.splice(index,1);
  else if(kind==="upload"){const result=globalThis.EbayUI?.photoSelection?.removeUploadAt?.(index);if(result?.clearedAll)globalThis.EbayUI?.photoSelection?.setReport?.("The selected upload was removed. This Chrome version cleared all manually uploaded photos; marketplace photos were preserved.");}
  lastPhotoChecklist=null; await savePhotoCaches(); globalThis.EbayUI?.photoSelection?.renderAll?.(); globalThis.EbayUI?.photoSelection?.setReport?.(`Removed ${label} from AI analysis. Re-read the current marketplace photos or choose the file again to restore it.`); setStatus("Photo removed from AI analysis.");
}
