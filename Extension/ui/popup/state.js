// V8.23.21 popup visual state only. Application state lives in shared/app_state.js.
(function initWindowModeV8160(){
  try { const params=new URLSearchParams(location.search); if(params.get("embedded") === "1"){document.documentElement.classList.add("embedded");document.documentElement.dataset.windowMode="embedded";} }
  catch(error){globalThis.EbayLogger?.warn?.("Window UI initialization failed",{message:error?.message||String(error)});}
})();
function $(id){return document.getElementById(id);}
function setStatus(text){if(!globalThis.EbayUI?.status?.setText?.("status",text)){const status=$("status");if(status)status.textContent=text;}}
