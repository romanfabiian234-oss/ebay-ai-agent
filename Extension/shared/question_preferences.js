/* V8.23.21 question-preference persistence. */
async function loadQuestionPreferencesV680() {
  const stored = await globalThis.EbayAiStorageV790.get(STORAGE.excludedQuestions);
  const saved = Array.isArray(stored[STORAGE.excludedQuestions]) ? stored[STORAGE.excludedQuestions] : [];
  excludedQuestionKeysV680 = new Set(saved.map(itemSpecificQuestionKeyV670).filter(Boolean));
  renderQuestionSelectionV680();
}

async function saveQuestionPreferencesV680() {
  await globalThis.EbayAiStorageV790.set({ [STORAGE.excludedQuestions]: [...excludedQuestionKeysV680].sort() });
}

