/* V8.23.21 Queue controls UI: renders popup queue state only. */
let latestQueueV720 = { version: "8.23.21", updatedAt: "", items: [] };
let latestQueueRunnerV720 = { status: "idle", items: [], currentIndex: 0, lastMessage: "" };
function setQueuePopupStatusV701(text, tone = "neutral") {
  const box = $("queueRunnerStatus");
  if (!box) return;
  box.textContent = text;
  box.dataset.tone = tone;
}
function queueRunnerToneV710(status) {
  if (status === "completed") return "success";
  if (["blocked", "stopped", "error"].includes(status)) return "warning";
  return "neutral";
}
function queueRunnerLabelV710(status) {
  const labels = { idle: "idle", starting: "starting", running: "running", paused: "paused", blocked: "blocked", stopping: "stopping", stopped: "stopped", completed: "completed", error: "error" };
  return labels[status] || "idle";
}
function queueItemStateV720(item) {
  const status = String(item?.processStatus || "");
  if (["loading", "analyzing", "filling", "saving"].includes(status)) return { label: "Working", tone: "working" };
  if (status === "completed") return { label: "Done", tone: "done" };
  if (status === "review") return { label: "Review", tone: "review" };
  if (status === "error") return { label: "Error", tone: "error" };
  if (item?.failureScope === "queue") return { label: "Blocked", tone: "stopped" };
  if (status === "stopped") return { label: "Stopped", tone: "stopped" };
  if (status === "pending") return { label: "Waiting", tone: "waiting" };
  return null;
}
function runnerItemForQueueItemV720(item) {
  const list = Array.isArray(latestQueueRunnerV720?.items) ? latestQueueRunnerV720.items : [];
  return list.find(candidate => String(candidate?.draftId || candidate?.id || "") === String(item?.draftId || item?.id || "")) || null;
}
function queueStatusV720(queue) {
  const runner = latestQueueRunnerV720 || {};
  const status = queueRunnerLabelV710(runner.status);
  if (["starting", "running"].includes(status)) {
    const total = Array.isArray(runner.items) ? runner.items.length : queue.items.length;
    const position = Math.min(total, Math.max(1, Number(runner.currentIndex || 0) + 1));
    return { text: runner.lastMessage || `Processing ${position} of ${total}…`, tone: "neutral" };
  }
  if (["blocked", "completed", "stopped", "error"].includes(status) && runner.lastMessage) {
    return { text: runner.lastMessage, tone: queueRunnerToneV710(status) };
  }
  if (queue.items.length) return { text: `${queue.items.length} draft(s) selected. Press Start.`, tone: "neutral" };
  return { text: "Select draft checkboxes on the eBay Drafts page, then press Start.", tone: "neutral" };
}
function renderQueuePopupV701(queue, message = "", tone = "neutral") {
  const safeQueue = normalizedQueueV701(queue);
  latestQueueV720 = safeQueue;
  const countTag = $("queueCountTag");
  const list = $("queuePopupList");
  if (countTag) countTag.textContent = `${safeQueue.items.length} selected`;
  if (list) {
    list.replaceChildren();
    for (const [index, item] of safeQueue.items.entries()) {
      const row = document.createElement("div");
      row.className = "queuePopupItem";
      const order = document.createElement("span");
      order.className = "queuePopupOrder";
      order.textContent = String(index + 1);
      const text = document.createElement("div");
      text.className = "queuePopupText";
      const title = document.createElement("strong");
      title.className = "queuePopupTitle";
      title.textContent = item.title;
      const meta = document.createElement("span");
      meta.className = "queuePopupMeta";
      const runItem = runnerItemForQueueItemV720(item);
      const displayState = queueItemStateV720(runItem);
      if (displayState) {
        meta.textContent = displayState.label;
        meta.dataset.state = displayState.tone;
      } else {
        meta.textContent = item.draftId ? `Draft ${item.draftId}` : "Draft not available";
      }
      text.append(title, meta);
      if (runItem?.message && (runItem.processStatus === "error" || runItem.failureScope === "queue")) {
        const detail = document.createElement("span");
        detail.className = "queuePopupMessage";
        detail.textContent = runItem.message;
        detail.title = runItem.message;
        text.appendChild(detail);
      }
      row.append(order, text);
      list.appendChild(row);
    }
  }
  const status = message ? { text: message, tone } : queueStatusV720(safeQueue);
  setQueuePopupStatusV701(status.text, status.tone);
  const active = ["starting", "running", "stopping"].includes(queueRunnerLabelV710(latestQueueRunnerV720?.status));
  if ($("clearQueueBtn")) $("clearQueueBtn").disabled = active || safeQueue.items.length === 0;
  return safeQueue;
}
function renderQueueRunnerV710(runner = {}) {
  latestQueueRunnerV720 = runner && typeof runner === "object" ? runner : { status: "idle", items: [] };
  const status = queueRunnerLabelV710(latestQueueRunnerV720.status);
  const active = ["starting", "running", "stopping"].includes(status);
  if ($("startQueueBtn")) $("startQueueBtn").classList.toggle("hidden", active);
  if ($("startQueueBtn")) $("startQueueBtn").disabled = active || latestQueueV720.items.length === 0;
  if ($("stopQueueBtn")) $("stopQueueBtn").classList.toggle("hidden", !active);
  if ($("stopQueueBtn")) $("stopQueueBtn").disabled = !active;
  if ($("clearQueueBtn")) $("clearQueueBtn").disabled = active || latestQueueV720.items.length === 0;
  renderQueuePopupV701(latestQueueV720);
  return latestQueueRunnerV720;
}

(() => {
  const ui = globalThis.EbayUI;
  if (ui?.register && !ui.has?.("queueControls")) ui.register("queueControls", {
    setStatus: setQueuePopupStatusV701,
    renderQueue: renderQueuePopupV701,
    renderRunner: renderQueueRunnerV710
  });
})();
