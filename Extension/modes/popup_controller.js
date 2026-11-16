/* V8.23.21 popup data/startup workflow. UI/popup owns bindings and visual route only. */
async function loadPopupDataV780() {
  await loadSettings();
  await loadEbayConnectionStateV780();
  await synchronizePersistentSetupV873();
  await refreshQueueV701();
  await refreshQueueRunnerV710();
  await loadDraft();
  await loadPhotoCaches();
  await loadQuestionPreferencesV680();
  try { await refreshItemSpecificContextV670({ quiet: true }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  await renderLogs(); await renderUsageHistory(); await renderDraftHistory();
  try { await refreshReviewDatabaseV830(); await renderReviewItemsV830(); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  globalThis.EbayUI?.textImport?.updateAll?.();
  updateApiUi();
}
function maybeAutoReadPhotosV780() {
  const settings = globalThis.EbayUI?.settings?.getSettings?.() || {};
  if (settings.autoReadEbayPhotos) activeMarketplaceTabV8200().then(tab => { if (tab) readCurrentMarketplacePhotosV8220(); });
}
