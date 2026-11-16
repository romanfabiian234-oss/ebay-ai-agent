/* V8.23.21 Queue control container. Queue UI rendering lives in ui/queue-controls. */
const QUEUE_UI_VERSION_V701 = "8.23.21";
const QUEUE_RUNNER_VERSION_V710 = "8.23.21";
const HELPER_RUNTIME_FILES_V8130 = [
  "ui/registry/registry.js", "ui/notifications/notifications.js", "ui/progress/progress.js",
  "ui/assistant-panel/assistant-panel.js", "platforms/ebay_helper.js"
];
const QUEUE_PANEL_FILES_V7100 = [
  "ui/registry/registry.js", "platforms/ebay_queue_dom.js", "shared/storage.js",
  "ui/queue-panel/queue-panel.js", "modes/queue_page.js"
];
function pageRuntimeFilesFromManifestV8130() {
  const scripts = chrome.runtime.getManifest?.()?.content_scripts || [];
  const first = scripts.find(entry => Array.isArray(entry?.js) && entry.js.includes("content.js"));
  return Array.isArray(first?.js) ? first.js.slice() : [];
}
function extractDraftIdV701(input) {
  return globalThis.EbayBlocksV890?.openDraft?.extractDraftId?.(input) || "";
}
function isSellerHubListingsUrlV701(value) {
  try {
    const parsed = new URL(String(value || ""));
    return isSupportedEbayUrlV600(parsed.href) && /\/sh\/lst(?:\/|$)/i.test(parsed.pathname);
  } catch (_) { return false; }
}

function normalizedQueueV701(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const items = [];
  for (const entry of Array.isArray(source.items) ? source.items : []) {
    if (!entry || typeof entry !== "object") continue;
    const url = String(entry.url || "").slice(0, 2000);
    const draftId = String(entry.draftId || extractDraftIdV701(url)).slice(0, 120);
    const id = String(entry.id || draftId || "").slice(0, 160);
    if (!id || !url || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      draftId,
      url,
      title: String(entry.title || `eBay draft ${draftId || "without ID"}`).replace(/\s+/g, " ").trim().slice(0, 180),
      status: entry.status === "needs-review" ? "needs-review" : "ready",
      addedAt: String(entry.addedAt || "")
    });
  }
  return { version: QUEUE_UI_VERSION_V701, updatedAt: String(source.updatedAt || ""), items };
}
async function readQueueV701() {
  const stored = await chrome.storage.local.get(STORAGE.queue);
  return normalizedQueueV701(stored?.[STORAGE.queue]);
}
async function syncQueueSelectionFromActiveTabV721() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isSellerHubListingsUrlV701(tab.url)) {
    return { ok: false, skipped: true, message: "Open Seller Hub → Listings → Drafts." };
  }
  const ready = await ensureQueueContentV701(tab.id);
  if (!ready?.ok) return ready;
  return sendQueueTabMessageV701(tab.id, "AI_QUEUE_SYNC_V721");
}
async function refreshQueueV701(message = "", tone = "neutral") {
  try { await syncQueueSelectionFromActiveTabV721(); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  const queue = await readQueueV701();
  return renderQueuePopupV701(queue, message, tone);
}
async function sendQueueTabMessageV701(tabId, type) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type }, response => {
      if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, message: "No response." });
    });
  });
}
async function ensureQueueContentV701(tabId) {
  let response = await sendQueueTabMessageV701(tabId, "AI_QUEUE_GET_STATUS_V701");
  if (response.ok) return response;
  try { await chrome.scripting.insertCSS({ target: { tabId, allFrames: false }, files: ["ui/queue-panel/queue-panel.css"] }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  try { await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: QUEUE_PANEL_FILES_V7100 }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  return sendQueueTabMessageV701(tabId, "AI_QUEUE_GET_STATUS_V701");
}
async function clearQueueV701() {
  const runnerResponse = await sendRuntimeMessage({ type: "AI_QUEUE_RUNNER_GET_V710" });
  if (["starting", "running", "stopping"].includes(runnerResponse?.runner?.status)) {
    setQueuePopupStatusV701("Stop the queue before clearing it.", "warning");
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && isSellerHubListingsUrlV701(tab.url)) {
    const ready = await ensureQueueContentV701(tab.id);
    if (ready.ok) await sendQueueTabMessageV701(tab.id, "AI_QUEUE_CLEAR_V701");
  }
  const empty = { version: QUEUE_UI_VERSION_V701, updatedAt: new Date().toISOString(), items: [] };
  await chrome.storage.local.set({ [STORAGE.queue]: empty });
  latestQueueRunnerV720 = { status: "idle", items: [], currentIndex: 0, lastMessage: "" };
  renderQueuePopupV701(empty, "Queue cleared.", "success");
  setStatus("AI Queue cleared.");
}
async function refreshQueueRunnerV710() {
  const response = await sendRuntimeMessage({ type: "AI_QUEUE_RUNNER_GET_V710" });
  if (!response?.ok) {
    renderQueueRunnerV710({ status: "error", lastMessage: response?.message || "Could not read queue status." });
    return null;
  }
  return renderQueueRunnerV710(response.runner || {});
}
async function startQueueRunnerV710() {
  try { await syncQueueSelectionFromActiveTabV721(); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  const queue = await readQueueV701();
  if (!queue.items.length) {
    renderQueuePopupV701(queue, "Select at least one eBay draft first.", "warning");
    return;
  }
  const response = await sendRuntimeMessage({
    type: "AI_QUEUE_RUNNER_START_V710",
    payload: { confirmedSafety: true, simpleMode: true }
  });
  if (response?.runner) renderQueueRunnerV710(response.runner);
  else await refreshQueueRunnerV710();
  if (!response?.ok) setQueuePopupStatusV701(response?.message || "Queue could not start.", "warning");
}
async function stopQueueRunnerV710() {
  const response = await sendRuntimeMessage({ type: "AI_QUEUE_RUNNER_STOP_V710" });
  if (response?.runner) renderQueueRunnerV710(response.runner);
  else await refreshQueueRunnerV710();
}
