/* V8.23.21 connections UI: forms/status/debug controls only. */
function setEbayOauthStatusV63(text) { if ($("ebayOauthStatusBox")) $("ebayOauthStatusBox").textContent = String(text || ""); }
function setEbayOauthBusyV63(isBusy) {
  ebayOauthBusyV63 = !!isBusy;
  ["ebayOauthCheckBtn","ebayOauthAuthorizeBtn","ebayOauthReadBtn","ebayOauthDisconnectBtn","ebayProfileSaveBtn","ebaySecretSaveBtn","ebayProfileExportBtn","ebayProfileImportBtn","ebayRemoveCredentialsBtn","saveUnifiedApiProfileBtn","exportUnifiedApiProfileBtn","importUnifiedApiProfileBtn","checkUnifiedConnectionsBtn"].forEach(id => { const button=$(id); if(button) button.disabled=ebayOauthBusyV63; });
}
function renderEbayOauthAccountV63(account) { const box=$("ebayOauthDataBox"); if(box) box.textContent=account&&typeof account==="object"?JSON.stringify(account,null,2):"No eBay account data loaded."; }
function ebayProfileFromUiV636() { return { schemaVersion:1, environment:String($("ebayProfileEnvironment")?.value||"production").trim(), clientId:String($("ebayProfileClientId")?.value||"").trim(), runame:String($("ebayProfileRuname")?.value||"").trim() }; }
function applyEbayProfileUiV636(profile={}) {
  if($("ebayProfileEnvironment")) $("ebayProfileEnvironment").value=profile.environment==="sandbox"?"sandbox":"production";
  if($("ebayProfileClientId")) $("ebayProfileClientId").value=String(profile.clientId||"");
  if($("ebayProfileRuname")) $("ebayProfileRuname").value=String(profile.runame||"");
  const box=$("ebayProfileStorageBox"); if(box){const secret=profile.clientSecretStored?"Yes":"No", refresh=profile.refreshTokenStored?"Yes":"No", extra=profile.keychainError?` ${profile.keychainError}`:""; box.textContent=`Persistent profile: ${profile.environment||"production"}. Client Secret in Keychain: ${secret}. Refresh token in Keychain: ${refresh}.${extra}`;}
}
function readEbayClientSecretV82310(){ return $("ebayProfileClientSecret")?.value || ""; }
function clearEbayClientSecretV82310(){ if($("ebayProfileClientSecret")) $("ebayProfileClientSecret").value=""; }
function clearEbayProfileFileV82310(){ if($("ebayProfileFileInput")) $("ebayProfileFileInput").value=""; }
function openDebugCollectorPanel(){const panel=$("debugCollectorPanel"),statusBox=$("domExportStatus");if(panel)panel.classList.toggle("open");if(statusBox)statusBox.textContent=panel?.classList.contains("open")?"Choose switches, then Download Selected Debug File.":"Debug collector closed.";}
function readDebugCollectorOptions(){const checked=id=>!!$(id)?.checked;return {actionLog:checked("diagActionLog"),helperState:checked("diagHelperState"),route:checked("diagRoute"),fields:checked("diagFields"),openMenus:checked("diagOpenMenus"),checkedRows:checked("diagCheckedRows"),yesNoRows:checked("diagYesNoRows"),activeElement:checked("diagActiveElement"),performance:checked("diagPerformance"),errors:checked("diagErrors"),pageInfo:checked("diagPageInfo"),storage:checked("diagStorage"),visibleText:checked("diagVisibleText"),compactHtml:checked("diagCompactHtml")};}
function setDebugCollectorStatusV82310(text){if($("domExportStatus")) $("domExportStatus").textContent=String(text||"");}
function downloadJsonV82310(name,payload){ downloadJsonFile(name,payload); }
(() => { const ui=globalThis.EbayUI; if(ui?.register&&!ui.has?.("connections")) ui.register("connections",{setStatus:setEbayOauthStatusV63,setBusy:setEbayOauthBusyV63,renderAccount:renderEbayOauthAccountV63,readProfile:ebayProfileFromUiV636,applyProfile:applyEbayProfileUiV636,readClientSecret:readEbayClientSecretV82310,clearClientSecret:clearEbayClientSecretV82310,clearProfileFile:clearEbayProfileFileV82310,toggleDebug:openDebugCollectorPanel,readDebugOptions:readDebugCollectorOptions,setDebugStatus:setDebugCollectorStatusV82310,downloadJson:downloadJsonV82310}); })();
