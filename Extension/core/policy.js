/* Central field policy, protected fields, and evidence validation — V8.23.21. Root-cause evidence guards for future listings. */

/* ===== ITEM SPECIFIC POLICY ===== */
/* Central Item Specific policy shared by automatic modes and the common Fill route. */
(function initEbayAiItemSpecifics(global) {
  "use strict";

  const ALWAYS_SKIP_FIELDS = new Set([
    "upc", "upc code", "universal product code", "universal product code upc",
    "mpn", "manufacturer part number", "manufacturer part number mpn"
  ]);

  // Free-form Item Specifics are allowed when they are ordinary reversible eBay
  // fields. Keep only fields whose meaning or dependency makes automatic writing unsafe.
  // Text/import mode is still explicit user input, but Photo/Autopilot/Queue may now fill
  // safe text Item Specifics when the AI has a supported value.
  const NEVER_AUTO_FILL_FIELDS = new Set([
    "california prop 65 warning",
    "personalization instructions"
  ]);

  // Low-value optional fields are skipped only when eBay does not mark them required.
  // Keep this list intentionally short so ordinary useful Item Specifics stay high-coverage.
  const LOW_VALUE_OPTIONAL_FIELDS = new Set([
    "unit quantity",
    "unit type"
  ]);

  // Automatic Fast Fill may answer these only when the supplied product photos directly
  // support the fact. Empty is valid and means "leave untouched". Review remains stricter.
  // Strict evidence-only facts. Automatic Fill leaves these untouched unless the
  // product photos directly support the fact. In particular, absence of evidence
  // never means Vintage/Handmade/Personalize = No.
  const EVIDENCE_ONLY_FIELDS = new Set([
    "garment care",
    "country of origin",
    "country region of manufacture",
    "country region of origin",
    "year manufactured",
    "year of manufacture",
    "authenticity",
    "certification",
    "character",
    "character family",
    "vintage",
    "handmade",
    "personalize",
    "customized",
    // Technical or hidden properties must not be guessed from generic appearance.
    "fabric weight",
    "performance activity",
    "cushioning level",
    "midsole type",
    "pronation",
    "heel to toe drop",
    "insulation weight",
    "fill power",
    "waterproof rating"
  ]);

  // Subjective fields may be useful, but an empty answer is preferable to a generic
  // filler value. They need strong visible/category support rather than mere plausibility.
  const STRONG_SUPPORT_FIELDS = new Set([
    "fit",
    "occasion",
    "theme",
    "season"
  ]);

  // Exact measurements/dimensions and manufacturer fit classifications must not be
  // guessed from perspective. These rules are behavior-based so they protect future
  // categories without hard-coding individual products.
  const MEASUREMENT_ONLY_FIELDS = new Set([
    "waist size", "inseam", "chest size", "shoulder to hem", "shoulder to shoulder",
    "waist to hem", "bag height", "bag width", "bag depth", "platform height",
    "heel height", "shaft height", "calf width", "shoe width"
  ]);

  // A negative binary answer is especially dangerous: not seeing a property is not
  // proof that it is absent. Named fields here are explicit even when eBay renders
  // them as a dropdown instead of a native Yes/No control.
  const EXPLICIT_BINARY_FIELDS = new Set([
    "signed", "vintage", "handmade", "personalize", "customized",
    "authenticity", "certification"
  ]);

  // These identity fields may use either direct product evidence OR explicit seller
  // context already present on the draft/title. They must never be guessed from style
  // or appearance alone, but they are less restrictive than strict evidence-only.
  const CONTEXT_REQUIRED_FIELDS = new Set([
    "brand",
    "size",
    "model",
    "product line"
  ]);

  function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function shouldAlwaysSkip(label) {
    return ALWAYS_SKIP_FIELDS.has(normalizeKey(label));
  }

  function isNeverAutoFill(label) {
    return NEVER_AUTO_FILL_FIELDS.has(normalizeKey(label));
  }

  function isLowValueOptional(label) {
    return LOW_VALUE_OPTIONAL_FIELDS.has(normalizeKey(label));
  }

  function isMaterialField(label) {
    const value = normalizeKey(label);
    return value === "material"
      || value.endsWith(" material")
      || [
        "metal", "metal purity", "gemstone", "stone", "main stone", "secondary stone",
        "diamond clarity grade", "diamond color grade", "total carat weight", "carat total weight"
      ].includes(value);
  }

  function isMeasurementOnly(label) {
    const value = normalizeKey(label);
    if (MEASUREMENT_ONLY_FIELDS.has(value)) return true;
    // Keep the pattern narrow: only exact dimensional nouns, not categorical fields
    // such as Sleeve Length or Dress Length which are legitimately visual classes.
    return /^(?:item |product )?(?:height|width|depth|circumference)$/.test(value)
      || /^(?:heel|platform|shaft|calf|bag|waist|chest|shoulder) (?:height|width|depth|size|circumference)$/.test(value);
  }

  function isExplicitBinaryLabel(label) {
    return EXPLICIT_BINARY_FIELDS.has(normalizeKey(label));
  }

  function isBinaryField(field = {}) {
    const type = String(field?.type || "").toLowerCase();
    if (type === "yesno") return true;
    const options = Array.isArray(field?.options) ? field.options.map(normalizeKey).filter(Boolean) : [];
    return options.length === 2 && options.includes("yes") && options.includes("no");
  }

  function isEvidenceOnly(label) {
    return EVIDENCE_ONLY_FIELDS.has(normalizeKey(label)) || isMaterialField(label) || isMeasurementOnly(label) || isExplicitBinaryLabel(label);
  }

  function isShoeSizeField(label) {
    return /^(?:(?:us|uk|eu|au) )?shoe size$/.test(normalizeKey(label));
  }

  function isContextRequired(label) {
    const normalized = normalizeKey(label);
    return CONTEXT_REQUIRED_FIELDS.has(normalized) || isShoeSizeField(label);
  }

  function isStrongSupport(label) {
    return STRONG_SUPPORT_FIELDS.has(normalizeKey(label));
  }

  function shouldVerifyExisting(label) {
    return isEvidenceOnly(label) || isContextRequired(label);
  }

  function requiresStrictSupport(fieldOrLabel = {}) {
    const field = typeof fieldOrLabel === "string" ? { name: fieldOrLabel } : (fieldOrLabel || {});
    const label = String(field.name || field.label || "");
    return isEvidenceOnly(label) || isContextRequired(label) || isBinaryField(field);
  }

  function requiresIndependentVerification(fieldOrLabel = {}) {
    const field = typeof fieldOrLabel === "string" ? { name: fieldOrLabel } : (fieldOrLabel || {});
    const label = String(field.name || field.label || "");
    // Ordinary visual fields do not need a second model pass. Identity, label facts,
    // exact measurements, technical facts and binary claims do.
    return isContextRequired(label) || isEvidenceOnly(label) || isBinaryField(field);
  }

  function automaticDecision(field = {}) {
    const label = String(field.name || field.label || "");
    const type = String(field.type || "").toLowerCase();
    const required = field.required === true;
    if (shouldAlwaysSkip(label)) return { allow: false, reason: "always_skip", evidenceOnly: false };
    if (isNeverAutoFill(label)) return { allow: false, reason: "never_auto_fill", evidenceOnly: false };
    if (!required && isLowValueOptional(label)) return { allow: false, reason: "low_value_optional", evidenceOnly: false };
    const binaryEvidence = isBinaryField(field);
    const evidenceOnly = isEvidenceOnly(label) || binaryEvidence;
    const contextRequired = isContextRequired(label);
    const strongSupport = isStrongSupport(label);
    return {
      allow: true,
      reason: "allowed",
      evidenceOnly,
      binaryEvidence,
      measurementOnly: isMeasurementOnly(label),
      contextRequired,
      strongSupport,
      safeText: type === "text",
      evidenceMode: isMeasurementOnly(label) ? "measurement" : binaryEvidence ? "binary_evidence" : evidenceOnly ? "strict" : contextRequired ? "context" : strongSupport ? "strong_support" : "best_probable"
    };
  }

  const api = Object.freeze({
    ALWAYS_SKIP_FIELDS,
    NEVER_AUTO_FILL_FIELDS,
    LOW_VALUE_OPTIONAL_FIELDS,
    EVIDENCE_ONLY_FIELDS,
    STRONG_SUPPORT_FIELDS,
    MEASUREMENT_ONLY_FIELDS,
    EXPLICIT_BINARY_FIELDS,
    CONTEXT_REQUIRED_FIELDS,
    normalizeKey,
    shouldAlwaysSkip,
    isNeverAutoFill,
    isLowValueOptional,
    isMaterialField,
    isMeasurementOnly,
    isExplicitBinaryLabel,
    isBinaryField,
    isEvidenceOnly,
    isShoeSizeField,
    isContextRequired,
    isStrongSupport,
    shouldVerifyExisting,
    requiresStrictSupport,
    requiresIndependentVerification,
    automaticDecision
  });

  // Keep the established global name so legacy/manual helpers continue to use one policy source.
  global.EbayAiItemSpecificsV7100 = api;
  global.EbayAiItemSpecificsV8110 = api;
})(globalThis);

/* ===== PROTECTED FIELDS ===== */
/* Protected-field rules shared by every mode before a fill action can run. */
(function initEbayAiSafety(global) {
  "use strict";

  const BLOCKED_FIELD_KEYS = new Set([
    "title", "item title",
    "condition", "item condition", "condition description", "condition note", "condition notes", "condition details",
    "description", "item description",
    "price", "item price", "quantity",
    "shipping", "shipping policy", "package weight", "package dimensions", "item location",
    "category",
    "payment", "payment policy", "return policy",
    "allow offers", "minimum offer", "auto accept",
    "upc", "upc code", "universal product code",
    "mpn", "manufacturer part number",
    "publish", "list", "list it", "submit", "finish update", "pay", "delete", "remove listing"
  ]);

  function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  const MARKETPLACE_BLOCKED_FIELD_KEYS = new Set([
    "title", "item title",
    "description", "item description",
    "price", "item price", "quantity",
    "shipping", "shipping policy", "shipping method", "shipping from", "package size", "package weight", "package dimensions", "item location",
    "availability", "boost your listing", "promote your item",
    "payment", "payment policy", "return policy",
    "allow offers", "minimum offer", "auto accept",
    "upc", "upc code", "universal product code",
    "mpn", "manufacturer part number",
    "publish", "list", "list it", "post listing", "post and add another", "submit", "finish update", "pay", "delete", "remove listing"
  ]);

  function inferPlatform() {
    try {
      const host = String(global.location?.hostname || "").toLowerCase();
      if (host === "depop.com" || host.endsWith(".depop.com")) return "depop";
      if (host === "poshmark.com" || host.endsWith(".poshmark.com")) return "poshmark";
    } catch (error) {
      try { global.EbayLogger?.debug?.("Platform detection fallback", { message: error?.message || String(error) }); } catch (_) { /* logger is optional */ }
    }
    return "ebay";
  }

  function isBlockedField(label, platform = inferPlatform()) {
    const normalized = normalizeKey(label);
    if (platform === "depop" || platform === "poshmark") return MARKETPLACE_BLOCKED_FIELD_KEYS.has(normalized);
    return BLOCKED_FIELD_KEYS.has(normalized);
  }

  global.EbayAiSafetyV790 = Object.freeze({ BLOCKED_FIELD_KEYS, MARKETPLACE_BLOCKED_FIELD_KEYS, normalizeKey, isBlockedField, inferPlatform });
})(globalThis);

/* ===== FIELD KNOWLEDGE ===== */
/* Field-specific AI knowledge and evidence policy. No DOM or Fill logic. */
(function initEbayAiFieldKnowledge(global) {
  "use strict";

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  const DEFINITIONS = Object.freeze({
    "brand": "Copy the brand exactly from a readable physical brand label. Never approximate a script logo.",
    "size": "Manufacturer size. Prefer a readable size tag; map combined labels such as XXL (18) to one exact eBay option.",
    "size type": "Sizing system such as Regular, Plus, Petite, Big & Tall, or Juniors. Use label/category evidence, not the numeric size alone.",
    "type": "The product class, such as Blouse, Dress, Sweater, Shorts, or Handbag.",
    "style": "The recognized garment or product silhouette. A collarless round or crew neckline with a short front button placket is Henley style when that exact option exists; Henley is not a Neckline value. Do not fall back to Basic when a more specific supported style exists.",
    "color": "The main visible color classification. Use Multicolor when several dominant colors are present and that option exists.",
    "material": "Standard fiber/material names from the composition label. Percentages belong in raw evidence, not selected values.",
    "fabric type": "Fabric construction or named fabric, such as Chiffon, Denim, Knit, Fleece, or Velvet; it is not the fiber content.",
    "sleeve length": "How far the sleeve extends: Sleeveless, Short Sleeve, 3/4 Sleeve, Long Sleeve, and similar.",
    "sleeve type": "The sleeve construction or shape, such as Puff, Bell, Raglan, Kimono, or Cap. Never repeat Sleeve Length here.",
    "neckline": "The visible neckline shape, such as Scoop Neck, V-Neck, Crew Neck, or High Neck.",
    "pattern": "The visible repeated design, such as Floral, Striped, Plaid, Solid, or Geometric.",
    "closure": "The visible fastening method, such as Pullover, Button, Zip, Hook & Eye, or Tie.",
    "fit": "The intended cut such as Relaxed, Regular, Slim, or Oversized. Use only when visually clear or stated by a label.",
    "features": "Concrete visible construction features or explicit label claims. Do not infer properties such as stretch-free.",
    "accents": "Visible decorative details such as Satin Trim, Ruffle, Embroidery, Beading, or Logo.",
    "occasion": "Intended use. Because it is subjective, answer only when strongly supported and an exact option exists.",
    "theme": "A recognizable motif or named theme. Do not duplicate Pattern unless the theme is genuinely supported.",
    "season": "Suitable seasons. Use conservatively; do not answer only from generic appearance.",
    "garment care": "Care instructions copied from a readable care label or symbols.",
    "country of origin": "Country explicitly stated by 'Made in ...' or equivalent wording on a physical label.",
    "country region of manufacture": "Country explicitly stated by 'Made in ...' or equivalent wording on a physical label.",
    "vintage": "Answer only with direct evidence of age or an explicit seller statement; modern appearance does not prove No.",
    "handmade": "Answer only when a label or explicit seller evidence states handmade status.",
    "personalize": "Answer only when explicit seller evidence states personalization availability.",
    "waist size": "A readable measurement or explicit manufacturer size measurement, not an estimate from garment size.",
    "inseam": "A readable physical measurement from the crotch seam to hem.",
    "dress length": "The visible/measurement-based length category such as Mini, Knee Length, Midi, or Maxi.",
    "fabric weight": "A technical weight category. Omit unless directly stated on a product/manufacturer label.",
    "performance activity": "Specific intended activity. Omit unless directly stated on the product/manufacturer label; generic suitability such as School or Travel is not evidence.",
    "cushioning level": "A hidden/technical cushioning classification. Omit unless explicitly stated by the manufacturer on the product or label.",
    "midsole type": "A hidden/technical construction detail. Omit unless explicitly stated by the manufacturer on the product or label.",
    "shoe width": "Manufacturer width classification. Use a readable size/manufacturer label; do not assume Standard from appearance.",
    "calf width": "Exact manufacturer/measurement-based calf classification. Do not infer Regular/Wide from appearance.",
    "platform height": "Exact physical dimension. Require a readable ruler/tape measurement or explicit manufacturer measurement.",
    "heel height": "Exact physical dimension or eBay height band. Require a readable ruler/tape measurement or explicit manufacturer measurement.",
    "signed": "Yes/No requires direct evidence. Absence of a visible signature does not prove No.",
    "character": "Named licensed character visibly depicted. Do not return None or Not Applicable.",
    "character family": "Named licensed franchise visibly depicted. Do not return None or Not Applicable."
  });

  const LABEL_REQUIRED = new Set([
    "brand", "size", "us shoe size", "uk shoe size", "eu shoe size", "au shoe size", "shoe size",
    "material", "garment care", "country of origin", "country region of manufacture", "model", "product line",
    "shoe width"
  ]);
  const EXPLICIT_ONLY = new Set([
    "vintage", "handmade", "personalize", "signed", "fabric weight", "performance activity",
    "cushioning level", "midsole type", "pronation", "heel to toe drop", "insulation weight", "fill power", "waterproof rating"
  ]);
  const SUBJECTIVE = new Set(["fit", "occasion", "theme", "season"]);
  const STRONG_VISUAL = new Set(["type", "color", "pattern", "closure", "sleeve length", "neckline", "dress length"]);

  function definition(label) {
    return DEFINITIONS[key(label)] || "Use only direct visible, label, measurement, or explicit seller evidence appropriate to this exact field.";
  }

  function policy(label) {
    const fieldKey = key(label);
    if (LABEL_REQUIRED.has(fieldKey)) {
      return { minConfidence: 0.90, allowedSourceTypes: ["physical_tag"], requiredFactKinds: ["label_text"], evidenceClass: "READABLE_PHYSICAL_LABEL" };
    }
    if (global.EbayAiItemSpecificsV7100?.isMeasurementOnly?.(label) || ["waist size", "inseam"].includes(fieldKey)) {
      return { minConfidence: 0.92, allowedSourceTypes: ["measurement", "physical_tag"], requiredFactKinds: ["measurement", "label_text"], evidenceClass: "READABLE_MEASUREMENT" };
    }
    if (EXPLICIT_ONLY.has(fieldKey)) {
      return { minConfidence: 0.95, allowedSourceTypes: ["physical_tag", "measurement"], requiredFactKinds: ["label_text", "measurement"], evidenceClass: "EXPLICIT_ONLY" };
    }
    if (SUBJECTIVE.has(fieldKey)) {
      const threshold = ["fit", "occasion", "theme", "season"].includes(fieldKey) ? 0.90 : 0.86;
      return { minConfidence: threshold, allowedSourceTypes: ["visual", "physical_tag"], requiredFactKinds: ["visual_observation", "label_text"], evidenceClass: "STRONG_SUPPORT" };
    }
    if (STRONG_VISUAL.has(fieldKey)) {
      return { minConfidence: 0.80, allowedSourceTypes: ["visual", "physical_tag", "measurement"], requiredFactKinds: ["visual_observation", "label_text", "measurement"], evidenceClass: "DIRECT_VISUAL" };
    }
    return { minConfidence: 0.82, allowedSourceTypes: ["visual", "physical_tag", "measurement"], requiredFactKinds: ["visual_observation", "label_text", "measurement"], evidenceClass: "DIRECT_EVIDENCE" };
  }

  function recoveryPriority(label) {
    const fieldKey = key(label);
    if (["brand", "size", "us shoe size", "uk shoe size", "eu shoe size", "au shoe size", "shoe size", "material", "country of origin", "country region of manufacture", "garment care"].includes(fieldKey)) return 100;
    if (["type", "color", "pattern", "closure", "sleeve length", "neckline", "style", "fabric type"].includes(fieldKey)) return 80;
    if (["features", "accents", "fit", "occasion", "theme", "season"].includes(fieldKey)) return 50;
    return 30;
  }

  function neededPhoto(label) {
    const fieldKey = key(label);
    if (fieldKey === "brand" || fieldKey === "size") return "Add a sharp close-up of the brand and size labels.";
    if (fieldKey === "material" || fieldKey === "country of origin" || fieldKey === "country region of manufacture") return "Add a sharp close-up of the fiber-content and Made in label.";
    if (fieldKey === "garment care") return "Add a sharp photo of both sides of the care label.";
    if (global.EbayAiItemSpecificsV7100?.isMeasurementOnly?.(label) || fieldKey === "waist size" || fieldKey === "inseam") return "Add a straight, in-focus measurement/size-label photo with the ruler or manufacturer value fully visible.";
    if (fieldKey === "sleeve type") return "Add a clear photo of the shoulder seam and full sleeve laid without folds.";
    if (fieldKey === "neckline") return "Add a straight front photo with the entire neckline visible.";
    return "Add a clearer close-up that directly shows this field.";
  }

  global.EbayAiFieldKnowledgeV820 = Object.freeze({ clean, key, definition, policy, recoveryPriority, neededPhoto });
})(globalThis);

/* ===== EVIDENCE VALIDATION ===== */
/* Deterministic OCR evidence validator and direct tag-fact recovery. */
(function initEvidenceValidator(global) {
  "use strict";

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9%]+/g, " ").trim();
  }

  function titleCase(value) {
    return clean(value).toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
  }

  const TEXT_REQUIRED_FIELDS = new Set([
    "brand", "size", "material", "garment care", "country of origin", "country region of manufacture", "model", "product line",
    "us shoe size", "shoe width", "upper material", "lining material", "outsole material"
  ]);

  const OCR_RECOVERY_FIELDS = new Set([
    "brand", "size", "material", "garment care", "country of origin", "country region of manufacture",
    "us shoe size", "shoe width", "upper material", "lining material", "outsole material"
  ]);

  const FIBERS = Object.freeze({
    cotton: ["cotton", "coton", "algodon", "baumwolle", "pamuk", "cotone", "katoen", "bomull", "bawelna", "kapas"],
    polyester: ["polyester", "poliester", "poliestere", "poliesther"],
    nylon: ["nylon", "polyamide", "polyamid", "poliamide", "poliamida"],
    rayon: ["rayon"],
    viscose: ["viscose", "viscosa", "viskose"],
    spandex: ["spandex", "elastane", "elastan", "elasthane", "lycra"],
    linen: ["linen", "lin", "lino", "flax"],
    wool: ["wool", "wolle", "lana"],
    silk: ["silk", "soie", "seide", "seda"],
    cashmere: ["cashmere", "kaschmir", "cachemire"],
    acrylic: ["acrylic", "acrylique", "acrilico"],
    acetate: ["acetate", "acetato"],
    modal: ["modal"],
    leather: ["leather", "cuir", "leder"],
    suede: ["suede", "daim", "velours leather"]
  });

  const FIBER_DISPLAY = Object.freeze({
    cotton: "Cotton", polyester: "Polyester", nylon: "Nylon", rayon: "Rayon", viscose: "Viscose",
    spandex: "Spandex", linen: "Linen", wool: "Wool", silk: "Silk", cashmere: "Cashmere",
    acrylic: "Acrylic", acetate: "Acetate", modal: "Modal", leather: "Leather", suede: "Suede"
  });

  const CARE_PHRASES = Object.freeze({
    "machine wash cold": ["machine wash cold", "machine washable cold", "wash cold", "machinewash cold", "machlne wash cold"],
    "machine wash": ["machine wash", "machine washable", "machinewash", "lavage machine", "lavar a maquina"],
    "hand wash only": ["hand wash only", "handwash only"],
    "hand wash": ["hand wash", "handwash", "wash by hand", "lavage a la main"],
    "dry clean only": ["dry clean only", "professional dry clean only"],
    "do not bleach": ["do not bleach", "no bleach", "non chlorine bleach", "non-chlorine bleach"],
    "tumble dry low": ["tumble dry low", "tumble dry low heat"],
    "line dry": ["line dry", "hang dry", "dry flat"],
    "wash inside out": ["wash inside out", "wash garment inside out"],
    "wash separately": ["wash separately", "wash with like colors", "wash and dry with like colors"]
  });

  // Longest aliases are matched first and only after an explicit origin phrase.
  // Language abbreviations such as CN/CH are intentionally not accepted as countries.
  const COUNTRY_ALIASES = Object.freeze({
    "united states of america": "United States",
    "united states": "United States",
    "u s a": "United States",
    "usa": "United States",
    "united kingdom": "United Kingdom",
    "great britain": "United Kingdom",
    "south korea": "South Korea",
    "republic of korea": "South Korea",
    "north korea": "North Korea",
    "hong kong": "Hong Kong",
    "dominican republic": "Dominican Republic",
    "costa rica": "Costa Rica",
    "el salvador": "El Salvador",
    "new zealand": "New Zealand",
    "sri lanka": "Sri Lanka",
    "czech republic": "Czech Republic",
    "czechia": "Czech Republic",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
    "united arab emirates": "United Arab Emirates",
    "puerto rico": "Puerto Rico",
    "viet nam": "Vietnam",
    "vietnam": "Vietnam",
    "indonesia": "Indonesia",
    "china": "China",
    "taiwan": "Taiwan",
    "bangladesh": "Bangladesh",
    "india": "India",
    "pakistan": "Pakistan",
    "cambodia": "Cambodia",
    "thailand": "Thailand",
    "philippines": "Philippines",
    "malaysia": "Malaysia",
    "myanmar": "Myanmar",
    "laos": "Laos",
    "japan": "Japan",
    "mexico": "Mexico",
    "canada": "Canada",
    "guatemala": "Guatemala",
    "honduras": "Honduras",
    "nicaragua": "Nicaragua",
    "peru": "Peru",
    "brazil": "Brazil",
    "colombia": "Colombia",
    "argentina": "Argentina",
    "chile": "Chile",
    "ecuador": "Ecuador",
    "turkey": "Turkey",
    "turkiye": "Turkey",
    "italy": "Italy",
    "france": "France",
    "germany": "Germany",
    "spain": "Spain",
    "portugal": "Portugal",
    "romania": "Romania",
    "bulgaria": "Bulgaria",
    "poland": "Poland",
    "ukraine": "Ukraine",
    "netherlands": "Netherlands",
    "belgium": "Belgium",
    "ireland": "Ireland",
    "greece": "Greece",
    "morocco": "Morocco",
    "tunisia": "Tunisia",
    "egypt": "Egypt",
    "israel": "Israel",
    "jordan": "Jordan",
    "south africa": "South Africa",
    "mauritius": "Mauritius"
  });

  const COUNTRY_ALIAS_KEYS = Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length);

  const BRAND_PREFIX_PATTERN = /\b(?:brand|marca|marque|marke|merk|marchio)\s*[:#-]?\s*([a-z0-9][a-z0-9&.'’+\-/ ]{1,48})/ig;
  const OCR_NOISE_TERMS = new Set([
    "size", "made", "made in", "country", "country of origin", "care", "material", "fabric", "shell", "lining",
    "machine wash", "hand wash", "dry clean", "wash", "rn", "ca", "ch", "sp", "tw", "usgb", "eg",
    "imported", "distributed", "distribuido", "fabrique", "hecho", "composition", "exclusive of decoration"
  ]);

  function normalizeOcrText(value) {
    let output = clean(value);
    try { output = output.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    return output.toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\b(?:indonesla|indones1a|ind0nesia)\b/g, "indonesia")
      .replace(/\b(?:vletnam|vietnarn)\b/g, "vietnam")
      .replace(/\b(?:c0tton|cotlon|coton)\b/g, "cotton")
      .replace(/\b(?:polyestcr|polyestcr|p0lyester)\b/g, "polyester")
      .replace(/\b(?:elastanc|elastarre)\b/g, "elastane")
      .replace(/\b(?:machlne|rnachine)\b/g, "machine")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9%&.'+\-/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeLogoText(value) {
    const raw = clean(value).replace(/^[\s:;#-]+|[\s:;#-]+$/g, "");
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.length <= 10 && tokens.every(token => /^[A-Za-z0-9]$/.test(token))) return tokens.join("");
    return raw;
  }

  function groupBlocksByPhoto(blocks = []) {
    const groups = new Map();
    for (const block of blocks) {
      const id = clean(block.photoId || `photo-${block.photo || 0}`);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(block);
    }
    return groups;
  }

  function levenshtein(left, right) {
    const a = String(left || ""), b = String(right || "");
    if (!a) return b.length;
    if (!b) return a.length;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length];
  }

  function fuzzyCountryAlias(value) {
    const normalized = normalizeOcrText(value).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    const exact = COUNTRY_ALIAS_KEYS.find(candidate => normalized === candidate || normalized.startsWith(`${candidate} `));
    if (exact) return exact;
    const words = normalized.split(" ").filter(Boolean).slice(0, 4);
    const probes = [];
    for (let length = words.length; length >= 1; length -= 1) probes.push(words.slice(0, length).join(" "));
    let best = null;
    for (const probe of probes) {
      if (probe.length < 4) continue;
      for (const candidate of COUNTRY_ALIAS_KEYS) {
        const distance = levenshtein(probe, candidate);
        const allowed = candidate.length >= 10 ? 2 : 1;
        if (distance > allowed) continue;
        if (!best || distance < best.distance || (distance === best.distance && candidate.length > best.candidate.length)) best = { candidate, distance };
      }
      if (best?.distance === 0) break;
    }
    return best?.candidate || "";
  }

  function normalizeSize(value) {
    const normalized = key(value);
    const aliases = {
      "extra extra extra large": "3xl", xxxl: "3xl", "3x": "3xl", "3xl": "3xl",
      "extra extra large": "2xl", xxl: "2xl", "2x": "2xl", "2xl": "2xl",
      "extra large": "xl", "x large": "xl", xl: "xl",
      large: "l", lg: "l", l: "l",
      medium: "m", med: "m", m: "m",
      small: "s", sm: "s", s: "s",
      "extra small": "xs", "x small": "xs", xs: "xs",
      "extra extra small": "2xs", xxs: "2xs", "2xs": "2xs"
    };
    return aliases[normalized] || normalized;
  }

  function displaySize(value) {
    const normalized = normalizeSize(value);
    return ({ "2xs": "2XS", xs: "XS", s: "S", m: "M", l: "L", xl: "XL", "2xl": "2XL", "3xl": "3XL" })[normalized] || clean(value);
  }

  function normalizeCountry(value) {
    const normalized = key(value)
      .replace(/^(?:made|manufactured|produced) in /, "")
      .replace(/^country of origin /, "")
      .trim();
    return key(COUNTRY_ALIASES[normalized] || normalized);
  }

  function canonicalCountry(value) {
    const normalized = key(value);
    const direct = COUNTRY_ALIASES[normalized];
    if (direct) return direct;
    const alias = COUNTRY_ALIAS_KEYS.find(candidate => normalized === candidate || normalized.startsWith(`${candidate} `));
    return alias ? COUNTRY_ALIASES[alias] : "";
  }

  function photoBlocks(ocr = {}) {
    const out = [];
    for (const photo of Array.isArray(ocr?.photos) ? ocr.photos : []) {
      const blocks = Array.isArray(photo?.blocks) ? photo.blocks : [];
      for (const block of blocks) {
        const text = clean(block?.text);
        if (!text) continue;
        const box = block?.box && typeof block.box === "object" ? {
          x: Number(block.box.x || 0), y: Number(block.box.y || 0),
          width: Number(block.box.width || 0), height: Number(block.box.height || 0)
        } : null;
        out.push({
          photoId: clean(photo?.photoId || photo?.photo_id),
          photo: Number(photo?.displayNumber || photo?.photo || 0),
          role: clean([photo?.role || "", block?.role || ""].filter(Boolean).join(" ")),
          text,
          normalizedText: normalizeOcrText(text),
          confidence: Math.max(0, Math.min(1, Number(block?.confidence || 0))),
          votes: Math.max(1, Number(block?.votes || 1)),
          box
        });
      }
    }
    return out;
  }

  function joinedText(blocks = []) {
    return key(blocks.map(block => block.text).join(" \n "));
  }

  function blocksForPhoto(block, blocks = []) {
    return blocks.filter(item => clean(item.photoId) === clean(block.photoId));
  }

  function tagContext(block, blocks = []) {
    const role = key(block?.role || "");
    if (/\b(?:tag|label|brand|size|material|care)\b/.test(role)) return true;
    const samePhotoText = joinedText(blocksForPhoto(block, blocks));
    const anchors = [
      /\bmade in\b/, /\bcountry of origin\b/, /\brn\s*\d+\b/, /\bca\s*\d+\b/,
      /\bmachine wash\b/, /\bhand wash\b/, /\bdry clean\b/, /\bsize\b/,
      /\b(?:cotton|polyester|spandex|elastane|nylon|rayon|viscose|linen|wool|silk|cashmere|acrylic|acetate|modal|leather|suede)\b/,
      /\b\d{1,3}\s*%\b/
    ];
    return anchors.some(pattern => pattern.test(samePhotoText));
  }

  function sourcePhotoSet(result = {}) {
    return new Set((Array.isArray(result.photoSources) ? result.photoSources : []).map(clean).filter(Boolean));
  }

  function relevantBlocks(result = {}, blocks = []) {
    const wanted = sourcePhotoSet(result);
    if (!wanted.size) return blocks;
    const selected = blocks.filter(block => wanted.has(block.photoId));
    const remaining = blocks.filter(block => !wanted.has(block.photoId));
    return [...selected, ...remaining];
  }

  function candidateValues(result = {}, confirmedValue = "", suggestedValue = "") {
    const values = [
      confirmedValue,
      suggestedValue,
      result.value,
      result.reviewerValue,
      result.reviewer?.value,
      result.proposedValue,
      result.primaryValue,
      ...(Array.isArray(result.candidateValues) ? result.candidateValues : [])
    ].map(clean).filter(Boolean);
    return values.filter((value, index) => values.findIndex(other => key(other) === key(value)) === index);
  }

  function sizeTokenFromText(value) {
    const normalized = normalizeOcrText(value);
    const explicit = normalized.match(/\b(?:size|taille|talla|taglia|grosse|groesse)\s*[:#-]?\s*((?:3|2)?x{1,3}l|[smlx]{1,4}|xxs|xs|sm|med|lg|large|medium|small|extra\s+(?:small|large)|one\s+size|os|osfa|\d{1,3}(?:\.5)?|\d{1,2}t)\b/i);
    return explicit ? explicit[1] : "";
  }

  function extractSize(blocks = []) {
    const found = [];
    const add = (value, raw, block, strength) => {
      const normalized = normalizeSize(value);
      if (!normalized) return;
      found.push({ value: normalized, raw: clean(raw), block, strength: Number(strength || 0) });
    };
    for (const block of blocks) {
      const text = clean(block.text);
      const normalized = normalizeOcrText(text);
      const explicit = sizeTokenFromText(text);
      if (explicit) add(explicit, text, block, 100);

      const grouped = normalized.match(/\b(?:petite|petites|plus|regular|tall|juniors?|maternity)\s*[-:]?\s*((?:3|2)?x{1,3}l|xxs|xs|xl|xxl|xxxl|large|lg|l|medium|med|m|small|sm|s|\d{1,3}(?:\.5)?|\d{1,2}t)\b/i);
      if (grouped) add(grouped[1], grouped[0], block, 95);

      const short = normalized.length <= 14;
      const standalone = normalized.match(/^\s*((?:3|2)?x{1,3}l|xxs|xs|xl|xxl|xxxl|large|lg|l|medium|med|m|small|sm|s|one size|os|osfa|\d{1,3}(?:\.5)?|\d{1,2}t)\s*$/i);
      if (standalone && short && Number(block.confidence || 0) >= 0.48 && tagContext(block, blocks)) add(standalone[1], text, block, 85);

      // Vision sometimes merges a logo, one size token and an origin line into one observation.
      if (!explicit && tagContext(block, blocks) && normalized.length <= 80) {
        const tokens = normalized.match(/(?:^|\s)((?:3|2)?x{1,3}l|xxs|xs|xl|xxl|xxxl|large|lg|l|medium|med|m|small|sm|s|\d{1,2}t)(?=\s|$)/ig) || [];
        const candidates = tokens.map(token => token.trim()).filter(token => !["in"].includes(token));
        if (candidates.length === 1) add(candidates[0], text, block, 70);
      }
    }
    return found.filter((item, index) => found.findIndex(other => other.value === item.value && other.block === item.block && other.strength === item.strength) === index);
  }

  function strongestSizeDetections(detected = []) {
    if (!detected.length) return [];
    const maxStrength = Math.max(...detected.map(item => Number(item.strength || 0)));
    return detected.filter(item => Number(item.strength || 0) === maxStrength);
  }

  // Regional clothing size labels often present several legitimate numbers on one
  // physical tag (for example US 14 / UK 18 / EU 44). Generic numeric OCR must not
  // treat those parallel conversions as conflicting Size candidates. Resolve only
  // the explicitly printed US row for the generic eBay Size field; never convert
  // from another region when the US row is missing.
  const SIZE_REGION_ALIASES = Object.freeze({
    us: "us", usa: "us", "u s": "us", "united states": "us",
    uk: "uk", gb: "uk", "great britain": "uk",
    eu: "eu", eur: "eu", europe: "eu",
    au: "au", aus: "au", australia: "au",
    fr: "fr", france: "fr",
    de: "de", germany: "de",
    it: "it", italy: "it",
    es: "es", spain: "es"
  });
  const REGIONAL_SIZE_TOKEN_RE = /^(?:(?:4|3|2)?x{1,4}l|xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large|extra\s+(?:small|large)|one\s+size|os|osfa|\d{1,2}(?:\.5)?|\d{1,2}t)$/i;

  function normalizeSizeRegion(value) {
    const normalized = key(value)
      .replace(/\bu\s*\.?\s*s\s*\.?\s*a?\.?\b/g, match => /a/i.test(match) ? "usa" : "us")
      .replace(/[^a-z]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return SIZE_REGION_ALIASES[normalized] || "";
  }

  function regionalSizeToken(value) {
    const raw = clean(value).replace(/^[\s:;,#()\[\]-]+|[\s:;,#()\[\]-]+$/g, "").trim();
    if (!raw || !REGIONAL_SIZE_TOKEN_RE.test(raw)) return "";
    return displaySize(raw);
  }

  function reliableRegionalBlock(block = {}) {
    const confidence = Number(block?.confidence || 0);
    const votes = Math.max(1, Number(block?.votes || 1));
    return confidence >= 0.72 || (votes >= 2 && confidence >= 0.60);
  }

  function boxCenter(box = {}) {
    return {
      x: Number(box?.x || 0) + Number(box?.width || 0) / 2,
      y: Number(box?.y || 0) + Number(box?.height || 0) / 2
    };
  }

  function sameRegionalRow(regionBlock = {}, valueBlock = {}) {
    if (!regionBlock?.box || !valueBlock?.box) return false;
    const a = boxCenter(regionBlock.box), b = boxCenter(valueBlock.box);
    const height = Math.max(Number(regionBlock.box.height || 0), Number(valueBlock.box.height || 0));
    const yTolerance = Math.max(0.028, height * 0.90);
    if (Math.abs(a.y - b.y) > yTolerance) return false;
    // Size tables are normally label-column -> value-column. Permit a tiny OCR
    // overlap but reject remote numbers elsewhere on the tag.
    if (b.x < a.x - 0.035) return false;
    return (b.x - a.x) <= 0.42;
  }

  function regionalSizeRows(blocks = []) {
    const rows = [];
    const add = (region, value, sourceBlocks, strength, mode) => {
      const normalizedRegion = normalizeSizeRegion(region);
      const display = regionalSizeToken(value);
      const sources = Array.from(new Set((sourceBlocks || []).filter(Boolean)));
      if (!normalizedRegion || !display || !sources.length) return;
      if (!sources.every(reliableRegionalBlock)) return;
      rows.push({ region: normalizedRegion, value: display, normalizedValue: normalizeSize(display), blocks: sources, strength: Number(strength || 0), mode });
    };

    for (const group of groupBlocksByPhoto(blocks).values()) {
      if (!group.length) continue;

      // Strongest form: region and size are in one Vision observation.
      for (const block of group) {
        const raw = clean(block.text);
        const match = raw.match(/^\s*(UNITED\s+STATES|USA|US|U\.?\s*S\.?\s*A\.?|U\.?\s*S\.?|UK|GB|EU|EUR|EUROPE|AU|AUS|AUSTRALIA|FR|FRANCE|DE|GERMANY|IT|ITALY|ES|SPAIN)\s*[:#-]?\s*((?:(?:4|3|2)?X{1,4}L|XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|SMALL|MEDIUM|LARGE|EXTRA\s+(?:SMALL|LARGE)|ONE\s+SIZE|OS|OSFA|\d{1,2}(?:\.5)?|\d{1,2}T))\b/i);
        if (match) add(match[1], match[2], [block], 140, "same_block");
      }

      const regionBlocks = group.map((block, index) => ({ block, index, region: normalizeSizeRegion(block.text) })).filter(item => item.region && reliableRegionalBlock(item.block));
      const valueBlocks = group.map((block, index) => ({ block, index, value: regionalSizeToken(block.text) })).filter(item => item.value && reliableRegionalBlock(item.block));
      const distinctRegions = new Set(regionBlocks.map(item => item.region));
      // A split-block pair without geometry is accepted only when the photo clearly
      // contains a multi-region size table. This prevents a random "US" and number
      // elsewhere on a label from becoming Size.
      const tableContext = distinctRegions.size >= 2;

      for (const regionItem of regionBlocks) {
        let candidates = valueBlocks.filter(valueItem => valueItem.block !== regionItem.block && sameRegionalRow(regionItem.block, valueItem.block));
        let mode = "same_row";
        if (!candidates.length && tableContext) {
          candidates = valueBlocks.filter(valueItem => {
            const distance = Math.abs(valueItem.index - regionItem.index);
            return distance >= 1 && distance <= 2;
          });
          mode = "adjacent_blocks";
        }
        if (!candidates.length) continue;
        candidates.sort((a, b) => {
          if (regionItem.block?.box && a.block?.box && b.block?.box) {
            const ra = boxCenter(regionItem.block.box), aa = boxCenter(a.block.box), bb = boxCenter(b.block.box);
            return (Math.abs(ra.y-aa.y) + Math.max(0, aa.x-ra.x)) - (Math.abs(ra.y-bb.y) + Math.max(0, bb.x-ra.x));
          }
          return Math.abs(a.index-regionItem.index) - Math.abs(b.index-regionItem.index);
        });
        const best = candidates[0];
        const tied = candidates.filter(item => {
          if (regionItem.block?.box && best.block?.box && item.block?.box) {
            const r = boxCenter(regionItem.block.box), b = boxCenter(best.block.box), c = boxCenter(item.block.box);
            const bd = Math.abs(r.y-b.y) + Math.max(0,b.x-r.x);
            const cd = Math.abs(r.y-c.y) + Math.max(0,c.x-r.x);
            return Math.abs(cd-bd) <= 0.015;
          }
          return Math.abs(item.index-regionItem.index) === Math.abs(best.index-regionItem.index);
        });
        if (tied.length !== 1) continue;
        add(regionItem.region, best.value, [regionItem.block, best.block], mode === "same_row" ? 130 : 115, mode);
      }
    }

    const seen = new Set();
    return rows.filter(row => {
      const photo = clean(row.blocks?.[0]?.photoId || `photo-${row.blocks?.[0]?.photo || 0}`);
      const id = `${photo}|${row.region}|${normalizeSize(row.value)}|${row.mode}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function regionalSizeForMarket(blocks = [], region = "us") {
    const wantedRegion = normalizeSizeRegion(region) || key(region);
    const rows = regionalSizeRows(blocks).filter(row => row.region === wantedRegion);
    if (!rows.length) return null;
    const values = uniqueValues(rows, row => row.normalizedValue);
    const sourceBlocks = Array.from(new Set(rows.flatMap(row => row.blocks || [])));
    if (values.length !== 1) return { value: "", detected: values, blocks: sourceBlocks, conflict: true, region: wantedRegion };
    const selected = rows.filter(row => row.normalizedValue === values[0]).sort((a,b) => b.strength-a.strength);
    return {
      value: selected[0].value,
      normalizedValue: values[0],
      detected: values,
      blocks: Array.from(new Set(selected.flatMap(row => row.blocks || []))),
      conflict: false,
      region: wantedRegion,
      strength: selected[0].strength,
      mode: selected[0].mode
    };
  }

  function materialTerms(value) {
    const normalized = normalizeOcrText(value);
    const out = [];
    for (const [canonical, aliases] of Object.entries(FIBERS)) {
      if ([canonical, ...aliases].some(alias => new RegExp(`\\b${normalizeOcrText(alias).replace(/\s+/g, "\\s+")}\\b`).test(normalized))) out.push(canonical);
    }
    return Array.from(new Set(out));
  }

  function materialScope(text) {
    const normalized = key(text);
    if (/\b(lining|liner)\b/.test(normalized)) return "lining";
    if (/\b(?:outsole|sole)\b/.test(normalized)) return "outsole";
    if (/\bupper\b/.test(normalized)) return "upper";
    if (/\b(trim|exclusive of decoration|decoration)\b/.test(normalized)) return "trim";
    if (/\b(shell|outer shell|body|main fabric|fabric content)\b/.test(normalized)) return "outer_shell";
    return "whole_item";
  }

  function materialPercentNearAlias(text, aliases = []) {
    const normalized = normalizeOcrText(text);
    for (const alias of aliases) {
      const token = normalizeOcrText(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const before = normalized.match(new RegExp(`\\b(\\d{1,3})\\s*%\\s*${token}\\b`, "i"));
      const after = normalized.match(new RegExp(`\\b${token}\\s*(\\d{1,3})\\s*%\\b`, "i"));
      const raw = before?.[1] || after?.[1] || "";
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 1 && value <= 100) return value;
    }
    return null;
  }

  function percentageOnlyValue(text) {
    const match = normalizeOcrText(text).match(/^\s*(\d{1,3})\s*%\s*$/);
    const value = Number(match?.[1] || 0);
    return Number.isFinite(value) && value >= 1 && value <= 100 ? value : null;
  }

  function nearbyMaterialPercentage(block, group = []) {
    const index = group.indexOf(block);
    if (index < 0) return null;
    const candidates = [];
    for (let i = 0; i < group.length; i += 1) {
      if (i === index || Math.abs(i - index) > 1) continue;
      const percentage = percentageOnlyValue(group[i]?.text);
      if (!percentage) continue;
      const a = block?.box, b = group[i]?.box;
      if (a && b) {
        const ac = boxCenter(a), bc = boxCenter(b);
        const tolerance = Math.max(0.035, Math.max(Number(a.height || 0), Number(b.height || 0)) * 1.2);
        if (Math.abs(ac.y - bc.y) > tolerance) continue;
      }
      candidates.push({ percentage, block: group[i] });
    }
    const values = Array.from(new Set(candidates.map(item => item.percentage)));
    return values.length === 1 ? candidates.find(item => item.percentage === values[0]) : null;
  }

  function extractMaterialEntries(blocks = []) {
    const entries = [];
    const scan = (text, block) => {
      const normalized = normalizeOcrText(text);
      const scope = materialScope(text);
      for (const [canonical, aliases] of Object.entries(FIBERS)) {
        const allAliases = [canonical, ...aliases];
        if (!allAliases.some(alias => new RegExp(`\\b${normalizeOcrText(alias).replace(/\\s+/g, "\\s+")}\\b`).test(normalized))) continue;
        const percentage = materialPercentNearAlias(text, allAliases);
        entries.push({ value: canonical, scope, block, percentage, percentageBlock: percentage ? block : null });
      }
    };
    for (const block of blocks) scan(block.text, block);
    if (!entries.length) {
      for (const group of groupBlocksByPhoto(blocks).values()) scan(group.map(block => block.text).join(" "), group[0]);
    }

    // Vision can split "100%" and "CASHMERE" into adjacent observations. Attach
    // the percent only when one nearby percentage belongs to the same row/label.
    for (const entry of entries) {
      if (entry.percentage) continue;
      const group = blocksForPhoto(entry.block, blocks);
      const nearby = nearbyMaterialPercentage(entry.block, group);
      if (!nearby) continue;
      entry.percentage = nearby.percentage;
      entry.percentageBlock = nearby.block;
    }

    return entries.filter((entry, index) => entries.findIndex(other => other.value === entry.value && other.scope === entry.scope && other.block === entry.block && other.percentage === entry.percentage) === index);
  }

  function materialSourceBlocks(entries = []) {
    return Array.from(new Set((Array.isArray(entries) ? entries : []).flatMap(entry => [entry?.block, entry?.percentageBlock]).filter(Boolean)));
  }

  function materialCandidateValue(entries = [], field = {}) {
    const relevant = (Array.isArray(entries) ? entries : []).filter(entry => ["whole_item", "outer_shell"].includes(entry.scope));
    const values = uniqueValues(relevant, entry => entry.value);
    if (!values.length) return "";
    const displays = values.map(value => FIBER_DISPLAY[value] || titleCase(value));
    if (values.length === 1) {
      const value = values[0];
      const hasHundred = relevant.some(entry => entry.value === value && Number(entry.percentage || 0) === 100);
      if (hasHundred) {
        const precise = `100% ${FIBER_DISPLAY[value] || titleCase(value)}`;
        const options = (Array.isArray(field?.options) ? field.options : []).map(clean).filter(Boolean);
        const exact = options.find(option => key(option) === key(precise));
        if (exact) return exact;
        if (field?.optionsComplete === false) return precise;
      }
    }
    return displays.join(", ");
  }

  function extractMaterials(blocks = []) {
    return Array.from(new Set(extractMaterialEntries(blocks).map(entry => entry.value)));
  }


  const SHOE_COMPONENT_MATERIALS = Object.freeze({
    "faux leather": "Faux Leather",
    "synthetic leather": "Synthetic",
    "man made": "Synthetic",
    "man-made": "Synthetic",
    synthetic: "Synthetic",
    leather: "Leather",
    suede: "Suede",
    textile: "Textile",
    fabric: "Fabric",
    mesh: "Mesh",
    canvas: "Canvas",
    rubber: "Rubber",
    polyurethane: "Polyurethane",
    eva: "EVA"
  });

  function strictOptionDisplay(field = {}, candidate = "", aliases = []) {
    const options = (Array.isArray(field?.options) ? field.options : []).map(clean).filter(Boolean);
    if (!options.length) {
      // A virtualized eBay menu can intentionally omit its option list from the
      // AI snapshot. For narrow direct-tag parsers, preserve the deterministic
      // candidate and let the shared Fill Engine verify the exact live option.
      return field?.optionsComplete === false ? clean(candidate) : "";
    }
    const probes = [candidate, ...(Array.isArray(aliases) ? aliases : [])].map(key).filter(Boolean);
    const exact = options.filter(option => probes.includes(key(option)));
    if (exact.length === 1) return exact[0];
    // Width/material options sometimes include the code in parentheses (for example
    // "Extra Wide (2E)"). Accept only a unique whole-token match; never fuzzy-match.
    const tokenMatches = options.filter(option => probes.some(probe => {
      if (!probe || probe.length < 2) return false;
      const normalized = key(option);
      const escaped = probe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "i").test(normalized);
    }));
    return tokenMatches.length === 1 ? tokenMatches[0] : "";
  }

  function shoePhotoGroups(blocks = []) {
    return Array.from(groupBlocksByPhoto(blocks).values()).filter(group => group.length);
  }

  function shoeLabelContext(group = []) {
    const role = key(group.map(block => block.role).join(" "));
    const text = key(group.map(block => block.text).join(" "));
    if (/\b(?:shoe|size|tag|label)\b/.test(role)) return true;
    return /\b(?:upper|lining|liner|sole|outsole|man made|synthetic|leather|suede)\b/.test(text)
      && /\b(?:made in|upper|lining|liner|sole|outsole)\b/.test(text);
  }

  function shoeSizeWidthFacts(blocks = []) {
    const facts = [];
    const add = (field, value, sourceBlocks, strength) => {
      if (!value || !sourceBlocks.length) return;
      facts.push({ field, value: clean(value).toUpperCase(), blocks: Array.from(new Set(sourceBlocks)), strength: Number(strength || 0) });
    };
    for (const group of shoePhotoGroups(blocks)) {
      const raw = group.map(block => clean(block.text)).join(" ");
      const normalized = key(raw);
      const anchored = shoeLabelContext(group);
      const selectBlocks = tokens => group.filter(block => tokens.some(token => key(block.text).includes(key(token))));

      let match = normalized.match(/\b(?:us|usa|u s|shoe size|size)\s*[:#-]?\s*(\d{1,2}(?:\.5)?)\s*(?:\/|\s+)?(2e|3e|4e|5e|6e|eeee|eee|ee|e|xw|xxw|w|m|n)\b/i);
      if (match) {
        add("US Shoe Size", match[1], selectBlocks([match[1], match[2]]), 120);
        add("Shoe Width", match[2], selectBlocks([match[1], match[2]]), 120);
        continue;
      }

      const explicitSize = normalized.match(/\b(?:us|usa|u s|shoe size|size)\s*[:#-]?\s*(\d{1,2}(?:\.5)?)\b/i);
      const explicitWidth = normalized.match(/\b(?:width)\s*[:#-]?\s*(2e|3e|4e|5e|6e|eeee|eee|ee|e|xw|xxw|w|m|n)\b/i);
      if (explicitSize) add("US Shoe Size", explicitSize[1], selectBlocks([explicitSize[1]]), 115);
      if (explicitWidth) add("Shoe Width", explicitWidth[1], selectBlocks([explicitWidth[1]]), 115);

      // Some shoe labels contain only "9 2E" on one line or in adjacent OCR blocks.
      // This bare form is accepted only when the same photo has clear shoe-label anchors.
      if (anchored) {
        match = normalized.match(/(?:^|\s)(\d{1,2}(?:\.5)?)\s+(2e|3e|4e|5e|6e|eeee|eee|ee|e)(?:$|\s)/i);
        if (match) {
          add("US Shoe Size", match[1], selectBlocks([match[1], match[2]]), 105);
          add("Shoe Width", match[2], selectBlocks([match[1], match[2]]), 105);
        } else {
          const sizeBlocks = group.filter(block => /^\s*\d{1,2}(?:\.5)?\s*$/.test(clean(block.text)));
          const widthBlocks = group.filter(block => /^\s*(?:2e|3e|4e|5e|6e|eeee|eee|ee|e)\s*$/i.test(clean(block.text)));
          if (sizeBlocks.length === 1 && widthBlocks.length === 1) {
            add("US Shoe Size", clean(sizeBlocks[0].text), [sizeBlocks[0], widthBlocks[0]], 100);
            add("Shoe Width", clean(widthBlocks[0].text), [sizeBlocks[0], widthBlocks[0]], 100);
          }
        }
      }
    }
    return facts;
  }

  function shoeMaterialFacts(blocks = []) {
    const facts = [];
    const components = [
      { field: "Upper Material", pattern: "upper" },
      { field: "Lining Material", pattern: "lining|liner" },
      { field: "Outsole Material", pattern: "outsole|sole" }
    ];
    const materialPattern = "faux leather|synthetic leather|man[- ]made|synthetic|leather|suede|textile|fabric|mesh|canvas|rubber|polyurethane|eva";
    const canonical = raw => SHOE_COMPONENT_MATERIALS[key(raw)] || titleCase(raw);
    const add = (field, rawValue, group, strength = 110) => {
      const value = canonical(rawValue);
      if (!value) return;
      const materialKey = key(rawValue);
      const componentKey = key(field.replace(" Material", ""));
      const sourceBlocks = group.filter(block => {
        const text = key(block.text);
        return text.includes(materialKey) || text.includes(componentKey) || (componentKey === "outsole" && /\bsole\b/.test(text));
      });
      facts.push({ field, value, blocks: sourceBlocks.length ? sourceBlocks : group.slice(0, 2), strength });
    };
    for (const group of shoePhotoGroups(blocks)) {
      const normalized = key(group.map(block => block.text).join(" "));
      if (!shoeLabelContext(group)) continue;
      for (const component of components) {
        const before = new RegExp(`\\b(${materialPattern})\\s+(?:${component.pattern})\\b`, "i").exec(normalized);
        const after = new RegExp(`\\b(?:${component.pattern})\\s*[:#-]?\\s*(${materialPattern})\\b`, "i").exec(normalized);
        const match = before || after;
        if (match) add(component.field, match[1], group);
      }
    }
    return facts;
  }

  function directShoeFacts(blocks = []) {
    return [...shoeSizeWidthFacts(blocks), ...shoeMaterialFacts(blocks)];
  }

  function uniqueShoeFact(field, blocks = []) {
    const wanted = key(field);
    const matches = directShoeFacts(blocks).filter(fact => key(fact.field) === wanted);
    const values = uniqueValues(matches, fact => key(fact.value));
    if (values.length !== 1) return null;
    const selected = matches.filter(fact => key(fact.value) === values[0]).sort((a, b) => b.strength - a.strength);
    const top = selected[0];
    return { value: top.value, detected: [top.value], blocks: Array.from(new Set(selected.flatMap(fact => fact.blocks))), strength: top.strength };
  }

  function cleanOriginTail(value) {
    const raw = clean(value)
      .split(/(?:\r?\n|[|;])/)[0]
      .replace(/\s+(?:rn|ca|size|style|machine|hand|dry|wash|shell|lining|fabric|material|imported|distributed|distribuido)\b.*$/i, "")
      .replace(/\s+\d{1,3}\s*%.*$/i, "")
      .replace(/^[\s:;,#-]+|[\s:;,#.-]+$/g, "")
      .trim();
    if (!raw || raw.length > 48) return "";
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 4) return "";
    if (!words.every(word => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(word))) return "";
    const normalized = normalizeOcrText(raw);
    if (!normalized || OCR_NOISE_TERMS.has(normalized)) return "";
    return raw;
  }

  function canonicalOriginTail(value) {
    const raw = cleanOriginTail(value);
    if (!raw) return "";
    const alias = fuzzyCountryAlias(raw);
    if (alias) return COUNTRY_ALIASES[alias];
    // An explicit physical-label origin phrase is strong enough to preserve an
    // arbitrary country name. Exact eBay-option validation still happens later.
    return titleCase(raw);
  }

  function countryCandidatesFromText(text) {
    const raw = clean(text);
    const results = [];
    const patterns = [
      /\b(?:made|manufactured|produced)\s+in\s+(.{2,80})/ig,
      /\bcountry\s+of\s+origin\s*[:#-]?\s*(.{2,80})/ig,
      /\bhecho\s+en\s+(.{2,80})/ig,
      /\bfabricado\s+en\s+(.{2,80})/ig,
      /\bfabriqu[eé]\s+en\s+(.{2,80})/ig,
      /\bprodotto\s+in\s+(.{2,80})/ig,
      /\bhergestellt\s+in\s+(.{2,80})/ig
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(raw))) {
        const country = canonicalOriginTail(match[1]);
        if (country) results.push(country);
      }
    }
    return Array.from(new Set(results));
  }

  function extractCountry(blocks = []) {
    const results = [];
    const groups = new Map();
    for (const block of blocks) {
      const id = clean(block.photoId || `photo-${block.photo || 0}`);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(block);
      for (const value of countryCandidatesFromText(block.text)) results.push({ value: normalizeCountry(value), displayValue: value, raw: block.text, block });
    }
    for (const group of groups.values()) {
      const combined = group.map(block => block.text).join(" ");
      const source = group[0];
      for (const value of countryCandidatesFromText(combined)) results.push({ value: normalizeCountry(value), displayValue: value, raw: combined, block: source });
    }
    return results.filter((item, index) => results.findIndex(other => other.value === item.value && other.block?.photoId === item.block?.photoId) === index);
  }

  function careTerms(value) {
    const normalized = normalizeOcrText(value);
    const out = [];
    for (const [canonical, aliases] of Object.entries(CARE_PHRASES)) {
      if ([canonical, ...aliases].some(alias => normalized.includes(normalizeOcrText(alias)))) out.push(canonical);
    }
    return Array.from(new Set(out));
  }

  function extractCareEntries(blocks = []) {
    const entries = [];
    const scan = (rawText, block) => {
      const text = normalizeOcrText(rawText);
      for (const [canonical, aliases] of Object.entries(CARE_PHRASES)) {
        if (aliases.some(alias => text.includes(normalizeOcrText(alias)))) entries.push({ value: canonical, block });
      }
    };
    for (const block of blocks) scan(block.text, block);
    for (const group of groupBlocksByPhoto(blocks).values()) scan(group.map(block => block.text).join(" "), group[0]);
    return entries.filter((entry, index) => entries.findIndex(other => other.value === entry.value && other.block === entry.block) === index);
  }

  function extractCare(blocks = []) {
    return uniqueValues(extractCareEntries(blocks), entry => entry.value);
  }

  function compactKey(value) {
    return key(value).replace(/\s+/g, "");
  }

  function directPhraseMatch(value, blocks = []) {
    const wanted = normalizeOcrText(value);
    if (!wanted || wanted.length < 2) return false;
    const compactWanted = wanted.replace(/\s+/g, "");
    return blocks.some(block => {
      const text = normalizeOcrText(block.text);
      const compactText = text.replace(/\s+/g, "");
      return text === wanted || text.includes(` ${wanted} `) || text.startsWith(`${wanted} `) || text.endsWith(` ${wanted}`) || (compactWanted.length >= 3 && compactText.includes(compactWanted));
    });
  }

  function brandPhraseBlocks(value, blocks = []) {
    const wanted = normalizeOcrText(value);
    const compactWanted = wanted.replace(/\s+/g, "");
    if (!wanted || compactWanted.length < 2) return [];
    return blocks.filter(block => {
      const text = normalizeOcrText(block.text);
      const compactText = text.replace(/\s+/g, "");
      const exactWords = text === wanted || text.includes(` ${wanted} `) || text.startsWith(`${wanted} `) || text.endsWith(` ${wanted}`);
      const spacedLogo = compactWanted.length >= 3 && compactText === compactWanted;
      const explicit = Array.from(clean(block.text).matchAll(BRAND_PREFIX_PATTERN)).some(match => normalizeOcrText(normalizeLogoText(match[1])) === wanted);
      return exactWords || spacedLogo || explicit;
    });
  }

  function validBrandCandidate(value) {
    const display = normalizeLogoText(value);
    const normalized = normalizeOcrText(display);
    if (!normalized || display.length < 2 || display.length > 50) return "";
    if (!/[a-z]/i.test(display) || /^\d+$/.test(display) || /\d{3,}/.test(display)) return "";
    if (/\b(?:made in|country of origin|machine wash|hand wash|dry clean|cotton|polyester|spandex|elastane|nylon|rayon|viscose|linen|wool|silk|cashmere|acrylic|acetate|modal|leather|suede|size|rn\s*\d|ca\s*\d)\b/i.test(display)) return "";
    if (OCR_NOISE_TERMS.has(normalized) || COUNTRY_ALIAS_KEYS.some(country => normalized === country)) return "";
    const words = normalized.split(" ").filter(Boolean);
    if (words.length > 5) return "";
    if (words.every(word => word.length <= 2) && words.length > 1 && !clean(value).split(/\s+/).every(token => /^[A-Za-z0-9]$/.test(token))) return "";
    return display;
  }

  function extractBrandCandidates(blocks = []) {
    const candidates = [];
    const add = (value, block, strength, reason) => {
      const display = validBrandCandidate(value);
      if (!display) return;
      candidates.push({ value: display, normalized: normalizeOcrText(display), block, strength: Number(strength || 0), reason });
    };

    for (const block of blocks) {
      const raw = clean(block.text);
      BRAND_PREFIX_PATTERN.lastIndex = 0;
      let match;
      while ((match = BRAND_PREFIX_PATTERN.exec(raw))) add(match[1], block, 120, "explicit_brand_prefix");

      const role = normalizeOcrText(block.role);
      const isolated = validBrandCandidate(raw);
      if (!isolated) continue;
      const boxY = Number(block.box?.y || 0);
      let strength = 0;
      if (/brand|neck label|brand size|main label/.test(role)) strength += 70;
      else if (/tag|label/.test(role)) strength += 30;
      if (boxY >= 0.62) strength += 18;
      if (/^[A-Z0-9&.'’+\-/ ]+$/.test(raw) && raw.length <= 28) strength += 12;
      if (normalizeOcrText(raw).split(" ").length <= 3) strength += 8;
      if (strength >= 45) add(raw, block, strength, "isolated_label_logo");
    }

    const counts = new Map();
    for (const candidate of candidates) counts.set(candidate.normalized, (counts.get(candidate.normalized) || 0) + 1);
    for (const candidate of candidates) if ((counts.get(candidate.normalized) || 0) > 1) candidate.strength += 20;
    return candidates.filter((candidate, index) => candidates.findIndex(other => other.normalized === candidate.normalized && other.block === candidate.block) === index);
  }

  function strongestBrandCandidate(blocks = []) {
    const candidates = extractBrandCandidates(blocks).sort((a, b) => b.strength - a.strength || b.value.length - a.value.length);
    if (!candidates.length) return null;
    const top = candidates[0];
    const distinct = candidates.find(candidate => candidate.normalized !== top.normalized);
    if (top.strength < 70 || (distinct && distinct.strength >= top.strength - 4)) return null;
    return { value: top.value, detected: [top.normalized], blocks: candidates.filter(candidate => candidate.normalized === top.normalized).map(candidate => candidate.block), reason: top.reason };
  }

  function uniqueValues(items = [], selector = item => item) {
    return Array.from(new Set(items.map(selector).filter(Boolean)));
  }

  function evidenceForField(field, value, blocks = []) {
    const fieldKey = key(field);
    if (fieldKey === "size") {
      const regional = regionalSizeForMarket(blocks, "us");
      const wanted = normalizeSize(value);
      if (regional) {
        if (regional.conflict) return { status: "conflict", detected: regional.detected, blocks: regional.blocks, region: "us" };
        if (regional.normalizedValue === wanted) return { status: "confirmed", detected: [regional.normalizedValue], blocks: regional.blocks, region: "us" };
        return { status: "conflict", detected: [regional.normalizedValue], blocks: regional.blocks, region: "us" };
      }
      const detected = strongestSizeDetections(extractSize(blocks));
      const values = uniqueValues(detected, item => item.value);
      if (values.includes(wanted)) return { status: "confirmed", detected: values, blocks: detected.filter(item => item.value === wanted).map(item => item.block) };
      if (values.length) return { status: "conflict", detected: values, blocks: detected.map(item => item.block) };
      return { status: "not_found", detected: [], blocks: [] };
    }
    if (["us shoe size", "shoe width", "upper material", "lining material", "outsole material"].includes(fieldKey)) {
      const detected = uniqueShoeFact(fieldKey, blocks);
      if (!detected?.value) return { status: "not_found", detected: [], blocks: [] };
      const wanted = key(value);
      if (key(detected.value) === wanted || (fieldKey === "outsole material" && wanted === "synthetic" && key(detected.value) === "synthetic")) {
        return { status: "confirmed", detected: [detected.value], blocks: detected.blocks };
      }
      return { status: "conflict", detected: [detected.value], blocks: detected.blocks };
    }
    if (fieldKey === "material") {
      const wanted = materialTerms(value);
      const entries = extractMaterialEntries(blocks);
      const relevantEntries = entries.filter(entry => ["whole_item", "outer_shell"].includes(entry.scope));
      const detected = uniqueValues(relevantEntries, entry => entry.value);
      const sourceBlocks = materialSourceBlocks(relevantEntries);
      const requiresHundred = /^\s*100\s*%/i.test(clean(value));
      if (wanted.length && wanted.every(term => detected.includes(term))) {
        if (requiresHundred) {
          const percentageConfirmed = wanted.every(term => relevantEntries.some(entry => entry.value === term && Number(entry.percentage || 0) === 100));
          if (!percentageConfirmed) return { status: "not_found", detected, blocks: [] };
          const preciseEntries = relevantEntries.filter(entry => wanted.includes(entry.value) && Number(entry.percentage || 0) === 100);
          return { status: "confirmed", detected, blocks: materialSourceBlocks(preciseEntries), percentage: 100 };
        }
        return { status: "confirmed", detected, blocks: sourceBlocks };
      }
      if (wanted.length && detected.length && wanted.every(term => !detected.includes(term))) return { status: "conflict", detected, blocks: sourceBlocks };
      return { status: "not_found", detected, blocks: [] };
    }
    if (["country of origin", "country region of manufacture"].includes(fieldKey)) {
      const detected = extractCountry(blocks);
      const values = uniqueValues(detected, item => item.value);
      const wanted = normalizeCountry(value);
      if (values.includes(wanted)) return { status: "confirmed", detected: values, blocks: detected.filter(item => item.value === wanted).map(item => item.block) };
      if (values.length) return { status: "conflict", detected: values, blocks: detected.map(item => item.block) };
      return { status: "not_found", detected: [], blocks: [] };
    }
    if (fieldKey === "garment care") {
      const wanted = careTerms(value);
      const entries = extractCareEntries(blocks);
      const detected = uniqueValues(entries, entry => entry.value);
      const sourceBlocks = Array.from(new Set(entries.map(entry => entry.block)));
      if (wanted.length && wanted.every(term => detected.includes(term))) return { status: "confirmed", detected, blocks: sourceBlocks };
      if (wanted.length && detected.length && wanted.every(term => !detected.includes(term))) return { status: "conflict", detected, blocks: sourceBlocks };
      return { status: "not_found", detected, blocks: [] };
    }
    if (fieldKey === "brand") {
      const matched = brandPhraseBlocks(value, blocks);
      if (matched.length) return { status: "confirmed", detected: [clean(value)], blocks: matched };
      const detected = strongestBrandCandidate(blocks);
      if (detected?.value && normalizeOcrText(detected.value) !== normalizeOcrText(value)) return { status: "conflict", detected: [detected.value], blocks: detected.blocks };
      return { status: "not_found", detected: [], blocks: [] };
    }
    if (["model", "product line"].includes(fieldKey)) {
      return directPhraseMatch(value, blocks)
        ? { status: "confirmed", detected: [clean(value)], blocks: blocks.filter(block => directPhraseMatch(value, [block])) }
        : { status: "not_found", detected: [], blocks: [] };
    }
    return { status: "not_applicable", detected: [], blocks: [] };
  }

  function fieldMap(fields = []) {
    const map = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const name = clean(field?.name || field?.label);
      if (name && !map.has(key(name))) map.set(key(name), field);
    }
    return map;
  }

  function optionDisplay(field = {}, candidate = "") {
    const wanted = key(candidate);
    const exact = (Array.isArray(field?.options) ? field.options : []).find(option => key(option) === wanted);
    return clean(exact || candidate);
  }

  function deriveOcrCandidate(question, blocks = [], field = {}) {
    const questionKey = key(question);
    if (!OCR_RECOVERY_FIELDS.has(questionKey)) return null;
    if (["us shoe size", "shoe width", "upper material", "lining material", "outsole material"].includes(questionKey)) {
      const detected = uniqueShoeFact(questionKey, blocks);
      if (!detected?.value) return null;
      const aliases = questionKey === "outsole material" && key(detected.value) === "synthetic" ? ["Man Made", "Man-Made"] : [];
      const value = strictOptionDisplay(field, detected.value, aliases);
      if (!value) return null;
      return { value, detected: detected.detected, blocks: detected.blocks };
    }
    if (questionKey === "brand") {
      const options = (Array.isArray(field?.options) ? field.options : []).map(clean).filter(Boolean);
      const matches = options.map(option => ({ option, blocks: brandPhraseBlocks(option, blocks) })).filter(item => item.blocks.length);
      if (matches.length === 1) return { value: matches[0].option, detected: [normalizeOcrText(matches[0].option)], blocks: matches[0].blocks };
      const direct = strongestBrandCandidate(blocks);
      if (!direct?.value) return null;
      const exact = options.find(option => normalizeOcrText(option) === normalizeOcrText(direct.value));
      const fieldType = key(field?.type || "");
      const customAllowed = field?.customValueAllowed === true || ["text", "input", "custom", "free text"].includes(fieldType) || !options.length;
      const liveExactAllowed = field?.optionsComplete === false;
      if (!exact && !customAllowed && !liveExactAllowed) return null;
      return { value: exact || direct.value, detected: direct.detected, blocks: direct.blocks, requiresLiveExact: !exact && liveExactAllowed };
    }
    if (questionKey === "size") {
      const regional = regionalSizeForMarket(blocks, "us");
      if (regional) {
        if (regional.conflict || !regional.value) return null;
        return { value: optionDisplay(field, regional.value), detected: regional.detected, blocks: regional.blocks, region: "us", regionalSize: true };
      }
      const detected = strongestSizeDetections(extractSize(blocks));
      const values = uniqueValues(detected, item => item.value);
      if (values.length !== 1) return null;
      return { value: optionDisplay(field, displaySize(values[0])), detected: values, blocks: detected.filter(item => item.value === values[0]).map(item => item.block) };
    }
    if (questionKey === "material") {
      const entries = extractMaterialEntries(blocks).filter(entry => ["whole_item", "outer_shell"].includes(entry.scope));
      const values = uniqueValues(entries, entry => entry.value);
      if (!values.length) return null;
      const value = materialCandidateValue(entries, field);
      if (!value) return null;
      return { value, detected: values, blocks: materialSourceBlocks(entries), percentage: /^\s*100\s*%/i.test(value) ? 100 : null };
    }
    if (["country of origin", "country region of manufacture"].includes(questionKey)) {
      const detected = extractCountry(blocks);
      const values = uniqueValues(detected, item => item.value);
      if (values.length !== 1) return null;
      const match = detected.find(item => item.value === values[0]);
      const display = match?.displayValue || canonicalCountry(values[0]);
      if (!display) return null;
      return { value: optionDisplay(field, display), detected: values, blocks: detected.filter(item => item.value === values[0]).map(item => item.block) };
    }
    if (questionKey === "garment care") {
      const entries = extractCareEntries(blocks);
      const detected = uniqueValues(entries, entry => entry.value);
      let value = "";
      if (detected.includes("machine wash cold") || detected.includes("machine wash")) value = "Machine Washable";
      else if (detected.includes("hand wash only") || detected.includes("hand wash")) value = "Hand Wash Only";
      else if (detected.includes("dry clean only")) value = "Dry Clean Only";
      if (!value) return null;
      return { value: optionDisplay(field, value), detected, blocks: Array.from(new Set(entries.map(entry => entry.block))) };
    }
    return null;
  }

  function detectLabelFacts(blocks = []) {
    const facts = [];
    const push = (field, value, sourceBlocks, confidence = 0.9) => {
      const cleanValue = clean(value);
      if (!cleanValue) return;
      const identity = `${key(field)}|${key(cleanValue)}`;
      if (facts.some(fact => fact.identity === identity)) return;
      facts.push({ identity, field, value: cleanValue, confidence, blocks: Array.from(new Set(sourceBlocks || [])) });
    };
    const brand = strongestBrandCandidate(blocks);
    if (brand?.value) push("Brand", brand.value, brand.blocks, 0.93);
    const regionalSize = regionalSizeForMarket(blocks, "us");
    if (regionalSize?.value && !regionalSize.conflict) push("Size", regionalSize.value, regionalSize.blocks, 0.97);
    else if (!regionalSize) {
      const sizes = strongestSizeDetections(extractSize(blocks));
      for (const value of uniqueValues(sizes, item => item.value)) push("Size", displaySize(value), sizes.filter(item => item.value === value).map(item => item.block), 0.94);
    }
    for (const fact of directShoeFacts(blocks)) {
      const confidence = ["US Shoe Size", "Shoe Width"].includes(fact.field) ? 0.96 : 0.95;
      push(fact.field, fact.value, fact.blocks, confidence);
    }
    const materialEntries = extractMaterialEntries(blocks).filter(entry => ["whole_item", "outer_shell"].includes(entry.scope));
    const materials = uniqueValues(materialEntries, entry => entry.value);
    if (materials.length) push("Material", materialCandidateValue(materialEntries, { options: [], optionsComplete: false }) || materials.map(value => FIBER_DISPLAY[value] || titleCase(value)).join(", "), materialSourceBlocks(materialEntries), 0.94);
    const countries = extractCountry(blocks);
    for (const value of uniqueValues(countries, item => item.displayValue)) push("Country of Origin", value, countries.filter(item => item.displayValue === value).map(item => item.block), 0.97);
    const careEntries = extractCareEntries(blocks);
    const care = uniqueValues(careEntries, entry => entry.value);
    if (care.includes("machine wash cold") || care.includes("machine wash")) push("Garment Care", "Machine Washable", careEntries.map(entry => entry.block), 0.94);
    else if (care.includes("hand wash only") || care.includes("hand wash")) push("Garment Care", "Hand Wash Only", careEntries.map(entry => entry.block), 0.94);
    else if (care.includes("dry clean only")) push("Garment Care", "Dry Clean Only", careEntries.map(entry => entry.block), 0.94);
    return facts.map(({ identity, ...fact }) => fact);
  }

  function upsertReview(next, question, detail) {
    const index = next.reviewDetails.findIndex(item => key(item?.field) === key(question));
    if (index >= 0) next.reviewDetails[index] = { ...next.reviewDetails[index], ...detail };
    else next.reviewDetails.push(detail);
  }

  function ocrSourcesFor(questionKey, sourceBlocks = []) {
    return Array.from(new Set(sourceBlocks)).slice(0, 8).map(block => ({
      photoId: block.photoId,
      photo: block.photo,
      type: "physical_tag",
      scope: questionKey === "material" ? materialScope(block.text) : "whole_item",
      provider: "local_ocr",
      evidence: block.text,
      confidence: block.confidence,
      box: block.box && typeof block.box === "object" ? {
        x: Number(block.box.x || 0),
        y: Number(block.box.y || 0),
        width: Number(block.box.width || 0),
        height: Number(block.box.height || 0)
      } : null
    }));
  }

  function mergeSources(...lists) {
    const out = [];
    const seen = new Set();
    for (const source of lists.flatMap(list => Array.isArray(list) ? list : [])) {
      if (!source || typeof source !== "object") continue;
      const identity = [clean(source.photoId || source.photo_id), Number(source.photo || source.displayNumber || 0), clean(source.type), clean(source.scope), clean(source.provider), clean(source.evidence)].join("|");
      if (seen.has(identity)) continue;
      seen.add(identity);
      out.push(source);
    }
    return out;
  }

  function applyConfirmedOcr(next, question, result, value, detected, sourceBlocks, action = "confirmed") {
    const questionKey = key(question);
    const ocrSources = ocrSourcesFor(questionKey, sourceBlocks);
    const preservedAction = ["recovered", "corrected"].includes(result?.ocrAction) ? result.ocrAction : action;
    next.answers[question] = value;
    delete next.suggestedAnswers[question];
    delete next.rejectionReasons[question];
    next.reviewDetails = next.reviewDetails.filter(item => key(item?.field) !== questionKey);
    next.modelResults[question] = {
      ...result,
      value,
      proposedValue: value,
      rawValue: clean(result?.rawValue || value),
      candidateValues: [value],
      ocrStatus: "confirmed_by_ocr",
      ocrAction: preservedAction,
      ocrDetectedValues: detected || [],
      ocrSources,
      autoFillAllowed: true,
      status: "confirmed_by_tag",
      modelStatus: "confirmed",
      evidenceType: "physical_tag",
      evidenceScope: "whole_item",
      confidence: Math.max(Number(result?.confidence || 0), Math.max(0, ...ocrSources.map(source => Number(source.confidence || 0)))),
      sources: mergeSources(result?.sources, ocrSources).slice(0, 12)
    };
    const evidence = next.evidence[question] || {};
    next.evidence[question] = {
      ...evidence,
      value,
      status: "confirmed_by_tag",
      evidenceType: "physical_tag",
      evidenceScope: "whole_item",
      ocrStatus: "confirmed_by_ocr",
      ocrAction: preservedAction,
      ocrSources,
      sources: mergeSources(evidence.sources, ocrSources).slice(0, 12)
    };
  }

  function summarizeOcr(next, questions, base) {
    const modelResults = next.modelResults || {};
    const selected = (Array.isArray(questions) ? questions : []).map(question => modelResults[question] || {});
    return {
      ...base,
      checkedFieldCount: selected.filter(result => result.ocrStatus).length,
      confirmedCount: selected.filter(result => result.ocrStatus === "confirmed_by_ocr").length,
      recoveredCount: selected.filter(result => result.ocrAction === "recovered").length,
      correctedCount: selected.filter(result => result.ocrAction === "corrected").length,
      conflictCount: selected.filter(result => result.ocrStatus === "ocr_conflict").length,
      notConfirmedCount: selected.filter(result => result.ocrStatus === "ocr_not_confirmed").length
    };
  }

  function validateBundle(bundle = {}, questions = [], ocr = {}, options = {}) {
    const blocks = photoBlocks(ocr);
    const fieldsByKey = fieldMap(options.fields || []);
    const phase = clean(options.phase || "");
    const finalPhase = phase === "after_claude" || phase === "final";
    const next = {
      ...bundle,
      answers: { ...(bundle.answers || {}) },
      suggestedAnswers: { ...(bundle.suggestedAnswers || {}) },
      evidence: { ...(bundle.evidence || {}) },
      modelResults: { ...(bundle.modelResults || {}) },
      rejectionReasons: { ...(bundle.rejectionReasons || {}) },
      reviewDetails: [...(bundle.reviewDetails || [])],
      warnings: [...(bundle.warnings || [])]
    };
    const ocrBase = {
      available: ocr?.available === true,
      ok: ocr?.ok === true,
      healthy: ocr?.available === true && ocr?.ok === true && blocks.length > 0,
      engine: clean(ocr?.engine || "unavailable"),
      helperVersion: clean(ocr?.helperVersion || ""),
      photoCount: Number(ocr?.photoCount ?? (Array.isArray(ocr?.photos) ? ocr.photos.length : 0)),
      successfulPhotoCount: Number(ocr?.successfulPhotoCount ?? (Array.isArray(ocr?.photos) ? ocr.photos.filter(photo => photo?.ok === true).length : 0)),
      textPhotoCount: Number(ocr?.textPhotoCount ?? (Array.isArray(ocr?.photos) ? ocr.photos.filter(photo => Array.isArray(photo?.blocks) && photo.blocks.length).length : 0)),
      emptyPhotoCount: Number(ocr?.emptyPhotoCount ?? (Array.isArray(ocr?.photos) ? ocr.photos.filter(photo => !Array.isArray(photo?.blocks) || !photo.blocks.length).length : 0)),
      blockCount: Number(ocr?.blockCount ?? blocks.length),
      preprocessVariantCount: Number(ocr?.preprocessVariantCount || 0),
      preprocessedPhotoCount: Number(ocr?.preprocessedPhotoCount || 0),
      factCount: detectLabelFacts(blocks).length,
      durationMs: Number(ocr?.durationMs || 0),
      warnings: Array.isArray(ocr?.warnings) ? ocr.warnings : []
    };
    next.ocr = summarizeOcr(next, questions, ocrBase);

    if (ocr?.available !== true || ocr?.ok !== true) {
      const warning = clean((ocr?.warnings || [])[0] || "OCR validation is unavailable; GPT and Claude evidence rules remain active.");
      if (warning) next.warnings.push(`OCR validator unavailable: ${warning}`);
      return next;
    }
    if (!blocks.length) {
      const warning = clean((ocr?.warnings || [])[0] || "OCR returned zero readable text blocks; AI answers were preserved and OCR confirmation was skipped.");
      next.warnings.push(`OCR validator produced no text: ${warning}`);
      next.ocr = summarizeOcr(next, questions, { ...ocrBase, healthy: false });
      return next;
    }

    for (const question of Array.isArray(questions) ? questions : []) {
      const questionKey = key(question);
      if (!TEXT_REQUIRED_FIELDS.has(questionKey)) continue;
      const result = next.modelResults[question] || {};
      const relevant = relevantBlocks(result, blocks);
      const field = fieldsByKey.get(questionKey) || {};
      let candidates = candidateValues(result, next.answers[question], next.suggestedAnswers[question]);

      if (!candidates.length) {
        const recovered = deriveOcrCandidate(question, relevant, field);
        if (recovered?.value) {
          applyConfirmedOcr(next, question, result, recovered.value, recovered.detected, recovered.blocks, "recovered");
        }
        continue;
      }

      const checked = candidates.map(value => ({ value, validation: evidenceForField(question, value, relevant) }));
      const confirmedCandidate = checked.find(item => item.validation.status === "confirmed");
      if (confirmedCandidate) {
        let value = confirmedCandidate.value;
        let detected = confirmedCandidate.validation.detected || [];
        let sourceBlocks = confirmedCandidate.validation.blocks || [];
        let action = "confirmed";

        // For multi-select Material, preserve every directly read whole-item fiber.
        if (questionKey === "material" && key(field?.type) === "multi") {
          const complete = deriveOcrCandidate(question, relevant, field);
          if (complete?.value && materialTerms(complete.value).length >= materialTerms(value).length) {
            value = complete.value;
            detected = complete.detected;
            sourceBlocks = complete.blocks;
            if (key(value) !== key(confirmedCandidate.value)) action = "corrected";
          }
        }
        applyConfirmedOcr(next, question, result, value, detected, sourceBlocks, action);
        continue;
      }

      const selected = checked[0];
      const value = selected.value;
      const validation = selected.validation;
      const isConflict = validation.status === "conflict";
      const directOcr = deriveOcrCandidate(question, relevant, field);

      // GPT and Claude may both be wrong. After targeted review, one unambiguous
      // physical-tag value has priority and may deterministically correct them.
      if (isConflict && finalPhase && directOcr?.value) {
        applyConfirmedOcr(next, question, result, directOcr.value, directOcr.detected, directOcr.blocks, "corrected");
        const warning = `Local OCR corrected ${question}: ${value} -> ${directOcr.value}.`;
        next.warnings.push(warning);
        continue;
      }

      if (isConflict) {
        delete next.answers[question];
        if (value) next.suggestedAnswers[question] = value;
      } else if (value) {
        // With working OCR, a high-risk tag field is kept in Review but is not
        // auto-filled until readable tag evidence confirms it.
        delete next.answers[question];
        next.suggestedAnswers[question] = value;
      }
      const sourceBlocks = validation.blocks || [];
      const ocrSources = ocrSourcesFor(questionKey, sourceBlocks);
      const reason = isConflict
        ? `Local OCR contradicts the AI answer. AI: ${value}. OCR detected: ${(validation.detected || []).join(", ") || "different tag text"}.`
        : `Local OCR could not confirm readable tag text for ${question} - ${value}. The candidate remains in Review and is blocked from automatic Fill.`;
      next.rejectionReasons[question] = reason;
      next.modelResults[question] = {
        ...result,
        value: "",
        proposedValue: value,
        ocrStatus: isConflict ? "ocr_conflict" : "ocr_not_confirmed",
        ocrDetectedValues: validation.detected || [],
        ocrSources,
        autoFillAllowed: false,
        status: isConflict ? "conflict" : "needs_review",
        modelStatus: "needs_review"
      };
      upsertReview(next, question, {
        field: question,
        proposedValue: value,
        alternateValue: isConflict ? (validation.detected || []).join(", ") : "",
        confidence: Number(result.confidence || 0),
        sources: mergeSources(result.sources, ocrSources).slice(0, 12),
        reason,
        modelStatus: "needs_review",
        status: isConflict ? "conflict" : "needs_review",
        ocrStatus: isConflict ? "ocr_conflict" : "ocr_not_confirmed"
      });
    }

    next.suggestedCount = Object.keys(next.suggestedAnswers || {}).length;
    next.ocr = summarizeOcr(next, questions, ocrBase);
    next.warnings = Array.from(new Set(next.warnings)).slice(0, 120);
    return next;
  }

  global.EbayEvidenceValidatorV860 = Object.freeze({
    validateBundle,
    evidenceForField,
    deriveOcrCandidate,
    photoBlocks,
    extractSize,
    extractMaterials,
    extractMaterialEntries,
    materialCandidateValue,
    materialSourceBlocks,
    directShoeFacts,
    shoeSizeWidthFacts,
    shoeMaterialFacts,
    uniqueShoeFact,
    strictOptionDisplay,
    materialScope,
    extractCountry,
    countryCandidatesFromText,
    regionalSizeRows,
    regionalSizeForMarket,
    canonicalOriginTail,
    extractCare,
    extractCareEntries,
    extractBrandCandidates,
    strongestBrandCandidate,
    detectLabelFacts,
    brandPhraseBlocks,
    compactKey,
    normalizeOcrText,
    normalizeSize,
    normalizeCountry,
    candidateValues,
    key,
    clean
  });
})(globalThis);
