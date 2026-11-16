/* V8.23.21 Review model/resolver helpers. No DOM/storage side effects. */
function reviewKeyV830(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function reviewDraftIdV830(url = ebayPageContextV639.url || "") {
  const match = String(url || "").match(/[?&](?:draftId|draft_id)=([^&#]+)/i);
  try { return match ? decodeURIComponent(match[1]).slice(0, 180) : ""; } catch (_) { return match?.[1]?.slice(0, 180) || ""; }
}

function reviewStatusFromEvidenceV830(field, aiValue, evidence = {}, suggestedAnswers = {}) {
  if (!String(aiValue || "").trim()) return "not_filled";
  if (Object.prototype.hasOwnProperty.call(suggestedAnswers || {}, field) || evidence?.sourceType === "safe_default" || evidence?.probable === true) return "needs_review";
  const sources = Array.isArray(evidence?.sources) ? evidence.sources : [];
  const sourceText = sources.map(source => String(source?.evidence || "")).join(" ").toLowerCase();
  const confidence = Number(evidence?.confidence || 0);
  const sourceTypes = new Set(sources.map(source => String(source?.type || "")));
  if (sourceTypes.has("physical_tag") || /\b(tag|label|marked|reads?|printed|made in|size tag|care label)\b/.test(sourceText)) return "confirmed_by_tag";
  if (sources.length) return "confirmed_by_photo";
  return "needs_review";
}

function reviewStatusLabelV830(status) {
  return ({
    confirmed_by_tag: "Confirmed by tag",
    confirmed_by_photo: "Confirmed by photo",
    supported_by_two_models: "Supported by two models",
    likely_correct: "Likely correct",
    suggested: "Suggested",
    needs_review: "Needs review",
    conflict: "Conflict",
    user_confirmed: "User confirmed",
    user_corrected: "User corrected",
    cleared_by_user: "Cleared by user",
    not_filled: "Not filled"
  })[String(status || "")] || "Needs review";
}

function reviewNeedsAttentionV830(status) {
  return ["supported_by_two_models", "likely_correct", "suggested", "needs_review", "conflict", "cleared_by_user", "not_filled"].includes(String(status || ""));
}

function buildReviewItemV830({
  questions = [], answers = {}, evidence = {}, suggestedAnswers = {}, reviewDetails = [], modelResults = {}, validationIssues = [],
  fieldCatalog = [], photoCatalog = [], reviewer = {}, analysisRunId = "", aiResponseSchemaVersion = 3, fillPolicy = "safe", usage = {}
} = {}) {
  const reviewByKey = new Map((Array.isArray(reviewDetails) ? reviewDetails : []).map(item => [reviewKeyV830(item?.field), item]));
  const modelByKey = new Map(Object.entries(modelResults || {}).map(([label, item]) => [reviewKeyV830(label), item || {}]));
  const actualCatalog = Array.isArray(fieldCatalog) && fieldCatalog.length ? fieldCatalog : (ebayPageContextV639.fieldCatalog || ebayPageContextV639.fields || []);
  const actualPhotos = Array.isArray(photoCatalog) && photoCatalog.length ? photoCatalog : (ebayPageContextV639.photoCatalog || ebayPhotoCache || []);
  const catalogByKey = new Map(actualCatalog.map(item => [reviewKeyV830(item?.field || item?.name || item?.label), item]));
  const currentByKey = new Map(Object.entries(ebayPageContextV639.fieldSummary || {}).map(([label, value]) => [reviewKeyV830(label), String(value || "").trim()]));
  const ordered = Array.from(new Set([...(Array.isArray(questions) ? questions : []), ...Object.keys(answers || {}), ...Object.keys(modelResults || {})].map(value => String(value || "").trim()).filter(Boolean)));
  const fields = ordered.map(field => {
    const key = reviewKeyV830(field), reviewDetail = reviewByKey.get(key) || {}, result = modelByKey.get(key) || {}, catalog = catalogByKey.get(key) || {};
    const confirmedValue = String(answers?.[field] || "").trim();
    const proposedValue = String(suggestedAnswers?.[field] || reviewDetail?.proposedValue || result?.value || "").trim();
    const aiValue = confirmedValue || proposedValue;
    const itemEvidence = evidence?.[field] && typeof evidence[field] === "object" ? evidence[field] : {};
    const currentValue = currentByKey.get(key) || "";
    const status = String(result?.status || reviewDetail?.status || (confirmedValue ? reviewStatusFromEvidenceV830(field, aiValue, itemEvidence, suggestedAnswers) : aiValue ? "needs_review" : "not_filled"));
    const sourceInput = Array.isArray(result?.sources) ? result.sources : Array.isArray(itemEvidence?.sources) ? itemEvidence.sources : Array.isArray(reviewDetail?.sources) ? reviewDetail.sources : [];
    return {
      field, fieldKey: key,
      fieldId: String(result?.fieldId || reviewDetail?.fieldId || catalog?.fieldId || catalog?.field_id || ""),
      fieldKeySource: String(catalog?.fieldKeySource || catalog?.field_key_source || ""), domKey: String(catalog?.domKey || catalog?.dom_key || ""), taxonomyName: String(catalog?.taxonomyName || field), orphaned: false,
      aiValue, primaryValue: String(result?.value || proposedValue || confirmedValue || ""), reviewerValue: String(result?.reviewer?.value || ""),
      filledValue: currentValue && currentValue === aiValue ? currentValue : "", currentValue, status,
      modelStatus: String(result?.modelStatus || reviewDetail?.modelStatus || "needs_review"), confidence: Number(result?.confidence ?? itemEvidence?.confidence ?? reviewDetail?.confidence ?? 0),
      sourceType: String(result?.evidenceType || itemEvidence?.evidenceType || itemEvidence?.sourceType || ""), evidenceScope: String(result?.evidenceScope || itemEvidence?.evidenceScope || ""),
      rawValue: String(result?.rawValue || itemEvidence?.rawValue || ""),
      ocrStatus: String(result?.ocrStatus || itemEvidence?.ocrStatus || reviewDetail?.ocrStatus || ""),
      ocrDetectedValues: Array.isArray(result?.ocrDetectedValues) ? result.ocrDetectedValues : [],
      resolverStatus: String(result?.resolverStatus || result?.resolver?.reason || reviewDetail?.resolverReason || ""),
      resolvedValue: String(result?.resolvedValue || result?.resolver?.value || ""),
      autoFillAllowed: result?.autoFillAllowed !== false,
      reason: String(reviewDetail?.reason || itemEvidence?.reason || ""), reviewReason: String(result?.reviewReason || reviewDetail?.reviewReason || ""),
      missingPhotoRole: String(result?.missingPhotoRole || reviewDetail?.missingPhotoRole || "none"), validationIssues: Array.isArray(result?.validationIssues) ? result.validationIssues : [],
      primary: result && typeof result === "object" ? result : {}, reviewer: result?.reviewer && typeof result.reviewer === "object" ? result.reviewer : {},
      sources: sourceInput.slice(0, 8).map(source => ({
        photoId: String(source?.photoId || source?.photo_id || ""),
        photo: Number(source?.photo || source?.displayNumber || 0),
        type: String(source?.type || result?.evidenceType || ""),
        scope: String(source?.scope || result?.evidenceScope || ""),
        provider: String(source?.provider || result?.provider || "openai"),
        evidence: String(source?.evidence || result?.evidence || ""),
        confidence: Number(source?.confidence || 0),
        box: source?.box && typeof source.box === "object" ? {
          x: Number(source.box.x || 0), y: Number(source.box.y || 0),
          width: Number(source.box.width || 0), height: Number(source.box.height || 0)
        } : null
      })),
      changedFrom: "", changedTo: "", history: []
    };
  });
  return {
    schemaVersion: 3, reviewFileSchemaVersion: 3, aiResponseSchemaVersion: Number(aiResponseSchemaVersion || 3), analysisRunId: String(analysisRunId || ""),
    draftId: ebayPageContextV639.draftId || reviewDraftIdV830(), title: String(ebayPageContextV639.currentTitle || getData().title || "").trim(), category: String(ebayPageContextV639.category || "").trim(),
    categoryId: String(ebayPageContextV639.categoryId || "unknown"), marketplaceId: String(ebayPageContextV639.marketplaceId || "EBAY_US"), url: String(ebayPageContextV639.url || "").trim(),
    extensionVersion: "V8.23.21", primaryProvider: "openai", reviewer: reviewer && typeof reviewer === "object" ? reviewer : {}, fillPolicy: String(fillPolicy || "safe"),
    fieldCatalog: actualCatalog, photoCatalog: actualPhotos, validationIssues: Array.isArray(validationIssues) ? validationIssues : [], usage: usage && typeof usage === "object" ? usage : {}, answers: fields
  };
}

function reviewIdentityPayloadV830() {
  return {
    draftId: ebayPageContextV639.draftId || reviewDraftIdV830(),
    title: String(ebayPageContextV639.currentTitle || getData().title || "").trim(),
    category: String(ebayPageContextV639.category || "").trim(),
    url: String(ebayPageContextV639.url || "").trim()
  };
}

function reviewCurrentValuesV830() {
  return new Map(Object.entries(ebayPageContextV639.fieldSummary || {}).map(([label, value]) => [reviewKeyV830(label), String(value || "").trim()]));
}

function effectiveReviewAnswerV830(answer, currentValues = reviewCurrentValuesV830()) {
  const copy = { ...(answer || {}) };
  const current = currentValues.get(reviewKeyV830(copy.field)) ?? String(copy.currentValue || "");
  copy.currentValue = String(current || "").trim();
  const savedCurrent = String(answer?.currentValue || copy.changedTo || copy.filledValue || "").trim();
  if (!copy.currentValue) {
    if (savedCurrent) {
      copy.status = "cleared_by_user";
      copy.changedFrom = savedCurrent;
      copy.changedTo = "";
    }
    return copy;
  }
  if (savedCurrent && reviewKeyV830(copy.currentValue) !== reviewKeyV830(savedCurrent)) {
    copy.status = "user_corrected";
    copy.changedFrom = savedCurrent;
    copy.changedTo = copy.currentValue;
    return copy;
  }
  if (copy.aiValue && reviewKeyV830(copy.currentValue) !== reviewKeyV830(copy.aiValue)) {
    copy.status = "user_corrected";
    copy.changedFrom = copy.aiValue;
    copy.changedTo = copy.currentValue;
  }
  return copy;
}

function reviewFilterAcceptsV830(answer, filter) {
  const status = String(answer?.status || "");
  if (filter === "all") return true;
  if (filter === "suggested") return ["suggested", "likely_correct", "supported_by_two_models"].includes(status);
  if (filter === "changed") return ["user_corrected", "cleared_by_user"].includes(status);
  if (filter === "confirmed") return ["confirmed_by_tag", "confirmed_by_photo", "user_confirmed"].includes(status);
  return reviewNeedsAttentionV830(status);
}

