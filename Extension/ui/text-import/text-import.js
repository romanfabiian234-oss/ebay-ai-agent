/* V8.23.21 Text Import UI: rendering and user input only. */
function questionSelectionRowV680(question, included) {
  const row = document.createElement("div");
  row.className = "questionSelectionRow";
  const name = document.createElement("span");
  name.textContent = question;
  const button = document.createElement("button");
  button.type = "button";
  button.className = included ? "red" : "primary";
  button.textContent = included ? "Remove" : "Add";
  button.addEventListener("click", () => setQuestionIncludedV680(question, !included));
  row.append(name, button);
  return row;
}

function renderQuestionSelectionV680() {
  const includedBox = $("includedQuestionsList");
  const excludedBox = $("excludedQuestionsList");
  if (!includedBox || !excludedBox) return;
  const all = currentItemSpecificQuestionsV670();
  const included = all.filter(question => !excludedQuestionKeysV680.has(itemSpecificQuestionKeyV670(question)));
  const excluded = all.filter(question => excludedQuestionKeysV680.has(itemSpecificQuestionKeyV670(question)));
  includedBox.replaceChildren(...included.map(question => questionSelectionRowV680(question, true)));
  excludedBox.replaceChildren(...excluded.map(question => questionSelectionRowV680(question, false)));
  $("noIncludedQuestions")?.classList.toggle("hidden", included.length > 0);
  $("noExcludedQuestions")?.classList.toggle("hidden", excluded.length > 0);
  if ($("selectedQuestionsCountTag")) $("selectedQuestionsCountTag").textContent = `${included.length}/${all.length} selected`;
  if ($("excludedQuestionsCountTag")) $("excludedQuestionsCountTag").textContent = `${excluded.length} removed`;
}

function readDynamicSpecificAnswersV82310(){const answers={};document.querySelectorAll("#dynamicSpecificsFields [data-specific-question]").forEach(input=>{const question=String(input.dataset.specificQuestion||"").trim(),value=String(input.value||"").trim();if(question&&isUsableItemSpecificAnswerV670(value))answers[question]=value;});return answers;}
function syncDynamicSpecificInputsV82310(){applyDynamicSpecificAnswersV82310(readDynamicSpecificAnswersV82310()).catch(error=>setStatus(`Save error: ${error?.message||error}`));}
function updateDynamicSpecificsCountV670(answers = mergedItemSpecificAnswersV670()) {
  const total = currentItemSpecificQuestionsV670().length;
  const answered = Object.keys(answers || {}).length;
  if ($("itemSpecificsCountTag")) $("itemSpecificsCountTag").textContent = `${answered}/${total} answered`;
}

function renderDynamicSpecificFieldsV670(data = getData()) {
  const container = $("dynamicSpecificsFields");
  if (!container) return;
  const questions = currentItemSpecificQuestionsV670();
  const answers = mergedItemSpecificAnswersV670(data);
  const signature = questions.join("\u0000");
  if (signature !== dynamicSpecificsSignatureV670 || container.children.length !== questions.length) {
    container.replaceChildren();
    for (const question of questions) {
      const label = document.createElement("label");
      label.textContent = question;
      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.dataset.specificQuestion = question;
      input.value = answers[question] || "";
      input.addEventListener("input", syncDynamicSpecificInputsV82310);
      label.appendChild(input);
      container.appendChild(label);
    }
    dynamicSpecificsSignatureV670 = signature;
  } else {
    container.querySelectorAll("[data-specific-question]").forEach(input => {
      if (document.activeElement !== input) input.value = answers[input.dataset.specificQuestion] || "";
    });
  }
  if ($("noItemSpecificsFields")) $("noItemSpecificsFields").classList.toggle("hidden", questions.length > 0);
  if ($("itemSpecificsPageHint")) {
    $("itemSpecificsPageHint").textContent = questions.length
      ? `${questions.length} exact field(s) loaded from the current eBay category. Only these fields can be imported or filled.`
      : "Open an eBay draft to load its current Item Specific questions.";
  }
  updateDynamicSpecificsCountV670(answers);
}

function buildPreview(data, warnings) {
  return [
    `TITLE (${(data.title || "").length}/80)`, data.title || "Not confirmed", "",
    "PRICE", data.price ? `$${data.price}` : "Not confirmed", data.suggestedPrice ? `Suggested: ${data.suggestedPrice}` : "", "",
    "BASIC", `Brand: ${data.brand || "Not confirmed"}`, `Size: ${data.size || "Not confirmed"}`, `Color: ${data.color || "Not confirmed"}`, `Condition: ${data.condition || "Not confirmed"}`, "",
    "ITEM SPECIFICS", data.specifics || "Not confirmed", "",
    "DESCRIPTION", data.description || "Not confirmed", "",
    "WARNINGS", warnings.length ? warnings.map(w => `⚠ ${w}`).join("\n") : "No major warnings. Review before publishing."
  ].filter(x => x !== "").join("\n");
}

function updateAll() {
  const data = getData();
  const titleLen = (data.title || "").length;
  $("titleCount").textContent = `${titleLen}/80`;
  $("titleCount").classList.toggle("bad", titleLen > 80);
  const warnings = buildWarnings(data);
  const warningBox = $("warnings");
  warningBox.classList.toggle("ok", warnings.length === 0);
  warningBox.textContent = warnings.length ? warnings.map(w => `⚠ ${w}`).join("\n") : "No major warnings. Still review before publishing.";
  $("preview").textContent = buildPreview(data, warnings);
  updateWebResearchToggleV640();
  renderDynamicSpecificFieldsV670(data);
  renderQuestionSelectionV680();
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 250);
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    $("chatgptText").value = text || "";
    scheduleSave();
    setStatus("Clipboard pasted.");
  } catch (_) {
    setStatus("Could not read clipboard. Click box and press Command+V.");
  }
}


function readRawTextV82310(){return $("chatgptText")?.value||"";}
function setRawTextV82310(text){if($("chatgptText")) $("chatgptText").value=String(text||"");}
function clearTextFormV82310(){for(const id of FIELD_IDS){if(!$(id))continue;if(id==="profile")$(id).value="General";else if(id==="quantity")$(id).value="1";else $(id).value="";}setRawTextV82310("");}
(() => {const ui=globalThis.EbayUI;if(ui?.register&&!ui.has?.("textImport"))ui.register("textImport",{renderQuestions:renderQuestionSelectionV680,renderFields:renderDynamicSpecificFieldsV670,updateCount:updateDynamicSpecificsCountV670,updateAll,readRawText:readRawTextV82310,setRawText:setRawTextV82310,clearForm:clearTextFormV82310});})();
