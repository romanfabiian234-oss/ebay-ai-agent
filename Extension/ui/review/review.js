/* V8.23.21 Review UI container: render/filter/buttons only. */
function renderReviewCurrentItemV830(item = currentReviewItemV830) {
  const list = $("reviewFieldList");
  const noFields = $("reviewNoFields");
  if (!list || !noFields) return;
  list.replaceChildren();
  if (!item || !Array.isArray(item.answers)) {
    noFields.classList.remove("hidden");
    $("reviewCurrentStatusTag").textContent = "Not found";
    $("reviewCurrentItemBox").textContent = "No saved review record matched this eBay draft.";
    $("reviewSummaryChips").replaceChildren();
    return;
  }
  const currentValues = reviewCurrentValuesV830();
  const answers = item.answers.map(answer => effectiveReviewAnswerV830(answer, currentValues));
  const filter = $("reviewFilter")?.value || "needs_attention";
  const visible = answers.filter(answer => reviewFilterAcceptsV830(answer, filter));
  noFields.classList.toggle("hidden", visible.length > 0);
  const counts = {};
  answers.forEach(answer => { counts[answer.status] = (counts[answer.status] || 0) + 1; });
  const attention = answers.filter(answer => reviewNeedsAttentionV830(answer.status)).length;
  $("reviewCurrentStatusTag").textContent = attention ? `${attention} to check` : "Review complete";
  $("reviewCurrentStatusTag").className = `sourceTag ${attention ? "warn" : "ok"}`;
  $("reviewCurrentItemBox").textContent = `${item.title || "Current item"}\n${item.category || "Category not saved"}\n${answers.length} field(s); ${attention} need attention.`;
  const chips = $("reviewSummaryChips");
  chips.replaceChildren();
  for (const status of ["confirmed_by_tag", "confirmed_by_photo", "supported_by_two_models", "likely_correct", "suggested", "needs_review", "conflict", "user_confirmed", "user_corrected", "cleared_by_user", "not_filled"]) {
    if (!counts[status]) continue;
    const chip = document.createElement("span");
    chip.className = "reviewChip";
    chip.dataset.status = status;
    chip.textContent = `${reviewStatusLabelV830(status)}: ${counts[status]}`;
    chips.appendChild(chip);
  }
  for (const answer of visible) {
    const row = document.createElement("div");
    row.className = "reviewFieldRow";
    const main = document.createElement("div");
    main.className = "reviewFieldMain";
    const name = document.createElement("div");
    name.className = "reviewFieldName";
    name.textContent = answer.field;
    const value = document.createElement("div");
    value.className = "reviewFieldValue";
    value.textContent = `AI: ${answer.aiValue || "No answer"}${answer.currentValue ? ` • eBay: ${answer.currentValue}` : " • eBay: empty"}`;
    main.append(name, value);
    const ocrSources = (Array.isArray(answer.sources) ? answer.sources : []).filter(source => String(source?.provider || "").toLowerCase() === "local_ocr" && String(source?.evidence || "").trim());
    if (ocrSources.length) {
      const evidenceLine = document.createElement("div");
      evidenceLine.className = "reviewFieldEvidence";
      evidenceLine.textContent = ocrSources.slice(0, 2).map(source => {
        const confidence = Number(source?.confidence || 0);
        const confidenceText = confidence > 0 ? ` • ${Math.round(confidence * 100)}%` : "";
        return `OCR: “${String(source.evidence).slice(0, 140)}”${source.photo ? ` • Photo ${source.photo}` : ""}${confidenceText}`;
      }).join(" | ");
      main.appendChild(evidenceLine);
    }
    if (answer.changedFrom || answer.changedTo || answer.status === "user_corrected" || answer.status === "cleared_by_user") {
      const changed = document.createElement("div");
      changed.className = "reviewFieldChange";
      changed.textContent = `Changed: ${answer.changedFrom || answer.aiValue || "empty"} → ${answer.changedTo || answer.currentValue || "empty"}`;
      main.appendChild(changed);
    }
    const chip = document.createElement("span");
    chip.className = "reviewChip reviewFieldStatus";
    chip.dataset.status = answer.status;
    chip.textContent = reviewStatusLabelV830(answer.status);
    row.append(main, chip);
    list.appendChild(row);
  }
}

function renderReviewDatabaseStatusV82310(response = {}) {
  if ($("reviewDatabaseTag")) { $("reviewDatabaseTag").textContent = `${Number(response.itemCount || 0)} files`; $("reviewDatabaseTag").className = "sourceTag ok"; }
  if ($("reviewDatabasePath")) $("reviewDatabasePath").textContent = `${response.path || ""}\nSaved items: ${Number(response.itemCount || 0)} • Needs review: ${Number(response.needsReview || 0)}`;
}
function renderReviewDatabaseErrorV82310(message) {
  if ($("reviewDatabaseTag")) { $("reviewDatabaseTag").textContent = "Unavailable"; $("reviewDatabaseTag").className = "sourceTag warn"; }
  if ($("reviewDatabasePath")) $("reviewDatabasePath").textContent = String(message || "Review database unavailable.");
}
function renderReviewItemsDataV82310(response = {}) {
  const box = $("reviewItemList"), empty = $("reviewNoItems"); if (!box || !empty) return;
  box.replaceChildren(); const items = Array.isArray(response?.items) ? response.items : [];
  if ($("reviewItemsCountTag")) $("reviewItemsCountTag").textContent = `${items.length} files`;
  empty.classList.toggle("hidden", items.length > 0);
  for (const item of items) {
    const row=document.createElement("div"); row.className="reviewItemRow";
    const main=document.createElement("div"), title=document.createElement("span"), meta=document.createElement("span"), chip=document.createElement("span");
    title.className="reviewItemTitle"; title.textContent=item.title||item.draftId||"Saved item";
    meta.className="reviewItemMeta"; meta.textContent=`${item.answerCount||0} answers • ${item.attentionCount||0} to check • ${item.fileName||"listing file"} • ${item.updatedAt||""}`;
    main.append(title,meta); chip.className="reviewChip"; chip.dataset.status=item.reviewStatus==="review_complete"?"user_confirmed":"needs_review"; chip.textContent=item.reviewStatus==="review_complete"?"Complete":"Review"; row.append(main,chip); box.appendChild(row);
  }
}
function bindReviewEventsV830() {
  bindClickV780("runReviewAnalysisBtn", () => runCurrentReviewAnalysisV890().catch(error => setStatus(`Review analysis error: ${error?.message || error}`)));
  bindClickV780("chooseReviewFolderBtn", () => chooseReviewFolderV840().catch(error => setStatus(`Review folder error: ${error?.message || error}`)));
  bindClickV780("refreshReviewDatabaseBtn", () => refreshReviewWorkspaceV830().catch(error => setStatus(`Review refresh error: ${error?.message || error}`)));
  bindClickV780("loadCurrentReviewBtn", () => loadCurrentReviewV830().catch(error => setStatus(`Review load error: ${error?.message || error}`)));
  bindClickV780("enableReviewAssistantBtn", () => enableReviewAssistantV830().catch(error => setStatus(`Review Assistant error: ${error?.message || error}`)));
  bindClickV780("disableReviewAssistantBtn", () => disableReviewAssistantV830().catch(error => setStatus(`Review Assistant error: ${error?.message || error}`)));
  $("reviewFilter")?.addEventListener("change", () => renderReviewCurrentItemV830());
}

function setReviewRunningV82310(running) { const button=$("runReviewAnalysisBtn"); if(button) button.disabled=!!running; }
function setReviewStageV82310(text, tone="warn") { const tag=$("reviewCurrentStatusTag"); if(!tag) return; tag.textContent=String(text||""); tag.className=`sourceTag ${tone||""}`.trim(); }
function setReviewCurrentTextV82310(text) { const box=$("reviewCurrentItemBox"); if(box) box.textContent=String(text||""); }
function reviewFilterValueV82310() { return $("reviewFilter")?.value || "needs_attention"; }
(() => {
  const ui=globalThis.EbayUI;
  if(ui?.register && !ui.has?.("review")) ui.register("review", {
    renderCurrent: renderReviewCurrentItemV830,
    setRunning: setReviewRunningV82310,
    setStage: setReviewStageV82310,
    setCurrentText: setReviewCurrentTextV82310,
    filterValue: reviewFilterValueV82310,
    renderDatabase: renderReviewDatabaseStatusV82310,
    renderDatabaseError: renderReviewDatabaseErrorV82310,
    renderItems: renderReviewItemsDataV82310
  });
})();
