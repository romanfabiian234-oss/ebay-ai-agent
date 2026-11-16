/* V8.23.21 settings workflow container. UI rendering lives in ui/settings. */
async function savePersistentSetupProfileV873(settings = {}) {
  try {
    return await sendRuntimeMessage({
      type: "AGENT_SETUP_SAVE_V873",
      payload: { settings: settingsForPersistentProfileV873(settings) }
    });
  } catch (_) {
    return { ok: false };
  }
}
async function refreshLocalSetupStatusV8131() {
  const response = await sendRuntimeMessage({ type: "AGENT_SETUP_STATUS_V873" });
  applyBackendSetupStatusV8131(response);
  return response;
}
async function synchronizePersistentSetupV873() {
  const response = await sendRuntimeMessage({ type: "AGENT_SETUP_STATUS_V873" });
  if (!response?.ok) {
    applyBackendSetupStatusV8131(response);
    if ($("settingsStatus")) $("settingsStatus").textContent = `Backend unavailable: ${response?.message || "Start or reinstall the local backend."}`;
    return false;
  }
  applyBackendSetupStatusV8131(response);

  const current = getSettingsFromUi();
  const profile = response.profile && typeof response.profile === "object" ? response.profile : {};
  const profileSettings = profile.settings && typeof profile.settings === "object" ? profile.settings : {};
  let next = { ...current };
  let saveProfile = false;

  if (profile.configured) {
    next = { ...next, ...profileSettings };
  } else {
    if (!apiSettingsConfiguredV873(next)) next = { ...next, ...OPENAI_AUTO_SETTINGS_V873 };
    // A new Mac may not have a Keychain key yet. Keep the API configuration enabled
    // so the user only needs to paste the key once; missing secret status is shown separately.
    if (response.claudeKeyStored) next.claudeReviewEnabled = true;
    saveProfile = true;
  }

  if (response.aiKeyStored && !apiSettingsConfiguredV873(next)) {
    next = { ...next, ...OPENAI_AUTO_SETTINGS_V873 };
    saveProfile = true;
  }
  next.saveApiKey = !!response.aiKeyStored;
  next.claudeKeyStored = !!response.claudeKeyStored;
  next.webResearchEnabled = false;
  next.autoFillDescriptionCondition = false;

  setSettingsUi({ ...next, apiKey: "", claudeApiKey: "" });
  await globalThis.EbayAiStorageV790.set({
    [STORAGE.settings]: settingsWithoutApiKeyV637(next),
    [PERSISTENT_SETUP_SYNC_STORAGE_KEY_V873]: true,
  });
  if (saveProfile) await savePersistentSetupProfileV873(next);

  setSettingsLocalStatusV8131(profile.configured ? "Synced from this Mac ✓" : "Defaults saved on this Mac ✓", "ok");
  const apiState = response.aiKeyStored ? "GPT key is ready in Keychain." : "GPT key is not installed on this Mac yet. Paste it once and click Save GPT Settings & Key.";
  const claudeState = response.claudeKeyStored ? "Claude key is ready." : "Claude is optional and not configured.";
  if ($("settingsStatus")) $("settingsStatus").textContent = `${apiState} ${claudeState}`;
  return true;
}
async function saveApiKeyIfPresentV637(settings = {}) {
  const key = String(settings.apiKey || "").trim();
  if (!key) return { saved: false };
  const response = await sendRuntimeMessage({ type: "AI_KEY_SAVE_V637", payload: { apiKey: key } });
  if (!response?.ok) throw new Error(response?.message || "API key could not be saved to macOS Keychain.");
  if ($("apiKey")) $("apiKey").value = "";
  if ($("saveApiKey")) $("saveApiKey").checked = true;
  return { saved: true, message: response.message || "API key saved in macOS Keychain." };
}
async function refreshAiKeyStatusV637({ quiet = false } = {}) {
  const response = await sendRuntimeMessage({ type: "AI_KEY_STATUS_V637" });
  if (response?.ok) {
    if ($("saveApiKey")) $("saveApiKey").checked = !!response.keyStored;
    setLocalSetupStatusV8131("gptKeyStatusBox", response.keyStored ? "ok" : "warn", response.keyStored ? "Stored in Keychain ✓" : "Not installed on this Mac");
    if (!quiet && $("settingsStatus")) $("settingsStatus").textContent = response.message || (response.keyStored ? "GPT key is stored securely in macOS Keychain." : "GPT key is not installed on this Mac yet. Paste it once and click Save GPT Settings & Key.");
    return !!response.keyStored;
  }
  setLocalSetupStatusV8131("backendStatusBox", "error", response?.message || "Local backend is unavailable.");
  setLocalSetupStatusV8131("gptKeyStatusBox", "error", "Unknown until Backend connects");
  if (!quiet && $("settingsStatus")) $("settingsStatus").textContent = `Keychain status unavailable: ${response?.message || "Local backend is not available."}`;
  return false;
}
async function saveClaudeKeyIfPresentV850(settings = {}) {
  const key = String(settings.claudeApiKey || "").trim();
  if (!key) return { saved: false };
  const response = await sendRuntimeMessage({ type: "CLAUDE_KEY_SAVE_V850", payload: { apiKey: key } });
  if (!response?.ok) throw new Error(response?.message || "Claude API key could not be saved to macOS Keychain.");
  if ($("claudeApiKey")) $("claudeApiKey").value = "";
  if ($("claudeKeyStored")) $("claudeKeyStored").checked = true;
  return { saved: true, message: response.message || "Claude API key saved in macOS Keychain." };
}
async function refreshClaudeKeyStatusV850({ quiet = false } = {}) {
  const response = await sendRuntimeMessage({ type: "CLAUDE_KEY_STATUS_V850" });
  if ($("claudeKeyStored")) $("claudeKeyStored").checked = !!response?.keyStored;
  if (!quiet && $("claudeStatusBox")) $("claudeStatusBox").textContent = response?.message || "Claude Keychain status is unavailable.";
  return !!response?.keyStored;
}
async function saveClaudeKeyV850() {
  const settings = getSettingsFromUi();
  const result = await saveClaudeKeyIfPresentV850(settings);
  const stored = settingsWithoutApiKeyV637(settings);
  await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: stored });
  await refreshClaudeKeyStatusV850({ quiet: false });
  setStatus(result.saved ? "Claude key saved securely." : "Paste the Claude API key first.");
}
async function removeClaudeKeyV850() {
  const response = await sendRuntimeMessage({ type: "CLAUDE_KEY_REMOVE_V850" });
  if ($("claudeApiKey")) $("claudeApiKey").value = "";
  if ($("claudeKeyStored")) $("claudeKeyStored").checked = false;
  if ($("claudeStatusBox")) $("claudeStatusBox").textContent = response?.message || "Claude key removal failed.";
  setStatus(response?.ok ? "Claude key removed from macOS Keychain." : `Claude key removal failed: ${response?.message || "backend unavailable"}`);
}
async function toggleWebResearchV640() {
  const checkbox = $("webResearchEnabled");
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  updateWebResearchToggleV640();
  try {
    await saveSettings();
    setStatus(checkbox.checked
      ? "Internet Research ON. It will run as a text-only second stage."
      : "Internet Research OFF. Analysis will use photos and page context only.");
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    updateWebResearchToggleV640();
    setStatus(`Could not change Internet Research: ${error.message || error}`);
  }
}
async function exportApiSettingsFile() {
  const settings = getSettingsFromUi();
  const apiSettings = {};
  for (const key of API_FILE_KEYS) apiSettings[key] = settings[key];
  apiSettings.saveApiKey = false;

  downloadJsonFile("ebay-filler-api-settings.json", {
    format: "ebay-filler-api-settings",
    version: 2,
    exportedAt: new Date().toISOString(),
    warning: "No API key is included. The key remains in macOS Keychain.",
    settings: apiSettings
  });
  setStatus("API settings exported without the API key.");
  await addLog("API settings exported", "Reusable API JSON file created without secrets.");
}
async function importApiSettingsFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const imported = validateImportedApiSettings(JSON.parse(text));
    const importedKey = String(imported.apiKey || "").trim();
    delete imported.apiKey;
    if (importedKey) {
      const keyResponse = await sendRuntimeMessage({ type: "AI_KEY_SAVE_V637", payload: { apiKey: importedKey } });
      if (!keyResponse?.ok) throw new Error(keyResponse?.message || "Imported API key could not be moved to macOS Keychain.");
    }
    const stored = await globalThis.EbayAiStorageV790.get(STORAGE.settings);
    const merged = { ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] || {}), ...imported, apiKey: "" };

    merged.apiBaseUrl = normalizeBaseUrl(merged.apiBaseUrl);
    merged.apiPath = normalizePath(merged.apiPath || "/v1/chat/completions");
    merged.authHeader = merged.authHeader || "Authorization";
    merged.authPrefix = merged.authPrefix ?? "Bearer";
    merged.saveApiKey = importedKey ? true : !!merged.saveApiKey;

    await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: settingsWithoutApiKeyV637(merged) });
    setSettingsUi(merged);
    try {
      await refreshAiKeyStatusV637({ quiet: true });
      await refreshClaudeKeyStatusV850({ quiet: true });
    } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    setStatus(importedKey ? "API settings imported; API key moved to macOS Keychain. Press Test API." : "API settings imported without a key. Press Test API.");
    await addLog("API settings imported", `mode=${merged.apiMode}; base=${merged.apiBaseUrl || "blank"}; model=${merged.apiModel || "blank"}`);
  } catch (error) {
    setStatus(`API import failed: ${error.message || "invalid file"}`);
    await addLog("API settings import failed", error.message || "Invalid file");
  } finally {
    const input = $("apiSettingsFileInput");
    if (input) input.value = "";
  }
}
async function exportUnifiedApiProfileV638() {
  const ai = unifiedAiSettingsFromUiV638();
  const ebay = ebayProfileFromUiV636();
  if (!ebay.clientId || !ebay.runame) throw new Error("Enter the eBay Client ID and RuName before export.");

  let aiKeyStored = false;
  let clientSecretStored = false;
  let refreshTokenStored = false;
  try {
    await ensureNativeBackendConnectionV8180();
    const [aiStatus, ebayStatus] = await Promise.all([
      sendRuntimeMessage({ type: "AI_KEY_STATUS_V637" }),
      sendRuntimeMessage({ type: "EBAY_OAUTH_PROFILE_GET_V63" }),
    ]);
    aiKeyStored = !!aiStatus?.keyStored;
    clientSecretStored = !!ebayStatus?.profile?.clientSecretStored;
    refreshTokenStored = !!ebayStatus?.profile?.refreshTokenStored;
  } catch (_) {
    // Export remains safe and useful even if the backend is temporarily offline.
  }

  downloadJsonFile("ebay-filler-one-api-profile-v6-3-9.json", {
    format: "ebay-filler-unified-api-profile",
    version: 1,
    containsSecrets: false,
    exportedAt: new Date().toISOString(),
    security: "No API key, Client Secret, OAuth token, access token, refresh token, or local security credential is included.",
    ai,
    ebay,
    secretHints: {
      aiApiKeyWasStoredOnSourceMac: aiKeyStored,
      ebayClientSecretWasStoredOnSourceMac: clientSecretStored,
      ebayRefreshTokenWasStoredOnSourceMac: refreshTokenStored,
    },
  });
  setUnifiedApiStatusV638("One combined API profile exported safely without secrets.");
  setStatus("One combined API profile exported.");
  await addLog("Unified API profile exported", "GPT and eBay settings exported together without secrets.");
}
async function applyImportedAiSettingsV638(imported = {}) {
  const importedKey = String(imported.apiKey || "").trim();
  const safeImported = { ...imported };
  delete safeImported.apiKey;
  if (importedKey) {
    const keyResponse = await sendRuntimeMessage({ type: "AI_KEY_SAVE_V637", payload: { apiKey: importedKey } });
    if (!keyResponse?.ok) throw new Error(keyResponse?.message || "The legacy GPT key could not be moved to macOS Keychain.");
  }
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.settings);
  const merged = { ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] || {}), ...safeImported, apiKey: "" };
  merged.apiBaseUrl = normalizeBaseUrl(merged.apiBaseUrl);
  merged.apiPath = normalizePath(merged.apiPath || "/v1/chat/completions");
  merged.authHeader = merged.authHeader || "Authorization";
  merged.authPrefix = merged.authPrefix ?? "Bearer";
  merged.saveApiKey = importedKey ? true : !!merged.saveApiKey;
  await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: settingsWithoutApiKeyV637(merged) });
  setSettingsUi(merged);
  return { merged, importedKey: !!importedKey };
}
async function importUnifiedApiProfileV638(file) {
  if (!file) return;
  const applied = [];
  try {
    if (file.size > 131072) throw new Error("The API profile file is too large.");
    const parsed = validateUnifiedApiProfileV638(JSON.parse(await file.text()));
    const legacyKey = String(parsed.ai?.apiKey || "").trim();

    if (parsed.ebay) {
      applyEbayProfileUiV636(parsed.ebay);
      if (hasNativeBackendConnectionV8180()) {
        await ensureNativeBackendConnectionV8180();
        const response = await sendRuntimeMessage({ type: "EBAY_OAUTH_PROFILE_SAVE_V63", payload: parsed.ebay });
        if (!response?.ok) throw new Error(response?.message || "Could not save the imported eBay profile.");
        await clearPendingEbayProfileV715();
        applyEbayProfileUiV636(response.profile || parsed.ebay);
        applied.push("eBay settings");
      } else {
        await savePendingEbayProfileV715(parsed.ebay);
        applied.push("eBay settings pending backend connection");
      }
    }
    if (parsed.ai) {
      await applyImportedAiSettingsV638(parsed.ai);
      applied.push("GPT settings");
    }

    await refreshAiKeyStatusV637({ quiet: true });
    await refreshClaudeKeyStatusV850({ quiet: true });
    const source = parsed.importedLegacy ? ` Legacy ${parsed.importedLegacy} file accepted.` : "";
    const pending = applied.includes("eBay settings pending backend connection")
      ? " eBay settings were loaded while the local backend was unavailable. Run START.command, Reload the extension, then save them again."
      : "";
    setUnifiedApiStatusV638(`API profile imported successfully.${source}${pending} Secrets remain in macOS Keychain; re-enter only missing secrets.`);
    setStatus("Combined API profile imported.");
    await addLog("Unified API profile imported", parsed.importedLegacy ? `Legacy ${parsed.importedLegacy} format` : "Unified V8.23.21 format");
  } catch (error) {
    const message = error?.message || String(error);
    const partial = applied.length ? ` Applied before the error: ${applied.join(", ")}.` : " No settings were marked imported.";
    setUnifiedApiStatusV638(`API profile import failed: ${message}.${partial}`);
    setStatus(`API profile import failed: ${message}`);
    await addLog("Unified API profile import failed", `${message}; applied=${applied.join(", ") || "none"}`);
  } finally {
    if ($("unifiedApiProfileFileInput")) $("unifiedApiProfileFileInput").value = "";
  }
}
async function saveUnifiedApiProfileV638() {
  if (ebayOauthBusyV63) return;
  setEbayOauthBusyV63(true);
  const unifiedButton = $("saveUnifiedApiProfileBtn");
  if (unifiedButton) unifiedButton.disabled = true;
  const completed = [];
  try {
    await ensureNativeBackendConnectionV8180();
    const settings = getSettingsFromUi();
    const ebay = ebayProfileFromUiV636();
    if (!ebay.clientId || !ebay.runame) throw new Error("Enter the eBay Client ID (App ID) and OAuth RuName.");
    if (settings.apiEnabled && (!settings.apiBaseUrl || !settings.apiModel)) {
      throw new Error("GPT API is enabled: enter Base URL and Model.");
    }

    const ebayProfileResponse = await sendRuntimeMessage({ type: "EBAY_OAUTH_PROFILE_SAVE_V63", payload: ebay });
    if (!ebayProfileResponse?.ok) throw new Error(ebayProfileResponse?.message || "Could not save the eBay profile.");
    await clearPendingEbayProfileV715();
    applyEbayProfileUiV636(ebayProfileResponse.profile || ebay);
    completed.push("eBay profile");

    const clientSecret = String($("ebayProfileClientSecret")?.value || "").trim();
    if (clientSecret) {
      const secretResponse = await sendRuntimeMessage({ type: "EBAY_OAUTH_CREDENTIALS_SAVE_V63", payload: { clientSecret } });
      if (!secretResponse?.ok) throw new Error(secretResponse?.message || "Could not save the eBay Client Secret.");
      if ($("ebayProfileClientSecret")) $("ebayProfileClientSecret").value = "";
      applyEbayProfileUiV636(secretResponse.profile || ebayProfileResponse.profile || ebay);
      completed.push("eBay Client Secret");
    }

    const keyResult = await saveApiKeyIfPresentV637(settings);
    if (keyResult.saved) completed.push("GPT API key");
    const storedSettings = settingsWithoutApiKeyV637({ ...settings, saveApiKey: keyResult.saved ? true : !!settings.saveApiKey });
    await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: storedSettings });
    completed.push("GPT settings");
    applyTheme(settings.themeMode);
    updateApiUi();

    const [aiStatus, profileStatus] = await Promise.all([
      sendRuntimeMessage({ type: "AI_KEY_STATUS_V637" }),
      sendRuntimeMessage({ type: "EBAY_OAUTH_PROFILE_GET_V63" }),
    ]);
    if (profileStatus?.ok) applyEbayProfileUiV636(profileStatus.profile || ebay);
    const aiReady = !!aiStatus?.keyStored;
    const ebaySecretReady = !!profileStatus?.profile?.clientSecretStored;
    const missing = [];
    if (settings.apiEnabled && !aiReady) missing.push("GPT API key");
    if (!ebaySecretReady) missing.push("eBay Client Secret");
    const suffix = missing.length ? ` Missing on this Mac: ${missing.join(", ")}.` : " Both secrets are protected in macOS Keychain.";
    setUnifiedApiStatusV638(`GPT and eBay non-secret settings saved together.${suffix}`);
    setSettingsLocalStatusV8131("Saved on this Mac ✓", "ok");
    setLocalSetupStatusV8131("gptKeyStatusBox", aiReady ? "ok" : "warn", aiReady ? "Stored in Keychain ✓" : "Not installed on this Mac");
    await refreshLocalSetupStatusV8131();
    if ($("settingsStatus")) $("settingsStatus").textContent = aiReady ? "GPT API key is stored in macOS Keychain." : "GPT settings are saved, but the GPT API key is not installed on this Mac yet.";
    setEbayOauthStatusV63(ebaySecretReady ? "eBay profile saved. Authorize eBay if the refresh token is not stored yet." : "eBay profile saved. Enter Client Secret in Advanced eBay settings if you want to use the optional eBay API.");
    setStatus(missing.length ? `Settings saved. Still needed: ${missing.join(", ")}.` : "Both API settings and Keychain secrets are ready.");
    await addLog("Unified API settings saved", `GPT key=${aiReady ? "Keychain" : "missing"}; eBay secret=${ebaySecretReady ? "Keychain" : "missing"}`);
  } catch (error) {
    const message = error?.message || String(error);
    const partial = completed.length ? ` Saved before the error: ${completed.join(", ")}.` : " No settings were marked saved.";
    setUnifiedApiStatusV638(`Save failed: ${message}.${partial}`);
    setStatus(`API settings not fully saved: ${message}`);
    await addLog("Unified API save failed", `${message}; saved=${completed.join(", ") || "none"}`);
  } finally {
    setEbayOauthBusyV63(false);
    if (unifiedButton) unifiedButton.disabled = false;
  }
}
async function checkUnifiedConnectionsV638() {
  try {
    await ensureNativeBackendConnectionV8180();
    setUnifiedApiStatusV638("Checking the shared local secure backend...");
    const [ebay, ai] = await Promise.all([
      sendRuntimeMessage({ type: "EBAY_OAUTH_STATUS_V63" }),
      sendRuntimeMessage({ type: "AI_KEY_STATUS_V637" }),
    ]);
    if (!ebay?.ok) throw new Error(ebay?.message || "eBay backend check failed.");
    if (!ai?.ok) throw new Error(ai?.message || "GPT Keychain check failed.");
    setEbayOauthStatusV63(ebayOauthConnectionSummaryV63(ebay));
    if ($("settingsStatus")) $("settingsStatus").textContent = ai.message || (ai.keyStored ? "GPT key is stored in Keychain." : "GPT key is missing.");
    setUnifiedApiStatusV638(`Secure backend connected. eBay: ${ebay.authenticated ? "authorized" : ebay.configured ? "profile ready" : "setup required"}. GPT key: ${ai.keyStored ? "Keychain" : "missing"}.`);
    await refreshLocalSetupStatusV8131();
    setStatus("Both API connections checked.");
  } catch (error) {
    const message = error?.message || String(error);
    setUnifiedApiStatusV638(`Connection check failed: ${message}`);
    setLocalSetupStatusV8131("backendStatusBox", "error", message);
    setLocalSetupStatusV8131("gptKeyStatusBox", "error", "Unknown until Backend connects");
    setStatus(`Connection check failed: ${message}`);
  }
}
async function saveSettings() {
  const settings = { ...getSettingsFromUi(), webResearchEnabled: false, autoFillDescriptionCondition: false };
  const keyWasEntered = !!String(settings.apiKey || "").trim();
  const keyResult = await saveApiKeyIfPresentV637(settings);
  const claudeKeyResult = await saveClaudeKeyIfPresentV850(settings);
  if (keyResult.saved && !apiSettingsConfiguredV873(settings)) Object.assign(settings, OPENAI_AUTO_SETTINGS_V873);
  if (claudeKeyResult.saved) settings.claudeReviewEnabled = true;
  setSettingsUi({ ...settings, apiKey: "", claudeApiKey: "" });
  const storedSettings = settingsWithoutApiKeyV637({ ...settings, saveApiKey: keyResult.saved ? true : !!settings.saveApiKey });
  await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: storedSettings });
  await savePersistentSetupProfileV873(storedSettings);
  applyTheme(settings.themeMode);
  updateApiUi();

  const setup = await refreshLocalSetupStatusV8131();
  await refreshClaudeKeyStatusV850({ quiet: true });
  const aiReady = !!setup?.aiKeyStored;
  if ($("saveApiKey")) $("saveApiKey").checked = aiReady;
  setSettingsLocalStatusV8131("Saved on this Mac ✓", "ok");

  if ($("settingsStatus")) {
    if (aiReady) $("settingsStatus").textContent = keyWasEntered ? "Settings saved. GPT API key was saved securely in macOS Keychain." : "Settings saved. Existing GPT API key remains securely in macOS Keychain.";
    else $("settingsStatus").textContent = "Settings saved. GPT API key is not installed on this Mac yet — paste it once and click Save GPT Settings & Key.";
  }
  setStatus(aiReady ? "GPT settings ready." : "GPT settings saved; API key is still needed on this Mac.");
  await addLog("Settings saved", `GPT ${settings.apiEnabled ? "enabled" : "disabled"}; Claude ${settings.claudeReviewEnabled ? "enabled" : "disabled"}; fill=${settings.reviewFillMode}; GPT key=${aiReady ? "Keychain" : "missing"}`);
  return { ...settings, apiKey: "", claudeApiKey: "" };
}
async function loadSettings() {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.settings);
  const storedSettings = stored[STORAGE.settings] || {};
  const hadStoredSettings = !!stored[STORAGE.settings];
  const loaded = { ...DEFAULT_SETTINGS, ...storedSettings };
  loaded.webResearchEnabled = false;
  loaded.autoFillDescriptionCondition = false;
  const savedOutputLimit = Number(loaded.maxOutputTokens);
  const outputModeCap = loaded.tokenMode === "quality" ? 10000 : loaded.tokenMode === "cheap" ? 4500 : 8000;
  // Beta 80 keeps enough structured-output headroom but removes the old 10k balanced default.
  loaded.maxOutputTokens = String(Math.min(outputModeCap, Math.max(1200, Number.isFinite(savedOutputLimit) ? savedOutputLimit : outputModeCap)));
  const legacyPhotoPolicy = String(storedSettings.analysisPhotoPolicyVersion || "") !== "3";
  const photoModeCap = loaded.tokenMode === "cheap" ? 4 : loaded.tokenMode === "quality" ? 8 : 6;
  // V8.23.21 cost migration: older Balanced/Quality profiles that were widened
  // to ten photos are moved to the evidence-aware 6/8-photo caps.
  if (legacyPhotoPolicy) loaded.maxPhotosPerRequest = String(photoModeCap);
  else loaded.maxPhotosPerRequest = String(Math.max(1, Math.min(Number(loaded.maxPhotosPerRequest || photoModeCap), photoModeCap)));
  loaded.analysisPhotoPolicyVersion = "3";
  const officialRates = pricingForSettingsV821(loaded);
  if (/^https:\/\/api\.openai\.com\/?$/i.test(String(loaded.apiBaseUrl || "").trim()) && /^gpt-5\.6(?:-|$)|^gpt-5\.5(?:-|$)/i.test(String(loaded.apiModel || "").trim())) {
    loaded.inputCostPer1M = String(officialRates.input);
    loaded.outputCostPer1M = String(officialRates.output);
  }
  const legacyKey = String(loaded.apiKey || "").trim();
  // V8.9: this setting is Review-only. Never force an old review policy into
  // normal Photo/Autopilot/Queue. Preserve a valid saved Review choice.
  if (!["safe", "review_assisted", "complete_coverage", "confirmed_only"].includes(String(loaded.reviewFillMode || ""))) {
    loaded.reviewFillMode = "safe";
  }
  if ((savedOutputLimit === 900 && !legacyKey) || legacyPhotoPolicy) {
    await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: settingsWithoutApiKeyV637(loaded) });
  }
  let migrationMessage = "";
  let legacyMigrationFailed = false;
  if (legacyKey) {
    // Remove the legacy Chrome-stored copy immediately. If Keychain migration
    // fails, the value remains only in this popup's password field for one retry.
    loaded.apiKey = "";
    await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: settingsWithoutApiKeyV637(loaded) });
    const response = await sendRuntimeMessage({ type: "AI_KEY_SAVE_V637", payload: { apiKey: legacyKey } });
    if (response?.ok) {
      loaded.saveApiKey = true;
      await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: settingsWithoutApiKeyV637(loaded) });
      migrationMessage = "Existing API key moved from Chrome storage to macOS Keychain.";
    } else {
      legacyMigrationFailed = true;
      loaded.saveApiKey = false;
      migrationMessage = `Legacy API key was removed from Chrome storage, but Keychain migration needs retry: ${response?.message || "local backend unavailable"}`;
    }
  }
  setSettingsUi({ ...loaded, apiKey: legacyMigrationFailed ? legacyKey : "" });
  setSettingsLocalStatusV8131(hadStoredSettings ? "Loaded on this Mac ✓" : "Using defaults — save once", hadStoredSettings ? "ok" : "warn");
  await refreshAiKeyStatusV637({ quiet: true });
  await refreshClaudeKeyStatusV850({ quiet: true });
  if (migrationMessage && $("settingsStatus")) $("settingsStatus").textContent = migrationMessage;
}
async function resetSettings() {
  const reset = settingsWithoutApiKeyV637(DEFAULT_SETTINGS);
  await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: reset });
  setSettingsUi(reset);
  await refreshAiKeyStatusV637({ quiet: true });
  await refreshClaudeKeyStatusV850({ quiet: true });
  setSettingsLocalStatusV8131("Reset to defaults", "warn");
  setStatus("Settings reset. API key in macOS Keychain was preserved.");
}
async function savePanelSizeSettingsV8190({ reset = false } = {}) {
  const requested = reset
    ? { panelSizeMode: "auto", panelCustomWidth: DEFAULT_SETTINGS.panelCustomWidth || "460", panelCustomHeight: DEFAULT_SETTINGS.panelCustomHeight || "680" }
    : normalizedPanelSizeSettingsV8190(getSettingsFromUi());
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.settings);
  const merged = settingsWithoutApiKeyV637({ ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] || {}), ...requested });
  await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: merged });
  setSettingsUi({ ...getSettingsFromUi(), ...requested });
  updatePanelSizeUiV8190();
  const persistent = await savePersistentSetupProfileV873(merged);
  const suffix = persistent?.ok === false ? " Saved in Chrome on this Mac; the local profile can sync it when Backend is available." : " Saved for this Mac.";
  if ($("panelSizeStatus")) $("panelSizeStatus").textContent += suffix;
  setStatus(reset ? "Control Panel size reset to Auto." : "Control Panel size saved.");
  await addLog("Control Panel size saved", `${requested.panelSizeMode}; custom=${requested.panelCustomWidth}x${requested.panelCustomHeight}`);
}
function setWorkflowMode(mode) {
  if ($("workflowMode")) $("workflowMode").value = mode;
  updateWorkflowModeUi();
  updateApiUi();
  saveSettings();
  setStatus(`Workflow mode: ${mode === "ai" ? "AI" : mode === "text" ? "Text" : "Hybrid"}.`);
}
/* V8.23.21 settings actions moved out of photo selection. */
function applyApiPreset() {
  const preset = $("apiPreset")?.value || "custom";
  const patch = { apiPreset: preset, apiEnabled: true };
  if (preset === "openai-quality") Object.assign(patch, { apiMode: "openai-compatible", apiBaseUrl: "https://api.openai.com", apiPath: "/v1/responses", apiModel: "gpt-5.6", authHeader: "Authorization", authPrefix: "Bearer", customHeaders: "", webResearchEnabled: false });
  if (preset === "openai-cheap") Object.assign(patch, { apiMode: "openai-compatible", apiBaseUrl: "https://api.openai.com", apiPath: "/v1/responses", apiModel: "gpt-5.6-luna", authHeader: "Authorization", authPrefix: "Bearer", customHeaders: "", webResearchEnabled: false });
  if (preset === "openrouter") Object.assign(patch, { apiMode: "openai-compatible", apiBaseUrl: "https://openrouter.ai/api", apiPath: "/v1/chat/completions", apiModel: "", authHeader: "Authorization", authPrefix: "Bearer", customHeaders: '{"HTTP-Referer":"https://localhost","X-Title":"eBay Filler"}' });
  if (preset === "local-proxy") Object.assign(patch, { apiMode: "local-proxy", apiBaseUrl: "http://127.0.0.1:8787", apiPath: "/analyze", apiModel: "local", authHeader: "", authPrefix: "", customHeaders: "" });
  setSettingsUi({ ...getSettingsFromUi(), ...patch });
  setStatus(`Preset applied: ${preset}. Add model/API key if needed.`);
}
async function clearSensitiveData() {
  const [gptResponse, claudeResponse] = await Promise.all([
    sendRuntimeMessage({ type: "AI_KEY_REMOVE_V637" }),
    sendRuntimeMessage({ type: "CLAUDE_KEY_REMOVE_V850" })
  ]);
  if ($("apiKey")) $("apiKey").value = "";
  if ($("claudeApiKey")) $("claudeApiKey").value = "";
  if ($("saveApiKey")) $("saveApiKey").checked = false;
  if ($("claudeKeyStored")) $("claudeKeyStored").checked = false;
  setLocalSetupStatusV8131("gptKeyStatusBox", "warn", "Not installed on this Mac");
  const settings = settingsWithoutApiKeyV637({ ...getSettingsFromUi(), saveApiKey: false });
  await globalThis.EbayAiStorageV790.set({ [STORAGE.settings]: settings });
  screenshotPhotoCache = []; ebayPageContextV639 = {};
  await globalThis.EbayAiStorageV790.remove([STORAGE.screenshotPhotos, STORAGE.pageContext]);
  renderAllPhotos();
  if (gptResponse?.ok && claudeResponse?.ok) {
    setStatus("GPT and Claude keys removed from macOS Keychain; screenshot cache cleared.");
    await addLog("Sensitive data cleared", "Both API keys were removed from macOS Keychain and legacy Chrome storage was scrubbed.");
  } else {
    const failures = [!gptResponse?.ok ? `GPT: ${gptResponse?.message || "backend unavailable"}` : "", !claudeResponse?.ok ? `Claude: ${claudeResponse?.message || "backend unavailable"}` : ""].filter(Boolean).join("; ");
    setStatus(`Chrome sensitive data cleared, but Keychain removal was incomplete: ${failures}`);
    await addLog("Sensitive data partially cleared", failures);
  }
}
