/* V8.23.21 connection/backend service. No popup DOM rendering. */
let nativeBackendConnectedV8180 = false;

function sendRuntimeMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
        else resolve(response || { ok: false, message: "No response from background." });
      });
    } catch (error) { resolve({ ok: false, message: error?.message || String(error) }); }
  });
}
function hasNativeBackendConnectionV8180() { return nativeBackendConnectedV8180; }
async function checkNativeBackendConnectionV8180() {
  const response = await sendRuntimeMessage({ type: "LOCAL_NATIVE_BACKEND_STATUS_V8180" });
  nativeBackendConnectedV8180 = !!response?.ok && !!response?.paired;
  if (!nativeBackendConnectedV8180) throw new Error(response?.message || "Native Backend connection is unavailable.");
  return true;
}
async function ensureNativeBackendConnectionV8180() { return checkNativeBackendConnectionV8180(); }

function validateImportedEbayProfileV636(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid eBay profile JSON.");
  if (payload.format !== "ebay-filler-ebay-api-profile" || Number(payload.version) !== 1) throw new Error("Unsupported eBay profile file.");
  if (payload.containsSecrets !== false) throw new Error("Profile file is not marked secret-free.");
  const profile = payload.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("eBay profile is missing.");
  const environment = profile.environment === "sandbox" ? "sandbox" : profile.environment === "production" ? "production" : "";
  const clientId = String(profile.clientId || "").trim();
  const runame = String(profile.runame || "").trim();
  if (!environment || !clientId || !runame) throw new Error("Environment, Client ID and RuName are required.");
  return { schemaVersion: 1, environment, clientId, runame };
}

async function savePendingEbayProfileV715(profile) {
  const pending = validateImportedEbayProfileV636({ format: "ebay-filler-ebay-api-profile", version: 1, containsSecrets: false, profile });
  await globalThis.EbayAiStorageV790.set({ [PENDING_EBAY_PROFILE_STORAGE_KEY_V715]: pending });
  return pending;
}
async function clearPendingEbayProfileV715() { await globalThis.EbayAiStorageV790.remove(PENDING_EBAY_PROFILE_STORAGE_KEY_V715); }
async function loadPendingEbayProfileV715() {
  const stored = await globalThis.EbayAiStorageV790.get(PENDING_EBAY_PROFILE_STORAGE_KEY_V715);
  const profile = stored?.[PENDING_EBAY_PROFILE_STORAGE_KEY_V715];
  if (!profile) return null;
  try { return validateImportedEbayProfileV636({ format: "ebay-filler-ebay-api-profile", version: 1, containsSecrets: false, profile }); }
  catch (_) { await clearPendingEbayProfileV715(); return null; }
}
function ebayOauthConnectionSummaryV63(response) {
  const environment = response?.environment ? ` (${response.environment})` : "";
  const profile = response?.profile || {};
  const keychain = profile.clientSecretStored ? " Client Secret: Keychain." : " Client Secret: missing.";
  const refresh = profile.refreshTokenStored ? " Refresh token: Keychain." : "";
  if (response?.authenticated) {
    const seconds = Math.max(0, Number(response.accessExpiresIn || 0));
    const expiry = seconds ? ` Access token: ${Math.ceil(seconds / 60)} min.` : " Access refresh is available.";
    return `Connected to eBay${environment}.${expiry}${keychain}${refresh}`;
  }
  if (response?.configured) return `Backend ready${environment}. Authorization required.${keychain}${refresh}`;
  return `Backend is running${environment}, but the eBay profile or Client Secret is not configured.${keychain}`;
}
async function getEbayProfileV82310() {
  await ensureNativeBackendConnectionV8180();
  const response = await sendRuntimeMessage({ type: "EBAY_OAUTH_PROFILE_GET_V63" });
  if (!response?.ok) throw new Error(response?.message || "Could not load eBay profile.");
  return response.profile || {};
}
async function persistEbayProfileV82310(profile) {
  await ensureNativeBackendConnectionV8180();
  if (!profile?.clientId || !profile?.runame) throw new Error("Enter Client ID and RuName.");
  const response = await sendRuntimeMessage({ type: "EBAY_OAUTH_PROFILE_SAVE_V63", payload: profile });
  if (!response?.ok) throw new Error(response?.message || "Could not save eBay profile.");
  return response.profile || profile;
}
async function persistEbayClientSecretV82310(clientSecret) {
  await ensureNativeBackendConnectionV8180();
  if (!String(clientSecret || "").trim()) throw new Error("Enter the Production Client Secret (Cert ID).");
  const response = await sendRuntimeMessage({ type: "EBAY_OAUTH_CREDENTIALS_SAVE_V63", payload: { clientSecret: String(clientSecret) } });
  if (!response?.ok) throw new Error(response?.message || "Could not save Client Secret.");
  return response.profile || {};
}
async function removeEbayCredentialsV82310() {
  await ensureNativeBackendConnectionV8180();
  const response = await sendRuntimeMessage({ type: "EBAY_OAUTH_REMOVE_CREDENTIALS_V63" });
  if (!response?.ok) throw new Error(response?.message || "Could not remove saved credentials.");
  return response;
}
async function executeEbayOauthV82310(type, payload = {}) {
  await ensureNativeBackendConnectionV8180();
  const response = await sendRuntimeMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.message || "Unknown OAuth error.");
  return response;
}
async function collectEbayDebugBundleV82310(options = {}) {
  const tab = await activeEbayTab();
  if (!tab?.id || !isSupportedEbayUrlV600(tab.url)) throw new Error("Open the eBay draft page first.");
  const injected = await injectContentScript(tab.id);
  if (!injected) throw new Error("Could not connect to eBay page. Refresh eBay and try again.");
  const result = await sendEbayTabMessageV639(tab.id, "EXPORT_EBAY_DEBUG_BUNDLE_V5", options);
  if (!result?.ok) throw new Error(result?.message || "Debug export failed.");
  return result.bundle || {};
}
async function clearEbayActionLogV82310() {
  const tab = await activeEbayTab();
  if (!tab?.id || !isSupportedEbayUrlV600(tab.url)) throw new Error("Open the eBay draft page first.");
  await injectContentScript(tab.id);
  const result = await sendEbayTabMessageV639(tab.id, "CLEAR_EBAY_ACTION_LOG_V5", {});
  if (!result?.ok) throw new Error(result?.message || "Could not clear action log.");
  return result;
}

async function loadEbayConnectionStateV780() {
  try {
    await checkNativeBackendConnectionV8180();
    await loadEbayProfileV636();
    const statusResponse = await sendRuntimeMessage({ type: "EBAY_OAUTH_STATUS_V63" });
    if (statusResponse?.ok) setEbayOauthStatusV63(ebayOauthConnectionSummaryV63(statusResponse));
  } catch (error) {
    nativeBackendConnectedV8180 = false;
    await loadPendingEbayProfileV715();
    setEbayOauthStatusV63(`Secure backend unavailable: ${error?.message || String(error)}`);
  }
}
