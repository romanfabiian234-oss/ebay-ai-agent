/* V8.23.21 photo-state persistence container. */
async function savePhotoCaches() {
  await globalThis.EbayAiStorageV790.set({
    [STORAGE.ebayPhotos]: ebayPhotoCache,
    [STORAGE.screenshotPhotos]: screenshotPhotoCache,
    [STORAGE.pageContext]: ebayPageContextV639,
    [STORAGE.checklist]: lastPhotoChecklist
  });
}
async function loadPhotoCaches() {
  const stored = await globalThis.EbayAiStorageV790.get([STORAGE.ebayPhotos, STORAGE.screenshotPhotos, STORAGE.pageContext, STORAGE.checklist]);
  ebayPhotoCache = stored[STORAGE.ebayPhotos] || [];
  currentPhotoSourcePlatformV8220 = String(ebayPhotoCache.find(photo => photo?.marketplaceSource)?.marketplaceSource || stored[STORAGE.pageContext]?.platform || "ebay").toLowerCase();
  screenshotPhotoCache = stored[STORAGE.screenshotPhotos] || [];
  ebayPageContextV639 = sanitizePageContextV639(stored[STORAGE.pageContext] || {});
  lastPhotoChecklist = stored[STORAGE.checklist] || null;
}
