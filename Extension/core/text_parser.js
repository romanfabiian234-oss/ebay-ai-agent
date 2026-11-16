/* V8.23.21 deterministic Text Import parser. No DOM/storage side effects. */
/* Item-specific parser vocabulary belongs to the parser, not UI state. */
const LABEL_ALIASES = {
  title: ["title", "item title", "заголовок", "название", "назва"],
  brand: ["brand", "бренд", "марка"], size: ["size", "розмір", "размер"], color: ["color", "colour", "колір", "цвет"],
  condition: ["condition", "item condition", "стан", "состояние"], price: ["price", "item price", "ціна", "цена"],
  suggestedPrice: ["suggested price", "recommended price", "price range", "предложенная цена", "рекомендована ціна"],
  category: ["category", "категорія", "категория"], description: ["description", "item description", "опис", "описание"],
  conditionDescription: ["condition description", "condition note", "condition notes", "condition details", "опис стану", "описание состояния"],
  measurements: ["measurements", "measurement", "заміри", "замеры"], shipping: ["shipping", "shipping notes", "доставка"],
  aiWarnings: ["warnings", "warning", "попередження", "предупреждения", "предупреждение"], specifics: ["item specifics", "specifics", "item specific", "характеристики", "специфікації", "спецификации"]
};
const ITEM_SPECIFIC_LABELS = [
  "Style", "Department", "Type", "US Shoe Size", "UK Shoe Size", "AU Shoe Size", "EU Shoe Size", "Upper Material", "UPC", "Lining Material", "Insole Material", "Outsole Material", "Shoe Width", "Closure", "Pattern", "Features", "Character", "Model", "Heel Height", "Vintage", "Theme", "Accents", "Fabric Type", "Product Line", "Performance/Activity", "Heel Style", "Occasion", "Season", "Toe Shape", "Country of Origin", "Handmade", "Shoe Shaft Style", "MPN", "California Prop 65 Warning", "Outer Shell Material", "Insulation Material", "Sleeve Length", "Sleeve Type", "Neckline", "Dress Length", "Material", "Fabric Wash", "Fit", "Size Type", "Swim Bottom Style", "Swim Top Style", "Cup Size", "Strap Type", "Number of Pieces", "Garment Care", "Personalize", "Personalization Instructions", "Character Family"
];
function scrubImportLabel(label) { return String(label || "").replace(/ /g, " ").replace(/\s+/g, " ").replace(/\s*~\s*[\d.]+\s*[kmb]?\s*searches?.*$/i, "").replace(/\s+Trending$/i, "").replace(/\s*\*$/, "").trim(); }
function isItemSpecificImportLabel(label) { const n=normalize(scrubImportLabel(label)); if(!n||n==="item specifics"||n==="specifics") return false; return ITEM_SPECIFIC_LABELS.some(x=>normalize(x)===n); }

function stripImportBullet(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/^[\s"'“”‘’`•*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseImportKeyValueLine(line) {
  const raw = stripImportBullet(line);
  if (!raw) return null;

  // Supports all formats the user usually pastes:
  // Brand: Filson
  // Brand - Filson
  // Brand – Filson
  // Brand — Filson
  // Brand = Filson
  const match = raw.match(/^(.{2,90}?)\s*(?:[:：=]|\s[-–—]\s)\s*(.+)$/);
  if (!match) return null;

  const label = scrubImportLabel(match[1]);
  let value = clean(match[2]);
  if (!label || !value || label.length > 80) return null;

  // Avoid treating normal sentences as item specifics.
  if (/^(https?|www\.)/i.test(label)) return null;
  if (label.split(/\s+/).length > 7 && !isItemSpecificImportLabel(label) && !fieldFromLabel(label)) return null;

  value = value.replace(/^[-–—•\s]+/, "").trim();
  return { label, value };
}

function parseKeyValueLines(text) {
  const result = {};
  if (!text) return result;
  for (const rawLine of String(text).split(/\r?\n|;/)) {
    const parsed = parseImportKeyValueLine(rawLine);
    if (parsed) result[parsed.label] = parsed.value;
  }
  return result;
}

function stringifyKeyValue(obj) {
  return Object.entries(obj || {})
    .filter(([k, v]) => k && v !== undefined && v !== null && String(v).trim())
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}

function itemSpecificQuestionKeyV670(value) {
  return normalize(scrubImportLabel(value)).replace(/[^a-z0-9]+/g, " ").trim();
}

function isUsableItemSpecificAnswerV670(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || /^[-?]+$/.test(text)) return false;
  return !globalThis.EbayAiFieldParserV790?.isPlaceholderValue?.(text);
}

function normalizeItemSpecificAnswerV671(label, value) {
  let answer = String(value || "")
    .replace(/^[-–—•\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  const key = itemSpecificQuestionKeyV670(label);
  if (!answer) return "";

  // Keep normalization intentionally small and deterministic. These are
  // spelling/shape fixes for common eBay values, not new AI guesses.
  if (key === "accents") {
    answer = answer
      .split(/\s*,\s*/)
      .map(part => /^buttons?$/i.test(part) ? "Buttons" : part)
      .join(", ");
  }
  if (key === "features") {
    answer = answer
      .split(/\s*,\s*/)
      .map(part => /^pockets?$/i.test(part) ? "Pockets" : part)
      .join(", ");
  }
  if (["vintage", "handmade", "personalize"].includes(key) && /^(?:yes|no)$/i.test(answer)) {
    answer = answer[0].toUpperCase() + answer.slice(1).toLowerCase();
  }
  if (key === "unit type" && /^units?$/i.test(answer)) answer = "Unit";
  if (key === "material") answer = answer.replace(/^(?:body|shell|fabric)\s*:?\s*/i, "").trim();
  if (key === "lining material") answer = answer.replace(/^(?:lining|liner)\s*:?\s*/i, "").trim();
  if (key === "upc") {
    const digits = answer.replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(digits.length) || /^0+$/.test(digits)) return "";
    answer = digits;
  }
  if (key === "california prop 65 warning" && /^(?:does not apply|not applicable|n\/?a|none|no|unknown)$/i.test(answer)) return "";
  if (/^(?:chest size|waist size|inseam|shirt length|jacket chest size)$/.test(key)) {
    const measurement = answer.match(/^(\d+(?:\.\d+)?(?:\s*(?:in|inch|inches|cm))?)/i);
    if (measurement) answer = measurement[1].replace(/\s*(?:inch|inches)$/i, " in").replace(/\s+/, " ").trim();
  }
  if (key === "country of origin") {
    answer = answer
      .replace(/^(?:made|manufactured|produced)\s+in\s+/i, "")
      .replace(/^country\s*:\s*/i, "")
      .trim();
  }
  if (key === "fabric weight") {
    if (/^(?:light|light[ -]?weight)$/i.test(answer)) answer = "Lightweight";
    else if (/^(?:medium|medium[ -]?weight|mid[ -]?weight)$/i.test(answer)) answer = "Midweight";
    else if (/^(?:heavy|heavy[ -]?weight)$/i.test(answer)) answer = "Heavyweight";
  }
  if (key === "garment care" && /^(?:see|check|refer to)\s+(?:the\s+)?(?:reverse|care label|label)(?:\s+for\s+care)?\.?$/i.test(answer)) {
    return "";
  }
  return answer;
}

function normalizeItemSpecificAnswerSetV683(answers = {}) {
  const normalized = { ...answers };
  const labelFor = wanted => Object.keys(normalized).find(label => itemSpecificQuestionKeyV670(label) === wanted);
  const typeLabel = labelFor("type");
  const styleLabel = labelFor("style");
  const type = String(typeLabel ? normalized[typeLabel] : "").trim();
  const style = String(styleLabel ? normalized[styleLabel] : "").trim();

  // Keep the Style noun consistent with Type without inventing a new fact.
  if (styleLabel && /\bjacket\b/i.test(type) && /^swing\s+coat$/i.test(style)) {
    normalized[styleLabel] = "Swing Jacket";
  } else if (styleLabel && /\bcoat\b/i.test(type) && /^swing\s+jacket$/i.test(style)) {
    normalized[styleLabel] = "Swing Coat";
  }
  return normalized;
}

let lastItemSpecificImportMetaV812 = { candidateCount: 0, acceptedCount: 0, ignored: [] };


function itemSpecificsOnlyDataV670(answers = {}) {
  const byKey = new Map(Object.entries(answers).map(([label, value]) => [itemSpecificQuestionKeyV670(label), value]));
  return {
    profile: "General",
    title: String(ebayPageContextV639.currentTitle || getData().title || "").trim(),
    brand: byKey.get("brand") || "",
    size: byKey.get("size") || byKey.get("us shoe size") || "",
    color: byKey.get("color") || byKey.get("colour") || byKey.get("exterior color") || "",
    condition: "",
    price: "",
    suggestedPrice: "",
    quantity: "1",
    category: "",
    conditionDescription: "",
    description: "",
    measurements: "",
    specifics: stringifyKeyValue(answers),
    shipping: "",
    aiWarnings: ""
  };
}

let dynamicSpecificsSignatureV670 = "";
function fieldFromLabel(label) {
  const cleanLabel = scrubImportLabel(label).replace(/[*#]/g, "");
  const n = normalize(cleanLabel);
  if (!n) return null;

  // Item-specific labels must stay in the Item Specifics text area.
  // Example: "UK Shoe Size" contains "Size", but it is NOT the top-level Size field.
  if (isItemSpecificImportLabel(cleanLabel)) return null;

  for (const [field, aliases] of Object.entries(LABEL_ALIASES)) {
    if (aliases.some(a => n === normalize(a))) return field;
  }

  // Soft contains matching only for long phrases. Avoid short words like "size" / "price"
  // from accidentally catching "UK Shoe Size" or "Suggested Price".
  for (const [field, aliases] of Object.entries(LABEL_ALIASES)) {
    if (aliases.some(a => normalize(a).length >= 8 && n.includes(normalize(a)))) return field;
  }
  return null;
}





function buildWarnings(data) {
  const warnings = [];
  if (!data.title) warnings.push("Title is missing.");
  if ((data.title || "").length > 80) warnings.push(`Title is over 80 characters: ${data.title.length}/80.`);
  if (!data.price) warnings.push("Price is missing.");
  if (!data.condition) warnings.push("Condition is missing.");
  if (!data.brand) warnings.push("Brand is missing or not confirmed.");
  if (!data.color) warnings.push("Color is missing or not confirmed.");
  const preowned = normalize(data.condition).includes("pre-owned");
  if (preowned && !normalize(`${data.conditionDescription} ${data.description}`).match(/condition|wear|pre-owned|flaw|photos/)) warnings.push("Pre-owned item needs condition note.");
  // V6.4.5: materials and descriptive terms are allowed when supported by evidence.
  if (!data.description) warnings.push("Description is missing.");
  if (data.aiWarnings) {
    for (const raw of data.aiWarnings.split(/\r?\n/)) if (raw.trim()) warnings.push(raw.trim());
  }
  return warnings;
}

