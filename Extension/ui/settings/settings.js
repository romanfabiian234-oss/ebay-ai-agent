/* V8.23.21 settings UI container: form values, visual state, and downloads only. */
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  document.querySelectorAll(".tabPanel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
  updateAll();
  renderQuestionSelectionV680();
  if (tabId === "aiTab") refreshQueueV701().catch(() => {});
  if (tabId === "reviewTab") refreshReviewWorkspaceV830().catch(() => {});
}
function getData() {
  const data = {};
  for (const id of FIELD_IDS) data[id] = $(id)?.value?.trim() || "";
  data.quantity = data.quantity || "1";
  data.specificsObject = parseKeyValueLines(data.specifics);
  data.measurementsObject = parseKeyValueLines(data.measurements);
  return data;
}
function setData(data = {}) {
  for (const id of FIELD_IDS) {
    if (Object.prototype.hasOwnProperty.call(data, id) && $(id)) $(id).value = data[id] || "";
  }
  updateAll();
  scheduleSave();
}
function setLocalSetupStatusV8131(id, state, text) {
  const el = $(id);
  if (!el) return;
  el.dataset.state = state || "info";
  el.textContent = String(text || "");
}
function setSettingsLocalStatusV8131(text, state = "ok") {
  setLocalSetupStatusV8131("settingsSavedStatusBox", state, text);
}
function applyBackendSetupStatusV8131(response = {}) {
  if (response?.ok) {
    const version = String(response.backendVersion || "").trim();
    const python = String(response.pythonVersion || "").trim();
    setLocalSetupStatusV8131("backendStatusBox", "ok", `Connected${version ? ` — ${version}` : ""}${python ? ` / Python ${python}` : ""}`);
    setLocalSetupStatusV8131("gptKeyStatusBox", response.aiKeyStored ? "ok" : "warn", response.aiKeyStored ? "Stored in Keychain ✓" : "Not installed on this Mac");
    return true;
  }
  const message = String(response?.message || "Local backend is unavailable.");
  setLocalSetupStatusV8131("backendStatusBox", "error", message);
  setLocalSetupStatusV8131("gptKeyStatusBox", "error", "Unknown until Backend connects");
  return false;
}
function getSettingsFromUi() {
  const settings = {};
  for (const key of SETTINGS_KEYS) {
    const el = $(key);
    if (!el) continue;
    if (el.type === "checkbox") settings[key] = !!el.checked;
    else settings[key] = el.value || "";
  }
  settings.apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl);
  settings.apiPath = normalizePath(settings.apiPath || "/v1/chat/completions");
  settings.authHeader = settings.authHeader || "Authorization";
  settings.authPrefix = settings.authPrefix ?? "Bearer";
  return settings;
}
function setSettingsUi(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  for (const key of SETTINGS_KEYS) {
    const el = $(key);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!merged[key];
    else el.value = merged[key] ?? "";
  }
  applyTheme(merged.themeMode);
  updateApiUi();
  updateWebResearchToggleV640();
  updatePanelSizeUiV8190();
}
function updateWebResearchToggleV640() {
  const enabled = !!$("webResearchEnabled")?.checked;
  const button = $("webResearchToggleBtn");
  if (!button) return;
  button.textContent = enabled ? "Internet Research: ON" : "Internet Research: OFF";
  button.setAttribute("aria-pressed", enabled ? "true" : "false");
  button.classList.toggle("green", enabled);
  button.classList.toggle("red", !enabled);
  button.title = enabled
    ? "After photo analysis, run a separate text-only web search. Photos are not sent twice."
    : "Use only photos and eBay page context; no internet research.";
}
function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setUnifiedApiStatusV638(text) {
  if ($("unifiedApiStatusBox")) $("unifiedApiStatusBox").textContent = String(text || "");
}
function unifiedAiSettingsFromUiV638() {
  const settings = getSettingsFromUi();
  const safe = {};
  for (const key of API_FILE_KEYS) safe[key] = settings[key];
  safe.saveApiKey = false;
  return safe;
}
function updatePanelSizeUiV8190() {
  const normalized = normalizedPanelSizeSettingsV8190(getSettingsFromUi());
  const custom = normalized.panelSizeMode === "custom";
  if ($("panelCustomWidth")) { $("panelCustomWidth").value = normalized.panelCustomWidth; $("panelCustomWidth").disabled = !custom; }
  if ($("panelCustomHeight")) { $("panelCustomHeight").value = normalized.panelCustomHeight; $("panelCustomHeight").disabled = !custom; }
  $("panelCustomSizeFields")?.classList.toggle("isDisabled", !custom);
  const status = $("panelSizeStatus");
  if (!status) return normalized;
  const preset = PANEL_SIZE_CONFIG_V8190.PRESETS?.[normalized.panelSizeMode];
  if (normalized.panelSizeMode === "auto") status.textContent = "Auto: width and height follow the current eBay page and stay inside its viewport.";
  else if (normalized.panelSizeMode === "custom") status.textContent = `Custom: ${normalized.panelCustomWidth} × ${normalized.panelCustomHeight}px maximum; smaller pages are capped automatically.`;
  else if (preset) status.textContent = `${normalized.panelSizeMode[0].toUpperCase()}${normalized.panelSizeMode.slice(1)}: ${preset.width} × ${preset.height}px; smaller pages are capped automatically.`;
  return normalized;
}
function applyTheme(mode) {
  return globalThis.EbayUI?.theme?.applyTheme?.(mode) || "light";
}
function updateWorkflowModeUi() {
  const mode = $("workflowMode")?.value || "hybrid";
  document.body.dataset.workflowMode = mode;
  const status = $("workflowStatusBox");
  const settings = getSettingsFromUi();
  const apiDisabled = !settings.apiEnabled || settings.apiMode === "off";

  if (mode === "ai") {
    if (status) status.textContent = apiDisabled
      ? "AI Mode selected, but API is OFF. Turn API ON in Settings or switch to Text Mode."
      : "AI Mode: use eBay photos/uploaded photos → Analyze Photos → Review → Fill.";
  } else if (mode === "text") {
    if (status) status.textContent = "Text Mode: paste ChatGPT/listing text → Import Text → Review → Fill. API buttons are disabled in this mode.";
  } else {
    if (status) status.textContent = apiDisabled
      ? "Hybrid Mode: API is OFF, so Text fallback is ready. Turn API ON when needed."
      : "Hybrid Mode: AI tools and Text fallback are both available.";
  }
}
function updateApiUi() {
  const settings = getSettingsFromUi();
  const workflowMode = settings.workflowMode || "hybrid";
  const disabled = !settings.apiEnabled || settings.apiMode === "off" || workflowMode === "text";
  if ($("analyzeBtn")) $("analyzeBtn").disabled = disabled;
  if ($("analyzeEbayBtn")) $("analyzeEbayBtn").disabled = disabled;
  if ($("apiStatusBox")) $("apiStatusBox").classList.toggle("apiOff", disabled);
  if (disabled && $("apiStatusBox")) {
    $("apiStatusBox").textContent = workflowMode === "text"
      ? "Text Mode is ON. AI analysis buttons are disabled. Switch to AI/Hybrid to analyze photos."
      : "API is OFF. Use Text Mode/manual paste/import, or turn API ON in Settings.";
  }
  updateWorkflowModeUi();
}

(() => {
  const ui = globalThis.EbayUI;
  if (ui?.register && !ui.has?.("settings")) ui.register("settings", {
    get: getSettingsFromUi, set: setSettingsUi, updateApi: updateApiUi,
    updatePanelSize: updatePanelSizeUiV8190, setLocalStatus: setLocalSetupStatusV8131
  });
})();
