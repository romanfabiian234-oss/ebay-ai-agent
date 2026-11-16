function bindClickV780(id, handler) {
  $(id)?.addEventListener("click", handler);
}

function bindQueueAndModeEventsV780() {
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  bindClickV780("clearQueueBtn", clearQueueV701);
  bindClickV780("startQueueBtn", startQueueRunnerV710);
  bindClickV780("stopQueueBtn", stopQueueRunnerV710);
  bindClickV780("switchAiModeBtn", () => setWorkflowMode("ai"));
  bindClickV780("switchTextModeBtn", () => setWorkflowMode("text"));
  bindClickV780("switchHybridModeBtn", () => setWorkflowMode("hybrid"));
  $("workflowMode")?.addEventListener("change", () => {
    updateWorkflowModeUi();
    updateApiUi();
    saveSettings();
  });
}

function bindFormAndSettingsEventsV780() {
  for (const id of FIELD_IDS) {
    $(id)?.addEventListener("input", () => { updateAll(); scheduleSave(); });
    $(id)?.addEventListener("change", () => { updateAll(); scheduleSave(); });
  }
  for (const id of SETTINGS_KEYS) {
    $(id)?.addEventListener("input", () => { if (id === "themeMode") applyTheme($(id).value); updateApiUi(); });
    $(id)?.addEventListener("change", () => {
      if (id === "themeMode") applyTheme($(id).value);
      if (id === "webResearchEnabled") updateWebResearchToggleV640();
      if (["panelSizeMode", "panelCustomWidth", "panelCustomHeight"].includes(id)) updatePanelSizeUiV8190();
      updateApiUi();
    });
  }
  $("panelSizeMode")?.addEventListener("input", updatePanelSizeUiV8190);
  $("panelCustomWidth")?.addEventListener("input", updatePanelSizeUiV8190);
  $("panelCustomHeight")?.addEventListener("input", updatePanelSizeUiV8190);
  bindClickV780("savePanelSizeBtn", () => savePanelSizeSettingsV8190().catch(error => setStatus(`Panel size not saved: ${error?.message || error}`)));
  bindClickV780("resetPanelSizeBtn", () => savePanelSizeSettingsV8190({ reset: true }).catch(error => setStatus(`Panel size reset failed: ${error?.message || error}`)));
}

function bindPhotoAndFillEventsV780() {
  $("photoInput")?.addEventListener("change", previewPhotos);
  bindClickV780("readEbayPhotosBtn", readCurrentMarketplacePhotosV8220);
  bindClickV780("refreshQuestionsBtn", reloadQuestionsV680);
  bindClickV780("includeAllQuestionsBtn", includeAllQuestionsV680);
  bindClickV780("captureVisibleBtn", captureVisibleArea);
  bindClickV780("analyzeBtn", () => analyzePhotos(false));
  bindClickV780("webResearchToggleBtn", toggleWebResearchV640);
  bindClickV780("analyzeEbayBtn", () => analyzePhotos(true));
  bindClickV780("fillOneFromAiBtn", oneButtonFillEbay);
  bindClickV780("clearPhotosBtn", clearAllPhotosV780);
  bindClickV780("pasteClipboardBtn", pasteFromClipboard);
  bindClickV780("importBtn", importListingText);
  bindClickV780("saveBtn", async () => { await saveDraft(); setStatus("Saved."); });
  bindClickV780("clearFormBtn", clearForm);
  bindClickV780("fillOneBtn", oneButtonFillEbay);
  bindClickV780("marketplaceFillAllBtn", fillAllCurrentListingV8200);
  bindClickV780("stopActionsBtn", stopAllActions);
  bindClickV780("enableHoverAssistantBtn", enableHoverAssistant);
  bindClickV780("disableHoverAssistantBtn", disableHoverAssistant);
}

function reportUnifiedExportErrorV780(error) {
  const message = error?.message || String(error);
  setUnifiedApiStatusV638(`Export failed: ${message}`);
  setStatus(`Export failed: ${message}`);
}

function saveSettingsFromButtonV780() {
  saveSettings().catch(error => {
    const message = error?.message || String(error);
    setStatus(`Settings not saved: ${message}`);
    if ($("settingsStatus")) $("settingsStatus").textContent = `Keychain error: ${message}`;
    setLocalSetupStatusV8131("backendStatusBox", "error", message);
  });
}

function bindApiSettingsEventsV780() {
  bindClickV780("applyPresetBtn", applyApiPreset);
  bindClickV780("saveUnifiedApiProfileBtn", saveUnifiedApiProfileV638);
  bindClickV780("exportUnifiedApiProfileBtn", () => exportUnifiedApiProfileV638().catch(reportUnifiedExportErrorV780));
  bindClickV780("importUnifiedApiProfileBtn", () => $("unifiedApiProfileFileInput")?.click());
  $("unifiedApiProfileFileInput")?.addEventListener("change", event => importUnifiedApiProfileV638(event.target.files?.[0]));
  bindClickV780("checkUnifiedConnectionsBtn", checkUnifiedConnectionsV638);
  bindClickV780("saveSettingsBtn", saveSettingsFromButtonV780);
  bindClickV780("exportApiSettingsBtn", exportApiSettingsFile);
  bindClickV780("importApiSettingsBtn", () => $("apiSettingsFileInput")?.click());
  $("apiSettingsFileInput")?.addEventListener("change", event => importApiSettingsFile(event.target.files?.[0]));
  bindClickV780("clearSensitiveBtn", clearSensitiveData);
  bindClickV780("resetSettingsBtn", resetSettings);
  bindClickV780("testApiBtn", testApi);
  bindClickV780("saveClaudeKeyBtn", () => saveClaudeKeyV850().catch(error => setStatus(`Claude key error: ${error?.message || error}`)));
  bindClickV780("removeClaudeKeyBtn", () => removeClaudeKeyV850().catch(error => setStatus(`Claude key error: ${error?.message || error}`)));
}

function bindDebugEventsV780() {
  bindClickV780("exportDomBtn", exportDomSnapshot);
  bindClickV780("downloadDebugBundleBtn", downloadDebugBundle);
  bindClickV780("clearActionLogBtn", clearEbayActionLog);
  bindClickV780("copyLogsBtn", copyLogs);
  bindClickV780("clearLogsBtn", clearLogs);
  bindClickV780("runDiagnosticsBtn", runDiagnostics);
  bindClickV780("exportDebugBtn", exportDebugFile);
  bindClickV780("clearUsageBtn", clearUsageHistory);
}

function bindEbayConnectionEventsV780() {
  bindClickV780("ebayProfileSaveBtn", saveEbayProfileV636);
  bindClickV780("ebaySecretSaveBtn", saveEbayClientSecretV636);
  bindClickV780("ebayProfileExportBtn", exportEbayProfileV636);
  bindClickV780("ebayProfileImportBtn", () => $("ebayProfileFileInput")?.click());
  $("ebayProfileFileInput")?.addEventListener("change", event => importEbayProfileV636(event.target.files?.[0]));
  bindClickV780("ebayRemoveCredentialsBtn", removeSavedEbayCredentialsV636);
  bindClickV780("ebayOauthCheckBtn", () => runEbayOauthActionV63("EBAY_OAUTH_STATUS_V63", "Checking the shared local secure backend..."));
  bindClickV780("ebayOauthAuthorizeBtn", () => runEbayOauthActionV63("EBAY_OAUTH_START_V63", "Preparing secure eBay authorization..."));
  bindClickV780("ebayOauthReadBtn", () => runEbayOauthActionV63("EBAY_OAUTH_READ_ACCOUNT_V63", "Reading safe account status from eBay..."));
  bindClickV780("ebayOauthDisconnectBtn", () => runEbayOauthActionV63("EBAY_OAUTH_DISCONNECT_V63", "Clearing local eBay OAuth session..."));
}

async function applyStandaloneRouteV880() {
  const params = new URLSearchParams(location.search);
  const requestedTab = params.get("tab");
  if (requestedTab && document.getElementById(requestedTab)) switchTab(requestedTab);
  const notice = String(params.get("notice") || "").trim();
  if (notice) setStatus(notice);
  if (requestedTab === "reviewTab") {
    try { await loadCurrentReviewV830({ quiet: true }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  }
}

async function initializePopupV600() {
  bindQueueAndModeEventsV780();
  bindFormAndSettingsEventsV780();
  bindPhotoAndFillEventsV780();
  bindApiSettingsEventsV780();
  bindDebugEventsV780();
  bindEbayConnectionEventsV780();
  bindReviewEventsV830();
  await loadPopupDataV780();
  await applyStandaloneRouteV880();
  maybeAutoReadPhotosV780();
}

globalThis.EbayPopupSyncV82310?.start?.({
  onQueue: queue => { if ($("queuePopupList")) renderQueuePopupV701(queue); },
  onRunner: runner => { if ($("queueRunnerStatus")) renderQueueRunnerV710(runner); },
  onLogs: () => renderLogs(),
  onUsage: () => renderUsageHistory(),
  onDrafts: () => renderDraftHistory()
});

document.addEventListener("DOMContentLoaded", () => {
  initializePopupV600().catch(error => {
    const message = `Startup error: ${error?.message || error || "unknown error"}`;
    try { setStatus(message); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    try { console.error("[eBay Filler V8.23.21]", error); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  });
});
