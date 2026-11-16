/* V8.23.21 draft persistence container. */
async function persistPopupDraftV82310(data, rawText) {
  await globalThis.EbayAiStorageV790.set({ [STORAGE.draft]: data, [STORAGE.raw]: String(rawText || "") });
}
async function loadPopupDraftV82310() {
  const stored = await globalThis.EbayAiStorageV790.get([STORAGE.draft, STORAGE.raw]);
  return { data: stored[STORAGE.draft] || null, rawText: stored[STORAGE.raw] || "" };
}
async function clearPopupDraftV82310() {
  await globalThis.EbayAiStorageV790.remove([STORAGE.draft, STORAGE.raw, STORAGE.ebayPhotos, STORAGE.screenshotPhotos, STORAGE.pageContext, STORAGE.checklist]);
}
