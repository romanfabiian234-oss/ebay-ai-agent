/* V8.23.21 connection workflows. UI rendering/input is delegated to ui/connections. */
function connectionViewV82310(){ return globalThis.EbayUI?.connections; }
async function loadEbayProfileV636() { const profile=await getEbayProfileV82310(); connectionViewV82310()?.applyProfile?.(profile); return profile; }
async function saveEbayProfileV636() {
  if(ebayOauthBusyV63) return; const view=connectionViewV82310(); view?.setBusy?.(true);
  try { const profile=await persistEbayProfileV82310(view?.readProfile?.()||{}); view?.applyProfile?.(profile); view?.setStatus?.("eBay profile saved outside the extension folder. Save Client Secret to Keychain if needed."); }
  catch(error){view?.setStatus?.(`Profile not saved: ${error?.message||String(error)}`);} finally{view?.setBusy?.(false);}
}
async function saveEbayClientSecretV636() {
  if(ebayOauthBusyV63) return; const view=connectionViewV82310(); view?.setBusy?.(true);
  try { const profile=await persistEbayClientSecretV82310(view?.readClientSecret?.()||""); view?.clearClientSecret?.(); view?.applyProfile?.(profile); view?.setStatus?.("Client Secret saved securely in macOS Keychain. Authorize eBay now."); }
  catch(error){view?.setStatus?.(`Client Secret not saved: ${error?.message||String(error)}`);} finally{view?.setBusy?.(false);}
}
function exportEbayProfileV636() { const view=connectionViewV82310(); view?.downloadJson?.("ebay-filler-ebay-api-profile.json", { format:"ebay-filler-ebay-api-profile", version:1, containsSecrets:false, exportedAt:new Date().toISOString(), profile:view?.readProfile?.()||{} }); view?.setStatus?.("eBay profile exported without Client Secret or tokens."); }
async function importEbayProfileV636(file) {
  const view=connectionViewV82310(); if(!file) return;
  try { if(file.size>65536) throw new Error("eBay profile file is too large."); const profile=validateImportedEbayProfileV636(JSON.parse(await file.text())); view?.applyProfile?.(profile); await saveEbayProfileV636(); }
  catch(error){view?.setStatus?.(`Profile import failed: ${error?.message||String(error)}`);} finally{view?.clearProfileFile?.();}
}
async function removeSavedEbayCredentialsV636() {
  if(!globalThis.EbayUI?.notifications?.confirm?.("Remove the saved eBay Client Secret and refresh token from macOS Keychain?")) return;
  if(ebayOauthBusyV63) return; const view=connectionViewV82310(); view?.setBusy?.(true);
  try { await removeEbayCredentialsV82310(); view?.renderAccount?.(null); await loadEbayProfileV636(); view?.setStatus?.("Saved Client Secret and refresh token removed. The non-secret profile was preserved."); }
  catch(error){view?.setStatus?.(`Credentials not removed: ${error?.message||String(error)}`);} finally{view?.setBusy?.(false);}
}
async function runEbayOauthActionV63(type, workingText, payload={}) {
  if(ebayOauthBusyV63) return; const view=connectionViewV82310(); view?.setBusy?.(true);
  try { view?.setStatus?.(workingText); const response=await executeEbayOauthV82310(type,payload);
    if(type==="EBAY_OAUTH_STATUS_V63") view?.setStatus?.(ebayOauthConnectionSummaryV63(response));
    else if(type==="EBAY_OAUTH_START_V63") view?.setStatus?.("Authorization opened. Approve read-only access on eBay and wait for the local result page, then press Check Backend.");
    else if(type==="EBAY_OAUTH_READ_ACCOUNT_V63"){view?.renderAccount?.(response.account||{});view?.setStatus?.(`Read-only account check completed (${response.environment||"eBay"}).`);}
    else if(type==="EBAY_OAUTH_DISCONNECT_V63"){view?.renderAccount?.(null);view?.setStatus?.("Disconnected from eBay. Refresh token was removed; saved profile and Client Secret were preserved.");}
  } catch(error){view?.setStatus?.(`Not connected: ${error?.message||String(error)}`);} finally{view?.setBusy?.(false);}
}
async function downloadDebugBundle(){const view=connectionViewV82310();try{view?.setDebugStatus?.("Collecting selected debug information...");const bundle=await collectEbayDebugBundleV82310(view?.readDebugOptions?.()||{});const stamp=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),name=`ebay-debug-v8-23-10-${stamp}.json`;view?.downloadJson?.(name,bundle);const msg=`Debug file downloaded: ${name}`;view?.setDebugStatus?.(msg);setStatus(msg);await addLog("Debug bundle downloaded",name);}catch(error){const msg=`Debug export error: ${error?.message||String(error)}`;view?.setDebugStatus?.(msg);setStatus(msg);await addLog("Debug export error",msg);}}
async function clearEbayActionLog(){const view=connectionViewV82310();try{await clearEbayActionLogV82310();const msg="Action log cleared.";view?.setDebugStatus?.(msg);setStatus(msg);}catch(error){const msg=`Clear log error: ${error?.message||String(error)}`;view?.setDebugStatus?.(msg);setStatus(msg);}}
async function exportDomSnapshot(){connectionViewV82310()?.toggleDebug?.();}
