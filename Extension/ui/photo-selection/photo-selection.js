/* V8.23.21 photo selection UI container: renders photos/checklist and handles selection removal. */
function setPhotoReport(text) {
  const box = $("photoReadReport");
  if (box) box.textContent = text || "";
}

function currentPhotoSourceLabelV8220() {
  const inferred = String(ebayPhotoCache.find(photo => photo?.marketplaceSource)?.marketplaceSource || currentPhotoSourcePlatformV8220 || "ebay").toLowerCase();
  return inferred === "depop" ? "Depop" : inferred === "poshmark" ? "Poshmark" : "eBay";
}
function photoKindCounts() {
  const source = String(currentPhotoSourcePlatformV8220 || "ebay").toLowerCase();
  const marketplace = ebayPhotoCache.length;
  return {
    upload: Array.from($("photoInput")?.files || []).length,
    marketplace,
    ebay: source === "ebay" ? marketplace : 0,
    depop: source === "depop" ? marketplace : 0,
    poshmark: source === "poshmark" ? marketplace : 0,
    screenshot: screenshotPhotoCache.length
  };
}
function updatePhotoSourceBar() {
  return globalThis.EbayUI?.photoSelectionView?.renderSourceBar?.({
    countTag: $("photoCountTag"),
    sourceBar: $("photoSourceBar"),
    counts: photoKindCounts(),
    sourceLabel: currentPhotoSourceLabelV8220()
  });
}
function checklistFromCurrentPhotos() {
  const counts = photoKindCounts();
  const total = counts.upload + counts.marketplace + counts.screenshot;
  const out = DEFAULT_CHECKLIST.map(item => ({ ...item }));
  const set = (key, state, note) => {
    const item = out.find(x => x.key === key);
    if (item) { item.state = state; item.note = note; }
  };
  if (total >= 1) set("front", "ok", "At least one photo loaded");
  if (total >= 2) set("back", "review", "Multiple photos loaded; AI should verify front/back");
  if (total >= 4) set("brandTag", "review", "Enough photos for tags, but AI must verify");
  if (total >= 5) set("sizeTag", "review", "Enough photos for size tag, but AI must verify");
  if (total >= 6) set("materialTag", "review", "Enough photos for material tag, but material still must be confirmed by visible tag");
  return out;
}
function normalizeChecklistItems(input) {
  if (!input) return checklistFromCurrentPhotos();
  const arr = Array.isArray(input) ? input : Object.entries(input).map(([key, value]) => {
    if (typeof value === "object") return { key, ...value };
    return { key, label: key, state: value ? "ok" : "review", note: String(value) };
  });
  return arr.map((item, i) => {
    const label = item.label || item.name || item.key || `Photo check ${i + 1}`;
    let state = normalize(item.state || item.status || "review");
    if (["yes", "true", "ok", "present", "confirmed", "found"].includes(state)) state = "ok";
    else if (["no", "false", "missing", "not found"].includes(state)) state = "missing";
    else state = "review";
    return { key: item.key || label, label, state, note: item.note || item.details || item.reason || "" };
  });
}
function renderPhotoChecklist(items = null) {
  const list = normalizeChecklistItems(items || lastPhotoChecklist || checklistFromCurrentPhotos());
  return globalThis.EbayUI?.photoSelectionView?.renderChecklist?.($("photoChecklist"), list);
}
function escapeHtml(text) {
  return globalThis.EbayUI?.photoSelectionView?.escapeHtml?.(text) ?? String(text || "");
}
function removeUploadFileAtV82310(index){const input=$("photoInput"),files=Array.from(input?.files||[]);if(!input||index<0||index>=files.length)return {ok:false};try{const transfer=new DataTransfer();files.forEach((file,fileIndex)=>{if(fileIndex!==index)transfer.items.add(file);});input.files=transfer.files;return {ok:true,clearedAll:false};}catch(error){input.value="";return {ok:true,clearedAll:true};}}

function renderAllPhotos() {
  const grid = $("photoPreview");
  if (!grid) return;
  grid.innerHTML = "";
  const files = Array.from($("photoInput")?.files || []);
  const uploadItems = files.slice(0, 12).map((file, index) => ({ kind: "upload", sourceIndex: index, label: `Upload ${index + 1}`, url: URL.createObjectURL(file), name: file.name, revoke: true }));
  const ebayItems = ebayPhotoCache.slice(0, 12).map((p, i) => {
    const source = String(p?.marketplaceSource || currentPhotoSourcePlatformV8220 || "ebay").toLowerCase();
    const sourceLabel = source === "depop" ? "Depop" : source === "poshmark" ? "Poshmark" : "eBay";
    return { ...p, kind: p.kind || (source === "ebay" ? "ebay" : "marketplace"), marketplaceSource: source, sourceIndex: i, sourceLabel, label: p.role || `${sourceLabel} ${i + 1}`, url: p.dataUrl || p.url || p.src };
  });
  const screenItems = screenshotPhotoCache.slice(0, 4).map((p, i) => ({ ...p, kind: "screenshot", sourceIndex: i, label: `Screenshot ${i + 1}`, url: p.dataUrl }));
  const items = [...ebayItems, ...screenItems, ...uploadItems];
  for (const [i, item] of items.entries()) {
    const card = document.createElement("div");
    card.className = "photoCard";
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.alt || item.name || item.label || "photo";
    if (item.revoke) img.onload = () => URL.revokeObjectURL(item.url);
    const badge = document.createElement("div");
    badge.className = "photoBadge";
    badge.textContent = item.kind === "screenshot" ? "Screen" : item.kind === "upload" ? "Upload" : (item.sourceLabel || (item.marketplaceSource === "depop" ? "Depop" : item.marketplaceSource === "poshmark" ? "Poshmark" : "eBay"));
    const meta = document.createElement("div");
    meta.className = "photoMeta";
    meta.textContent = `${i + 1}. ${item.label || item.name || item.kind}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.title = "Remove this image from AI analysis";
    removeButton.setAttribute("aria-label", `Remove ${item.label || item.name || "photo"} from AI analysis`);
    removeButton.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await removePhotoFromAnalysisV642(item.kind, item.sourceIndex, item.name || item.label || "photo");
    });
    card.appendChild(img);
    card.appendChild(badge);
    card.appendChild(removeButton);
    card.appendChild(meta);
    grid.appendChild(card);
  }
  updatePhotoSourceBar();
  renderPhotoChecklist();
  if (!items.length) setPhotoReport("No photos loaded yet.");
}


(() => {
  const ui = globalThis.EbayUI;
  if (ui?.register && !ui.has?.("photoSelection")) ui.register("photoSelection", {
    setReport: setPhotoReport,
    renderAll: renderAllPhotos,
    renderChecklist: renderPhotoChecklist,
    counts: photoKindCounts,
    checklist: checklistFromCurrentPhotos,
    removeUploadAt: removeUploadFileAtV82310,
    clearUploadInput: () => { if ($("photoInput")) $("photoInput").value = ""; }
  });
})();
