/* V8.23.21 diagnostics workflow: gathers current popup/runtime state; shared diagnostics owns persistence/math. */

function highResolutionDiagnosticPhotoUrlV82317(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "i.ebayimg.com" || host.endsWith(".ebayimg.com"))) return "";
    if (!/^\/(?:images\/g\/[^/]+\/|00\/s\/)/i.test(url.pathname)) return "";
    if (!/\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname)) return "";
    url.hash = "";
    url.pathname = url.pathname
      .replace(/\/s-l\d+([./])/ig, "/s-l1600$1")
      .replace(/\/\$_(\d{1,2})\.(jpe?g|png|webp|gif)$/i, (match, code, ext) => Number(code) < 57 ? `/$_57.${ext}` : match);
    return url.href;
  } catch (_) { return ""; }
}

function diagnosticPhotoManifestV82317(photos = []) {
  return (Array.isArray(photos) ? photos : []).map((photo, index) => {
    const source = photo?.canonicalUrl || photo?.url || photo?.src || "";
    const highResUrl = highResolutionDiagnosticPhotoUrlV82317(source);
    return {
      index: index + 1,
      photoId: String(photo?.photoId || photo?.photo_id || ""),
      name: String(photo?.name || `ebay-photo-${index + 1}`),
      role: String(photo?.role || ""),
      highResUrl: highResUrl || "",
      highResAvailable: Boolean(highResUrl),
      sourceKind: /^data:image\//i.test(String(source)) ? "local_data" : highResUrl ? "ebay_high_res" : source ? "other_url" : "missing"
    };
  });
}

async function saveDraftHistory(status = "saved") {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.draftHistory);
  const history = stored[STORAGE.draftHistory] || [];
  const data = getData();
  const entry = {
    createdAt: new Date().toISOString(), status, title: data.title || "Untitled", price: data.price || "", brand: data.brand || "", size: data.size || "",
    photoCounts: globalThis.EbayUI?.photoSelection?.counts?.() || {}, warnings: buildWarnings(data).slice(0, 8), data
  };
  await globalThis.EbayAiStorageV790.set({ [STORAGE.draftHistory]: [entry, ...history].slice(0, 20) });
  globalThis.EbayEventsV82310?.emit?.("diagnostics:drafts");
}

async function collectDiagnosticsV82310() {
  const settings = getSettingsFromUi();
  const keyStatus = await sendRuntimeMessage({ type: "AI_KEY_STATUS_V637" });
  const tab = await activeEbayTab();
  const history = await getUsageHistory();
  const sum = summarizeUsage(history);
  const counts = globalThis.EbayUI?.photoSelection?.counts?.() || {ebay:0,upload:0,screenshot:0};
  const data = getData();
  const warnings = buildWarnings(data);
  const diag = {
    version: "V8.23.21", time: new Date().toISOString(), apiEnabled: !!settings.apiEnabled,
    apiMode: settings.apiMode, apiBaseUrl: settings.apiBaseUrl || "blank", apiModel: settings.apiModel || "blank",
    apiKeyStored: !!keyStatus?.keyStored, ebayTabOpen: !!tab, photos: counts,
    listingReady: !!(data.title && data.price), warnings: warnings.length,
    usageTodayCost: sum.todayCost, usageMonthCost: sum.monthCost
  };
  const text = [
    `Version: ${diag.version}`,
    `API: ${diag.apiEnabled ? "ON" : "OFF"} • ${diag.apiMode} • model=${diag.apiModel}`,
    `API key stored: ${diag.apiKeyStored ? "yes" : "no"}`,
    `eBay draft tab: ${diag.ebayTabOpen ? "OK" : "not active"}`,
    `Photos: eBay ${counts.ebay}, upload ${counts.upload}, screenshot ${counts.screenshot}`,
    `Listing fields: ${diag.listingReady ? "ready" : "needs review"}`,
    `Warnings: ${warnings.length}`,
    `Usage today: ${money(sum.todayCost)}; month: ${money(sum.monthCost)}`
  ].join("\n");
  await globalThis.EbayAiStorageV790?.set?.({ [STORAGE.lastDiagnostics]: diag });
  await addLog("Diagnostics run", text);
  return { diag, text };
}

async function buildDebugPayloadV82317() {
  const settings = getSettingsFromUi();
  const store = globalThis.EbayAiStorageV790;
  const logs = await store?.get?.(STORAGE.logs) || {};
  const diagnostics = await store?.get?.(STORAGE.lastDiagnostics) || {};
  const data = getData();
  const diagnosticPhotos = diagnosticPhotoManifestV82317(ebayPhotoCache);
  return {
    version: "V8.23.21", createdAt: new Date().toISOString(), settings: settingsWithoutApiKeyV637(settings),
    listing: data, photoCounts: globalThis.EbayUI?.photoSelection?.counts?.() || {},
    // Diagnostic exports deliberately keep canonical high-resolution eBay evidence
    // URLs, while never embedding local data URLs or API secrets. This makes an OCR
    // miss reproducible without degrading the saved evidence to a thumbnail.
    ebayPhotos: diagnosticPhotos,
    diagnosticHighResPhotoCount: diagnosticPhotos.filter(photo => photo.highResAvailable).length,
    checklist: lastPhotoChecklist || globalThis.EbayUI?.photoSelection?.checklist?.() || [], warnings: buildWarnings(data),
    usageHistory: await getUsageHistory(), logs: logs[STORAGE.logs] || [], diagnostics: diagnostics[STORAGE.lastDiagnostics] || null
  };
}

async function renderLogs() {
  const logs=await readLogsV82310(); globalThis.EbayUI?.diagnostics?.renderLogs?.(logs); return logs;
}
async function renderUsageHistory() {
  const settings=getSettingsFromUi(), history=await getUsageHistory(), sum=summarizeUsage(history);
  globalThis.EbayUI?.diagnostics?.renderUsage?.(history,settings,sum); return {history,sum};
}
async function renderDraftHistory() {
  const history=await readDraftHistoryV82310(); globalThis.EbayUI?.diagnostics?.renderDrafts?.(history); return history;
}
async function runDiagnostics() {
  const result=await collectDiagnosticsV82310(); globalThis.EbayUI?.diagnostics?.setText?.(result.text); setStatus("Diagnostics complete."); return result;
}
async function exportDebugFile() {
  const payload=await buildDebugPayloadV82317(), name=`ebay-filler-v8-23-18-debug-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
  globalThis.EbayUI?.diagnostics?.downloadJson?.(name,payload); setStatus("Debug file exported. API key was redacted.");
}
async function clearUsageHistory() { await clearUsageDataV82310(); await renderUsageHistory(); setStatus("Usage history and AI cache cleared."); }
async function copyLogs() { const logs=await readLogsV82310(); await globalThis.EbayUI?.diagnostics?.copyText?.(logs.map(l=>`[${l.time}] ${l.message}\n${l.detail||""}`).join("\n\n")); setStatus("Logs copied."); }
async function clearLogs() { await clearLogsDataV82310(); await renderLogs(); setStatus("Logs cleared."); }
