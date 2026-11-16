/* AI prompt, transport, response validation, OCR, and analysis — V8.23.21. Root-cause accuracy guards for future listings. */

/* ===== core/ai.js ===== */
/* Shared Item Specific prompt: fast best-answer Fill plus compact support metadata
   for strict fields; full evidence verification remains Review Mode's job. */
(function initSimpleEbayPrompt(global) {
  "use strict";

  function cleanText(value, limit = 500) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function questionKey(value) {
    return cleanText(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function knowledge() {
    return global.EbayAiFieldKnowledgeV820 || {
      definition: () => "Use direct evidence appropriate to the field.",
      policy: () => ({ minConfidence: 0.82, evidenceClass: "DIRECT_EVIDENCE" }),
      neededPhoto: () => "Add a clearer close-up that directly shows this field."
    };
  }

  function cleanQuestionList(questions) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(questions) ? questions : []) {
      const question = cleanText(raw, 120);
      const key = questionKey(question);
      if (!question || !key || seen.has(key) || ["upc", "mpn", "manufacturer part number", "universal product code"].includes(key)) continue;
      seen.add(key);
      out.push(question);
    }
    return out;
  }

  function baseSafetyRules() {
    return [
      "Analyze exactly one marketplace product from the supplied numbered product photos and current-page listing-field metadata.",
      "CHECK EVERY REQUESTED FIELD and return one compact result for every requested field in the same order.",
      "Use the exact requested field name. Never create an unrequested field.",
      "When OPTIONS are provided, returned values must use exact listed platform options whenever possible. Do not use a merely similar dropdown option.",
      "CARDINALITY MULTIPLE may return several exact values. CARDINALITY ONE must return one best value only.",
      "A clearly readable physical tag or measurement overrides visual inference, title context, current values, screenshots, or seller-created answer cards.",
      "Size may map an equivalent tag form to the best exact platform option. Material must use standard material names without percentages.",
      "Sleeve Length is length; Sleeve Type is sleeve construction. Fabric Type is fabric construction, not fiber composition.",
      "Never return placeholders such as Unknown, N/A, Not Applicable, Does Not Apply, Leave Blank, or No known warnings.",
      "Never return UPC or MPN. Never return title, description, price, quantity, shipping, availability, payment, publish/list/post, pay, delete, or other commerce actions. Category or Condition may be returned only when that exact field is explicitly requested by the current platform form."
    ];
  }

  function fillModeRules() {
    return [
      "FILL MODE: behave like a strong general GPT product analyst. Give the best probable platform answer for ordinary visual fields without unnecessary hesitation.",
      "Use readable tags first. For ordinary visual fields, infer the best candidate from all supplied photos, visible construction, category context, and available platform options.",
      "Fields marked POLICY: EVIDENCE_ONLY are different: return a value only when a supplied product photo directly confirms it with readable physical text/marking, or the special visible-character exception below. Otherwise return an empty string for that field.",
      "Never infer an EVIDENCE_ONLY fact from brand reputation, style, seller title, category conventions, absence of evidence, or a similar-looking listing.",
      "For Yes/No fields marked EVIDENCE_ONLY, absence of proof does NOT mean No. Return Yes or No only when product evidence directly supports that choice; otherwise return an empty string.",
      "Character and Character Family are EVIDENCE_ONLY, but an unmistakable visible character or franchise graphic printed on the physical product counts as direct visual product evidence.",
      "For directly visible ordinary fields such as Type, Color, Style, Pattern, Closure, Sleeve Length/Type, Neckline, visible Features and visible Accents, return the best supported exact platform answer from the supplied photos.",
      "Fields marked POLICY: STRONG_SUPPORT (Fit, Occasion, Theme, Season) may be blank when the photos/category do not strongly support a useful answer. Do not use generic filler such as School or Travel just because it is plausible.",
      "Hidden or technical properties such as Fabric Weight, Performance/Activity, Cushioning Level, Midsole Type, Pronation, heel-to-toe drop, insulation weight/fill power or waterproof rating are EVIDENCE_ONLY and must not be inferred from generic appearance.",
      "Exact dimensions/classifications such as width, height, depth, platform/heel/shaft/calf measurements and manufacturer width classes require a readable ruler/tape measurement or explicit manufacturer label. Perspective is never a measurement.",
      "For any Yes/No field, absence is not proof of No. Return No only when the product/label explicitly establishes the negative; a merely missing visible feature is not enough.",
      "Do not invent filler values merely to make an optional field non-empty. Safe free-form Item Specifics may be requested; answer them only when the value is directly supported and concise.",
      "Policy-blocked fields are filtered before this request and must never be recreated as extra answers."
    ];
  }

  function reviewModeRules() {
    return [
      "REVIEW MODE: verification is the purpose of this request. Distinguish directly supported values from guesses and conflicts.",
      "Use model_status confirmed only when the value is directly supported by a readable physical tag, measurement, or clear visible product feature.",
      "Use model_status needs_review when evidence is weak, missing, conflicting, or inferred. Keep a proposed candidate when useful for human review, but do not present it as confirmed.",
      "Brand, Size, Material, Garment Care, Country of Origin, Model, and Product Line require readable physical evidence to be confirmed.",
      "Vintage, Handmade, Personalize, Fabric Weight, and Performance/Activity require explicit evidence to be confirmed. Absence of evidence alone does not confirm No.",
      "Do not infer care instructions, authenticity, exact age, rare status, or country from appearance."
    ];
  }

  function fieldExamples(reviewMode = false) {
    const examples = [
      "EXAMPLE 1 — Size tag reads XXL (18); options are 2XL | 18 | 18-20. Best exact value: 18.",
      "EXAMPLE 2 — Material tag reads 99% Polyester, 1% Other Fiber; options are Polyester | Other. Values: Polyester, Other.",
      "EXAMPLE 3 — Sleeve Length is 3/4 Sleeve. Do not copy 3/4 Sleeve into Sleeve Type.",
      "EXAMPLE 4 — Script label visibly reads Maggie Barnes. Copy Maggie Barnes exactly; do not transform it into a plausible different brand.",
      "EXAMPLE 5 — Black, white, and gold are all prominent and Multicolor is available. Color: Multicolor."
    ];
    if (reviewMode) examples.push("EXAMPLE REVIEW — If Style looks like Tunic but is not definitive, return Tunic as needs_review rather than confirmed.");
    return examples;
  }

  function getItemSpecificsSystemInstructions({ reviewMode = false } = {}) {
    return [
      ...baseSafetyRules(),
      ...(reviewMode ? reviewModeRules() : fillModeRules()),
      ...fieldExamples(reviewMode),
      "Return only plain text lines in the exact format: [Exact question] - [Answer]. One field per line.",
      "Do not return explanations, evidence, JSON, markdown, headings, or numbering in the plain-text compatibility route."
    ].join("\n");
  }

  function getStrictVerificationStructuredSystemInstructions() {
    return [
      "INDEPENDENT STRICT VERIFICATION: re-read only the requested strict fields from the supplied product photos. Never assume, copy, or try to reproduce a previous candidate value.",
      "Use the exact requested field names. When OPTIONS are supplied, return exact listed platform options whenever possible. Size may map an equivalent readable tag form to the best exact platform option; Material uses standard material names without percentages. Return one value only for single fields and comma + space values for multi-select fields.",
      "A readable physical tag, printed/stamped/embossed product marking, brand logo, size/care label, or readable measurement is direct evidence. If the exact strict fact cannot be independently re-read, return an empty string.",
      "Brand, Size, Material, Garment Care, Country of Origin, Model, Product Line, Vintage, Handmade, Personalize, Customized, Signed, year, authenticity/certification, Fabric Weight, Performance/Activity, Cushioning Level, Midsole Type and similar hidden technical facts require direct product evidence; generic appearance is not enough.",
      "Character and Character Family may use an unmistakable visible character/franchise graphic on the physical product. Component materials require evidence for that same component; Body/Outer does not prove Lining or Handle/Strap, and Upper/Insole/Outsole are separate.",
      "Exact dimensions, heel/platform/shaft/calf/waist/chest values, shoe width classes and other measurement-only fields require a readable ruler/tape or explicit manufacturer label. Never estimate exact measurements or width classes from perspective.",
      "For Yes/No fields, absence is never evidence of No. A visible property may support an obvious Yes only when that field policy allows visual evidence; otherwise require explicit product evidence.",
      "Never invent label text, placeholders, unrequested fields, UPC, MPN, title, description, price, quantity, shipping, availability, payment, publish/list/post, delete, or other commerce actions.",
      "Return valid JSON only and follow the supplied Fill schema exactly. The answers object must contain every requested field exactly once. Every requested strict field must also have one compact support record; blank strict answers use source_type none, photo 0, and empty evidence."
    ].join("\n");
  }

  function getItemSpecificsStructuredSystemInstructions({ repair = false, reviewMode = false } = {}) {
    if (repair && !reviewMode) return getStrictVerificationStructuredSystemInstructions();
    return [
      ...baseSafetyRules(),
      ...(reviewMode ? reviewModeRules() : fillModeRules()),
      ...fieldExamples(reviewMode),
      reviewMode
        ? "Perform one compact verification analysis across all requested fields."
        : "Perform one compact primary Fill analysis across all requested fields. Code may use at most one small targeted GPT repair only for rejected/conflicting strict evidence or a missing strict fact with detected direct evidence.",
      "Return valid JSON only and follow the supplied JSON schema exactly.",
      reviewMode
        ? "results must contain exactly one verification object for every requested field, in the same order."
        : "The answers object must contain every requested field exactly once. Directly visible ordinary fields need a non-empty best value when applicable; POLICY: STRONG_SUPPORT, POLICY: EVIDENCE_ONLY and POLICY: CONTEXT_REQUIRED fields may use an empty string when the required support is absent. For every strict field, also return one compact support record; blank strict answers use source_type none.",
      reviewMode
        ? "Use model_status confirmed only for directly supported candidates; otherwise use needs_review."
        : "FILL MODE uses a compact schema: return one best value string for every exact field. For multi-select fields, join the selected exact values with comma + space. Only strict policy fields carry compact support metadata.",
      reviewMode
        ? "Never return auto_fill_allowed or final resolver statuses. Keep evidence to one short sentence of at most 160 characters."
        : "Do not add confidence, explanations, or review commentary in Fill Mode. For strict policy fields only, the schema requires a short support record so code can reject unsupported dangerous facts before Fill."
    ].join("\n");
  }

  function stringEnum(values, fallback = { type: "string" }) {
    const cleaned = [...new Set((Array.isArray(values) ? values : []).map(value => cleanText(value, 120)).filter(Boolean))];
    return cleaned.length ? { type: "string", enum: cleaned } : fallback;
  }

  function getItemSpecificsJsonSchema(options = {}) {
    const questions = cleanQuestionList(options.questions || []);
    const fieldSchema = stringEnum(questions);
    const maxPhoto = Math.max(1, Math.min(Number(options.maxPhotos || 10), 10));
    const exactCount = Math.max(1, questions.length || 1);
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        results: {
          type: "array",
          minItems: exactCount,
          maxItems: exactCount,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: fieldSchema,
              status: { type: "string", enum: ["confirmed", "needs_review"] },
              value: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              photo: { type: "integer", minimum: 0, maximum: maxPhoto },
              source_type: { type: "string", enum: ["physical_tag", "measurement", "visual", "none"] },
              evidence: { type: "string" },
              reason: { type: "string" },
              needed_photo: { type: "string" }
            },
            required: ["field", "status", "value", "confidence", "photo", "source_type", "evidence", "reason", "needed_photo"]
          }
        }
      },
      required: ["results"]
    };
  }

  function fieldIdForQuestion(question, fields = []) {
    const wanted = questionKey(question);
    const field = (Array.isArray(fields) ? fields : []).find(item => questionKey(item?.name || item?.label) === wanted) || {};
    return cleanText(field.fieldId || field.field_id || `legacy:${wanted.replace(/\s+/g, "_")}`, 180);
  }

  function getItemSpecificsFastFillJsonSchema(options = {}) {
    const questions = cleanQuestionList(options.questions || []);
    const fields = Array.isArray(options.fields) ? options.fields : [];
    const policy = global.EbayAiItemSpecificsV7100;
    const fieldTypeByQuestion = new Map(fields.map(field => [questionKey(field?.name || field?.label), cleanText(field?.type, 40).toLowerCase()]));
    const fieldByQuestion = new Map(fields.map(field => [questionKey(field?.name || field?.label), field]));
    const strictQuestions = questions.filter(question => policy?.requiresStrictSupport?.(fieldByQuestion.get(questionKey(question)) || question));
    // Safe free-form Item Specifics are allowed, but the schema must never force a
    // speculative text answer merely to satisfy minLength. Blank means leave untouched.
    const blankAllowed = new Set(questions.filter(question =>
      strictQuestions.includes(question)
      || policy?.isStrongSupport?.(question)
      || fieldTypeByQuestion.get(questionKey(question)) === "text"
    ));
    const answerProperties = Object.fromEntries(questions.map(question => [question,
      blankAllowed.has(question)
        ? { type: "string", maxLength: 500 }
        : { type: "string", minLength: 1, maxLength: 500 }]));
    const properties = {
      fill_response_schema_version: { type: "integer", enum: [3] },
      answers: {
        type: "object",
        additionalProperties: false,
        properties: answerProperties,
        required: questions
      }
    };
    const required = ["fill_response_schema_version", "answers"];
    if (strictQuestions.length) {
      const supportEntry = {
        type: "object",
        additionalProperties: false,
        properties: {
          source_type: { type: "string", enum: ["physical_tag", "measurement", "visual", "seller_context", "none"] },
          photo: { type: "integer", minimum: 0, maximum: 10 },
          evidence: { type: "string", maxLength: 160 }
        },
        required: ["source_type", "photo", "evidence"]
      };
      properties.support = {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(strictQuestions.map(question => [question, supportEntry])),
        required: strictQuestions
      };
      required.push("support");
    }
    return { type: "object", additionalProperties: false, properties, required };
  }

  function getItemSpecificsJsonSchemaV3(options = {}) {
    const questions = cleanQuestionList(options.questions || []);
    const fieldSchema = stringEnum(questions);
    const exactCount = Math.max(1, questions.length || 1);
    const enums = global.EbayContractsV3?.ENUMS || {};
    return {
      type: "object", additionalProperties: false,
      properties: {
        ai_response_schema_version: { type: "integer", enum: [3] },
        request_id: { type: "string" },
        results: {
          type: "array", minItems: exactCount, maxItems: exactCount,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              field_id: { type: "string" }, field: fieldSchema,
              model_status: { type: "string", enum: enums.ai_status || ["confirmed", "needs_review"] },
              raw_value: { type: "string" }, candidate_values: { type: "array", items: { type: "string" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              photo_sources: { type: "array", items: { type: "string" } },
              evidence_type: { type: "string", enum: enums.evidence_type || ["physical_tag", "measurement", "visual", "none"] },
              evidence_scope: { type: "string", enum: enums.evidence_scope || ["whole_item", "outer_shell", "lining", "trim", "component", "unknown"] },
              evidence: { type: "string" },
              review_reason: { type: "string", enum: enums.review_reason || ["none", "no_evidence", "low_confidence", "ambiguous_visual_classification", "invalid_ebay_option", "conflicting_photos", "missing_required_photo", "unsupported_inference"] },
              missing_photo_role: { type: "string", enum: enums.photo_role || ["front", "back", "brand_size_tag", "material_care_tag", "measurement", "detail", "fabric_closeup", "defect", "none"] }
            },
            required: ["field_id", "field", "model_status", "raw_value", "candidate_values", "confidence", "photo_sources", "evidence_type", "evidence_scope", "evidence", "review_reason", "missing_photo_role"]
          }
        }
      },
      required: ["ai_response_schema_version", "request_id", "results"]
    };
  }

  function compactFieldLines(questions, fields, currentValues, { reviewMode = false } = {}) {
    const fieldByKey = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const name = cleanText(field?.name || field?.label, 120);
      if (name) fieldByKey.set(questionKey(name), field);
    }
    const rules = knowledge();
    return questions.map(question => {
      const field = fieldByKey.get(questionKey(question)) || {};
      const current = cleanText(currentValues?.[question] || field.currentValue || "", 160);
      const type = cleanText(field.type || "", 40);
      // Keep the exact platform vocabulary but never spend prompt tokens on duplicate
      // labels produced by repeated DOM nodes. This is lossless compression.
      const options = [];
      for (const rawOption of (Array.isArray(field.options) ? field.options : [])) {
        const option = cleanText(rawOption, 80);
        if (!option || options.some(existing => questionKey(existing) === questionKey(option))) continue;
        options.push(option);
        if (options.length >= Math.max(1, Math.min(Number(field.maxPromptOptions || 80), 500))) break;
      }
      const fieldId = fieldIdForQuestion(question, fields);
      const parts = [question];
      if (type) parts.push(`TYPE: ${type}`);
      parts.push(`CARDINALITY: ${type === "multi" ? "MULTIPLE" : "ONE"}`);
      const autoPolicy = global.EbayAiItemSpecificsV7100;
      if (!reviewMode && autoPolicy?.isMeasurementOnly?.(question)) {
        parts.push("POLICY: MEASUREMENT_ONLY — blank unless a readable ruler/tape measurement or explicit manufacturer measurement/width label directly supports the exact value");
      } else if (!reviewMode && autoPolicy?.isBinaryField?.(field)) {
        parts.push("POLICY: BINARY_EVIDENCE — Yes requires direct visible/label support; No requires explicit negative evidence and can never be inferred from absence");
      } else if (!reviewMode && autoPolicy?.isEvidenceOnly?.(question)) {
        parts.push("POLICY: EVIDENCE_ONLY — blank unless directly confirmed by physical product evidence; Character fields may use an unmistakable visible character/franchise graphic");
      } else if (!reviewMode && autoPolicy?.isContextRequired?.(question)) {
        parts.push("POLICY: CONTEXT_REQUIRED — use a readable product mark/tag OR explicit seller title/note that states this exact fact; never use CURRENT as evidence and never infer identity from appearance; shoe sizes require readable product/size-tag evidence");
      } else if (!reviewMode && autoPolicy?.isStrongSupport?.(question)) {
        parts.push("POLICY: STRONG_SUPPORT — answer only when the supplied photos/category strongly support a specific useful option; otherwise use an empty string rather than generic filler");
      }
      if (reviewMode) {
        const fieldPolicy = rules.policy(question);
        parts.push(`FIELD_ID: ${fieldId}`);
        parts.push(`EVIDENCE: ${fieldPolicy.evidenceClass}`);
        parts.push(`MIN CONFIDENCE: ${Number(fieldPolicy.minConfidence || 0.82).toFixed(2)}`);
        parts.push(`DEFINITION: ${rules.definition(question)}`);
      }
      if (field.customValueAllowed === true) parts.push("CUSTOM VALUE: ALLOWED");
      // Review Mode needs the current form value so it can compare page state to
      // evidence. Fast Fill intentionally omits it to prevent anchoring/self-confirming
      // a wrong eBay value (for example, an incorrect pre-filled Brand or Size).
      if (reviewMode && current && !/^(?:select|choose|search|empty)$/i.test(current)) parts.push(`CURRENT (existing eBay value; context only, NEVER evidence): ${current}`);
      if (options.length) parts.push(`OPTIONS: ${options.join(" | ")}`);
      else parts.push(reviewMode
        ? "OPTIONS: NOT FULLY EXPOSED — propose a value only when useful for verification"
        : "OPTIONS: NOT FULLY EXPOSED — return the best concise platform-style candidate from the photos and category context");
      return parts.join(" | ");
    });
  }

  function compactStrictVerificationFieldLines(questions, fields, options = {}) {
    const fieldByKey = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const name = cleanText(field?.name || field?.label, 120);
      if (name) fieldByKey.set(questionKey(name), field);
    }
    const autoPolicy = global.EbayAiItemSpecificsV7100;
    return questions.map(question => {
      const field = fieldByKey.get(questionKey(question)) || {};
      const type = cleanText(field.type || "", 40);
      const allOptions = [];
      for (const rawOption of (Array.isArray(field.options) ? field.options : [])) {
        const option = cleanText(rawOption, 80);
        if (!option || allOptions.some(existing => questionKey(existing) === questionKey(option))) continue;
        allOptions.push(option);
        if (allOptions.length >= Math.max(1, Math.min(Number(field.maxPromptOptions || 500), 500))) break;
      }
      const microRepair = options.microRepair === true;
      const microListThreshold = Math.max(8, Math.min(Number(options.microOptionThreshold || 48), 80));
      const promptOptionLimit = microRepair
        ? Math.min(microListThreshold, Math.max(1, Math.min(Number(field.maxPromptOptions || microListThreshold), 80)))
        : Math.max(1, Math.min(Number(field.maxPromptOptions || 80), 500));
      const visibleOptions = allOptions.slice(0, promptOptionLimit);
      let policyCode = "STRICT_DIRECT_EVIDENCE";
      if (autoPolicy?.isMeasurementOnly?.(question)) policyCode = "MEASUREMENT_ONLY";
      else if (autoPolicy?.isBinaryField?.(field)) policyCode = "BINARY_EVIDENCE";
      else if (autoPolicy?.isEvidenceOnly?.(question)) policyCode = "EVIDENCE_ONLY";
      else if (autoPolicy?.isContextRequired?.(question)) policyCode = "CONTEXT_REQUIRED";
      const parts = [question];
      if (type) parts.push(`TYPE: ${type}`);
      parts.push(`CARDINALITY: ${type === "multi" ? "MULTIPLE" : "ONE"}`);
      parts.push(`POLICY: ${policyCode}`);
      if (field.customValueAllowed === true) parts.push("CUSTOM VALUE: ALLOWED");
      if (microRepair && allOptions.length > microListThreshold) {
        parts.push(`OPTIONS: LARGE LIVE CATALOG (${allOptions.length} values) — return only the exact readable product fact; Fill Engine verifies the exact live platform option.`);
      } else if (visibleOptions.length) {
        parts.push(`OPTIONS: ${visibleOptions.join(" | ")}`);
      } else {
        parts.push("OPTIONS: NOT FULLY EXPOSED — return only the exact readable product fact; Fill Engine verifies the live option later.");
      }
      return parts.join(" | ");
    });
  }

  function buildItemSpecificsPrompt({ existingTitle = "", category = "", questions = [], fields = [], currentValues = {}, pageContext = {}, customInstruction = "", purpose = "fill" } = {}) {
    const list = cleanQuestionList(questions);
    if (!list.length) throw new Error("No listing-field questions were supplied to GPT.");
    const pageFields = Array.isArray(fields) && fields.length ? fields : (Array.isArray(pageContext?.fields) ? pageContext.fields : []);
    const current = currentValues && typeof currentValues === "object" ? currentValues : (pageContext.fieldSummary || {});
    const sellerInstruction = cleanText(customInstruction, 500);
    const reviewMode = purpose === "review";
    const platformLabel = cleanText(pageContext?.platformLabel || pageContext?.platform || "eBay", 40) || "eBay";
    const modeInstructions = reviewMode
      ? [
          "REVIEW MODE: verify every field. Return the V3 evidence result required by the Review schema.",
          "Use the stable PHOTO_ID values for photo_sources. Keep evidence concise and distinguish confirmed evidence from needs_review.",
          "For composition fields, evidence_scope states whole_item, outer_shell, lining, trim, component, or unknown."
        ]
      : [
          "FILL MODE: answer ordinary directly visible fields with one best useful value; full Review verification is not part of this request.",
          "Follow each field POLICY plus the system rules. A non-empty strict answer needs the allowed direct source and short visible evidence; physical_tag includes readable labels, printed/stamped/embossed markings and readable product logos. Blank strict answers use source_type none.",
          "CONTEXT_REQUIRED identity/size facts need a readable product mark/tag or explicit seller note containing the exact fact; CURRENT form values are never evidence. Shoe sizes require readable size-tag evidence.",
          "Hidden/technical facts and materials need direct product evidence, and component material evidence must name that same component. Measurement-only fields need a readable ruler/tape or explicit manufacturer value.",
          "For Yes/No, absence never proves No. A visible property can support Yes only when its policy permits visual evidence; otherwise require explicit product evidence.",
          "STRONG_SUPPORT fields may be blank when the product/category does not strongly support a specific option. EVIDENCE_ONLY fields stay blank without direct evidence.",
          "For MULTIPLE fields, return the best exact values separated by comma + space. Keep strict support evidence short; do not add confidence, explanations, or review commentary."
        ];
    return [
      `Platform: ${platformLabel}. Inspect all supplied product photos together and evaluate every requested listing field below in page order.`,
      `Existing title for secondary seller context only: ${cleanText(existingTitle, 220) || "not supplied"}`,
      `Category for context only: ${cleanText(category, 180) || "not supplied"}`,
      reviewMode ? `CURRENT values shown below are existing ${platformLabel} form values only. They may be wrong and must never be cited as evidence or used to overrule a physical tag/photo.` : `Fast Fill does not expose existing ${platformLabel} field values to the model; analyze the product independently from the supplied evidence.`,
      "Do not treat a seller-created answer-card image as a physical label.",
      "",
      "REQUESTED LISTING FIELDS:",
      compactFieldLines(list, pageFields, current, { reviewMode }).join("\n"),
      sellerInstruction ? `\nSELLER NOTE (secondary unless it explicitly states seller-known facts):\n${sellerInstruction}` : "",
      "",
      ...modeInstructions
    ].filter(Boolean).join("\n");
  }

  function buildItemSpecificsRecoveryPrompt(options = {}) {
    const recoveryQuestions = cleanQuestionList(options.recoveryQuestions || options.questions || []);
    const reasons = options.rejectionReasons && typeof options.rejectionReasons === "object" ? options.rejectionReasons : {};
    const recoveryPurpose = options.purpose === "fill" ? "fill" : "review";
    const base = buildItemSpecificsPrompt({ ...options, questions: recoveryQuestions, purpose: recoveryPurpose });
    const reasonLines = recoveryQuestions.map(question => `${question}: ${cleanText(reasons[question] || "Independently re-read the direct evidence for this field.", 500)}`);
    return [
      "TARGETED STRICT VERIFICATION / REPAIR — this is the only additional request.",
      "Recheck only the fields listed below. Do not return fields outside this list.",
      options.independentVerification === true
        ? "This is an independent second read. Do NOT assume or try to reproduce any previous candidate; derive the value again only from the supplied photos/evidence. If the exact fact is not directly supported, return an empty string."
        : "Correct the rejection reason; do not merely repeat the previous wording.",
      "",
      "PRIMARY REJECTION REASONS:",
      reasonLines.join("\n"),
      "",
      base
    ].join("\n");
  }

  function buildStrictVerificationPrompt(options = {}) {
    const recoveryQuestions = cleanQuestionList(options.recoveryQuestions || options.questions || []);
    if (!recoveryQuestions.length) throw new Error("No strict verification questions were supplied to GPT.");
    const reasons = options.rejectionReasons && typeof options.rejectionReasons === "object" ? options.rejectionReasons : {};
    const pageFields = Array.isArray(options.fields) ? options.fields : [];
    const platformLabel = cleanText(options.pageContext?.platformLabel || options.pageContext?.platform || "eBay", 40) || "eBay";
    const reasonLines = recoveryQuestions.map(question => `${question}: ${cleanText(reasons[question] || "Independently re-read the direct evidence for this field.", 260)}`);
    return [
      `Platform: ${platformLabel}. Independently verify only the strict listing fields below from the supplied product photos.`,
      `Category for context only: ${cleanText(options.category || options.pageContext?.category || "", 180) || "not supplied"}`,
      "Do not use seller title or existing form values as evidence. Do not infer or try to reproduce the primary GPT answer.",
      "",
      "STRICT FIELDS TO VERIFY:",
      compactStrictVerificationFieldLines(recoveryQuestions, pageFields, { microRepair: true, microOptionThreshold: 48 }).join("\n"),
      "",
      "WHY EACH FIELD IS BEING RECHECKED:",
      reasonLines.join("\n"),
      "",
      "Return blank for any field whose exact strict fact cannot be independently supported by the supplied product evidence."
    ].join("\n");
  }

  function buildTestPrompt() { return "Reply with exactly OK."; }
  function getStructuredJsonSystemInstructions() { return "Return valid JSON only for the requested non-Item-Specific operation."; }
  function getResponsesInstructions() { return getItemSpecificsSystemInstructions(); }
  function getResponsesJsonInstructions({ test = false } = {}) { return test ? "Reply with exactly OK." : "Return valid JSON only for the requested non-Item-Specific operation."; }
  function getCustomJsonOutputInstructions() { return "Return valid JSON only."; }
  function getStructuredSafetyPolicy() { return Object.freeze({ no_publish_action: true, no_secrets: true }); }
  function getItemSpecificsSafetyPolicy() { return Object.freeze({ no_publish_action: true, exact_page_fields_only: true, exclude_upc_mpn: true }); }

  global.EbayAiPromptV711 = Object.freeze({
    cleanText,
    cleanQuestionList,
    getItemSpecificsSystemInstructions,
    getItemSpecificsStructuredSystemInstructions,
    getStrictVerificationStructuredSystemInstructions,
    getItemSpecificsJsonSchema,
    getItemSpecificsFastFillJsonSchema,
    getItemSpecificsJsonSchemaV3,
    fieldIdForQuestion,
    buildItemSpecificsPrompt,
    buildItemSpecificsRecoveryPrompt,
    buildStrictVerificationPrompt,
    buildTestPrompt,
    getStructuredJsonSystemInstructions,
    getResponsesInstructions,
    getResponsesJsonInstructions,
    getCustomJsonOutputInstructions,
    getStructuredSafetyPolicy,
    getItemSpecificsSafetyPolicy
  });
})(globalThis);

/* ===== RESPONSE PARSER ===== */
/* Actual GPT/API response parsing. Field - Value text parsing is normalized by the Text-mode input adapter before the shared AI/Fill boundary. */
(function initEbayAiResponseParser(global) {
  "use strict";
function parseJsonObjectV640(text) {
  let raw = String(text || "").trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }
}


function warningListV640(value) {
  if (Array.isArray(value)) return value.map(v => String(v || "").trim()).filter(Boolean);
  return String(value || "").split(/\r?\n/).map(v => v.trim()).filter(Boolean);
}

const EVIDENCE_STATUSES_V650 = new Set([
  "confirmed_by_tag",
  "confirmed_by_official_source",
  "supported_by_multiple_sources",
  "possible_match",
  "unconfirmed",
  "conflicting_information"
]);

const CONFIRMED_EVIDENCE_STATUSES_V650 = new Set([
  "confirmed_by_tag",
  "confirmed_by_official_source",
  "supported_by_multiple_sources"
]);


function evidenceKeyV650(name, value) {
  const normalizePart = part => String(part || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${normalizePart(name)}\u0000${normalizePart(value)}`;
}


function sanitizeEvidenceV650(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(0, 250)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const name = String(item.name || item.key || item.label || "").trim().slice(0, 80);
    const factValue = String(item.value ?? item.text ?? item.answer ?? "").trim().slice(0, 1000);
    const status = String(item.status || "").trim().toLowerCase();
    if (!name || !factValue || !EVIDENCE_STATUSES_V650.has(status)) continue;
    out.push({
      name,
      value: factValue,
      status,
      evidence: String(item.evidence || item.reason || "").trim().slice(0, 1000),
      sourceUrl: String(item.sourceUrl || item.source_url || item.url || "").trim().slice(0, 2000)
    });
  }
  return out;
}


function applyEvidenceStatusFilterV650(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = { ...source };
  const evidence = sanitizeEvidenceV650(source.evidence || source.factEvidence || source.fact_evidence);
  const evidenceByFact = new Map(evidence.map(item => [evidenceKeyV650(item.name, item.value), item]));
  const warnings = warningListV640(source.warnings || source.aiWarnings);
  const specifics = source.specifics && typeof source.specifics === "object" && !Array.isArray(source.specifics)
    ? source.specifics
    : {};
  const confirmedSpecifics = {};

  for (const [name, rawValue] of Object.entries(specifics).slice(0, 200)) {
    const factValue = String(rawValue ?? "").trim();
    if (!name.trim() || !factValue) continue;
    const fact = evidenceByFact.get(evidenceKeyV650(name, factValue));
    if (fact && CONFIRMED_EVIDENCE_STATUSES_V650.has(fact.status)) {
      confirmedSpecifics[name] = factValue;
    } else {
      const status = fact?.status || "unconfirmed";
      warnings.push(`Needs review: ${name} = ${factValue} (${status}).`);
    }
  }

  for (const fact of evidence) {
    if (CONFIRMED_EVIDENCE_STATUSES_V650.has(fact.status)) continue;
    warnings.push(`Needs review: ${fact.name} = ${fact.value} (${fact.status}).`);
  }

  out.specifics = confirmedSpecifics;
  out.evidence = evidence;
  out.warnings = [...new Set(warnings)].slice(0, 50);
  return out;
}


function normalizeKeyV641(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}


function pairsToObjectV641(value) {
  if (!Array.isArray(value)) return value;
  const out = {};
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const name = String(item.name || item.key || item.label || "").trim();
    const val = String(item.value ?? item.text ?? item.answer ?? "").trim();
    if (name && val) out[name] = val;
  }
  return out;
}


function unwrapListingObjectV641(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const meaningful = new Set([
    "brand", "size", "color", "colour", "condition", "itemcondition", "price",
    "suggestedprice", "description", "itemdescription", "listingdescription",
    "conditiondescription", "conditionnote", "category", "profile", "specifics",
    "itemspecifics", "measurements", "shipping", "warnings"
  ]);
  const hasMeaningful = obj => Object.keys(obj || {}).some(key => meaningful.has(normalizeKeyV641(key)));
  if (hasMeaningful(value)) return value;
  const wrappers = ["listing", "listingData", "listing_data", "result", "data", "product", "item", "fields", "analysis", "output"];
  for (const key of wrappers) {
    const child = value[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const unwrapped = unwrapListingObjectV641(child);
      if (Object.keys(unwrapped).length) return unwrapped;
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const unwrapped = unwrapListingObjectV641(child);
      if (hasMeaningful(unwrapped)) return unwrapped;
    }
  }
  return value;
}


function normalizedListingObjectV641(text) {
  const raw = parseJsonObjectV640(text);
  const source = unwrapListingObjectV641(raw);
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out = { ...source };
  if (out.specifics !== undefined) out.specifics = pairsToObjectV641(out.specifics);
  if (out.itemSpecifics !== undefined && out.specifics === undefined) out.specifics = pairsToObjectV641(out.itemSpecifics);
  if (out.item_specifics !== undefined && out.specifics === undefined) out.specifics = pairsToObjectV641(out.item_specifics);
  if (out.measurements !== undefined) out.measurements = pairsToObjectV641(out.measurements);
  if (!out.conditionDescription) out.conditionDescription = out.conditionNote || out.condition_note || out.conditionDetails || out.condition_details || "";
  if (!out.description) out.description = out.itemDescription || out.item_description || out.listingDescription || out.listing_description || "";
  if (!out.condition) out.condition = out.itemCondition || out.item_condition || "";
  return out;
}





function normalizeListingTextV641(text) {
  const obj = applyEvidenceStatusFilterV650(normalizedListingObjectV641(text));
  delete obj.title;
  return JSON.stringify(obj);
}


function mergePhotoAndResearchV640(photoText, researchText) {
  const photo = applyEvidenceStatusFilterV650(normalizedListingObjectV641(photoText));
  const research = applyEvidenceStatusFilterV650(normalizedListingObjectV641(researchText));
  if (!Object.keys(photo).length) throw new Error("Photo analysis returned invalid JSON.");
  const merged = { ...photo };

  // Web research may add exact stable specifics, but it never replaces the
  // photo-grounded description, condition, or condition note.
  if (research.specifics && typeof research.specifics === "object" && !Array.isArray(research.specifics)) {
    const photoSpecifics = photo.specifics && typeof photo.specifics === "object" && !Array.isArray(photo.specifics) ? photo.specifics : {};
    merged.specifics = { ...research.specifics, ...photoSpecifics };
  }
  const warnings = [
    ...warningListV640(photo.warnings || photo.aiWarnings),
    ...warningListV640(research.warnings || research.aiWarnings)
  ];
  if (warnings.length) merged.warnings = [...new Set(warnings)].slice(0, 50);

  merged.evidence = [...photo.evidence, ...research.evidence].slice(0, 250);

  // These fields may never be supplied or overridden by internet research.
  delete merged.title;
  merged.condition = photo.condition || "";
  merged.conditionDescription = photo.conditionDescription || photo.condition_note || "";
  if (photo.price !== undefined) merged.price = photo.price;
  return JSON.stringify(merged);
}


function extractWebSearchSourcesV639(json) {
  const found = new Map();
  const add = (url, title = "") => {
    const cleanUrl = String(url || "").trim();
    if (!/^https:\/\//i.test(cleanUrl)) return;
    if (!found.has(cleanUrl)) found.set(cleanUrl, { url: cleanUrl, title: String(title || "").trim().slice(0, 300) });
  };
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.type === "url_citation") add(value.url, value.title);
    if (value.url && (value.type === "url" || value.title || value.source)) add(value.url, value.title);
    if (Array.isArray(value.sources)) value.sources.forEach(source => add(source?.url, source?.title));
    for (const child of Object.values(value)) visit(child);
  };
  visit(json?.output || []);
  return Array.from(found.values()).slice(0, 12);
}


function apiValueToTextA537(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch (_) { return ""; }
  }
  return String(value);
}


function extractApiText(json) {
  if (!json) return "";
  if (typeof json === "string") return json;
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text;
  // Responses API envelopes may contain a top-level `text` object describing
  // the requested JSON schema. Read the actual output message first so that
  // request metadata can never be mistaken for GPT's answer.
  if (Array.isArray(json.output)) {
    const parts = [];
    for (const item of json.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
        else if (!content?.type && typeof content?.text === "string") parts.push(content.text);
      }
    }
    if (parts.some(part => String(part || "").trim())) return parts.filter(Boolean).join("\n");
  }
  const choice = json.choices?.[0];
  if (choice?.message?.parsed && typeof choice.message.parsed === "object") {
    return apiValueToTextA537(choice.message.parsed);
  }
  if (json.output_parsed && typeof json.output_parsed === "object") {
    return apiValueToTextA537(json.output_parsed);
  }
  if (choice?.message?.content) {
    const content = choice.message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(p => apiValueToTextA537(p?.text ?? p?.content ?? p)).filter(Boolean).join("\n");
    return apiValueToTextA537(content);
  }
  if (choice?.text) return apiValueToTextA537(choice.text);
  if (typeof json.text === "string") return json.text;
  if (typeof json.content === "string") return json.content;
  if (Array.isArray(json.content)) {
    const parts = json.content
      .filter(part => part?.type === "output_text" || part?.type === "text" || (!part?.type && typeof part?.text === "string"))
      .map(part => typeof part?.text === "string" ? part.text : "")
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  return "";
}


function extractApiDiagnosticsV842(json) {
  const choice = json?.choices?.[0] || {};
  const refusals = [];
  const addRefusal = value => {
    const text = String(value || "").trim();
    if (text && !refusals.includes(text)) refusals.push(text);
  };
  addRefusal(choice?.message?.refusal);
  const visitContent = content => {
    for (const part of Array.isArray(content) ? content : []) {
      if (part?.type === "refusal") addRefusal(part.refusal || part.text);
    }
  };
  visitContent(choice?.message?.content);
  for (const item of Array.isArray(json?.output) ? json.output : []) visitContent(item?.content);
  visitContent(json?.content);
  const finishReason = String(choice?.finish_reason || choice?.finishReason || json?.stop_reason || "").trim();
  const status = String(json?.status || json?.type || "").trim();
  const incompleteReason = String(json?.incomplete_details?.reason || json?.incompleteDetails?.reason || (["length", "max_tokens"].includes(finishReason) ? "max_tokens" : "")).trim();
  return {
    status,
    finishReason,
    incompleteReason,
    refusal: refusals.join(" ").slice(0, 700)
  };
}


function isSchemaEchoV670(text) {
  const value = String(text || "");
  return /["']type["']\s*:\s*["']json_schema["']/i.test(value)
    || (/Safe structured listing fields for an existing eBay draft/i.test(value) && /additionalProperties/i.test(value));
}



  global.EbayAiResponseParserV711 = Object.freeze({
    parseJsonObject: parseJsonObjectV640,
    normalizeListingText: normalizeListingTextV641,
    mergePhotoAndResearch: mergePhotoAndResearchV640,
    extractWebSearchSources: extractWebSearchSourcesV639,
    extractApiText,
    extractApiDiagnostics: extractApiDiagnosticsV842,
    isSchemaEcho: isSchemaEchoV670,
    applyEvidenceStatusFilter: applyEvidenceStatusFilterV650
  });
})(globalThis);

/* ===== core/ai.js ===== */
/* Evidence-first GPT answer validator and deterministic eBay resolver. */
(function initSimpleAnswerProcessor(global) {
  "use strict";

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function knowledge() {
    return global.EbayAiFieldKnowledgeV820 || {
      policy: () => ({ minConfidence: 0.75, allowedSourceTypes: ["visual", "physical_tag", "measurement"], requiredFactKinds: ["visual_observation", "label_text", "measurement"] }),
      recoveryPriority: () => 0,
      neededPhoto: () => "Add a clearer direct photo."
    };
  }

  function parseLine(line) {
    const raw = clean(line).replace(/^[-*•\d.)\s]+/, "");
    const match = raw.match(/^(.{2,100}?)\s+(?:-|–|—)\s+(.+)$/);
    if (!match) return null;
    const field = clean(match[1]);
    const value = clean(match[2]).replace(/\s*\[(?:TAG|MEASUREMENT|SELLER DATA) PHOTO[^\]]*\]\s*$/i, "").trim();
    return field && value ? { field, value } : null;
  }

  function splitValues(value) {
    const out = [];
    for (const part of clean(value).split(/\s*,\s*/).filter(Boolean)) {
      if (!out.some(existing => key(existing) === key(part))) out.push(part);
    }
    return out;
  }

  function fieldMap(fields = []) {
    const map = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const name = clean(field?.name || field?.label);
      if (name && !map.has(key(name))) map.set(key(name), field);
    }
    return map;
  }

  function canonicalOption(options, value) {
    return (Array.isArray(options) ? options : []).find(option => key(option) === key(value)) || "";
  }

  function isTaxonomyField(question) {
    return new Set(["material", "features", "occasion", "theme", "pattern", "style", "accents", "season", "garment care", "performance activity", "fabric type", "fit", "sleeve type", "neckline", "closure"]).has(key(question));
  }

  function resolveCompositeSizeOption(value, options) {
    const raw = clean(value);
    const exact = candidate => canonicalOption(options, candidate);
    const numbers = [...raw.matchAll(/\d+/g)].map(match => Number(match[0])).filter(Number.isFinite);
    for (const number of numbers) {
      const numeric = exact(String(number));
      if (numeric) return numeric;
    }
    for (const number of numbers) {
      const range = (Array.isArray(options) ? options : []).find(option => {
        const match = clean(option).match(/^(\d+)\s*[-–—]\s*(\d+)$/);
        return match && Number(match[1]) <= number && number <= Number(match[2]);
      });
      if (range) return range;
    }
    const alphaMatch = raw.toUpperCase().match(/\b(XXXL|XXL|XL|L|M|S|XS|XXS)\b/);
    const aliases = { XXXL: ["3XL", "XXXL"], XXL: ["2XL", "XXL"], XL: ["XL"], L: ["L"], M: ["M"], S: ["S"], XS: ["XS"], XXS: ["2XS", "XXS"] };
    for (const alias of aliases[alphaMatch?.[1]] || []) {
      const match = exact(alias);
      if (match) return match;
    }
    const wordSize = key(raw);
    const wordAliases = [
      ["extra extra extra large", ["3XL", "XXXL"]],
      ["triple extra large", ["3XL", "XXXL"]],
      ["extra extra large", ["2XL", "XXL"]],
      ["double extra large", ["2XL", "XXL"]],
      ["extra large", ["XL"]],
      ["large", ["L"]],
      ["medium", ["M"]],
      ["small", ["S"]],
      ["extra small", ["XS"]],
      ["extra extra small", ["2XS", "XXS"]]
    ];
    for (const [phrase, candidates] of wordAliases) {
      if (wordSize !== phrase) continue;
      for (const candidate of candidates) {
        const match = exact(candidate);
        if (match) return match;
      }
    }
    return "";
  }

  function normalizedMaterialOptions(rawValue, suppliedValues, options) {
    const haystack = ` ${key([rawValue, ...(Array.isArray(suppliedValues) ? suppliedValues : [])].join(" "))} `;
    const out = [];
    for (const option of Array.isArray(options) ? options : []) {
      const optionKey = key(option);
      if (!optionKey) continue;
      let found = haystack.includes(` ${optionKey} `);
      if (!found && optionKey === "other") found = /\bother (?:fiber|fibre|material)\b/.test(haystack);
      if (!found && optionKey === "polyester") found = /\bpolyester\b/.test(haystack);
      if (!found && optionKey === "cotton") found = /\bcotton\b/.test(haystack);
      if (!found && optionKey === "linen") found = /\blinen\b/.test(haystack);
      if (!found && optionKey === "rayon") found = /\b(?:rayon|viscose)\b/.test(haystack);
      if (!found && optionKey === "viscose") found = /\bviscose\b/.test(haystack);
      if (!found && optionKey === "elastane") found = /\b(?:elastane|spandex)\b/.test(haystack);
      if (!found && optionKey === "spandex") found = /\b(?:spandex|elastane)\b/.test(haystack);
      if (found && !out.some(existing => key(existing) === optionKey)) out.push(option);
    }
    return out;
  }

  function normalizeCountryOption(rawValue, suppliedValues, options) {
    for (const value of [...(Array.isArray(suppliedValues) ? suppliedValues : []), clean(rawValue).replace(/^made\s+in\s+/i, "")]) {
      const exact = canonicalOption(options, value);
      if (exact) return exact;
    }
    return "";
  }

  function normalizeFieldValues(question, rawValue, suppliedValues, field, warnings) {
    const options = Array.isArray(field?.options) ? field.options.map(clean).filter(Boolean) : [];
    const questionKey = key(question);
    let values = Array.isArray(suppliedValues) ? suppliedValues.map(clean).filter(Boolean) : splitValues(suppliedValues);

    if (questionKey === "material" && options.length) {
      const materials = normalizedMaterialOptions(rawValue, values, options);
      if (materials.length) {
        if (key(materials.join(", ")) !== key(values.join(", "))) warnings.push(`Normalized fiber percentages to exact eBay materials: ${question} - ${materials.join(", ")}`);
        values = materials;
      }
    }

    if (["country of origin", "country region of manufacture"].includes(questionKey) && options.length) {
      const country = normalizeCountryOption(rawValue, values, options);
      if (country) values = [country];
    }

    const multicolor = canonicalOption(options, "Multicolor");
    if (["color", "colour", "exterior color"].includes(questionKey) && multicolor) {
      const exactColors = values.map(value => canonicalOption(options, value)).filter(Boolean);
      if (exactColors.length > 1 || values.length > 1) {
        warnings.push(`Normalized multiple colors to the one-value eBay option: ${multicolor}`);
        values = [multicolor];
      }
    }

    return values;
  }

  function enforceFieldShape(question, value, field, warnings, rawValue = "") {
    if (!field) return clean(value);
    const type = key(field.type);
    const multiple = type === "multi";
    const options = Array.isArray(field.options) ? field.options.map(clean).filter(Boolean) : [];
    let parts = normalizeFieldValues(question, rawValue, splitValues(value), field, warnings);

    if (!multiple && parts.length > 1) {
      const questionKey = key(question);
      const multicolor = canonicalOption(options, "Multicolor");
      if (["color", "colour", "exterior color"].includes(questionKey) && multicolor) {
        warnings.push(`Normalized multiple colors to the one-value eBay option: ${multicolor}`);
        return multicolor;
      }
      for (const part of parts) {
        const exact = canonicalOption(options, part);
        if (exact) {
          warnings.push(`Reduced multiple values to the first exact one-value eBay option: ${question} - ${exact}`);
          return exact;
        }
      }
      warnings.push(`Ignored multiple values because no exact one-value eBay option exists: ${question}`);
      return "";
    }

    if (!multiple && parts.length === 1 && options.length) {
      const exact = canonicalOption(options, parts[0]);
      if (exact) return exact;
      if (key(question) === "size") {
        const resolved = resolveCompositeSizeOption(rawValue || parts[0], options);
        if (resolved) {
          warnings.push(`Resolved combined manufacturer size to the closest exact eBay option: ${question} - ${resolved}`);
          return resolved;
        }
      }
      if (field.customValueAllowed !== true || isTaxonomyField(question)) {
        warnings.push(`Ignored unavailable one-value option: ${question} - ${parts[0]}`);
        return "";
      }
    }

    if (multiple && options.length) {
      const exact = parts.map(part => canonicalOption(options, part)).filter(Boolean);
      const dropped = parts.filter(part => !canonicalOption(options, part));
      if (dropped.length) warnings.push(`Ignored unavailable values for ${question}: ${dropped.join(", ")}`);
      if (field.customValueAllowed !== true || isTaxonomyField(question)) return exact.join(", ");
      if (exact.length) return exact.join(", ");
    }
    return parts.join(", ");
  }

  function fallbackSafeAnswer(field, value) {
    const valueKey = key(String(value || "").replace(/[’']/g, ""));
    if (!valueKey || /^(?:unknown|not confirmed|unconfirmed|n a|na|not applicable|does not apply|doesnt apply|leave blank|skip|cannot determine|unable to determine|no known warnings)$/.test(valueKey)) return "";
    return clean(value).slice(0, 500);
  }

  // Fast Fill owns only the GPT candidate. Exact eBay option resolution belongs
  // exclusively to BLOCK 05 so a useful answer is never discarded twice.
  function sanitizeFastFillCandidate(question, value, policy) {
    const raw = clean(value).slice(0, 500);
    if (!raw) return "";
    return policy?.sanitizeAnswer
      ? policy.sanitizeAnswer(question, raw, { strictAiDefaults: false })
      : fallbackSafeAnswer(question, raw);
  }

  function parseJsonObject(text) {
    const value = String(text || "").trim();
    if (!value) return null;
    const candidates = [value, value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")];
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(value.slice(start, end + 1));
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    return null;
  }

  const ALLOWED_SOURCE_TYPES = new Set(["physical_tag", "measurement", "visual"]);
  const ALLOWED_FACT_KINDS = new Set(["label_text", "visual_observation", "measurement"]);

  function sanitizeSources(value) {
    const out = [];
    for (const source of Array.isArray(value) ? value.slice(0, 5) : []) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const photo = Number(source.photo ?? source.photo_id ?? source.photoNumber);
      const evidence = clean(source.evidence || source.reason || source.text).slice(0, 500);
      const requestedType = key(source.type || source.source_type || "visual").replace(/ /g, "_");
      const type = ALLOWED_SOURCE_TYPES.has(requestedType) ? requestedType : "visual";
      if (!Number.isInteger(photo) || photo < 1 || photo > 10 || !evidence) continue;
      out.push({ photo, type, evidence });
    }
    return out;
  }

  function sanitizeFacts(value) {
    const out = [];
    const seenIds = new Set();
    for (const item of Array.isArray(value) ? value.slice(0, 300) : []) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      let id = clean(item.id).slice(0, 80);
      const kind = clean(item.kind).toLowerCase();
      const text = clean(item.text || item.value || item.evidence).slice(0, 700);
      const confidence = Math.max(0, Math.min(Number(item.confidence || 0), 1));
      const sources = sanitizeSources(item.sources);
      if (!id || seenIds.has(id) || !ALLOWED_FACT_KINDS.has(kind) || !text || !sources.length) continue;
      seenIds.add(id);
      out.push({ id, kind, text, confidence, sources });
    }
    return out;
  }

  function structuredPayload(text) {
    const parsed = parseJsonObject(text);
    if (!parsed) return null;
    if ([2, 3].includes(Number(parsed.fill_response_schema_version || 0)) && parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) return { ...parsed, __format: "fast_map" };
    if (Array.isArray(parsed.results)) return { ...parsed, __format: "compact" };
    if (Array.isArray(parsed.answers)) return { ...parsed, __format: "legacy" };
    return null;
  }

  function sanitizeAndShapeAnswer(exactQuestion, rawValue, values, field, policy, warnings) {
    const normalizedValues = normalizeFieldValues(exactQuestion, rawValue, Array.isArray(values) ? values : splitValues(values), field, warnings);
    const joined = normalizedValues.join(", ");
    const sanitized = policy?.sanitizeAnswer
      ? policy.sanitizeAnswer(exactQuestion, joined, { strictAiDefaults: false })
      : fallbackSafeAnswer(exactQuestion, joined);
    return enforceFieldShape(exactQuestion, sanitized, field, warnings, rawValue);
  }

  function sourceOverlap(answerSources, facts) {
    const photos = new Set(answerSources.map(source => source.photo));
    return facts.some(fact => fact.sources.some(source => photos.has(source.photo)));
  }


  function factAnswerConsistencyError(question, shapedValue, rawValue, facts, sources) {
    const fieldKey = key(question);
    const evidenceText = key([
      ...(Array.isArray(facts) ? facts.map(fact => fact.text) : []),
      ...(Array.isArray(sources) ? sources.map(source => source.evidence) : [])
    ].join(" "));
    if (!evidenceText) return "Direct evidence text is empty.";
    const selected = splitValues(shapedValue).map(key).filter(Boolean);
    const selectedPhrase = key(shapedValue);
    const rawPhrase = key(rawValue);
    if (["brand", "model", "product line"].includes(fieldKey)) {
      if (selectedPhrase && !evidenceText.includes(selectedPhrase)) return `${question} does not match the cited label fact text.`;
    }
    if (["country of origin", "country region of manufacture"].includes(fieldKey)) {
      if (selectedPhrase && !evidenceText.includes(selectedPhrase) && !(rawPhrase && evidenceText.includes(rawPhrase))) return `${question} does not match the cited country label fact text.`;
    }
    if (fieldKey === "size") {
      if (!selected.some(value => evidenceText.includes(value)) && !(rawPhrase && evidenceText.includes(rawPhrase))) return "Size does not match the cited label fact text.";
    }
    if (fieldKey === "material") {
      const aliases = { rayon: ["rayon", "viscose"], viscose: ["viscose", "rayon"], elastane: ["elastane", "spandex"], spandex: ["spandex", "elastane"], other: ["other fiber", "other fibre", "other material"] };
      for (const value of selected) {
        const terms = aliases[value] || [value];
        if (!terms.some(term => evidenceText.includes(term))) return `Material value ${value} is not present in the cited composition evidence.`;
      }
    }
    return "";
  }

  function invalidFieldSemantics(question, shapedValue, rawValue, acceptedAnswers) {
    const fieldKey = key(question);
    const valueKey = key(shapedValue);
    const rawKey = key(rawValue);
    if (fieldKey === "sleeve type") {
      const lengthLike = /\b(?:sleeveless|short sleeve|long sleeve|3 4 sleeve|three quarter sleeve|half sleeve)\b/;
      if (lengthLike.test(valueKey) || lengthLike.test(rawKey)) return "Sleeve Type repeated or was derived from a Sleeve Length value.";
      if (/^(?:casual|regular|standard|normal)(?: sleeve)?$/.test(valueKey)) return "Sleeve Type is a generic fallback, not a confirmed sleeve construction.";
      if (/\bpuff(?:ed)? sleeve\b/.test(valueKey) && !/\b(?:gathered|fullness|voluminous|balloon|puffed at|puffing at)\b/.test(key(rawValue))) {
        return "Puff Sleeve requires explicit visible gathered or puffed construction evidence.";
      }
    }
    if (fieldKey === "neckline" && /\bv neck\b/.test(valueKey) && !/\b(?:v shaped|v shape|pointed v|distinct v|v neckline)\b/.test(key(rawValue))) {
      return "V-Neck requires a clearly pointed V-shaped neckline, not a wide rounded opening.";
    }
    if (fieldKey === "material" && /\d|%/.test(shapedValue)) return "Material selected values must be standardized names without percentages.";
    if (["vintage", "handmade", "personalize"].includes(fieldKey) && valueKey === "no") return `${question} - No requires explicit evidence and cannot be inferred from absence.`;
    if (fieldKey === "fabric type" && acceptedAnswers.Material && key(acceptedAnswers.Material) === valueKey) return "Fabric Type duplicated Material instead of fabric construction.";
    if (fieldKey === "theme" && acceptedAnswers.Pattern && key(acceptedAnswers.Pattern) === valueKey && !/character|holiday|western|sports|nature/.test(valueKey)) return "Theme merely duplicated Pattern without independent theme evidence.";
    if (/^(?:unknown|none|not applicable|does not apply|no known warnings)$/.test(valueKey)) return "Placeholder values are not automatic answers.";
    if (!clean(rawValue)) return "raw_value is empty.";
    return "";
  }

  function v3Enums() {
    return global.EbayContractsV3?.ENUMS || {
      ai_status: ["confirmed", "needs_review"], evidence_type: ["physical_tag", "measurement", "visual", "none"],
      evidence_scope: ["whole_item", "outer_shell", "lining", "trim", "component", "unknown"],
      review_reason: ["none", "no_evidence", "low_confidence", "ambiguous_visual_classification", "invalid_ebay_option", "conflicting_photos", "missing_required_photo", "unsupported_inference"],
      photo_role: ["front", "back", "brand_size_tag", "material_care_tag", "measurement", "detail", "fabric_closeup", "defect", "none"]
    };
  }

  function v3Policies() {
    return global.EbayContractsV3?.FIELD_POLICIES || {
      high_risk: {
        fields: ["Brand", "Size", "Material", "Country of Origin", "Garment Care", "Model", "Product Line"],
        confidence_threshold: null, required_evidence_type: "physical_tag", required_evidence_scope: "whole_item"
      },
      objective_visual: {
        fields: ["Type", "Color", "Pattern", "Closure", "Sleeve Length"],
        confidence_threshold: 0.80, allowed_evidence_types: ["visual", "physical_tag", "measurement"]
      },
      interpretational_visual: {
        fields: ["Neckline", "Sleeve Type", "Style", "Fabric Type", "Features", "Accents", "Fit"],
        confidence_threshold: 0.85, allowed_evidence_types: ["visual", "physical_tag", "measurement"]
      },
      strict_both_modes: {
        fields: ["Brand", "Size", "Material", "Country of Origin", "Garment Care", "Vintage", "Handmade", "Personalize", "Model", "Product Line", "Fabric Weight", "Performance/Activity"]
      }
    };
  }

  function fieldPolicyGroup(question) {
    const policies = v3Policies();
    const fieldKey = key(question);
    for (const name of ["high_risk", "objective_visual", "interpretational_visual"]) {
      const policy = policies[name] || {};
      if ((policy.fields || []).some(value => key(value) === fieldKey)) return { name, ...policy };
    }
    return { name: "general", confidence_threshold: 0.82, allowed_evidence_types: ["visual", "physical_tag", "measurement"] };
  }

  function fieldIdMap(fields = []) {
    const map = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const id = clean(field?.fieldId || field?.field_id);
      if (id && !map.has(id)) map.set(id, field);
    }
    return map;
  }

  function photoCatalogMap(photoCatalog = []) {
    const map = new Map();
    for (const [index, photo] of (Array.isArray(photoCatalog) ? photoCatalog : []).entries()) {
      const id = clean(photo?.photoId || photo?.photo_id);
      if (!id || map.has(id)) continue;
      map.set(id, { ...photo, displayNumber: Number(photo?.displayNumber || photo?.requestPhotoNumber || index + 1) });
    }
    return map;
  }

  function directEvidenceStatus(type) {
    return type === "physical_tag" ? "confirmed_by_tag" : type === "none" ? "needs_review" : "confirmed_by_photo";
  }

  function parseV3Bundle(structured, questions = [], fields = [], options = {}) {
    const ordered = (Array.isArray(questions) ? questions : []).map(clean).filter(Boolean);
    const questionByKey = new Map(ordered.map(question => [key(question), question]));
    const fieldsByKey = fieldMap(fields);
    const fieldsById = fieldIdMap(fields);
    const photos = photoCatalogMap(options.photoCatalog || []);
    const enums = v3Enums();
    const aiStatuses = new Set(enums.ai_status || []), evidenceTypes = new Set(enums.evidence_type || []), scopes = new Set(enums.evidence_scope || []), reasons = new Set(enums.review_reason || []), roles = new Set(enums.photo_role || []);
    const answers = {}, evidence = {}, suggestedAnswers = {}, rejectionReasons = {}, modelResults = {}, validationIssues = [], reviewDetails = [], warnings = [];
    const seenIds = new Set(), seenQuestions = new Set();
    const addIssue = issue => { if (issue && !validationIssues.includes(issue)) validationIssues.push(issue); };
    const reject = (question, reason, detail = {}) => {
      rejectionReasons[question] = clean(reason).slice(0, 500) || "Needs review.";
      reviewDetails.push({
        field: question, fieldId: clean(detail.fieldId), proposedValue: clean(detail.proposedValue), confidence: Number(detail.confidence || 0),
        sources: Array.isArray(detail.sources) ? detail.sources : [], reason: rejectionReasons[question], neededPhoto: clean(detail.neededPhoto),
        modelStatus: "needs_review", rawValue: clean(detail.rawValue), candidateValues: Array.isArray(detail.candidateValues) ? detail.candidateValues : [],
        evidenceType: clean(detail.evidenceType || "none"), evidenceScope: clean(detail.evidenceScope || "unknown"), reviewReason: clean(detail.reviewReason || "no_evidence"),
        missingPhotoRole: clean(detail.missingPhotoRole || "none"), status: detail.status || (detail.proposedValue ? "likely_correct" : "not_filled"),
        primaryProvider: options.modelProvider || "openai"
      });
    };

    if (Number(structured?.ai_response_schema_version || 0) !== 3) addIssue("invalid_enum");
    for (const item of Array.isArray(structured?.results) ? structured.results.slice(0, 200) : []) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const fieldId = clean(item.field_id);
      const requestedName = clean(item.field);
      if (fieldId && seenIds.has(fieldId)) { addIssue("duplicate_field_id"); continue; }
      if (fieldId) seenIds.add(fieldId);
      const field = fieldsById.get(fieldId) || fieldsByKey.get(key(requestedName));
      const exactQuestion = questionByKey.get(key(field?.name || field?.label || requestedName));
      if (!exactQuestion || (fieldId && fieldsById.size && !fieldsById.has(fieldId))) { addIssue("unknown_field_id"); continue; }
      if (seenQuestions.has(exactQuestion)) { addIssue("duplicate_field_id"); continue; }
      seenQuestions.add(exactQuestion);

      const rawValue = clean(item.raw_value).slice(0, 500);
      const candidateValues = [...new Set((Array.isArray(item.candidate_values) ? item.candidate_values : []).map(clean).filter(Boolean))].slice(0, 30);
      const modelStatus = clean(item.model_status);
      let confidence = Number(item.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) { addIssue("invalid_confidence"); confidence = Math.max(0, Math.min(Number.isFinite(confidence) ? confidence : 0, 1)); }
      const evidenceType = clean(item.evidence_type || "none");
      let evidenceScope = clean(item.evidence_scope || "");
      const evidenceText = clean(item.evidence).slice(0, 160);
      const reviewReason = clean(item.review_reason || "none");
      const missingPhotoRole = clean(item.missing_photo_role || "none");
      if (!aiStatuses.has(modelStatus) || !evidenceTypes.has(evidenceType) || !reasons.has(reviewReason) || !roles.has(missingPhotoRole)) addIssue("invalid_enum");
      if (!scopes.has(evidenceScope)) { addIssue("invalid_enum"); evidenceScope = "unknown"; }
      const composition = ["material", "fabric type", "garment care", "country of origin", "country region of manufacture"].includes(key(exactQuestion));
      if (!evidenceScope) { evidenceScope = composition ? "unknown" : "whole_item"; addIssue("missing_evidence_scope_defaulted"); addIssue("schema_repaired"); }
      const photoIds = [...new Set((Array.isArray(item.photo_sources) ? item.photo_sources : []).map(clean).filter(Boolean))].slice(0, 5);
      const validPhotoIds = photoIds.filter(id => photos.has(id));
      if (validPhotoIds.length !== photoIds.length) addIssue("unknown_photo_source");
      const sources = validPhotoIds.map(id => ({ photo: photos.get(id).displayNumber, photoId: id, type: evidenceType, scope: evidenceScope, evidence: evidenceText }));
      const selectionMode = key(field?.type) === "multi" ? "multi" : "single";
      if (selectionMode === "single" && candidateValues.length > 1) addIssue("multiple_values_for_single_select");
      const shaped = selectionMode === "single" && candidateValues.length > 1 ? "" : sanitizeAndShapeAnswer(exactQuestion, rawValue || candidateValues.join(", "), candidateValues, field, global.EbayAiFieldParserV790, warnings);
      const group = fieldPolicyGroup(exactQuestion);
      const threshold = group.name === "high_risk" ? 0.9 : Number(group.confidence_threshold ?? knowledge().policy(exactQuestion).minConfidence ?? 0.82);
      let direct = modelStatus === "confirmed" && Boolean(shaped) && Boolean(sources.length) && evidenceType !== "none" && confidence >= threshold;
      if (group.name === "high_risk") direct = direct && evidenceType === "physical_tag" && evidenceScope === "whole_item";
      if (composition && evidenceScope === "unknown") direct = false;
      if (key(exactQuestion) === "material" && !["whole_item", "outer_shell"].includes(evidenceScope)) direct = false;
      const semanticError = shaped ? invalidFieldSemantics(exactQuestion, shaped, rawValue || candidateValues.join(", "), answers) : "";
      if (semanticError) direct = false;
      const status = direct ? directEvidenceStatus(evidenceType) : (shaped && confidence >= 0.7 ? "likely_correct" : shaped ? "suggested" : "not_filled");
      const normalized = { fieldId, field: exactQuestion, modelStatus: aiStatuses.has(modelStatus) ? modelStatus : "needs_review", rawValue, candidateValues, value: shaped, confidence, photoSources: validPhotoIds, sources, evidenceType, evidenceScope, evidence: evidenceText, reviewReason: reasons.has(reviewReason) ? reviewReason : "unsupported_inference", missingPhotoRole: roles.has(missingPhotoRole) ? missingPhotoRole : "none", status, provider: options.modelProvider || "openai" };
      modelResults[exactQuestion] = normalized;
      if (direct) {
        answers[exactQuestion] = shaped;
        evidence[exactQuestion] = { rawValue, confidence, factIds: [], sources, facts: [], fieldId, modelStatus, evidenceType, evidenceScope, reviewReason, status, provider: options.modelProvider || "openai" };
      } else {
        if (shaped) suggestedAnswers[exactQuestion] = shaped;
        const reason = semanticError || (modelStatus === "needs_review" ? evidenceText || reviewReason : !shaped ? "Value is unavailable in current eBay options." : group.name === "high_risk" ? "High-risk field lacks a readable whole-item physical label." : confidence < threshold ? `Confidence ${confidence.toFixed(2)} is below ${threshold.toFixed(2)}.` : "Evidence is not sufficient for automatic fill.");
        reject(exactQuestion, reason, { fieldId, proposedValue: shaped, confidence, sources, rawValue, candidateValues, evidenceType, evidenceScope, reviewReason, missingPhotoRole, status });
      }
    }

    for (const question of ordered) {
      if (seenQuestions.has(question)) continue;
      addIssue("missing_field_response");
      const field = fieldsByKey.get(key(question)) || {};
      const fieldId = clean(field.fieldId || field.field_id);
      const neededPhoto = knowledge().neededPhoto(question);
      modelResults[question] = { fieldId, field: question, modelStatus: "needs_review", rawValue: "", candidateValues: [], value: "", confidence: 0, photoSources: [], sources: [], evidenceType: "none", evidenceScope: "unknown", evidence: "No valid result returned by primary analysis", reviewReason: "no_evidence", missingPhotoRole: "none", status: "not_filled", provider: options.modelProvider || "openai" };
      reject(question, "No valid result returned by primary analysis.", { fieldId, neededPhoto, reviewReason: "no_evidence", status: "not_filled" });
    }
    const omitted = ordered.filter(question => !answers[question]);
    return { answers, evidence, facts: [], suggestedAnswers, suggestedCount: Object.keys(suggestedAnswers).length, warnings: Array.from(new Set(warnings)).slice(0, 100), omitted, missing: [], rejectionReasons, reviewDetails, modelResults, validationIssues, fieldCatalog: fields, photoCatalog: Array.from(photos.values()), aiResponseSchemaVersion: 3, primaryProvider: options.modelProvider || "openai" };
  }

  function strictFastSupportPolicy(question, field = {}) {
    const policy = global.EbayAiItemSpecificsV7100;
    const fieldKey = key(question);
    const binary = policy?.isBinaryField?.(field) === true;
    if (policy?.isMeasurementOnly?.(question)) {
      return { strict: true, context: false, measurement: true, binary, allowed: new Set(["measurement", "physical_tag"]) };
    }
    if (policy?.isContextRequired?.(question)) {
      // Shoe-size and manufacturer-width conversions are too easy to get wrong from
      // title/category context. Require a physical product/size label.
      const physicalOnly = policy?.isShoeSizeField?.(question) || fieldKey === "shoe width";
      const allowed = physicalOnly ? new Set(["physical_tag"]) : new Set(["physical_tag", "seller_context"]);
      return { strict: true, context: true, measurement: false, binary, allowed };
    }
    if (binary) {
      return { strict: true, context: false, measurement: false, binary: true, allowed: new Set(["physical_tag", "visual", "seller_context"]) };
    }
    if (!policy?.isEvidenceOnly?.(question)) return { strict: false, context: false, measurement: false, binary: false, allowed: new Set() };
    if (["character", "character family"].includes(fieldKey)) return { strict: true, context: false, measurement: false, binary: false, allowed: new Set(["physical_tag", "visual"]) };
    return { strict: true, context: false, measurement: false, binary: false, allowed: new Set(["physical_tag"]) };
  }

  function booleanSupportExplicit(question, candidate, evidenceText, sourceType = "") {
    const value = key(candidate);
    const fieldKey = key(question);
    const evidenceKey = key(evidenceText);
    if (!value || !evidenceKey) return false;
    if (value === "no") {
      if (sourceType === "visual") return false;
      const negative = /\b(?:no|not|non|without|unsigned|not signed|not handmade|not vintage|not customizable|not customized|personalization not offered|does not offer personalization)\b/;
      return negative.test(evidenceKey) && (evidenceKey.includes(fieldKey) || /unsigned|personalization not offered|not handmade|not vintage/.test(evidenceKey));
    }
    if (value === "yes") {
      const positive = /\b(?:yes|signed|handmade|vintage|customized|customizable|personalized|personalizable|certified|authentic)\b/;
      return positive.test(evidenceKey) || evidenceKey.includes(fieldKey);
    }
    return true;
  }

  function supportMentionsCandidate(question, candidate, evidenceText, sourceType = "") {
    const fieldKey = key(question);
    const evidenceKey = key(evidenceText);
    if (!candidate || !evidenceKey) return false;
    if (["vintage", "handmade", "personalize", "customized", "authenticity", "certification", "signed"].includes(fieldKey)) {
      return booleanSupportExplicit(question, candidate, evidenceText, sourceType);
    }
    const values = splitValues(candidate).map(key).filter(Boolean);
    if (!values.length) return false;
    const aliases = {
      rayon: ["rayon", "viscose"], viscose: ["viscose", "rayon"],
      elastane: ["elastane", "spandex"], spandex: ["spandex", "elastane"],
      other: ["other", "other fiber", "other fibre", "other material"]
    };
    return values.every(value => (aliases[value] || [value]).some(term => evidenceKey.includes(term)));
  }

  function materialScopeSupported(question, evidenceText) {
    const fieldKey = key(question);
    const evidenceKey = key(evidenceText);
    if (!global.EbayAiItemSpecificsV7100?.isMaterialField?.(question)) return true;
    const scoped = [
      [/^lining material$| lining material$/, /\blining\b/],
      [/^upper material$| upper material$/, /\bupper\b/],
      [/^outsole material$| outsole material$/, /\b(?:outsole|outer sole|sole)\b/],
      [/^insole material$| insole material$/, /\b(?:insole|sockliner|footbed)\b/],
      [/^(?:handle strap|handle|strap) material$| (?:handle strap|handle|strap) material$/, /\b(?:handle|strap)\b/],
      [/^exterior material$| exterior material$/, /\b(?:exterior|outer|body|shell)\b/],
      [/^outer shell material$| outer shell material$/, /\b(?:outer|shell|body|exterior)\b/],
      [/^insulation material$| insulation material$/, /\b(?:insulation|fill|padding)\b/]
    ];
    const rule = scoped.find(([pattern]) => pattern.test(fieldKey));
    return !rule || rule[1].test(evidenceKey);
  }

  function sellerContextSupportsCandidate(candidate, options = {}) {
    const values = splitValues(candidate).map(key).filter(Boolean);
    if (!values.length) return false;
    const contextText = [
      options.existingTitle,
      options.customInstruction,
      ...(Array.isArray(options.sellerContextTexts) ? options.sellerContextTexts : [])
    ].map(value => key(value)).filter(Boolean).join(" ");
    if (!contextText) return false;
    const padded = ` ${contextText} `;
    return values.every(value => padded.includes(` ${value} `));
  }

  function validateStrictFastSupport(question, candidate, support = {}, options = {}, field = {}) {
    const rule = strictFastSupportPolicy(question, field);
    if (!rule.strict || !candidate) return { ok: true, sourceType: "none", photo: 0, evidence: "" };
    const sourceType = clean(support?.source_type || support?.sourceType || "none").toLowerCase();
    const photo = Number(support?.photo || 0);
    const evidenceText = clean(support?.evidence).slice(0, 160);
    if (!rule.allowed.has(sourceType)) return { ok: false, reason: `Strict field ${question} lacks an allowed support source.`, sourceType, photo, evidence: evidenceText };
    if (sourceType !== "seller_context" && (!Number.isInteger(photo) || photo < 1 || photo > 10)) return { ok: false, reason: `Strict field ${question} lacks a valid supporting photo.`, sourceType, photo, evidence: evidenceText };
    if (sourceType === "seller_context" && photo !== 0) return { ok: false, reason: `Seller-context support for ${question} must use photo 0.`, sourceType, photo, evidence: evidenceText };
    if (!evidenceText) return { ok: false, reason: `Strict field ${question} lacks concise support evidence.`, sourceType, photo, evidence: evidenceText };
    if (!supportMentionsCandidate(question, candidate, evidenceText, sourceType)) return { ok: false, reason: `Strict field ${question} support does not identify the selected value.`, sourceType, photo, evidence: evidenceText };
    if (rule.binary && !booleanSupportExplicit(question, candidate, evidenceText, sourceType)) return { ok: false, reason: `Binary field ${question} lacks explicit support for ${candidate}; absence cannot prove No.`, sourceType, photo, evidence: evidenceText };
    if (!materialScopeSupported(question, evidenceText)) return { ok: false, reason: `Material support does not identify the required component for ${question}.`, sourceType, photo, evidence: evidenceText };
    if (sourceType === "seller_context" && !sellerContextSupportsCandidate(candidate, options)) {
      return { ok: false, reason: `Seller context does not explicitly contain the selected value for ${question}. CURRENT values are not evidence.`, sourceType, photo, evidence: evidenceText };
    }
    return { ok: true, sourceType, photo, evidence: evidenceText };
  }

  function parseFastFillMapBundle(structured, questions = [], fields = [], options = {}) {
    const ordered = Array.isArray(questions) ? questions.map(clean).filter(Boolean) : [];
    const source = structured?.answers && typeof structured.answers === "object" && !Array.isArray(structured.answers) ? structured.answers : {};
    const sourceByKey = new Map(Object.entries(source).map(([name, value]) => [key(name), value]));
    const supportSource = structured?.support && typeof structured.support === "object" && !Array.isArray(structured.support) ? structured.support : {};
    const supportByKey = new Map(Object.entries(supportSource).map(([name, value]) => [key(name), value]));
    const fieldsByKey = new Map((Array.isArray(fields) ? fields : []).map(field => [key(field?.name || field?.label || field?.field || ""), field]));
    const schemaVersion = Number(structured?.fill_response_schema_version || 0);
    const answers = {};
    const evidence = {};
    const modelResults = {};
    const warnings = [];
    const rejectionReasons = {};
    for (const question of ordered) {
      const rawValue = clean(sourceByKey.get(key(question))).slice(0, 500);
      const field = fieldsByKey.get(key(question)) || {};
      let shaped = sanitizeFastFillCandidate(question, rawValue, global.EbayAiFieldParserV790);
      const strictRule = strictFastSupportPolicy(question, field);
      const support = validateStrictFastSupport(question, shaped, supportByKey.get(key(question)) || {}, options, field);
      // Schema V2 is accepted only for ordinary fields. It predates strict support
      // metadata, so strict non-empty facts must not bypass the current policy.
      if (shaped && strictRule.strict && (schemaVersion < 3 || !support.ok)) {
        const reason = schemaVersion < 3
          ? `Strict field ${question} came from obsolete Fill schema V${schemaVersion} without support metadata.`
          : support.reason;
        rejectionReasons[question] = reason;
        warnings.push(`Needs review: ${question} — ${reason}`);
        shaped = "";
      }
      if (shaped) {
        answers[question] = shaped;
        if (strictRule.strict && support.ok) {
          evidence[question] = {
            rawValue,
            confidence: 0.9,
            sources: support.sourceType === "seller_context"
              ? [{ photo: 0, type: "seller_context", evidence: support.evidence }]
              : [{ photo: support.photo, type: support.sourceType, evidence: support.evidence }]
          };
        }
      }
      modelResults[question] = {
        field: question,
        rawValue,
        candidateValues: shaped ? splitValues(shaped) : [],
        value: shaped,
        modelStatus: shaped ? "best_candidate" : "not_filled",
        status: shaped ? "best_candidate" : "not_filled",
        confidence: shaped ? (strictRule.strict ? 0.9 : 0.75) : 0,
        evidenceType: shaped && strictRule.strict ? support.sourceType : "none",
        evidenceScope: "unknown",
        evidence: shaped && strictRule.strict ? support.evidence : "",
        photoSources: shaped && strictRule.strict && support.photo ? [support.photo] : [],
        provider: options.modelProvider || "openai"
      };
    }
    const omitted = ordered.filter(question => !answers[question]);
    for (const question of omitted) {
      if (!rejectionReasons[question]) rejectionReasons[question] = "GPT returned no usable best candidate.";
    }
    return {
      answers,
      evidence,
      facts: [],
      suggestedAnswers: {},
      suggestedCount: 0,
      warnings: Array.from(new Set(warnings)).slice(0, 80),
      omitted,
      missing: omitted,
      rejectionReasons,
      reviewDetails: [],
      modelResults,
      validationIssues: [],
      fieldCatalog: fields,
      photoCatalog: [],
      fillResponseSchemaVersion: schemaVersion || 0,
      primaryProvider: options.modelProvider || "openai"
    };
  }

  function parseFastFillBundle(structured, questions = [], fields = [], options = {}) {
    const ordered = Array.isArray(questions) ? questions.map(clean).filter(Boolean) : [];
    const questionByKey = new Map(ordered.map(question => [key(question), question]));
    const fieldsByKey = fieldMap(fields);
    const answers = {};
    const modelResults = {};
    const warnings = [];
    const seen = new Set();
    for (const item of Array.isArray(structured?.results) ? structured.results.slice(0, 200) : []) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const exactQuestion = questionByKey.get(key(item.field));
      if (!exactQuestion || seen.has(exactQuestion)) continue;
      seen.add(exactQuestion);
      const rawValue = clean(item.value).slice(0, 500);
      const shaped = sanitizeFastFillCandidate(exactQuestion, rawValue, global.EbayAiFieldParserV790);
      if (shaped) answers[exactQuestion] = shaped;
      modelResults[exactQuestion] = {
        field: exactQuestion,
        rawValue,
        candidateValues: shaped ? splitValues(shaped) : [],
        value: shaped,
        modelStatus: "best_candidate",
        status: shaped ? "best_candidate" : "not_filled",
        confidence: shaped ? 0.75 : 0,
        evidenceType: "none",
        evidenceScope: "unknown",
        provider: options.modelProvider || "openai"
      };
    }
    const omitted = ordered.filter(question => !answers[question]);
    return {
      answers,
      evidence: {},
      facts: [],
      suggestedAnswers: {},
      suggestedCount: 0,
      warnings: Array.from(new Set(warnings)).slice(0, 80),
      omitted,
      missing: omitted,
      rejectionReasons: Object.fromEntries(omitted.map(question => [question, "GPT returned no usable best candidate."])),
      reviewDetails: [],
      modelResults,
      validationIssues: [],
      fieldCatalog: fields,
      photoCatalog: [],
      fillResponseSchemaVersion: 1,
      primaryProvider: options.modelProvider || "openai"
    };
  }

  function parseFastFillCompatibility(text, structured, questions = [], fields = [], options = {}) {
    const ordered = Array.isArray(questions) ? questions.map(clean).filter(Boolean) : [];
    const questionByKey = new Map(ordered.map(question => [key(question), question]));
    const rows = [];
    if (structured?.__format === "compact" && Array.isArray(structured.results)) {
      for (const item of structured.results) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        rows.push({ field: item.field || item.name || item.question, value: item.value || item.raw_value || item.rawValue || (Array.isArray(item.candidate_values) ? item.candidate_values.join(", ") : "") });
      }
    } else if (structured?.__format === "legacy" && Array.isArray(structured.answers)) {
      for (const item of structured.answers) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        rows.push({ field: item.field || item.name || item.question, value: item.value || item.answer || (Array.isArray(item.values) ? item.values.join(", ") : "") });
      }
    } else if (structured && Number(structured.ai_response_schema_version || 0) === 3 && Array.isArray(structured.results)) {
      for (const item of structured.results) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        rows.push({ field: item.field, value: item.raw_value || item.value || (Array.isArray(item.candidate_values) ? item.candidate_values.join(", ") : "") });
      }
    } else if (!structured) {
      for (const line of String(text || "").split(/\r?\n/)) {
        const parsed = parseLine(line);
        if (parsed) rows.push(parsed);
      }
    }
    if (!rows.length) return null;
    const answers = {}, modelResults = {}, warnings = [], seen = new Set();
    for (const row of rows) {
      const exactQuestion = questionByKey.get(key(row.field));
      if (!exactQuestion || seen.has(exactQuestion)) continue;
      seen.add(exactQuestion);
      const rawValue = clean(row.value).slice(0, 500);
      const candidate = sanitizeFastFillCandidate(exactQuestion, rawValue, global.EbayAiFieldParserV790);
      if (candidate) answers[exactQuestion] = candidate;
      modelResults[exactQuestion] = { field: exactQuestion, rawValue, candidateValues: candidate ? splitValues(candidate) : [], value: candidate, modelStatus: "best_candidate", status: candidate ? "best_candidate" : "not_filled", confidence: candidate ? 0.75 : 0, evidenceType: "none", evidenceScope: "unknown", provider: options.modelProvider || "openai" };
    }
    const omitted = ordered.filter(question => !answers[question]);
    return { answers, evidence: {}, facts: [], suggestedAnswers: {}, suggestedCount: 0, warnings, omitted, missing: omitted, rejectionReasons: Object.fromEntries(omitted.map(question => [question, "GPT returned no usable best candidate."])), reviewDetails: [], modelResults, validationIssues: [], fieldCatalog: fields, photoCatalog: [], fillResponseSchemaVersion: 0, primaryProvider: options.modelProvider || "openai" };
  }

  function parseAnswerBundle(text, questions = [], fields = [], options = {}) {
    const policyParser = global.EbayAiFieldParserV790;
    const ordered = Array.isArray(questions) ? questions.map(clean).filter(Boolean) : [];
    const questionByKey = new Map(ordered.map(question => [key(question), question]));
    const answers = {};
    const evidence = {};
    const warnings = [];
    const rejectionReasons = {};
    const reviewDetails = [];
    const fieldsByKey = fieldMap(fields);
    const structured = structuredPayload(text);
    const rules = knowledge();
    if (structured && [2, 3].includes(Number(structured.fill_response_schema_version || 0))) return parseFastFillMapBundle(structured, ordered, fields, options);
    if (structured && Number(structured.fill_response_schema_version || 0) === 1) return parseFastFillBundle(structured, ordered, fields, options);
    // V3 is the Review contract itself, so it always keeps Review verification
    // semantics even if a legacy caller forgot to pass reviewMode:true.
    if (structured && Number(structured.ai_response_schema_version || 0) === 3) return parseV3Bundle(structured, ordered, fields, options);
    // Normal Fast Fill never activates evidence/confidence gating, even when a
    // compatible provider returns an older compact/plain shape. Review owns it.
    if (options.reviewMode !== true && options.requireSources !== true) {
      const compatible = parseFastFillCompatibility(text, structured, ordered, fields, options);
      if (compatible) return compatible;
    }
    const facts = structured?.__format === "legacy" ? sanitizeFacts(structured.facts) : [];
    const factsById = new Map(facts.map(fact => [fact.id, fact]));

    function reject(question, reason, neededPhoto = "", reviewMeta = {}) {
      if (!question) return;
      rejectionReasons[question] = rejectionReasons[question] || clean(reason).slice(0, 700);
      const photoRequest = clean(neededPhoto || rules.neededPhoto(question)).slice(0, 500);
      warnings.push(`Needs review: ${question} — ${reason}`);
      if (photoRequest) warnings.push(`Needed photo: ${question} — ${photoRequest}`);
      const proposedValue = clean(reviewMeta?.proposedValue || "").slice(0, 500);
      const confidence = Math.max(0, Math.min(Number(reviewMeta?.confidence || 0), 1));
      const sources = sanitizeSources(reviewMeta?.sources || []);
      const existingIndex = reviewDetails.findIndex(item => key(item?.field) === key(question));
      const detail = { field: question, proposedValue, confidence, sources, reason: clean(reason).slice(0, 700), neededPhoto: photoRequest };
      if (existingIndex >= 0) reviewDetails[existingIndex] = { ...reviewDetails[existingIndex], ...detail };
      else reviewDetails.push(detail);
    }

    if (structured?.__format === "compact") {
      for (const item of structured.results.slice(0, Math.max(200, ordered.length))) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const requested = clean(item.field || item.name || item.question);
        const exactQuestion = questionByKey.get(key(requested));
        if (!exactQuestion) {
          if (requested) warnings.push(`Ignored unrequested field: ${requested}`);
          continue;
        }
        if (answers[exactQuestion] || reviewDetails.some(entry => key(entry?.field) === key(exactQuestion))) continue;
        const status = key(item.status).replace(/ /g, "_");
        const rawValue = clean(item.value || item.raw_value || item.rawValue || "");
        const confidence = Math.max(0, Math.min(Number(item.confidence || 0), 1));
        const photo = Number(item.photo || 0);
        const sourceType = key(item.source_type || item.sourceType || "none").replace(/ /g, "_");
        const evidenceText = clean(item.evidence || "").slice(0, 500);
        const sources = Number.isInteger(photo) && photo >= 1 && photo <= 10 && ALLOWED_SOURCE_TYPES.has(sourceType) && evidenceText
          ? [{ photo, type: sourceType, evidence: evidenceText }]
          : [];
        const reason = clean(item.reason || (status === "needs_review" ? "API marked this field for review." : "")).slice(0, 500);
        const neededPhoto = clean(item.needed_photo || item.neededPhoto || "").slice(0, 500);

        if (status !== "confirmed") {
          reject(exactQuestion, reason || "Answer is not directly confirmed.", neededPhoto, { proposedValue: rawValue, confidence, sources });
          continue;
        }
        if (!rawValue) {
          reject(exactQuestion, "Confirmed result did not contain a value.", neededPhoto, { proposedValue: "", confidence, sources });
          continue;
        }
        if (!sources.length) {
          reject(exactQuestion, "Confirmed result did not contain a valid direct PHOTO source.", neededPhoto, { proposedValue: rawValue, confidence, sources: [] });
          continue;
        }
        const fieldPolicy = rules.policy(exactQuestion);
        if (confidence < Number(fieldPolicy.minConfidence || 0.75)) {
          reject(exactQuestion, `Confidence ${confidence.toFixed(2)} is below the field threshold ${Number(fieldPolicy.minConfidence || 0.75).toFixed(2)}.`, neededPhoto, { proposedValue: rawValue, confidence, sources });
          continue;
        }
        const allowedTypes = new Set(fieldPolicy.allowedSourceTypes || []);
        if (allowedTypes.size && !sources.some(source => allowedTypes.has(source.type))) {
          reject(exactQuestion, `Evidence type does not satisfy ${fieldPolicy.evidenceClass || "the field policy"}.`, neededPhoto, { proposedValue: rawValue, confidence, sources });
          continue;
        }
        const shaped = sanitizeAndShapeAnswer(exactQuestion, rawValue, splitValues(rawValue), fieldsByKey.get(key(exactQuestion)), policyParser, warnings);
        if (!shaped) {
          reject(exactQuestion, "Value is unsafe, unsupported, or unavailable in current eBay options.", neededPhoto, { proposedValue: rawValue, confidence, sources });
          continue;
        }
        const consistencyError = factAnswerConsistencyError(exactQuestion, shaped, rawValue, [], sources);
        if (consistencyError) {
          reject(exactQuestion, consistencyError, neededPhoto, { proposedValue: rawValue, confidence, sources });
          continue;
        }
        const semanticError = invalidFieldSemantics(exactQuestion, shaped, rawValue, answers);
        if (semanticError) {
          reject(exactQuestion, semanticError, neededPhoto, { proposedValue: rawValue, confidence, sources });
          continue;
        }
        answers[exactQuestion] = shaped;
        evidence[exactQuestion] = { rawValue: rawValue.slice(0, 500), confidence, factIds: [], sources, facts: [] };
      }
    } else if (structured?.__format === "legacy") {
      for (const item of structured.answers.slice(0, 200)) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const requested = clean(item.field || item.name || item.question);
        const exactQuestion = questionByKey.get(key(requested));
        if (!exactQuestion) {
          if (requested) warnings.push(`Ignored unrequested field: ${requested}`);
          continue;
        }
        if (answers[exactQuestion]) continue;
        const sources = sanitizeSources(item.sources || item.evidence);
        if (!sources.length) {
          reject(exactQuestion, "No valid direct PHOTO source was supplied.");
          continue;
        }
        const values = Array.isArray(item.values) ? item.values.map(clean).filter(Boolean) : splitValues(item.value || item.answer || "");
        if (!values.length) {
          reject(exactQuestion, "No usable selected value was supplied.");
          continue;
        }
        const rawValue = clean(item.raw_value || item.rawValue || values.join(", "));
        const confidence = Math.max(0, Math.min(Number(item.confidence || 0), 1));
        const fieldPolicy = rules.policy(exactQuestion);
        if (confidence < Number(fieldPolicy.minConfidence || 0.75)) {
          reject(exactQuestion, `Confidence ${confidence.toFixed(2)} is below the field threshold ${Number(fieldPolicy.minConfidence || 0.75).toFixed(2)}.`);
          continue;
        }
        const factIds = [...new Set((Array.isArray(item.fact_ids) ? item.fact_ids : []).map(clean).filter(Boolean))].slice(0, 10);
        const supportingFacts = factIds.map(id => factsById.get(id)).filter(Boolean);
        if (options.requireFacts === true && (!factIds.length || supportingFacts.length !== factIds.length)) {
          reject(exactQuestion, "Answer does not reference valid extracted facts.");
          continue;
        }
        if (supportingFacts.length && !sourceOverlap(sources, supportingFacts)) {
          reject(exactQuestion, "Answer sources do not overlap its cited facts.");
          continue;
        }
        const allowedTypes = new Set(fieldPolicy.allowedSourceTypes || []);
        if (allowedTypes.size && !sources.some(source => allowedTypes.has(source.type))) {
          reject(exactQuestion, `Evidence type does not satisfy ${fieldPolicy.evidenceClass || "the field policy"}.`);
          continue;
        }
        const requiredKinds = new Set(fieldPolicy.requiredFactKinds || []);
        if (options.requireFacts === true && requiredKinds.size && !supportingFacts.some(fact => requiredKinds.has(fact.kind))) {
          reject(exactQuestion, `Extracted facts do not satisfy ${fieldPolicy.evidenceClass || "the field policy"}.`);
          continue;
        }
        if (supportingFacts.some(fact => fact.confidence < Number(fieldPolicy.minConfidence || 0.75))) {
          reject(exactQuestion, "A cited fact is below the field confidence threshold.");
          continue;
        }
        const shaped = sanitizeAndShapeAnswer(exactQuestion, rawValue, values, fieldsByKey.get(key(exactQuestion)), policyParser, warnings);
        if (!shaped) {
          reject(exactQuestion, "Value is unsafe, unsupported, or unavailable in current eBay options.");
          continue;
        }
        const consistencyError = (supportingFacts.length || options.requireFacts === true)
          ? factAnswerConsistencyError(exactQuestion, shaped, rawValue, supportingFacts, sources)
          : "";
        if (consistencyError) {
          reject(exactQuestion, consistencyError);
          continue;
        }
        const semanticError = invalidFieldSemantics(exactQuestion, shaped, rawValue, answers);
        if (semanticError) {
          reject(exactQuestion, semanticError);
          continue;
        }
        answers[exactQuestion] = shaped;
        evidence[exactQuestion] = { rawValue: rawValue.slice(0, 500), confidence, factIds, sources, facts: supportingFacts };
      }
      for (const item of Array.isArray(structured.review) ? structured.review.slice(0, 200) : []) {
        const requested = clean(item?.field || item?.name);
        const exactQuestion = questionByKey.get(key(requested)) || requested;
        const reason = clean(item?.reason || item?.message).slice(0, 500);
        const neededPhoto = clean(item?.needed_photo || item?.neededPhoto).slice(0, 500);
        const proposedValue = clean(item?.proposed_value || item?.proposedValue || "").slice(0, 500);
        const confidence = Math.max(0, Math.min(Number(item?.confidence || 0), 1));
        const sources = sanitizeSources(item?.sources || []);
        if (exactQuestion && reason && !answers[exactQuestion]) reject(exactQuestion, reason, neededPhoto, { proposedValue, confidence, sources });
      }
    } else if (options.requireSources === true) {
      warnings.push("Needs review: OpenAI response was not valid evidence-first structured JSON.");
      for (const question of ordered) rejectionReasons[question] = "OpenAI response was not valid evidence-first structured JSON.";
    } else {
      for (const line of String(text || "").split(/\r?\n/)) {
        const parsed = parseLine(line);
        if (!parsed) continue;
        const exactQuestion = questionByKey.get(key(parsed.field));
        if (!exactQuestion) {
          warnings.push(`Ignored unrequested field: ${parsed.field}`);
          continue;
        }
        const value = sanitizeAndShapeAnswer(exactQuestion, parsed.value, splitValues(parsed.value), fieldsByKey.get(key(exactQuestion)), policyParser, warnings);
        if (!value) {
          warnings.push(`Ignored unsafe or unsupported answer: ${exactQuestion}`);
          continue;
        }
        answers[exactQuestion] = value;
      }
    }

    const omitted = ordered.filter(question => !Object.prototype.hasOwnProperty.call(answers, question));
    for (const question of omitted) {
      if (!reviewDetails.some(item => key(item?.field) === key(question))) {
        reject(question, rejectionReasons[question] || "No directly confirmed answer was returned.", rules.neededPhoto(question), { proposedValue: "", confidence: 0, sources: [] });
      }
    }
    return {
      answers,
      evidence,
      facts,
      warnings: Array.from(new Set(warnings)).slice(0, 80),
      omitted,
      missing: [],
      rejectionReasons,
      reviewDetails
    };
  }

  function toFieldValueText(bundle = {}, questions = []) {
    const answers = bundle.answers || {};
    const order = Array.isArray(questions) && questions.length ? questions : Object.keys(answers);
    return order.filter(question => answers[question]).map(question => `${question} - ${answers[question]}`).join("\n");
  }

  function recoveryQuestions(bundle = {}, questions = [], fields = [], limit = 12) {
    const answered = bundle.answers || {};
    const reasons = bundle.rejectionReasons || {};
    const rules = knowledge();
    return (Array.isArray(questions) ? questions : [])
      .filter(question => !answered[question])
      .map((question, index) => ({ question, index, priority: rules.recoveryPriority(question), reason: reasons[question] || "No accepted answer was returned." }))
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .slice(0, Math.max(0, Math.min(Number(limit || 0), 20)))
      .map(item => item.question);
  }

  const CRITICAL_RECOVERY_KEYS = new Set([
    "brand", "size", "garment care", "country of origin", "country region of manufacture",
    "country region of origin"
  ]);

  function isCriticalRecoveryField(question) {
    const policy = global.EbayAiItemSpecificsV7100;
    const fieldKey = key(question);
    return CRITICAL_RECOVERY_KEYS.has(fieldKey)
      || policy?.isMaterialField?.(question) === true
      || policy?.isShoeSizeField?.(question) === true;
  }

  function criticalRecoveryQuestions(bundle = {}, questions = [], fields = [], limit = 5) {
    const answered = bundle.answers || {};
    const reasons = bundle.rejectionReasons || {};
    const ordered = Array.isArray(questions) ? questions : [];
    return ordered
      .filter(question => !answered[question] && isCriticalRecoveryField(question))
      .map((question, index) => ({ question, index, reason: clean(reasons[question] || "No accepted answer was returned.") }))
      .sort((a, b) => {
        const aExplicit = /label|photo|source|confidence|fact|evidence|option/i.test(a.reason) ? 0 : 1;
        const bExplicit = /label|photo|source|confidence|fact|evidence|option/i.test(b.reason) ? 0 : 1;
        return aExplicit - bExplicit || a.index - b.index;
      })
      .slice(0, Math.max(0, Math.min(Number(limit || 0), 8)))
      .map(item => item.question);
  }

  function fieldByQuestion(fields = []) {
    return new Map((Array.isArray(fields) ? fields : []).map(field => [key(field?.name || field?.label), field]));
  }

  function strictVerificationQuestions(bundle = {}, questions = [], fields = [], limit = 40) {
    const policy = global.EbayAiItemSpecificsV7100;
    const byKey = fieldByQuestion(fields);
    const ordered = Array.isArray(questions) ? questions : [];
    const answers = bundle.answers || {};
    const reasons = bundle.rejectionReasons || {};
    return ordered
      .map((question, index) => {
        const field = byKey.get(key(question)) || { name: question };
        const strict = policy?.requiresIndependentVerification?.(field) === true;
        const answered = Boolean(clean(answers[question]));
        const criticalMissing = !answered && isCriticalRecoveryField(question);
        if (!strict && !criticalMissing) return null;
        const priority = knowledge().recoveryPriority(question) + (answered ? 200 : 100) + (policy?.isMeasurementOnly?.(question) ? 80 : 0);
        return { question, index, answered, priority, reason: clean(reasons[question] || (answered ? "Independently verify the direct evidence for this accepted strict answer." : "Primary analysis did not return a safe confirmed value.")) };
      })
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .slice(0, Math.max(0, Math.min(Number(limit || 0), 40)))
      .map(item => item.question);
  }

  // V8.23.21: a validated direct primary support record is enough for normal Fill.
  // A second paid read is reserved for weak/rejected/conflicting strict evidence or a
  // genuinely recoverable missing critical fact. Review Mode remains the full verifier.
  function smartStrictVerificationPlan(bundle = {}, questions = [], fields = [], limit = 8) {
    const policy = global.EbayAiItemSpecificsV7100;
    const byKey = fieldByQuestion(fields);
    const ordered = Array.isArray(questions) ? questions : [];
    const answers = bundle.answers || {};
    const reasons = bundle.rejectionReasons || {};
    const modelResults = bundle.modelResults || {};
    const mustVerify = (question, field) => {
      if (isCriticalRecoveryField(question)) return true;
      if (policy?.isContextRequired?.(question) === true) return true;
      if (policy?.isMaterialField?.(question) === true) return true;
      if (policy?.isMeasurementOnly?.(question) === true) return true;
      if (policy?.isExplicitBinaryLabel?.(question) === true) return true;
      if (policy?.isBinaryField?.(field) === true) return true;
      return false;
    };
    const hasStrongDirectPrimarySupport = question => {
      const value = clean(answers[question]);
      const result = modelResults[question] || {};
      const evidenceType = clean(result.evidenceType).toLowerCase();
      const evidenceText = clean(result.evidence);
      const photoSources = Array.isArray(result.photoSources) ? result.photoSources.map(Number).filter(Number.isInteger) : [];
      if (!value || reasons[question]) return false;
      if (result.independentVerification === true && result.localOcrConflict !== true) return true;
      if (!evidenceText || !photoSources.some(photo => photo >= 1 && photo <= 10)) return false;
      if (!['physical_tag', 'measurement', 'visual'].includes(evidenceType)) return false;
      // Visual support is allowed only for named graphic fields; hidden technical facts
      // must still come from a physical tag/measurement before they can skip pass two.
      if (evidenceType === 'visual' && !['character', 'character family'].includes(key(question))) return false;
      return Number(result.confidence || 0) >= 0.9;
    };

    const candidates = [];
    const skippedDirect = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const question = ordered[index];
      const field = byKey.get(key(question)) || { name: question };
      const strict = policy?.requiresIndependentVerification?.(field) === true;
      const answered = Boolean(clean(answers[question]));
      const criticalMissing = !answered && isCriticalRecoveryField(question);
      if (!strict && !criticalMissing) continue;
      if (answered && hasStrongDirectPrimarySupport(question)) {
        skippedDirect.push(question);
        continue;
      }
      const priority = knowledge().recoveryPriority(question) + (answered ? 200 : 100) + (mustVerify(question, field) ? 120 : 0) + (policy?.isMeasurementOnly?.(question) ? 80 : 0);
      candidates.push({ question, index, answered, priority, reason: clean(reasons[question] || (answered ? "Independently verify the direct evidence for this accepted strict answer." : "Primary analysis did not return a safe confirmed value.")) });
    }
    candidates.sort((a, b) => b.priority - a.priority || a.index - b.index);
    return {
      questions: candidates.slice(0, Math.max(0, Math.min(Number(limit || 0), 40))).map(item => item.question),
      skippedDirect
    };
  }

  function mergeStrictVerification(primary = {}, verifier = {}, verificationQuestions = [], allQuestions = []) {
    const result = {
      ...primary,
      answers: { ...(primary.answers || {}) },
      evidence: { ...(primary.evidence || {}) },
      modelResults: { ...(primary.modelResults || {}) },
      rejectionReasons: { ...(primary.rejectionReasons || {}) },
      reviewDetails: [...(primary.reviewDetails || [])],
      warnings: [...(primary.warnings || [])]
    };
    const removed = [], recovered = [], verified = [], conflicts = [];
    const addReview = (question, reason, proposedValue = "", alternateValue = "") => {
      result.rejectionReasons[question] = reason;
      result.reviewDetails = result.reviewDetails.filter(item => key(item?.field) !== key(question));
      result.reviewDetails.push({ field: question, proposedValue, alternateValue, reason, status: "needs_review", modelStatus: "needs_review" });
    };
    for (const question of Array.isArray(verificationQuestions) ? verificationQuestions : []) {
      const primaryValue = clean(primary.answers?.[question]);
      const verifierValue = clean(verifier.answers?.[question]);
      if (primaryValue) {
        if (verifierValue && key(verifierValue) === key(primaryValue)) {
          verified.push(question);
          if (verifier.evidence?.[question]) result.evidence[question] = { ...verifier.evidence[question], independentVerification: true };
          result.modelResults[question] = { ...(result.modelResults[question] || {}), independentVerification: true, verifierValue };
          delete result.rejectionReasons[question];
          continue;
        }
        delete result.answers[question];
        delete result.evidence[question];
        removed.push(question);
        const reason = verifierValue
          ? `Independent strict verification disagreed: primary ${primaryValue}; verifier ${verifierValue}.`
          : "Independent strict verification could not re-confirm the accepted value from direct evidence.";
        if (verifierValue) conflicts.push(question);
        addReview(question, reason, primaryValue, verifierValue);
        result.modelResults[question] = { ...(result.modelResults[question] || {}), value: "", status: verifierValue ? "conflict" : "needs_review", independentVerification: false, primaryValue, verifierValue };
        continue;
      }
      if (verifierValue) {
        result.answers[question] = verifierValue;
        if (verifier.evidence?.[question]) result.evidence[question] = { ...verifier.evidence[question], independentVerification: true };
        result.modelResults[question] = { ...(verifier.modelResults?.[question] || {}), independentVerification: true, verifierValue };
        delete result.rejectionReasons[question];
        result.reviewDetails = result.reviewDetails.filter(item => key(item?.field) !== key(question));
        recovered.push(question);
      }
    }
    const answeredKeys = new Set(Object.keys(result.answers).map(key));
    result.omitted = (Array.isArray(allQuestions) ? allQuestions : []).filter(question => !answeredKeys.has(key(question)));
    result.warnings = Array.from(new Set([...result.warnings, ...removed.map(question => `Needs review: ${question} — independent strict verification did not confirm the primary answer.`)])).slice(0, 100);
    result.strictVerification = { questions: [...verificationQuestions], verified, recovered, removed, conflicts };
    return result;
  }

  function dropUnverifiedStrictAnswers(primary = {}, verificationQuestions = [], allQuestions = [], reason = "Independent strict verification was unavailable.") {
    const emptyVerifier = { answers: {}, evidence: {}, modelResults: {} };
    return mergeStrictVerification(primary, emptyVerifier, verificationQuestions, allQuestions);
  }

  function priorityQuestions(questions = []) {
    const rules = knowledge();
    return [...questions].sort((a, b) => rules.recoveryPriority(b) - rules.recoveryPriority(a));
  }

  function mergeAnswerBundles(primary = {}, secondary = {}, questions = []) {
    const answers = { ...(primary.answers || {}) };
    const evidence = { ...(primary.evidence || {}) };
    const modelResults = { ...(primary.modelResults || {}) };
    const suggestedAnswers = { ...(primary.suggestedAnswers || {}) };
    for (const [question, value] of Object.entries(secondary.answers || {})) {
      if (!answers[question]) {
        answers[question] = value;
        if (secondary.evidence?.[question]) evidence[question] = secondary.evidence[question];
        if (secondary.modelResults?.[question]) modelResults[question] = secondary.modelResults[question];
        delete suggestedAnswers[question];
      }
    }
    const rejectionReasons = { ...(primary.rejectionReasons || {}) };
    for (const question of Object.keys(answers)) delete rejectionReasons[question];
    for (const [question, reason] of Object.entries(secondary.rejectionReasons || {})) if (!answers[question]) rejectionReasons[question] = reason;
    const omitted = (Array.isArray(questions) ? questions : []).filter(question => !answers[question]);
    const acceptedKeys = new Set(Object.keys(answers).map(key));
    const warnings = Array.from(new Set([...(primary.warnings || []), ...(secondary.warnings || [])]))
      .filter(message => {
        const match = clean(message).match(/^(?:Needs review|Needed photo):\s*([^—:]+?)(?:\s*[—:]|$)/i);
        return !match || !acceptedKeys.has(key(match[1]));
      })
      .slice(0, 100);
    return {
      ...primary,
      answers,
      evidence,
      modelResults,
      suggestedAnswers,
      suggestedCount: Object.keys(suggestedAnswers).length,
      facts: [...(primary.facts || []), ...(secondary.facts || [])].slice(0, 500),
      warnings,
      omitted,
      missing: [],
      rejectionReasons,
      reviewDetails: [...(primary.reviewDetails || []), ...(secondary.reviewDetails || [])].filter(item => !answers[item.field]).slice(0, 200),
      validationIssues: Array.from(new Set([...(primary.validationIssues || []), ...(secondary.validationIssues || [])])).slice(0, 100),
      fieldCatalog: primary.fieldCatalog || secondary.fieldCatalog || [],
      photoCatalog: primary.photoCatalog || secondary.photoCatalog || []
    };
  }

  function targetedReviewQuestions(bundle = {}, questions = [], fields = [], limit = 10) {
    const strict = new Set((v3Policies().high_risk?.fields || []).map(key));
    const results = bundle.modelResults || {};
    return (Array.isArray(questions) ? questions : []).map((question, index) => {
      const result = results[question] || {};
      const group = fieldPolicyGroup(question);
      const threshold = group.name === "high_risk" ? 1 : Number(group.confidence_threshold ?? 0.82);
      const weak = result.modelStatus === "needs_review" || !result.value || Number(result.confidence || 0) < threshold || (strict.has(key(question)) && !(result.evidenceType === "physical_tag" && result.evidenceScope === "whole_item"));
      return { question, index, weak, priority: knowledge().recoveryPriority(question) + (strict.has(key(question)) ? 100 : 0) };
    }).filter(item => item.weak).sort((a,b)=>b.priority-a.priority||a.index-b.index).slice(0, Math.max(0, Math.min(Number(limit || 0), 12))).map(item=>item.question);
  }

  function mergeReviewerBundles(primary = {}, reviewer = {}, questions = []) {
    const result = { ...primary, answers: { ...(primary.answers || {}) }, evidence: { ...(primary.evidence || {}) }, suggestedAnswers: { ...(primary.suggestedAnswers || {}) }, modelResults: { ...(primary.modelResults || {}) }, rejectionReasons: { ...(primary.rejectionReasons || {}) }, reviewDetails: [...(primary.reviewDetails || [])], validationIssues: Array.from(new Set([...(primary.validationIssues || []), ...(reviewer.validationIssues || [])])) };
    const reviewerResults = reviewer.modelResults || {};
    const removeReview = question => { result.reviewDetails = result.reviewDetails.filter(item => key(item?.field) !== key(question)); delete result.rejectionReasons[question]; };
    for (const question of Array.isArray(questions) ? questions : Object.keys(reviewerResults)) {
      const p = result.modelResults[question] || {}, r = reviewerResults[question];
      if (!r) continue;
      const pValue = clean(p.value || result.suggestedAnswers[question] || result.answers[question]);
      const rValue = clean(r.value || reviewer.suggestedAnswers?.[question] || reviewer.answers?.[question]);
      const same = pValue && rValue && key(pValue) === key(rValue);
      if (same) {
        const direct = [p, r].find(item => ["confirmed_by_tag", "confirmed_by_photo"].includes(item.status));
        if (direct) {
          result.answers[question] = direct.value;
          result.evidence[question] = { ...(direct.provider === "anthropic" ? reviewer.evidence?.[question] : result.evidence?.[question]), reviewer: r };
          result.modelResults[question] = { ...p, reviewer: r, value: direct.value, status: direct.status };
          delete result.suggestedAnswers[question]; removeReview(question);
        } else {
          delete result.answers[question]; result.suggestedAnswers[question] = pValue;
          result.modelResults[question] = { ...p, reviewer: r, value: pValue, status: "supported_by_two_models" };
          removeReview(question); result.rejectionReasons[question] = "Both models agree, but direct evidence is insufficient.";
          result.reviewDetails.push({ field: question, fieldId: p.fieldId || r.fieldId, proposedValue: pValue, confidence: Math.max(Number(p.confidence||0),Number(r.confidence||0)), sources: [...(p.sources||[]),...(r.sources||[])], reason: result.rejectionReasons[question], modelStatus: "needs_review", status: "supported_by_two_models", primary: p, reviewer: r });
        }
      } else if (rValue && !pValue && ["confirmed_by_tag","confirmed_by_photo"].includes(r.status)) {
        result.answers[question] = rValue; result.evidence[question] = reviewer.evidence?.[question] || { reviewer: r }; result.modelResults[question] = { ...p, reviewer: r, value: rValue, status: r.status }; delete result.suggestedAnswers[question]; removeReview(question);
      } else if (pValue && rValue && !same) {
        delete result.answers[question]; delete result.suggestedAnswers[question];
        result.modelResults[question] = { ...p, reviewer: r, primaryValue: pValue, reviewerValue: rValue, primaryStatus: p.status, value: "", status: "conflict" };
        removeReview(question); result.rejectionReasons[question] = `Primary selected ${pValue}; Claude selected ${rValue}.`;
        result.reviewDetails.push({ field: question, fieldId: p.fieldId || r.fieldId, proposedValue: pValue, alternateValue: rValue, confidence: Math.max(Number(p.confidence||0), Number(r.confidence||0)), sources: [...(p.sources||[]),...(r.sources||[])], reason: result.rejectionReasons[question], modelStatus: "needs_review", status: "conflict", primary: p, reviewer: r });
      } else {
        result.modelResults[question] = { ...p, reviewer: r };
      }
    }
    result.suggestedCount = Object.keys(result.suggestedAnswers).length;
    result.omitted = (Array.isArray(questions)?questions:[]).filter(q=>!result.answers[q]);
    return result;
  }

  function coverageScore(result = {}) {
    const statusWeight = { confirmed_by_tag: 80, confirmed_by_photo: 60, supported_by_two_models: 45, likely_correct: 35, suggested: 20, needs_review: 10, conflict: 0 };
    const evidenceWeight = { physical_tag: 35, measurement: 30, visual: 20, none: 0 };
    return Number(statusWeight[result.status] || 0)
      + Number(evidenceWeight[result.evidenceType] || 0)
      + (result.evidenceScope === "whole_item" ? 10 : result.evidenceScope === "outer_shell" ? 7 : 0)
      + Math.max(0, Math.min(1, Number(result.confidence || 0))) * 20
      + (result.modelStatus === "confirmed" ? 8 : 0);
  }

  function completeCoverageValue(bundle = {}, question = "") {
    const result = bundle.modelResults?.[question] || {};
    if (result.autoFillAllowed === false || result.ocrStatus === "ocr_conflict" || result.resolverStatus === "ambiguous_size_group") return "";
    const suggested = clean(bundle.suggestedAnswers?.[question]);
    if (result.status === "conflict") {
      const primaryValue = clean(result.primaryValue || suggested || result.rawValue || (Array.isArray(result.candidateValues) ? result.candidateValues.join(", ") : ""));
      const reviewer = result.reviewer || {};
      const reviewerValue = clean(result.reviewerValue || reviewer.value || (Array.isArray(reviewer.candidateValues) ? reviewer.candidateValues.join(", ") : ""));
      if (!primaryValue) return reviewerValue;
      if (!reviewerValue) return primaryValue;
      return coverageScore(reviewer) > coverageScore({ ...result, status: result.primaryStatus || result.originalStatus || "likely_correct" }) ? reviewerValue : primaryValue;
    }
    return clean(suggested || result.value || (Array.isArray(result.candidateValues) ? result.candidateValues.join(", ") : ""));
  }

  function applyFillPolicy(bundle = {}, questions = [], mode = "safe") {
    const fillPolicy = mode === "safe" ? "safe" : mode === "review_assisted" ? "review_assisted" : "complete_coverage";
    const next = { ...bundle, answers: { ...(bundle.answers || {}) }, fillPolicy };
    if (fillPolicy === "safe") return next;
    const strict = new Set((v3Policies().strict_both_modes?.fields || []).map(key));
    const coverageFilled = [];
    for (const question of Array.isArray(questions) ? questions : []) {
      const result = next.modelResults?.[question] || {};
      if (result.autoFillAllowed === false || result.ocrStatus === "ocr_conflict") {
        delete next.answers[question];
        continue;
      }
      if (next.answers[question]) continue;
      if (fillPolicy === "review_assisted") {
        if (strict.has(key(question))) continue;
        const value = clean(next.suggestedAnswers?.[question] || result.value);
        if (value && ["supported_by_two_models", "likely_correct", "suggested"].includes(result.status)) next.answers[question] = value;
        continue;
      }
      const value = completeCoverageValue(next, question);
      if (!value) continue;
      next.answers[question] = value;
      coverageFilled.push(question);
      next.modelResults[question] = { ...result, value, coverageSelected: true, originalStatus: result.status || "needs_review" };
    }
    next.coverageFilled = coverageFilled;
    next.coverageReadyCount = Object.keys(next.answers).length;
    next.coverageUnfilled = (Array.isArray(questions) ? questions : []).filter(question => !next.answers[question]);
    return next;
  }

  function combineUsage(left = {}, right = {}) {
    const inputTokens = Number(left.inputTokens || left.prompt_tokens || 0) + Number(right.inputTokens || right.prompt_tokens || 0);
    const outputTokens = Number(left.outputTokens || left.completion_tokens || 0) + Number(right.outputTokens || right.completion_tokens || 0);
    const reported = left.reported === true || right.reported === true;
    return {
      inputTokens,
      cachedInputTokens: Number(left.cachedInputTokens || 0) + Number(right.cachedInputTokens || 0),
      cacheWriteTokens: Number(left.cacheWriteTokens || 0) + Number(right.cacheWriteTokens || 0),
      uncachedInputTokens: Number(left.uncachedInputTokens || 0) + Number(right.uncachedInputTokens || 0),
      imageInputTokens: Number(left.imageInputTokens || 0) + Number(right.imageInputTokens || 0),
      textInputTokens: Number(left.textInputTokens || 0) + Number(right.textInputTokens || 0),
      outputTokens,
      reasoningTokens: Number(left.reasoningTokens || 0) + Number(right.reasoningTokens || 0),
      totalTokens: inputTokens + outputTokens,
      cost: Number(left.cost || 0) + Number(right.cost || 0),
      reported,
      source: reported ? "provider" : "estimate",
      costSource: reported ? "request-ledger-aggregate" : "estimate"
    };
  }

  global.EbayCoreAiAnswerProcessorV800 = Object.freeze({
    parseLine,
    parseAnswerBundle,
    parseFastFillCompatibility,
    toFieldValueText,
    recoveryQuestions,
    criticalRecoveryQuestions,
    strictVerificationQuestions,
    smartStrictVerificationPlan,
    mergeStrictVerification,
    dropUnverifiedStrictAnswers,
    targetedReviewQuestions,
    priorityQuestions,
    mergeAnswerBundles,
    mergeReviewerBundles,
    applyFillPolicy,
    combineUsage,
    enforceFieldShape,
    splitValues,
    structuredPayload,
    sanitizeSources,
    sanitizeFacts,
    resolveCompositeSizeOption
  });
})(globalThis);

/* ===== REQUEST BUILDER ===== */
/* Provider-specific request body construction. No GPT instruction text lives here. */
(function initEbayAiRequestBuilder(global) {
  "use strict";

  function promptSource() {
    const prompts = global.EbayAiPromptV711;
    if (!prompts) throw new Error("AI prompt module is not loaded.");
    return prompts;
  }

  function normalizeBaseUrl(input) {
    let value = String(input || "").trim();
    if (!value) return "";
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    return value.replace(/\/+$/, "");
  }

  function normalizePath(input) {
    let value = String(input || "").trim() || "/v1/chat/completions";
    if (!value.startsWith("/")) value = `/${value}`;
    return value;
  }

  function buildEndpoint(settings = {}) {
    const base = normalizeBaseUrl(settings.apiBaseUrl || "");
    if (!base) throw new Error("API Base URL is empty.");
    return `${base}${normalizePath(settings.apiPath || "/v1/chat/completions")}`;
  }

  function prefersMaxCompletionTokens(settings = {}) {
    const model = String(settings.apiModel || "").trim().toLowerCase();
    let host = "";
    try { host = new URL(normalizeBaseUrl(settings.apiBaseUrl || "")).hostname.toLowerCase(); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    if (host === "api.openai.com") return true;
    return /(?:^|\/)(?:gpt-5(?:[.:-]|$)|o[134](?:[.:-]|$))/.test(model);
  }

  function applyTokenLimit(body, settings, value) {
    delete body.max_tokens;
    delete body.max_completion_tokens;
    body[prefersMaxCompletionTokens(settings) ? "max_completion_tokens" : "max_tokens"] = value;
    return body;
  }

  function swapTokenLimitParameter(body) {
    const next = { ...body };
    if (Object.prototype.hasOwnProperty.call(next, "max_tokens")) {
      next.max_completion_tokens = next.max_tokens;
      delete next.max_tokens;
      return next;
    }
    if (Object.prototype.hasOwnProperty.call(next, "max_completion_tokens")) {
      next.max_tokens = next.max_completion_tokens;
      delete next.max_completion_tokens;
      return next;
    }
    return null;
  }

  function isTokenParameterCompatibilityError(status, text) {
    return Number(status) === 400
      && /(?:max_tokens|max_completion_tokens)/i.test(String(text || ""))
      && /(?:unsupported|not supported|unknown parameter|invalid.*parameter)/i.test(String(text || ""));
  }

  function effectiveOutputTokenLimit(settings = {}) {
    const raw = Number(settings.maxOutputTokens);
    const requested = Math.max(300, Math.min(Number.isFinite(raw) ? raw : 10000, 12000));
    const modeCap = settings.tokenMode === "quality" ? 10000 : settings.tokenMode === "cheap" ? 4500 : 8000;
    return Math.min(requested, modeCap);
  }

  function itemSpecificsOutputLimit(settings = {}, options = {}) {
    const questionCount = Math.max(1, Number(options.questionCount || options.questions?.length || options.schemaQuestions?.length || 1));
    const reviewMode = options.reviewMode === true;
    const modeCap = settings.tokenMode === "quality" ? 10000 : settings.tokenMode === "cheap" ? 4500 : 8000;
    if (!reviewMode) {
      // Fast Fill returns one compact answer map. Keep enough room for low-effort reasoning
      // and every answer, but do not give a small listing an unnecessary 8–10k ceiling.
      const reasoningReserve = supportsReasoning(settings) ? 1400 : 400;
      const fastNeed = Math.max(2000, 650 + questionCount * 70 + reasoningReserve);
      return Math.min(modeCap, Math.min(effectiveOutputTokenLimit(settings), fastNeed));
    }
    const reviewNeed = Math.max(3000, 1200 + questionCount * 240 + (supportsReasoning(settings) ? 1600 : 400));
    return Math.min(modeCap, Math.max(effectiveOutputTokenLimit(settings), reviewNeed));
  }

  function isOpenAiHost(settings = {}) {
    try { return new URL(normalizeBaseUrl(settings.apiBaseUrl || "")).hostname.toLowerCase() === "api.openai.com"; }
    catch (_) { return false; }
  }

  function usesResponsesApi(settings = {}) {
    const path = normalizePath(settings.apiPath || "");
    // Respect the exact configured endpoint. Never switch a saved Chat Completions
    // profile to Responses because of an unrelated setting.
    return /\/v1\/responses\/?$/i.test(path);
  }

  function supportsReasoning(settings = {}) {
    if (!isOpenAiHost(settings)) return false;
    return /^(?:gpt-5|o[134])(?:[.:-]|$)/.test(String(settings.apiModel || "").trim().toLowerCase());
  }

  function reasoningEffort(settings = {}, stage = "primary") {
    // V8.23.21: strict verification is a bounded evidence re-read, not a broad
    // reasoning task. Keep Quality at HIGH, but use LOW for latency-sensitive
    // Balanced/Cheap recovery. Output headroom and evidence policy stay unchanged.
    if (stage === "recovery") return settings.tokenMode === "quality" ? "high" : "low";
    if (settings.tokenMode === "quality") return "medium";
    return "low";
  }

  function imageUrl(image) {
    // For eBay gallery photos prefer the canonical high-resolution URL created by
    // snapshot/photo selection. Uploaded data URLs remain byte-for-byte unchanged.
    return image?.dataUrl || image?.canonicalUrl || image?.url || image?.src || "";
  }

  function supportedImages(images) {
    const selector = global.EbayAiPhotoSelectorV790;
    return selector?.filterPhotos ? selector.filterPhotos(images || []) : (images || []);
  }

  // Photos that carry the small printed text the strict fields depend on
  // (composition, size, brand, care, measurements). Roles are matched first;
  // when a photo has no role we fall back to the previous text matching so
  // existing saved photos keep behaving exactly as before.
  const EVIDENCE_TEXT_PATTERN = /tag|label|brand|size|material|care|made in|measurement|ruler|tape/;
  const EVIDENCE_ROLES = new Set([
    "tag", "care_tag", "brand_tag", "size_tag", "composition_tag",
    "label", "measurement", "measurements", "composition"
  ]);

  function normalizedRole(image) {
    return String(image?.role || image?.photoRole || "")
      .trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function describeImage(image) {
    return String(`${image?.role || ""} ${image?.kind || ""} ${image?.name || ""} ${image?.alt || ""} ${image?.photoCategory || ""}`).toLowerCase();
  }

  function isEvidencePhoto(image) {
    const role = normalizedRole(image);
    if (role && (EVIDENCE_ROLES.has(role) || EVIDENCE_TEXT_PATTERN.test(role))) return true;
    return EVIDENCE_TEXT_PATTERN.test(describeImage(image));
  }

  function photoLabel(image, index) {
    const role = normalizedRole(image);
    const descriptors = [image?.kind, image?.name, image?.alt]
      .map(value => String(value || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 2);
    const parts = [];
    const photoId = String(image?.photoId || image?.photo_id || `photo_${index + 1}`).trim();
    if (photoId) parts.push(`PHOTO_ID: ${photoId}`);
    if (role) parts.push(`ROLE HINT: ${role.replace(/_/g, " ")}`);
    if (descriptors.length) parts.push(descriptors.join(" / "));
    return `PHOTO ${index + 1}${parts.length ? ` — ${parts.join(" — ")}` : ""}`;
  }

  function imageDetail(image, settings = {}, stage = "primary") {
    // Recovery is always a targeted evidence re-read. PRIMARY is different:
    // when local Vision OCR already has a very strong direct-label read, the
    // label can stay LOW-detail for GPT because the deterministic Local Evidence
    // Engine will verify/recover that fact after the primary pass. If local OCR
    // is weak/ambiguous, promote the label to HIGH instead. This removes paid
    // duplicate reading without weakening the evidence gate.
    if (stage === "recovery") return "high";
    if (image?.forceHighDetail === true) return "high";
    if (stage === "primary" && image?.localOcrStrongEvidenceCandidate === true && image?.localOcrNeedsHighDetail !== true) return "low";
    const evidence = isEvidencePhoto(image);
    if (settings.tokenMode === "cheap") return evidence ? "high" : "low";
    if (evidence) return "high";
    if (settings.tokenMode === "quality") return "high";
    // V8.23.21: ordinary Balanced visual photos use LOW detail. HIGH is reserved
    // for explicit/locally detected label evidence and the targeted recovery pass.
    // Color/style/pattern/shape remain visually available at LOW detail, while
    // tiny printed facts are protected by local OCR and high-detail recovery.
    return "low";
  }

  function chatContent(prompt, images, settings = {}, stage = "primary") {
    const content = [{ type: "text", text: prompt }];
    supportedImages(images).forEach((image, index) => {
      const url = imageUrl(image);
      if (!url) return;
      content.push({ type: "text", text: photoLabel(image, index) });
      content.push({ type: "image_url", image_url: { url, detail: imageDetail(image, settings, stage) } });
    });
    return content;
  }

  function responsesContent(prompt, images, settings = {}, stage = "primary") {
    const content = [{ type: "input_text", text: prompt }];
    supportedImages(images).forEach((image, index) => {
      const url = imageUrl(image);
      if (!url) return;
      content.push({ type: "input_text", text: photoLabel(image, index) });
      content.push({ type: "input_image", image_url: url, detail: imageDetail(image, settings, stage) });
    });
    return content;
  }

  function customImages(images) {
    return supportedImages(images).map(image => ({
      name: image.name,
      kind: image.kind || "image",
      url: image.canonicalUrl || image.url || image.src || "",
      data_url: image.dataUrl || "",
      alt: image.alt || "",
      role: image.role || "",
      photo_id: image.photoId || image.photo_id || ""
    }));
  }

  function buildOpenAiCompatibleBody(settings, prompt, images) {
    const stage = "primary";
    const body = {
      model: settings.apiModel,
      messages: [
        { role: "system", content: promptSource().getStructuredJsonSystemInstructions() },
        { role: "user", content: chatContent(prompt, images, settings, stage) }
      ]
    };
    if (!prefersMaxCompletionTokens(settings)) body.temperature = 0.2;
    applyTokenLimit(body, settings, effectiveOutputTokenLimit(settings));
    if (settings.apiMode === "openai-compatible") body.response_format = { type: "json_object" };
    return body;
  }

  function buildOpenAiResponsesJsonBody(settings, prompt, images, { test = false, enableWebSearch = false, stage = "primary" } = {}) {
    const body = {
      model: settings.apiModel,
      store: false,
      instructions: promptSource().getResponsesJsonInstructions({ test, stage }),
      input: [{ role: "user", content: responsesContent(prompt, images, settings, stage) }],
      max_output_tokens: test ? 100 : effectiveOutputTokenLimit(settings)
    };
    // A connectivity test does not need JSON mode. This avoids provider errors
    // that require an explicit JSON instruction when json_object is enabled.
    if (!test) body.text = { format: { type: "json_object" } };
    if (!test && enableWebSearch) body.tools = [{ type: "web_search" }];
    return body;
  }

  function buildCustomJsonBody(settings, prompt, images) {
    const body = {
      model: settings.apiModel,
      prompt,
      images: customImages(images),
      output: promptSource().getCustomJsonOutputInstructions(),
      safety: promptSource().getStructuredSafetyPolicy()
    };
    if (settings.apiMode === "local-proxy") {
      body.settings = {
        tokenMode: settings.tokenMode || "balanced",
        maxOutputTokens: String(effectiveOutputTokenLimit(settings))
      };
    }
    return body;
  }

  function itemSpecificsSchemaSpec(options = {}, images = []) {
    return {
      name: options.stage === "recovery" ? "ebay_item_specific_repair" : "ebay_item_specific_answers",
      strict: true,
      schema: (options.reviewMode === true
        ? (promptSource().getItemSpecificsJsonSchemaV3 || promptSource().getItemSpecificsJsonSchema)
        : (promptSource().getItemSpecificsFastFillJsonSchema || promptSource().getItemSpecificsJsonSchema))({
        questions: options.schemaQuestions || options.questions || [],
        fields: options.schemaFields || options.fields || [],
        maxPhotos: Math.max(1, Math.min(supportedImages(images).length || 10, 10))
      })
    };
  }

  function buildItemSpecificsChatBody(settings, prompt, images, options = {}) {
    const structured = isOpenAiHost(settings);
    const body = {
      model: settings.apiModel,
      messages: [
        {
          role: "system",
          content: options.systemInstructions || (structured
            ? promptSource().getItemSpecificsStructuredSystemInstructions({ repair: options.stage === "recovery", reviewMode: options.reviewMode === true })
            : promptSource().getItemSpecificsSystemInstructions({ reviewMode: options.reviewMode === true }))
        },
        { role: "user", content: chatContent(prompt, images, settings, options.stage || "primary") }
      ]
    };
    if (structured) body.response_format = { type: "json_schema", json_schema: itemSpecificsSchemaSpec(options, images) };
    if (supportsReasoning(settings)) body.reasoning_effort = reasoningEffort(settings, options.stage || "primary");
    if (!prefersMaxCompletionTokens(settings)) body.temperature = 0.1;
    applyTokenLimit(body, settings, itemSpecificsOutputLimit(settings, { ...options, questionCount: (options.schemaQuestions || options.questions || []).length }));
    return body;
  }

  function buildItemSpecificsResponsesBody(settings, prompt, images, options = {}) {
    const structured = isOpenAiHost(settings);
    const body = {
      model: settings.apiModel,
      store: false,
      instructions: options.systemInstructions || (structured
        ? promptSource().getItemSpecificsStructuredSystemInstructions({ repair: options.stage === "recovery", reviewMode: options.reviewMode === true })
        : promptSource().getItemSpecificsSystemInstructions({ reviewMode: options.reviewMode === true })),
      input: [{ role: "user", content: responsesContent(prompt, images, settings, options.stage || "primary") }],
      max_output_tokens: itemSpecificsOutputLimit(settings, { ...options, questionCount: (options.schemaQuestions || options.questions || []).length })
    };
    if (structured) body.text = { format: { type: "json_schema", ...itemSpecificsSchemaSpec(options, images) } };
    if (supportsReasoning(settings)) body.reasoning = { effort: reasoningEffort(settings, options.stage || "primary") };
    return body;
  }

  function buildItemSpecificsCustomBody(settings, prompt, images, options = {}) {
    const body = {
      model: settings.apiModel,
      prompt,
      images: customImages(images),
      output: options.systemInstructions || (options.stage === "recovery" && options.reviewMode !== true
        ? promptSource().getStrictVerificationStructuredSystemInstructions()
        : promptSource().getItemSpecificsSystemInstructions({ reviewMode: options.reviewMode === true })),
      safety: promptSource().getItemSpecificsSafetyPolicy()
    };
    if (settings.apiMode === "local-proxy") {
      body.settings = {
        tokenMode: settings.tokenMode || "balanced",
        maxOutputTokens: String(itemSpecificsOutputLimit(settings, { ...options, questionCount: (options.schemaQuestions || options.questions || []).length }))
      };
    }
    return body;
  }

  function approximateTextTokens(text) {
    return Math.max(1, Math.ceil(String(text || "").length / 4));
  }

  function pricingForSettings(settings = {}, inputTokens = 0) {
    const shared = global.EbayUsageV8237?.pricingForSettings?.(settings, inputTokens);
    if (shared) return shared;
    const model = String(settings.apiModel || "").trim().toLowerCase();
    if (isOpenAiHost(settings)) {
      if (model === "gpt-5.6-terra" || model.startsWith("gpt-5.6-terra-")) return { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 };
      if (model === "gpt-5.6-luna" || model.startsWith("gpt-5.6-luna-")) return { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 };
      if (model === "gpt-5.6" || model === "gpt-5.6-sol" || model.startsWith("gpt-5.6-sol-")) return { input: 5, cachedInput: 0.5, cacheWrite: 6.25, output: 30 };
      if (model === "gpt-5.5" || model.startsWith("gpt-5.5-")) return { input: 5, cachedInput: 0.5, cacheWrite: 5, output: 30 };
    }
    const input = Number(settings.inputCostPer1M || 0);
    return { input, cachedInput: input, cacheWrite: input, output: Number(settings.outputCostPer1M || 0) };
  }

  function costFromTokens(inputTokens, outputTokens, settings = {}) {
    const shared = global.EbayUsageV8237?.calculateCost?.({ inputTokens, outputTokens, totalTokens: Number(inputTokens || 0) + Number(outputTokens || 0) }, settings);
    if (shared?.costAvailable) return Number(shared.cost || 0);
    const rates = pricingForSettings(settings, inputTokens);
    return (Number(inputTokens || 0) / 1000000) * Number(rates.input || 0)
      + (Number(outputTokens || 0) / 1000000) * Number(rates.output || 0);
  }

  function normalizeUsage(json, text, settings, estimate = {}) {
    const raw = json?.usage || {};
    const shared = global.EbayUsageV8237?.normalizeProviderUsage?.(raw, text, settings, estimate);
    if (shared) return shared;
    const reportedInput = raw.inputTokens || raw.input_tokens || raw.prompt_tokens || raw.promptTokens || 0;
    const reportedOutput = raw.outputTokens || raw.output_tokens || raw.completion_tokens || raw.completionTokens || 0;
    const reportedTotal = raw.totalTokens || raw.total_tokens || 0;
    const reported = Number(reportedInput || 0) > 0 || Number(reportedOutput || 0) > 0 || Number(reportedTotal || 0) > 0;
    const inputTokens = reportedInput || estimate.estimatedInputTokens || 0;
    const outputTokens = reportedOutput || estimate.estimatedOutputTokens || approximateTextTokens(text);
    const totalTokens = reportedTotal || Number(inputTokens || 0) + Number(outputTokens || 0);
    return { inputTokens, outputTokens, totalTokens, reported, source: reported ? "provider" : "estimate", cost: costFromTokens(inputTokens, outputTokens, settings) };
  }

  global.EbayAiRequestBuilderV711 = Object.freeze({
    normalizePath,
    buildEndpoint,
    prefersMaxCompletionTokens,
    applyTokenLimit,
    swapTokenLimitParameter,
    isTokenParameterCompatibilityError,
    isOpenAiHost,
    usesResponsesApi,
    effectiveOutputTokenLimit,
    approximateTextTokens,
    pricingForSettings,
    costFromTokens,
    normalizeUsage,
    buildOpenAiCompatibleBody,
    buildOpenAiResponsesJsonBody,
    buildCustomJsonBody,
    imageDetail,
    itemSpecificsOutputLimit,
    buildItemSpecificsChatBody,
    buildItemSpecificsResponsesBody,
    buildItemSpecificsCustomBody
  });
})(globalThis);

/* ===== API TRANSPORT ===== */
/* Secure GPT/API transport. Prompt text and request body construction live in separate files. */
(function initEbayAiRequest(global) {
  "use strict";

  const API_TIMEOUT_MS_V600 = 120000;
  const MAX_API_RESPONSE_CHARS_V600 = 1000000;

  const TOKEN_CAPABILITY_STORAGE_KEY = "ebayAiTokenParamCapabilitiesV8100";

  function tokenCapabilityKey(settings = {}) {
    return `${String(settings.apiBaseUrl || "").trim().toLowerCase()}|${String(settings.apiPath || "").trim().toLowerCase()}|${String(settings.apiModel || "").trim().toLowerCase()}`.slice(0, 1000);
  }

  function bodyTokenParameter(body = {}) {
    if (Object.prototype.hasOwnProperty.call(body, "max_completion_tokens")) return "max_completion_tokens";
    if (Object.prototype.hasOwnProperty.call(body, "max_tokens")) return "max_tokens";
    return "";
  }

  function bodyWithTokenParameter(body = {}, parameter = "") {
    const current = bodyTokenParameter(body);
    if (!parameter || current === parameter || !current) return body;
    const value = body[current];
    const next = { ...body };
    delete next[current];
    next[parameter] = value;
    return next;
  }

  async function knownTokenParameter(settings = {}) {
    try {
      const storage = global.chrome?.storage?.session;
      if (!storage?.get) return "";
      const result = await storage.get(TOKEN_CAPABILITY_STORAGE_KEY);
      const map = result?.[TOKEN_CAPABILITY_STORAGE_KEY] || {};
      const value = String(map[tokenCapabilityKey(settings)] || "");
      return ["max_tokens", "max_completion_tokens"].includes(value) ? value : "";
    } catch (_) { return ""; }
  }

  async function rememberTokenParameter(settings = {}, parameter = "") {
    if (!["max_tokens", "max_completion_tokens"].includes(parameter)) return;
    try {
      const storage = global.chrome?.storage?.session;
      if (!storage?.get || !storage?.set) return;
      const result = await storage.get(TOKEN_CAPABILITY_STORAGE_KEY);
      const map = { ...(result?.[TOKEN_CAPABILITY_STORAGE_KEY] || {}) };
      map[tokenCapabilityKey(settings)] = parameter;
      const entries = Object.entries(map).slice(-40);
      await storage.set({ [TOKEN_CAPABILITY_STORAGE_KEY]: Object.fromEntries(entries) });
    } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  }

  function requestBuilder() {
    const value = global.EbayAiRequestBuilderV711;
    if (!value) throw new Error("AI request builder is not loaded.");
    return value;
  }

  function responseParser() {
    const value = global.EbayAiResponseParserV711;
    if (!value) throw new Error("AI response parser is not loaded.");
    return value;
  }

  async function sendAnalyzePhotos(payload) {
    if (!global.chrome?.runtime?.sendMessage) {
      throw new Error("Chrome runtime is not available for AI request.");
    }
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "AI_ANALYZE_PHOTOS", payload }, response => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, message: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, message: "No AI response." });
      });
    });
  }

  function sanitizeAiSettingsForBackend(settings = {}) {
    const safe = { ...settings };
    delete safe.apiKey;
    delete safe.claudeApiKey;
    delete safe.saveApiKey;
    delete safe.claudeKeyStored;
    return safe;
  }

  function usageLedger() {
    return global.EbayUsageV8237 || null;
  }

  async function safeLedgerStart(provider, settings, estimate = {}, options = {}, clientRequestId = "") {
    const ledger = usageLedger();
    const id = clientRequestId || ledger?.newRequestId?.(provider === "anthropic" ? "claude" : "openai") || `${provider}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!ledger?.startRequest) return id;
    try {
      await ledger.startRequest({
        id,
        clientRequestId: id,
        provider,
        model: provider === "anthropic" ? (settings.claudeModel || settings.apiModel) : settings.apiModel,
        stage: options.stage || "api",
        analysisRunId: options.analysisRunId || options.requestId || "",
        photoCount: options.photoCount || 0,
        questionCount: options.questionCount || 0,
        estimatedCost: estimate.estimatedCost || 0,
        estimatedInputTokens: estimate.estimatedInputTokens || 0,
        estimatedOutputTokens: estimate.estimatedOutputTokens || 0,
        questionNames: Array.isArray(options.requestMeta?.questionNames) ? options.requestMeta.questionNames : [],
        repairReasons: Array.isArray(options.requestMeta?.repairReasons) ? options.requestMeta.repairReasons : [],
        photoIds: Array.isArray(options.requestMeta?.photoIds) ? options.requestMeta.photoIds : [],
        highDetailPhotoCount: Number(options.requestMeta?.highDetailPhotoCount || 0)
      });
    } catch (error) {
      globalThis.EbayLogger?.debug?.("API usage ledger start skipped", { message: error?.message || String(error) });
    }
    return id;
  }

  async function safeLedgerFinish(id, patch = {}) {
    const ledger = usageLedger();
    if (!ledger?.finishRequest || !id) return;
    try {
      await ledger.finishRequest(id, patch);
    } catch (error) {
      globalThis.EbayLogger?.debug?.("API usage ledger finish skipped", { message: error?.message || String(error) });
    }
  }

  function usageLedgerPatch(usage = {}, transport = {}, status = "success", extra = {}) {
    const reported = usage?.reported === true;
    const costKnown = reported && usage?.costAvailable !== false && usage?.costSource !== "provider-usage-cost-unavailable";
    return {
      status,
      upstreamStatus: Number(transport?.upstreamStatus || 0),
      providerRequestId: String(transport?.providerRequestId || ""),
      proxyRequestId: String(transport?.proxyRequestId || ""),
      clientRequestId: String(transport?.clientRequestId || extra.clientRequestId || ""),
      inputTokens: Number(usage?.inputTokens || 0),
      cachedInputTokens: Number(usage?.cachedInputTokens || 0),
      cacheWriteTokens: Number(usage?.cacheWriteTokens || 0),
      uncachedInputTokens: Number(usage?.uncachedInputTokens || 0),
      imageInputTokens: Number(usage?.imageInputTokens || 0),
      textInputTokens: Number(usage?.textInputTokens || 0),
      outputTokens: Number(usage?.outputTokens || 0),
      reasoningTokens: Number(usage?.reasoningTokens || 0),
      totalTokens: Number(usage?.totalTokens || 0),
      cost: costKnown ? Number(usage?.cost || 0) : 0,
      costKnown,
      costSource: String(usage?.costSource || (reported ? "provider-usage" : "estimate")),
      pricingSource: String(usage?.rates?.source || ""),
      longContext: usage?.rates?.longContext === true,
      uncertainCharge: !costKnown,
      ...extra
    };
  }

  async function postApiRequest(settings, body, timeoutMs = API_TIMEOUT_MS_V600, clientRequestId = "") {
    const safeTimeoutMs = Math.max(30000, Math.min(Number(timeoutMs || API_TIMEOUT_MS_V600), API_TIMEOUT_MS_V600));
    const data = await callLocalBackendV637(
      "/v1/ai/proxy",
      "POST",
      { settings: sanitizeAiSettingsForBackend(settings), body, upstreamTimeoutMs: safeTimeoutMs, clientRequestId },
      safeTimeoutMs + 5000,
      3 * 1024 * 1024
    );
    const status = Number(data.upstreamStatus || 0);
    const statusText = String(data.upstreamStatusText || "HTTP response");
    const responseText = String(data.responseText || "");
    if (responseText.length > MAX_API_RESPONSE_CHARS_V600) {
      throw new Error("API response is too large and was rejected.");
    }
    const transport = {
      confirmed: data.requestConfirmed === true && status >= 200 && status < 300 && Boolean(responseText.trim()),
      upstreamStatus: status,
      upstreamStatusText: statusText,
      proxyRequestId: String(data.proxyRequestId || ""),
      providerRequestId: String(data.providerRequestId || ""),
      clientRequestId: String(data.clientRequestId || clientRequestId || ""),
      confirmedAt: Number(data.confirmedAt || 0)
    };
    return {
      response: { ok: status >= 200 && status < 300, status, statusText },
      responseText,
      transport
    };
  }

  async function postClaudeRequest(body, timeoutMs = API_TIMEOUT_MS_V600) {
    const safeTimeoutMs = Math.max(30000, Math.min(Number(timeoutMs || API_TIMEOUT_MS_V600), API_TIMEOUT_MS_V600));
    const data = await callLocalBackendV637("/v1/claude/proxy", "POST", { body, upstreamTimeoutMs: safeTimeoutMs }, safeTimeoutMs + 5000, 3 * 1024 * 1024);
    const status = Number(data.upstreamStatus || 0), statusText = String(data.upstreamStatusText || "HTTP response"), responseText = String(data.responseText || "");
    if (responseText.length > MAX_API_RESPONSE_CHARS_V600) throw new Error("Claude response is too large and was rejected.");
    const transport = { confirmed: data.requestConfirmed === true && status >= 200 && status < 300 && Boolean(responseText.trim()), upstreamStatus: status, upstreamStatusText: statusText, proxyRequestId: String(data.proxyRequestId || ""), providerRequestId: String(data.providerRequestId || ""), confirmedAt: Number(data.confirmedAt || 0), provider: "anthropic" };
    return { response: { ok: status >= 200 && status < 300, status, statusText }, responseText, transport };
  }

  async function callClaudeApi(settings, body, estimate = {}, options = {}) {
    if (settings?.claudeReviewEnabled !== true && settings?.apiEnabled !== true) throw new Error("Claude Reviewer is disabled.");
    if (!String(settings?.claudeModel || settings?.apiModel || "").trim()) throw new Error("Claude model is empty.");
    const ledgerId = await safeLedgerStart("anthropic", settings, estimate, options);
    let attempt;
    try {
      attempt = await postClaudeRequest(body, options.timeoutMs);
    } catch (error) {
      await safeLedgerFinish(ledgerId, { status: "transport_error", costKnown: false, uncertainCharge: true, error: String(error?.message || error).slice(0, 500) });
      throw error;
    }
    const { response, responseText, transport } = attempt;
    transport.clientRequestId = ledgerId;
    if (!response.ok) {
      await safeLedgerFinish(ledgerId, { status: "http_error", costKnown: false, uncertainCharge: false, upstreamStatus: response.status, providerRequestId: transport.providerRequestId, proxyRequestId: transport.proxyRequestId, cost: 0 });
      throw new Error(`${response.status} ${response.statusText}: ${responseText.slice(0, 500)}`);
    }
    let json;
    try { json = JSON.parse(responseText); }
    catch (_) {
      const estimatedUsage = requestBuilder().normalizeUsage(null, responseText, { ...settings, apiBaseUrl: "https://api.anthropic.com", apiModel: settings.claudeModel || settings.apiModel }, estimate);
      await safeLedgerFinish(ledgerId, usageLedgerPatch(estimatedUsage, transport, "success_unparsed", { clientRequestId: ledgerId }));
      throw new Error("Claude API returned invalid JSON envelope.");
    }
    const parser = responseParser(), text = parser.extractApiText(json);
    const usageSettings = { ...settings, apiBaseUrl: "https://api.anthropic.com", apiModel: settings.claudeModel || settings.apiModel };
    const usage = requestBuilder().normalizeUsage(json, text, usageSettings, estimate); usage.provider = "anthropic"; usage.costAvailable = Number(usageSettings.inputCostPer1M || 0) > 0 || Number(usageSettings.outputCostPer1M || 0) > 0;
    await safeLedgerFinish(ledgerId, usageLedgerPatch(usage, transport, "success", { clientRequestId: ledgerId }));
    return { text, usage, researchSources: [], diagnostics: parser.extractApiDiagnostics?.(json) || { status: "", finishReason: "", incompleteReason: "", refusal: "" }, transport, raw: json };
  }

  async function trackedOpenAiAttempt(settings, body, estimate, options, timeoutMs) {
    const ledgerId = await safeLedgerStart("openai", settings, estimate, options);
    try {
      const attempt = await postApiRequest(settings, body, timeoutMs, ledgerId);
      attempt.ledgerId = ledgerId;
      if (!attempt.response.ok) {
        // Most provider 4xx responses are rejected before generation and have no
        // usage object. A 5xx response is less certain: if OpenAI reports usage,
        // record it; otherwise keep the request estimate reserved rather than
        // silently under-counting a request that may have reached model work.
        let errorJson = null;
        try { errorJson = JSON.parse(attempt.responseText || ""); } catch (error) { globalThis.EbayLogger?.debug?.("HTTP error envelope was not JSON", { message: error?.message || String(error) }); }
        const errorUsage = requestBuilder().normalizeUsage(errorJson, "", settings, {});
        if (errorUsage?.reported === true) {
          await safeLedgerFinish(ledgerId, usageLedgerPatch(errorUsage, attempt.transport, "http_error_usage_reported", { clientRequestId: ledgerId }));
        } else {
          const status = Number(attempt.response.status || 0);
          const uncertain = status >= 500 || status <= 0;
          await safeLedgerFinish(ledgerId, {
            status: uncertain ? "http_error_uncertain" : "http_error",
            costKnown: false,
            uncertainCharge: uncertain,
            upstreamStatus: status,
            providerRequestId: attempt.transport?.providerRequestId || "",
            proxyRequestId: attempt.transport?.proxyRequestId || "",
            clientRequestId: ledgerId,
            cost: 0
          });
        }
      }
      return attempt;
    } catch (error) {
      await safeLedgerFinish(ledgerId, {
        status: "transport_error",
        costKnown: false,
        uncertainCharge: true,
        clientRequestId: ledgerId,
        error: String(error?.message || error).slice(0, 500)
      });
      throw error;
    }
  }

  async function callApi(settings, body, estimate = {}, options = {}) {
    if (!settings?.apiEnabled || settings.apiMode === "off") throw new Error("API is disabled.");
    if (!settings.apiModel) throw new Error("API model is empty.");

    const builder = requestBuilder();
    builder.buildEndpoint(settings); // Validate the configured address before using the secure backend.
    const timeoutMs = Math.max(30000, Math.min(Number(options.timeoutMs || API_TIMEOUT_MS_V600), API_TIMEOUT_MS_V600));
    let requestBody = body;
    if (!builder.usesResponsesApi(settings)) {
      const knownParameter = await knownTokenParameter(settings);
      if (knownParameter) requestBody = bodyWithTokenParameter(requestBody, knownParameter);
    }
    let attempt = await trackedOpenAiAttempt(settings, requestBody, estimate, options, timeoutMs);

    if (
      options.allowCompatibilityRetry === true
      && !builder.usesResponsesApi(settings)
      && !attempt.response.ok
      && builder.isTokenParameterCompatibilityError(attempt.response.status, attempt.responseText)
    ) {
      // Every upstream compatibility attempt has its own ledger entry. Failed HTTP
      // attempts are retained for diagnostics but are not counted as known spend.
      const fallbackBody = builder.swapTokenLimitParameter(requestBody);
      if (fallbackBody) {
        attempt = await trackedOpenAiAttempt(settings, fallbackBody, estimate, { ...options, stage: `${options.stage || "api"}_compat_retry` }, timeoutMs);
        if (attempt.response.ok) await rememberTokenParameter(settings, bodyTokenParameter(fallbackBody));
      }
    } else if (attempt.response.ok && !builder.usesResponsesApi(settings)) {
      await rememberTokenParameter(settings, bodyTokenParameter(requestBody));
    }

    const { response, responseText, transport, ledgerId } = attempt;
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${responseText.slice(0, 500)}`);
    }

    let json;
    try {
      json = JSON.parse(responseText);
    } catch (_) {
      const usage = builder.normalizeUsage(null, responseText, settings, estimate);
      await safeLedgerFinish(ledgerId, usageLedgerPatch(usage, transport, "success_unparsed", { clientRequestId: ledgerId }));
      return {
        text: responseText,
        usage,
        researchSources: [],
        diagnostics: { status: "", finishReason: "", incompleteReason: "", refusal: "" },
        transport
      };
    }

    const parser = responseParser();
    const text = parser.extractApiText(json);
    const usage = builder.normalizeUsage(json, text, settings, estimate);
    await safeLedgerFinish(ledgerId, usageLedgerPatch(usage, transport, usage.reported === true ? "success" : "success_usage_unavailable", { clientRequestId: ledgerId }));
    return {
      text,
      usage,
      researchSources: parser.extractWebSearchSources(json),
      diagnostics: parser.extractApiDiagnostics?.(json) || { status: "", finishReason: "", incompleteReason: "", refusal: "" },
      transport
    };
  }

  const builderApi = requestBuilder();
  global.EbayAiRequestV711 = Object.freeze({
    sendAnalyzePhotos,
    callClaudeApi,
    normalizePath: builderApi.normalizePath,
    prefersMaxCompletionTokens: builderApi.prefersMaxCompletionTokens,
    applyTokenLimit: builderApi.applyTokenLimit,
    isOpenAiHost: builderApi.isOpenAiHost,
    usesResponsesApi: builderApi.usesResponsesApi,
    effectiveOutputTokenLimit: builderApi.effectiveOutputTokenLimit,
    approximateTextTokens: builderApi.approximateTextTokens,
    pricingForSettings: builderApi.pricingForSettings,
    costFromTokens: builderApi.costFromTokens,
    buildOpenAiCompatibleBody: builderApi.buildOpenAiCompatibleBody,
    buildOpenAiResponsesJsonBody: builderApi.buildOpenAiResponsesJsonBody,
    buildCustomJsonBody: builderApi.buildCustomJsonBody,
    buildItemSpecificsChatBody: builderApi.buildItemSpecificsChatBody,
    buildItemSpecificsResponsesBody: builderApi.buildItemSpecificsResponsesBody,
    buildItemSpecificsCustomBody: builderApi.buildItemSpecificsCustomBody,
    callApi
  });

  global.EbayAiRequestV790 = Object.freeze({ sendAnalyzePhotos });
})(globalThis);

/* ===== CLAUDE REVIEWER ===== */
/* Anthropic Messages API body builder for the optional targeted reviewer. */
(function initEbayClaudeReviewer(global) {
  "use strict";
  const DEFAULT_MODEL = "claude-sonnet-5";
  function clean(value, limit=500){return String(value??"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim().slice(0,limit);}
  function promptText(value,limit=100000){return String(value||"").slice(0,limit);}
  function imageUrl(image={}){return String(image.dataUrl||image.canonicalUrl||image.url||image.src||"").trim();}
  function imageBlock(image={}){
    const value=imageUrl(image); if(!value)return null;
    const m=value.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
    if(m){const media=m[1].toLowerCase()==="image/jpg"?"image/jpeg":m[1].toLowerCase();return{type:"image",source:{type:"base64",media_type:media,data:m[2].replace(/\s+/g,"")}};}
    if(/^https:\/\//i.test(value))return{type:"image",source:{type:"url",url:value}};
    return null;
  }
  function photoLabel(image={},index=0){const id=clean(image.photoId||image.photo_id||`photo_${index+1}`,180),role=clean(image.role||image.photoRole||image.photoCategory||"detail",80);return`PHOTO ${index+1} | PHOTO_ID: ${id} | ROLE HINT: ${role}`;}
  function pricing(settings={},now=new Date()){
    const input=Number(settings.claudeInputCostPer1M||0),output=Number(settings.claudeOutputCostPer1M||0);
    if(input>0||output>0)return{input:Math.max(0,input),output:Math.max(0,output),source:"settings"};
    const model=clean(settings.claudeModel||DEFAULT_MODEL,120).toLowerCase();
    if(model==="claude-sonnet-5"||model.startsWith("claude-sonnet-5-")){
      const intro=now instanceof Date&&Number.isFinite(now.getTime())&&now.getTime()<Date.parse("2026-09-01T00:00:00Z");
      return intro?{input:2,output:10,source:"sonnet5_intro"}:{input:3,output:15,source:"sonnet5_standard"};
    }
    return{input:0,output:0,source:"unknown_model"};
  }
  function buildBody(settings={},prompt="",images=[],options={}){
    const content=[{type:"text",text:promptText(prompt)}];
    (Array.isArray(images)?images:[]).slice(0,3).forEach((image,index)=>{const block=imageBlock(image);if(!block)return;content.push({type:"text",text:photoLabel(image,index)});content.push(block);});
    const maxTokens=Math.max(600,Math.min(Number(settings.claudeMaxOutputTokens||settings.maxOutputTokens||3000),6000));
    return{model:clean(settings.claudeModel||DEFAULT_MODEL,120)||DEFAULT_MODEL,max_tokens:maxTokens,system:[
      "You are the second reviewer for eBay Item Specifics.","Review only the requested weak fields. Do not analyze or return protected fields.",
      "Return valid JSON only with this top-level shape: {\"ai_response_schema_version\":3,\"request_id\":\"...\",\"results\":[...] }.",
      "Each result requires field_id, field, model_status, raw_value, candidate_values, confidence, photo_sources, evidence_type, evidence_scope, evidence, review_reason, missing_photo_role.",
      "model_status is confirmed or needs_review. candidate_values uses exact supplied eBay options. evidence is at most 160 characters.",
      "Agreement with the primary model is not proof. Cite a supplied PHOTO_ID and direct evidence.",
      "Never return auto_fill_allowed, secrets, UPC, MPN, title, description, condition, category, price, quantity, shipping, or publishing actions."
    ].join("\n"),messages:[{role:"user",content}],metadata:{user_id:clean(options.requestId||"ebay-review",64)||"ebay-review"}};
  }
  function reviewerSettings(primary={}){const rates=pricing(primary);return{...primary,provider:"anthropic",apiEnabled:primary.claudeReviewEnabled===true,apiBaseUrl:"https://api.anthropic.com",apiPath:"/v1/messages",apiModel:clean(primary.claudeModel||DEFAULT_MODEL,120)||DEFAULT_MODEL,claudeModel:clean(primary.claudeModel||DEFAULT_MODEL,120)||DEFAULT_MODEL,inputCostPer1M:rates.input,outputCostPer1M:rates.output,claudePricingSource:rates.source};}
  global.EbayClaudeReviewerV850=Object.freeze({DEFAULT_MODEL,buildBody,reviewerSettings,pricing,imageBlock,photoLabel,promptText});
})(globalThis);

/* ===== ANALYZE ===== */
/* One-request AI transport used by Photo and Queue. */
(function initEbayAiAnalyze(global) {
  "use strict";

  function requestApi() {
    const api = global.EbayAiRequestV711;
    if (!api) throw new Error("AI request module is not loaded.");
    return api;
  }

  function responseParser() {
    const parser = global.EbayAiResponseParserV711;
    if (!parser) throw new Error("AI response parser is not loaded.");
    return parser;
  }

  function promptBuilder() {
    const prompts = global.EbayAiPromptV711;
    if (!prompts) throw new Error("AI prompt module is not loaded.");
    return prompts;
  }

  async function callItemSpecificsApi(settings, prompt, images, estimate = {}, options = {}) {
    const api = requestApi();
    let body;
    let requestSettings = { ...settings };
    if (options.provider === "anthropic") {
      const reviewer = global.EbayClaudeReviewerV850;
      if (!reviewer) throw new Error("Claude reviewer module is not loaded.");
      body = reviewer.buildBody(requestSettings, prompt, images, { requestId: options.requestId });
      return api.callClaudeApi(requestSettings, body, estimate, { timeoutMs: options.apiTimeoutMs, stage: options.stage || "claude_review", analysisRunId: options.requestId || "", photoCount: images.length, questionCount: (options.schemaQuestions || options.questions || []).length, requestMeta: options.requestMeta || {} });
    }

    if (settings.apiMode === "custom-json" || settings.apiMode === "local-proxy") {
      body = api.buildItemSpecificsCustomBody(requestSettings, prompt, images, options);
    } else {
      const responsesApi = /\/v1\/responses\/?$/i.test(api.normalizePath(settings.apiPath || ""));
      requestSettings.apiPath = responsesApi ? "/v1/responses" : "/v1/chat/completions";
      body = responsesApi
        ? api.buildItemSpecificsResponsesBody(requestSettings, prompt, images, options)
        : api.buildItemSpecificsChatBody(requestSettings, prompt, images, options);
    }

    // Deliberately no compatibility retry inside a stage: each primary/repair stage owns exactly one upstream request.
    return api.callApi(requestSettings, body, estimate, { timeoutMs: options.apiTimeoutMs, stage: options.stage || "primary", analysisRunId: options.requestId || "", photoCount: images.length, questionCount: (options.schemaQuestions || options.questions || []).length, requestMeta: options.requestMeta || {}, allowCompatibilityRetry: false });
  }

  async function analyzePhotos(payload = {}) {
    const parser = responseParser();
    const settings = { ...(payload.settings || {}), webResearchEnabled: false };
    const prompt = String(payload.prompt || "").trim();
    const images = Array.isArray(payload.images) ? payload.images : [];

    if (!prompt) throw new Error("AI prompt was not supplied by core/ai.js.");
    if (!images.length) throw new Error("No images received by background worker.");

    const result = await callItemSpecificsApi(settings, prompt, images, payload.estimate || {}, {
      apiTimeoutMs: payload.apiTimeoutMs,
      stage: payload.stage || "primary",
      schemaQuestions: Array.isArray(payload.questions) ? payload.questions : [],
      schemaFields: Array.isArray(payload.fields) ? payload.fields : [],
      provider: payload.provider || "openai",
      requestId: payload.requestId || "",
      reviewMode: payload.reviewMode === true,
      systemInstructions: payload.systemInstructions || "",
      requestMeta: payload.requestMeta && typeof payload.requestMeta === "object" ? payload.requestMeta : {}
    });
    const text = String(result?.text || "").trim();
    if (!text) {
      const diagnostics = result?.diagnostics || {};
      const providerName = payload.provider === "anthropic" ? "Claude" : "GPT";
      if (diagnostics.refusal) throw new Error(`${providerName} refused the Item Specifics request: ${String(diagnostics.refusal).slice(0, 300)}`);
      if (diagnostics.incompleteReason || diagnostics.status === "incomplete" || diagnostics.finishReason === "length") {
        const reason = diagnostics.incompleteReason || diagnostics.finishReason || "incomplete output";
        throw new Error(`${providerName} Item Specifics response was incomplete (${reason}).`);
      }
      throw new Error(`${providerName} returned an empty Item Specifics response with no refusal or incomplete reason.`);
    }
    if (parser.isSchemaEcho(text)) throw new Error(`${payload.provider === "anthropic" ? "Claude" : "GPT"} returned request metadata instead of Item Specific answers.`);

    const transportConfirmed = result?.transport?.confirmed === true;
    const usage = result?.usage || {};
    const providerUsageRequired = payload.provider !== "anthropic" && requestApi().isOpenAiHost(settings);
    const providerUsageConfirmed = usage.reported === true && Number(usage.totalTokens || 0) > 0;
    if (!transportConfirmed) throw new Error("The local backend did not confirm a successful upstream AI request.");
    // Provider usage is accounting telemetry, not proof that a valid HTTP response is
    // wrong. Preserve the answer and mark usage unavailable instead of repeating GPT.
    const usageUnavailable = providerUsageRequired && !providerUsageConfirmed;

    return {
      ok: true,
      text,
      usage,
      transport: result.transport,
      requestConfirmed: true,
      providerUsageConfirmed: providerUsageRequired ? providerUsageConfirmed : usage.reported === true,
      usageUnavailable,
      researchSources: [],
      stages: { photo: true, web: false, requests: 1, stage: payload.stage || "primary" },
      promptOwner: "core/ai.js",
      message: usageUnavailable
        ? `${payload.provider === "anthropic" ? "Claude" : "GPT"} request confirmed: HTTP ${Number(result.transport?.upstreamStatus || 0)}; provider token usage was not reported.`
        : `${payload.provider === "anthropic" ? "Claude" : "GPT"} request confirmed: HTTP ${Number(result.transport?.upstreamStatus || 0)}, ${Number(usage.totalTokens || 0)} token(s).`
    };
  }

  async function testConnection(payload = {}) {
    const api = requestApi();
    const settings = { ...(payload.settings || {}) };
    if (!settings.apiEnabled || settings.apiMode === "off") return { ok: false, message: "API is OFF." };

    const prompt = promptBuilder().buildTestPrompt?.() || "Reply with OK.";
    let body;
    if (settings.apiMode === "custom-json" || settings.apiMode === "local-proxy") {
      body = api.buildCustomJsonBody(settings, prompt, []);
    } else if (api.usesResponsesApi(settings)) {
      settings.apiPath = "/v1/responses";
      body = api.buildOpenAiResponsesJsonBody(settings, prompt, [], { test: true });
    } else {
      body = { model: settings.apiModel, messages: [{ role: "user", content: prompt }] };
      if (!api.prefersMaxCompletionTokens(settings)) body.temperature = 0;
      api.applyTokenLimit(body, settings, 300);
    }
    const result = await api.callApi(settings, body, {}, { stage: "connection_test", analysisRunId: "connection-test", photoCount: 0, questionCount: 0, allowCompatibilityRetry: true });
    return { ok: true, text: result.text, usage: result.usage, message: String(result.text).slice(0, 180) };
  }

  async function run(payload = {}) {
    return requestApi().sendAnalyzePhotos(payload);
  }

  global.EbayAiAnalyzeV711 = Object.freeze({ run, analyzePhotos, testConnection });
})(globalThis);

/* ===== OCR CLIENT ===== */
/* Local macOS Vision OCR client. No AI reasoning and no Fill logic. */
(function initEbayOcrClient(global) {
  "use strict";

  const MAX_PHOTOS = 12;

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function imageSource(image = {}) {
    return clean(image.dataUrl || image.canonicalUrl || image.url || image.src || "");
  }

  function photoIdentity(image = {}, index = 0) {
    return clean(image.photoId || image.photo_id || `photo-${index + 1}`);
  }

  function normalizedBox(box = {}) {
    if (!box || typeof box !== "object") return null;
    const x = Math.max(0, Math.min(1, Number(box.x || 0)));
    const y = Math.max(0, Math.min(1, Number(box.y || 0)));
    const width = Math.max(0, Math.min(1 - x, Number(box.width || 0)));
    const height = Math.max(0, Math.min(1 - y, Number(box.height || 0)));
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  }

  function focusBoxFromBlocks(blocks = []) {
    const boxes = (Array.isArray(blocks) ? blocks : []).map(block => normalizedBox(block?.box)).filter(Boolean);
    if (!boxes.length) return null;
    const minX = Math.min(...boxes.map(box => box.x));
    const minY = Math.min(...boxes.map(box => box.y));
    const maxX = Math.max(...boxes.map(box => box.x + box.width));
    const maxY = Math.max(...boxes.map(box => box.y + box.height));
    const marginX = Math.max(0.04, (maxX - minX) * 0.18);
    const marginY = Math.max(0.05, (maxY - minY) * 0.22);
    const x = Math.max(0, minX - marginX);
    const y = Math.max(0, minY - marginY);
    return {
      x,
      y,
      width: Math.min(1 - x, maxX - minX + marginX * 2),
      height: Math.min(1 - y, maxY - minY + marginY * 2)
    };
  }


  function photoFocusBox(photo = {}) {
    const fromText = focusBoxFromBlocks(photo?.blocks || []);
    if (fromText) return fromText;
    const fromGeometry = normalizedBox(photo?.labelBox);
    if (fromGeometry && Number(photo?.rectangleConfidence || 0) >= 0.50) return fromGeometry;
    return null;
  }

  function labelTextSignal(photo = {}) {
    const blocks = Array.isArray(photo?.blocks) ? photo.blocks : [];
    const joined = blocks.map(block => clean(block?.text)).join(' ').toLowerCase();
    if (!joined) return false;
    const direct = /(?:\bsize\b|\bmade in\b|\bcountry of origin\b|\bmaterial\b|\bcomposition\b|\bcotton\b|\bpolyester\b|\bnylon\b|\bwool\b|\blinen\b|\bsilk\b|\bcashmere\b|\bleather\b|\bsuede\b|\bsynthetic\b|\bman[- ]made\b|\bupper\b|\blining\b|\boutsole\b|\bsole\b|\bstyle(?:\s*no)?\b|\bmodel\b|\brn\s*#?\s*\d|\bca\s*#?\s*\d|\bmachine wash\b|\bdry clean\b|\bhand wash\b|\bdo not bleach\b|\btumble dry\b|\biron\b)/i;
    if (direct.test(joined)) return true;
    const fiberPercent = /\b\d{1,3}\s*%\s*(?:cotton|polyester|nylon|wool|linen|silk|cashmere|rayon|viscose|spandex|elastane|acrylic)\b/i;
    return fiberPercent.test(joined);
  }

  function careSymbolHint(photo = {}) {
    const blocks = Array.isArray(photo?.blocks) ? photo.blocks : [];
    if (!blocks.length) return false;
    const joined = blocks.map(block => clean(block?.text)).join(' ').toLowerCase();
    const labelAnchor = labelTextSignal(photo) || /\b(?:wash|dry|care|fabric|fiber|made in)\b/.test(joined);
    if (!labelAnchor) return false;
    const isolatedTokens = blocks.filter(block => {
      const token = clean(block?.text).toUpperCase();
      return /^(?:P|F|W|30|40|60)$/.test(token) && Number(block?.confidence || 0) >= 0.55;
    });
    return isolatedTokens.length > 0;
  }

  function photoQualityScore(photo = {}) {
    const stats = blockStats(photo);
    const consensus = (Array.isArray(photo?.blocks) ? photo.blocks : []).filter(block => Number(block?.votes || 0) >= 2).length;
    const variantConsensus = (Array.isArray(photo?.blocks) ? photo.blocks : []).filter(block => Number(block?.variantVotes || 0) >= 2).length;
    const labelBonus = labelTextSignal(photo) ? 2.5 : 0;
    const geometryBonus = normalizedBox(photo?.labelBox) && Number(photo?.rectangleConfidence || 0) >= 0.55 ? 0.8 : 0;
    return stats.blockCount * 0.18 + stats.averageConfidence * 2.2 + stats.maximumConfidence * 1.4 + consensus * 0.55 + variantConsensus * 0.35 + labelBonus + geometryBonus;
  }

  function mergePhotoBlocks(primaryBlocks = [], retryBlocks = []) {
    const merged = [];
    const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
    const boxNear = (a, b) => {
      const aa = normalizedBox(a), bb = normalizedBox(b);
      if (!aa || !bb) return true;
      const ax = aa.x + aa.width / 2, ay = aa.y + aa.height / 2;
      const bx = bb.x + bb.width / 2, by = bb.y + bb.height / 2;
      return Math.abs(ax - bx) + Math.abs(ay - by) <= 0.12;
    };
    const add = (block, source) => {
      if (!block || !clean(block.text)) return;
      const key = norm(block.text);
      if (!key) return;
      const found = merged.find(item => item._key === key && boxNear(item.box, block.box));
      const confidence = Math.max(0, Math.min(1, Number(block.confidence || 0)));
      const votes = Math.max(1, Number(block.votes || 1));
      if (!found) {
        merged.push({ ...block, confidence, votes, _key: key, _sources: new Set([source]) });
        return;
      }
      found._sources.add(source);
      found.votes = Math.max(Number(found.votes || 1), votes, found._sources.size);
      found.passVotes = Math.max(Number(found.passVotes || 1), Number(block.passVotes || votes));
      found.variantVotes = Math.max(Number(found.variantVotes || 1), Number(block.variantVotes || 1));
      if (confidence > Number(found.confidence || 0)) Object.assign(found, { ...block, confidence, votes: found.votes, passVotes: found.passVotes, variantVotes: found.variantVotes, _key: key, _sources: found._sources });
    };
    (Array.isArray(primaryBlocks) ? primaryBlocks : []).forEach(block => add(block, 'fast'));
    (Array.isArray(retryBlocks) ? retryBlocks : []).forEach(block => add(block, 'accurate'));
    return merged
      .map(({ _key, _sources, ...block }) => block)
      .sort((a, b) => Number(b.votes || 1) - Number(a.votes || 1) || Number(b.confidence || 0) - Number(a.confidence || 0))
      .slice(0, 120);
  }

  function compactImage(image = {}, index = 0) {
    const source = imageSource(image);
    if (!source) return null;
    const result = {
      photoId: photoIdentity(image, index),
      displayNumber: Number(image.requestPhotoNumber || image.displayNumber || index + 1),
      role: clean(image.role || image.photoCategory || image.kind || ""),
      source
    };
    const focusBox = normalizedBox(image.focusBox);
    if (focusBox) result.focusBox = focusBox;
    if (image.smartPreprocess === true) result.smartPreprocess = true;
    return result;
  }

  async function analyze(images = [], options = {}) {
    const bridge = global.EbayLocalOcrBridgeV860;
    const selected = (Array.isArray(images) ? images : [])
      .slice(0, Math.max(1, Math.min(Number(options.maxPhotos || MAX_PHOTOS), MAX_PHOTOS)))
      .map(compactImage)
      .filter(Boolean);

    if (!selected.length) {
      return { ok: true, available: true, engine: "none", photos: [], warnings: ["No usable photos were supplied to OCR."] };
    }
    if (!bridge || typeof bridge.analyze !== "function") {
      return { ok: false, available: false, engine: "unavailable", photos: [], warnings: ["Local OCR bridge is unavailable."] };
    }

    try {
      const response = await bridge.analyze({
        images: selected,
        languages: Array.isArray(options.languages) && options.languages.length ? options.languages.slice(0, 8) : ["en-US"],
        accurate: options.accurate !== false,
        languageCorrection: options.languageCorrection === true,
        smartPreprocess: options.smartPreprocess === true
      });
      const photos = Array.isArray(response?.photos) ? response.photos : [];
      const blockCount = Number(response?.blockCount ?? photos.reduce((sum, photo) => sum + (Array.isArray(photo?.blocks) ? photo.blocks.length : 0), 0));
      const textPhotoCount = Number(response?.textPhotoCount ?? photos.filter(photo => Array.isArray(photo?.blocks) && photo.blocks.length > 0).length);
      return {
        ok: response?.ok === true,
        available: response?.available !== false,
        engine: clean(response?.engine || "macos_vision"),
        helperVersion: clean(response?.helperVersion || ""),
        photos,
        photoCount: Number(response?.photoCount ?? photos.length),
        successfulPhotoCount: Number(response?.successfulPhotoCount ?? photos.filter(photo => photo?.ok === true).length),
        textPhotoCount,
        emptyPhotoCount: Number(response?.emptyPhotoCount ?? Math.max(0, photos.length - textPhotoCount)),
        blockCount,
        warnings: Array.isArray(response?.warnings) ? response.warnings.map(clean).filter(Boolean) : [],
        durationMs: Number(response?.durationMs || 0),
        cacheHitCount: Number(response?.cacheHitCount || 0),
        preprocessVariantCount: Number(response?.preprocessVariantCount || 0),
        preprocessedPhotoCount: Number(response?.preprocessedPhotoCount || 0),
        smartPreprocess: response?.smartPreprocess === true
      };
    } catch (error) {
      return {
        ok: false,
        available: false,
        engine: "macos_vision",
        photos: [],
        warnings: [clean(error?.message || error || "OCR failed.")]
      };
    }
  }

  function likelyEvidenceImages(images = []) {
    return (Array.isArray(images) ? images : []).filter(image => {
      const text = clean(`${image?.role || ""} ${image?.photoCategory || ""} ${image?.selectionReason || ""}`).toLowerCase();
      return image?.evidenceCandidate === true || /tag|label|size|brand|care|material|composition|made in|measurement|late sequence evidence/.test(text);
    });
  }


  function blockStats(photo = {}) {
    const blocks = Array.isArray(photo?.blocks) ? photo.blocks : [];
    const confidences = blocks.map(block => Number(block?.confidence || 0)).filter(Number.isFinite);
    const averageConfidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;
    const maximumConfidence = confidences.length ? Math.max(...confidences) : 0;
    const tinyCount = blocks.filter(block => Number(block?.box?.height || 0) > 0 && Number(block?.box?.height || 0) < 0.018).length;
    return { blockCount: blocks.length, averageConfidence, maximumConfidence, tinyCount };
  }

  function needsAccurateRetry(image = {}, photo = {}) {
    const stats = blockStats(photo);
    const metadataEvidence = likelyEvidenceImages([image]).length > 0;
    const discoveredEvidence = labelTextSignal(photo) || (normalizedBox(photo?.labelBox) && Number(photo?.rectangleConfidence || 0) >= 0.55);
    if (!metadataEvidence && !discoveredEvidence) return false;
    if (!stats.blockCount) return true;
    if (stats.blockCount < 2) return true;
    if (stats.averageConfidence < 0.80) return true;
    if (stats.maximumConfidence < 0.88) return true;
    if (stats.tinyCount >= Math.ceil(stats.blockCount / 2)) return true;
    if (careSymbolHint(photo) && stats.averageConfidence < 0.88) return true;
    return false;
  }

  function mergeResults(primary = {}, retry = {}) {
    const byId = new Map();
    for (const photo of Array.isArray(primary?.photos) ? primary.photos : []) byId.set(clean(photo?.photoId), { ...photo });
    for (const photo of Array.isArray(retry?.photos) ? retry.photos : []) {
      const id = clean(photo?.photoId);
      const previous = byId.get(id) || {};
      const mergedBlocks = mergePhotoBlocks(previous?.blocks || [], photo?.blocks || []);
      const previousScore = photoQualityScore(previous);
      const retryScore = photoQualityScore(photo);
      const preferred = retryScore >= previousScore ? { ...previous, ...photo } : { ...photo, ...previous };
      byId.set(id, {
        ...preferred,
        photoId: id || clean(previous?.photoId || photo?.photoId),
        blocks: mergedBlocks,
        fullText: mergedBlocks.map(block => clean(block.text)).filter(Boolean).join('\n'),
        textDetected: mergedBlocks.length > 0,
        retryAccurate: true,
        fastQualityScore: previousScore,
        accurateQualityScore: retryScore,
        labelBox: normalizedBox(photo?.labelBox) || normalizedBox(previous?.labelBox),
        rectangleConfidence: Math.max(Number(previous?.rectangleConfidence || 0), Number(photo?.rectangleConfidence || 0)),
        rectangleDetected: previous?.rectangleDetected === true || photo?.rectangleDetected === true,
        preprocessUsed: photo?.preprocessUsed === true || previous?.preprocessUsed === true,
        preprocessVariants: Array.from(new Set([...(previous?.preprocessVariants || []), ...(photo?.preprocessVariants || [])])).slice(0, 8)
      });
    }
    const photos = Array.from(byId.values());
    const blockCount = photos.reduce((sum, photo) => sum + (Array.isArray(photo?.blocks) ? photo.blocks.length : 0), 0);
    const textPhotoCount = photos.filter(photo => Array.isArray(photo?.blocks) && photo.blocks.length > 0).length;
    return {
      ...primary,
      ok: primary?.ok === true || retry?.ok === true,
      available: primary?.available !== false || retry?.available !== false,
      photos,
      photoCount: photos.length,
      successfulPhotoCount: photos.filter(photo => photo?.ok === true).length,
      textPhotoCount,
      emptyPhotoCount: Math.max(0, photos.length - textPhotoCount),
      blockCount,
      cacheHitCount: Number(primary?.cacheHitCount || 0) + Number(retry?.cacheHitCount || 0),
      fastDurationMs: Number(primary?.durationMs || 0),
      accurateRetryDurationMs: Number(retry?.durationMs || 0),
      durationMs: Number(primary?.durationMs || 0) + Number(retry?.durationMs || 0),
      retryPhotoCount: Array.isArray(retry?.photos) ? retry.photos.length : 0,
      preprocessVariantCount: Number(retry?.preprocessVariantCount || 0),
      preprocessedPhotoCount: Number(retry?.preprocessedPhotoCount || 0),
      smartPreprocess: retry?.smartPreprocess === true,
      warnings: Array.from(new Set([...(primary?.warnings || []), ...(retry?.warnings || [])])).slice(0, 20)
    };
  }

  async function analyzeSmart(images = [], options = {}) {
    const list = Array.isArray(images) ? images : [];
    const fast = await analyze(list, { ...options, accurate: false, languageCorrection: false, smartPreprocess: false });
    if (options.accurateRetry === false || fast?.available === false) return fast;
    const fastById = new Map((Array.isArray(fast?.photos) ? fast.photos : []).map(photo => [clean(photo?.photoId), photo]));
    const retryCandidates = list
      .map((image, index) => {
        const photo = fastById.get(photoIdentity(image, index)) || {};
        const focusBox = photoFocusBox(photo);
        const discovered = labelTextSignal(photo) || (normalizedBox(photo?.labelBox) && Number(photo?.rectangleConfidence || 0) >= 0.55);
        const metadataEvidence = likelyEvidenceImages([image]).length > 0;
        return { ...image, focusBox, smartPreprocess: true, _retryNeeded: needsAccurateRetry(image, photo), _stats: blockStats(photo), _discovered: discovered, _metadataEvidence: metadataEvidence, _quality: photoQualityScore(photo) };
      })
      .filter(image => image._retryNeeded)
      .sort((a, b) => {
        const aNoText = Number(a._stats?.blockCount || 0) === 0 ? 1 : 0;
        const bNoText = Number(b._stats?.blockCount || 0) === 0 ? 1 : 0;
        const aDiscovered = a._discovered ? 1 : 0, bDiscovered = b._discovered ? 1 : 0;
        return bDiscovered - aDiscovered || bNoText - aNoText || Number(a._quality || 0) - Number(b._quality || 0);
      })
      .slice(0, Math.max(0, Math.min(Number(options.accurateRetryPhotos || 2), 3)))
      .map(({ _retryNeeded, _stats, _discovered, _metadataEvidence, _quality, ...image }) => image);
    if (!retryCandidates.length) return { ...fast, fastDurationMs: Number(fast?.durationMs || 0), accurateRetryDurationMs: 0, retryPhotoCount: 0, preprocessVariantCount: 0 };
    const accurate = await analyze(retryCandidates, {
      ...options,
      maxPhotos: retryCandidates.length,
      accurate: true,
      languageCorrection: true,
      smartPreprocess: true,
      languages: options.languages || ["en-US", "fr-FR", "es-ES", "de-DE", "it-IT", "pt-BR"]
    });
    return mergeResults(fast, accurate);
  }

  global.EbayOcrClientV860 = Object.freeze({
    analyze,
    analyzeSmart,
    likelyEvidenceImages,
    imageSource,
    compactImage,
    normalizedBox,
    focusBoxFromBlocks,
    photoFocusBox,
    labelTextSignal,
    careSymbolHint,
    photoQualityScore,
    mergePhotoBlocks,
    blockStats,
    needsAccurateRetry
  });
})(globalThis);

/* ===== AI PIPELINE ===== */
/* Shared AI pipeline: one primary GPT pass plus at most one targeted repair for Fill; OCR/Claude verification only in Review Mode. */
(function initSimpleAiPipeline(global) {
  "use strict";

  async function emit(payload, stage, status, details = {}) {
    if (typeof payload.onStage !== "function") return;
    try { await payload.onStage({ stage, status, at: new Date().toISOString(), ...details }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
  }

  function preparedImages(images, settings) {
    const selector = global.EbayAiPhotoSelectorV790;
    const modeCap = settings?.tokenMode === "cheap" ? 4 : settings?.tokenMode === "quality" ? 8 : 6;
    const capped = { ...(settings || {}), maxPhotosPerRequest: Math.min(Number(settings?.maxPhotosPerRequest || modeCap), modeCap) };
    if (selector?.selectPhotos) return selector.selectPhotos(images || [], capped);
    return (Array.isArray(images) ? images : []).slice(0, modeCap);
  }

  function recoveryImages(images, questions, roleMap = null, limit = 5) {
    const selector = global.EbayAiPhotoSelectorV790;
    const max = Math.max(1, Math.min(Number(limit || 5), 5));
    if (selector?.selectRepairPhotos) return selector.selectRepairPhotos(images || [], questions || [], max, roleMap);
    return (Array.isArray(images) ? images : []).slice(0, max);
  }

  function smartStrictRecoveryImages(primaryImages = [], recoveryPool = [], bundle = {}, questions = [], limit = 5, preferredPhotoIdsByQuestion = {}) {
    const selector = global.EbayAiPhotoSelectorV790;
    const primary = Array.isArray(primaryImages) ? primaryImages : [];
    const pool = Array.isArray(recoveryPool) && recoveryPool.length ? recoveryPool : primary;
    const requested = Array.isArray(questions) ? questions : [];
    const maxLimit = Math.max(1, Math.min(Number(limit || 5), 5));
    const selected = [];
    const seen = new Set();
    const imageKey = image => {
      try { return selector?.photoKey?.(image) || image?.photoId || image?.canonicalUrl || image?.url || image?.src || image?.dataUrl || ''; }
      catch (_) { return image?.photoId || image?.canonicalUrl || image?.url || image?.src || image?.dataUrl || ''; }
    };
    const add = image => {
      if (!image) return false;
      const id = String(imageKey(image) || '');
      if (!id || seen.has(id)) return false;
      selected.push({ ...image, forceHighDetail: true });
      seen.add(id);
      return true;
    };
    const supportNumbers = [];
    for (const question of requested) {
      const result = bundle.modelResults?.[question] || {};
      for (const raw of Array.isArray(result.photoSources) ? result.photoSources : []) {
        const number = Number(raw);
        if (Number.isInteger(number) && number >= 1 && number <= 10 && !supportNumbers.includes(number)) supportNumbers.push(number);
      }
    }
    for (const number of supportNumbers) {
      const image = primary.find(candidate => Number(candidate?.requestPhotoNumber || 0) === number) || primary[number - 1];
      add(image);
    }

    // If local OCR is the reason a missing field is worth a paid re-read, send the
    // exact photo where OCR found that fact before any gallery-order heuristic.
    const preferredIdsFor = question => Array.from(new Set((Array.isArray(preferredPhotoIdsByQuestion?.[question]) ? preferredPhotoIdsByQuestion[question] : []).map(value => String(value || '').trim()).filter(Boolean)));
    for (const question of requested) {
      for (const photoId of preferredIdsFor(question)) {
        if (selected.length >= maxLimit) break;
        const image = pool.find(candidate => String(candidate?.photoId || candidate?.photo_id || '').trim() === photoId);
        add(image);
      }
      if (selected.length >= maxLimit) break;
    }

    const questionsWithoutDirectPhoto = requested.filter(question => {
      const sources = bundle.modelResults?.[question]?.photoSources;
      const hasPrimary = Array.isArray(sources) && sources.some(raw => Number.isInteger(Number(raw)) && Number(raw) >= 1);
      return !hasPrimary && preferredIdsFor(question).length === 0;
    });

    // Do not pay for a second unrelated HIGH-detail image when the exact support
    // photo is already known. Add heuristic fallback capacity only for repair fields
    // that still have no direct photo signal.
    let dynamicMax = selected.length
      ? Math.min(maxLimit, selected.length + (questionsWithoutDirectPhoto.length ? 1 : 0))
      : maxLimit;
    dynamicMax = Math.max(1, dynamicMax);
    const selectorQuestions = questionsWithoutDirectPhoto.length ? questionsWithoutDirectPhoto : requested;
    if (selected.length < dynamicMax) {
      const fallback = recoveryImages(pool, selectorQuestions, null, dynamicMax);
      for (const image of fallback) {
        if (selected.length >= dynamicMax) break;
        add(image);
      }
    }
    if (selected.length < dynamicMax && pool.length > 1) {
      for (const image of recoveryImages(pool, requested, null, dynamicMax)) {
        if (selected.length >= dynamicMax) break;
        add(image);
      }
    }
    return selected.slice(0, dynamicMax);
  }

  function boundedSettings(payload = {}, reviewMode = false) {
    const requestedOutputTokens = Number(payload.settings?.maxOutputTokens);
    const outputCap = payload.settings?.tokenMode === "quality" ? 10000 : payload.settings?.tokenMode === "cheap" ? 4500 : 8000;
    const settings = {
      ...(payload.settings || {}),
      webResearchEnabled: false,
      maxOutputTokens: String(Math.min(outputCap, Math.max(1200, Number.isFinite(requestedOutputTokens) ? requestedOutputTokens : outputCap))),
      reviewFillMode: reviewMode ? (payload.settings?.reviewFillMode || "safe") : "best_answer"
    };
    if (!reviewMode) {
      settings.localOcrValidationEnabled = false;
      settings.claudeReviewEnabled = false;
    }
    return settings;
  }

  function requestId(prefix = "analysis") {
    try { if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID()}`; } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function providerLabel(provider) { return provider === "anthropic" ? "Claude" : "GPT"; }
  function confirmedResult(result = {}) { return ["confirmed_by_tag", "confirmed_by_photo"].includes(String(result.status || "")); }

  // V8.23.21: local OCR is a narrow direct-evidence assistant, never a general visual reasoner.
  // It may independently confirm a GPT label fact or recover a missing allowlisted label
  // fact after the primary pass when evidence is strong and the live eBay option matches exactly.
  const FAST_OCR_VERIFY_FIELDS = new Set([
    "brand", "size", "material", "garment care", "country of origin",
    "country region of manufacture", "model", "product line",
    "us shoe size", "shoe width", "upper material", "lining material", "outsole material"
  ]);

  function simpleFieldKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function fastOcrEligibleQuestions(questions = []) {
    return (Array.isArray(questions) ? questions : []).filter(question => FAST_OCR_VERIFY_FIELDS.has(simpleFieldKey(question)));
  }

  function reliableOcrConfirmation(question, value, validator, blocks = []) {
    if (!validator?.evidenceForField || !String(value || "").trim()) return null;
    if (!FAST_OCR_VERIFY_FIELDS.has(simpleFieldKey(question))) return null;
    let validation = null;
    try { validation = validator.evidenceForField(question, value, blocks); }
    catch (error) {
      globalThis.EbayLogger?.debug?.("Local OCR verification skipped", { field: String(question || ""), message: error?.message || String(error) });
      return null;
    }
    if (validation?.status !== "confirmed") return { status: validation?.status || "not_found", validation };
    const sourceBlocks = Array.isArray(validation.blocks) ? validation.blocks : [];
    if (!sourceBlocks.length) return { status: "not_found", validation };
    const maxConfidence = Math.max(0, ...sourceBlocks.map(block => Number(block?.confidence || 0)).filter(Number.isFinite));
    const consensus = sourceBlocks.some(block => Number(block?.votes || 0) >= 2);
    const fieldKey = simpleFieldKey(question);
    const confidenceFloor = ["brand", "size", "model", "product line", "us shoe size", "shoe width"].includes(fieldKey)
      ? 0.90
      : ["upper material", "lining material", "outsole material"].includes(fieldKey) ? 0.88 : 0.86;
    // A regional Size row may span two OCR observations (for example "USA" and
    // "14"). Never let one excellent block hide a weak/misread partner. Both
    // pieces must be strong, or both must have multi-pass consensus.
    if (fieldKey === "size" && validation?.region === "us" && sourceBlocks.length > 1) {
      const minConfidence = Math.min(...sourceBlocks.map(block => Number(block?.confidence || 0)).filter(Number.isFinite));
      const allConsensus = sourceBlocks.every(block => Number(block?.votes || 0) >= 2);
      if (minConfidence < 0.86 && !(allConsensus && minConfidence >= 0.72)) {
        return { status: "weak", validation, maxConfidence, minConfidence, consensus: allConsensus };
      }
    } else if (maxConfidence < confidenceFloor && !(consensus && maxConfidence >= 0.75)) {
      return { status: "weak", validation, maxConfidence, consensus };
    }
    return { status: "confirmed", validation, maxConfidence, consensus };
  }

  function primaryLabelSupportsOcrSkip(result = {}, validation = {}) {
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    const directLabel = simpleFieldKey(result?.evidenceType) === "physical tag"
      || sources.some(source => simpleFieldKey(source?.type) === "physical tag");
    if (!directLabel) return false;

    const primaryPhotos = new Set();
    for (const value of Array.isArray(result?.photoSources) ? result.photoSources : []) {
      const key = String(value ?? "").trim();
      if (key) primaryPhotos.add(key);
    }
    for (const source of sources) {
      if (simpleFieldKey(source?.type) !== "physical tag") continue;
      for (const value of [source?.photo, source?.photoId, source?.photo_id]) {
        const key = String(value ?? "").trim();
        if (key) primaryPhotos.add(key);
      }
    }
    if (!primaryPhotos.size) return false;

    const ocrBlocks = Array.isArray(validation?.blocks) ? validation.blocks : [];
    return ocrBlocks.some(block => {
      const identifiers = [block?.photo, block?.photoId].map(value => String(value ?? "").trim()).filter(Boolean);
      return identifiers.some(identifier => primaryPhotos.has(identifier));
    });
  }

  const CROSS_PHOTO_LOCAL_EVIDENCE_FIELDS = new Set([
    "brand", "size", "material", "garment care", "country of origin", "country region of manufacture",
    "us shoe size", "shoe width", "upper material", "lining material", "outsole material"
  ]);

  // Local Evidence Engine: an independent high-confidence OCR read may validate a strict
  // physical fact even when GPT cited a different gallery photo. The field-specific validator
  // already rejects conflicting sizes, wrong material scope and wrong shoe components. Model/
  // Product Line stay same-photo only because generic text elsewhere is more ambiguous.
  function localEvidenceSupportsIndependentSkip(question, primaryResult = {}, validation = {}) {
    if (primaryLabelSupportsOcrSkip(primaryResult, validation)) return { ok: true, mode: "same_photo" };
    const fieldKey = simpleFieldKey(question);
    if (!CROSS_PHOTO_LOCAL_EVIDENCE_FIELDS.has(fieldKey)) return { ok: false, mode: "same_photo_required" };
    const blocks = Array.isArray(validation?.blocks) ? validation.blocks : [];
    if (!blocks.length || validation?.status !== "confirmed") return { ok: false, mode: "no_confirmed_local_evidence" };
    const photoIds = Array.from(new Set(blocks.map(block => String(block?.photoId || "").trim()).filter(Boolean)));
    return { ok: true, mode: "cross_photo_local_evidence", photoIds };
  }

  function localOcrSources(question, blocks = []) {
    const fieldKey = simpleFieldKey(question);
    const scope = fieldKey === "upper material" ? "upper"
      : fieldKey === "lining material" ? "lining"
      : fieldKey === "outsole material" ? "outsole"
      : "whole_item";
    return (Array.isArray(blocks) ? blocks : []).slice(0, 6).map(block => ({
      photoId: String(block?.photoId || ""),
      photo: Number(block?.photo || block?.displayNumber || 0),
      type: "physical_tag",
      scope,
      provider: "local_ocr",
      evidence: String(block?.text || "").replace(/\s+/g, " ").trim().slice(0, 180),
      confidence: Number(block?.confidence || 0)
    })).filter(source => source.evidence);
  }

  function mergeDiagnosticSources(existing = [], additions = []) {
    const out = [];
    const seen = new Set();
    for (const source of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(additions) ? additions : [])]) {
      if (!source || typeof source !== "object") continue;
      const id = [source.photoId || "", source.photo || 0, source.provider || "", source.type || "", source.evidence || ""].join("|");
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(source);
    }
    return out.slice(0, 12);
  }

  function applyFastOcrIndependentVerification(bundle = {}, candidateQuestions = [], ocr = {}, validator = null, fields = []) {
    const next = {
      ...bundle,
      evidence: { ...(bundle.evidence || {}) },
      modelResults: { ...(bundle.modelResults || {}) },
      rejectionReasons: { ...(bundle.rejectionReasons || {}) },
      warnings: [...(bundle.warnings || [])]
    };
    const blocks = validator?.photoBlocks ? validator.photoBlocks(ocr) : [];
    const byField = new Map((Array.isArray(fields) ? fields : []).map(field => [simpleFieldKey(field?.name || field?.label), field]));
    const confirmed = [];
    const conflicts = [];
    const weak = [];

    if (ocr?.available !== true || ocr?.ok !== true || !blocks.length) {
      return { bundle: next, confirmed, conflicts, weak, available: false, blocks };
    }

    for (const question of fastOcrEligibleQuestions(candidateQuestions)) {
      let value = String(next.answers?.[question] || "").trim();
      if (!value) continue;

      // A direct physical label may be more specific than the primary model while
      // remaining semantically identical (for example Cashmere -> 100% Cashmere).
      // Upgrade only when the local parser can prove the percentage from OCR and the
      // precise candidate still passes the normal option/live-verification contract.
      if (simpleFieldKey(question) === "material" && validator?.deriveOcrCandidate) {
        const field = byField.get(simpleFieldKey(question)) || { name: question, options: [], optionsComplete: false };
        let localCandidate = null;
        try { localCandidate = validator.deriveOcrCandidate(question, blocks, field); }
        catch (error) { globalThis.EbayLogger?.debug?.("Local OCR material specificity check skipped", { message: error?.message || String(error) }); }
        const localValue = String(localCandidate?.value || "").trim();
        const baseLocal = localValue.replace(/^\s*100\s*%\s*/i, "").trim();
        const basePrimary = value.replace(/^\s*\d+(?:\.\d+)?\s*%\s*/i, "").trim();
        if (/^100\s*%/i.test(localValue) && simpleFieldKey(baseLocal) === simpleFieldKey(basePrimary)) {
          const precise = exactLocalOcrOptionValue(field, localValue);
          const preciseCheck = precise ? reliableOcrConfirmation(question, precise, validator, blocks) : null;
          if (precise && preciseCheck?.status === "confirmed") {
            value = precise;
            next.answers = { ...(next.answers || {}), [question]: precise };
            next.modelResults[question] = {
              ...(next.modelResults[question] || {}),
              value: precise,
              resolvedValue: precise,
              localOcrSpecificityUpgrade: true,
              primaryValueBeforeLocalUpgrade: String(bundle.answers?.[question] || "").trim()
            };
          }
        }
      }

      const checked = reliableOcrConfirmation(question, value, validator, blocks);
      if (!checked) continue;
      if (checked.status === "confirmed") {
        const priorResult = next.modelResults[question] || {};
        const localEvidenceDecision = localEvidenceSupportsIndependentSkip(question, priorResult, checked.validation);
        if (!localEvidenceDecision.ok) {
          weak.push(question);
          continue;
        }
        const sources = localOcrSources(question, checked.validation?.blocks || []);
        const priorEvidence = next.evidence[question] || {};
        const localEvidenceText = sources.map(source => source.evidence).filter(Boolean).join(" | ").slice(0, 420);
        next.modelResults[question] = {
          ...priorResult,
          independentVerification: true,
          independentVerifier: "local_ocr",
          localEvidenceMode: localEvidenceDecision.mode,
          ocrStatus: "confirmed_by_ocr",
          localOcrConfidence: Number(checked.maxConfidence || 0),
          evidenceType: "physical_tag",
          evidenceScope: sources[0]?.scope || priorResult.evidenceScope || "whole_item",
          evidence: localEvidenceText || priorResult.evidence || "",
          status: "confirmed_by_tag",
          modelStatus: "confirmed",
          sources: mergeDiagnosticSources(priorResult.sources, sources)
        };
        next.evidence[question] = {
          ...priorEvidence,
          independentVerification: true,
          independentVerifier: "local_ocr",
          localEvidenceMode: localEvidenceDecision.mode,
          ocrStatus: "confirmed_by_ocr",
          evidenceType: "physical_tag",
          evidenceScope: sources[0]?.scope || priorEvidence.evidenceScope || "whole_item",
          evidence: localEvidenceText || priorEvidence.evidence || "",
          sources: mergeDiagnosticSources(priorEvidence.sources, sources)
        };
        delete next.rejectionReasons[question];
        confirmed.push(question);
        continue;
      }
      if (checked.status === "conflict") {
        conflicts.push(question);
        const detected = Array.isArray(checked.validation?.detected) ? checked.validation.detected : [];
        next.modelResults[question] = {
          ...(next.modelResults[question] || {}),
          localOcrConflict: true,
          localOcrDetectedValues: detected
        };
        next.rejectionReasons[question] = "Local OCR detected conflicting direct label text. Independently re-read the exact field; do not assume the primary value.";
      } else if (checked.status === "weak") weak.push(question);
    }

    next.fastOcrVerification = {
      available: true,
      confirmed: [...confirmed],
      conflicts: [...conflicts],
      weak: [...weak],
      blockCount: blocks.length
    };
    return { bundle: next, confirmed, conflicts, weak, available: true, blocks };
  }


  const LIVE_EXACT_OCR_FIELDS = new Set([
    "brand", "size", "material", "garment care", "us shoe size", "shoe width", "upper material", "lining material", "outsole material",
    "country of origin", "country region of manufacture"
  ]);

  function exactLocalOcrOptionValue(field = {}, value = "") {
    const options = (Array.isArray(field?.options) ? field.options : []).map(option => String(option || "").trim()).filter(Boolean);
    if (!options.length) {
      const fieldKey = simpleFieldKey(field?.name || field?.label || "");
      const candidate = String(value || "").trim();
      // Only direct physical-label fields may cross an intentionally incomplete
      // snapshot. The value still has to pass the local evidence gate, and the
      // shared Fill Engine must find/confirm the exact live eBay option later.
      return field?.optionsComplete === false && LIVE_EXACT_OCR_FIELDS.has(fieldKey) ? candidate : "";
    }
    const byKey = new Map(options.map(option => [simpleFieldKey(option), option]));
    const values = String(value || "").split(/\s*,\s*/).map(item => item.trim()).filter(Boolean);
    if (!values.length) return "";
    const matched = values.map(item => byKey.get(simpleFieldKey(item)) || "");
    if (matched.every(Boolean)) return matched.join(", ");
    // A compact eBay snapshot may expose only the first slice of a virtualized
    // dropdown. Strong, field-specific local OCR may proceed to the shared Fill
    // Engine, which must open the live dropdown and confirm the exact value.
    const fieldKey = simpleFieldKey(field?.name || field?.label || "");
    if (field?.optionsComplete === false && LIVE_EXACT_OCR_FIELDS.has(fieldKey)) return String(value || "").trim();
    return "";
  }

  function applyFastOcrMissingRecovery(bundle = {}, candidateQuestions = [], ocr = {}, validator = null, fields = []) {
    const next = {
      ...bundle,
      answers: { ...(bundle.answers || {}) },
      evidence: { ...(bundle.evidence || {}) },
      modelResults: { ...(bundle.modelResults || {}) },
      rejectionReasons: { ...(bundle.rejectionReasons || {}) },
      warnings: [...(bundle.warnings || [])]
    };
    const recovered = [];
    const weak = [];
    if (ocr?.available !== true || ocr?.ok !== true || !validator?.photoBlocks || !validator?.deriveOcrCandidate) {
      return { bundle: next, recovered, weak, available: false };
    }
    const blocks = validator.photoBlocks(ocr);
    if (!blocks.length) return { bundle: next, recovered, weak, available: true };
    const byKey = new Map((Array.isArray(fields) ? fields : []).map(field => [simpleFieldKey(field?.name || field?.label), field]));

    for (const question of fastOcrEligibleQuestions(candidateQuestions)) {
      if (String(next.answers?.[question] || "").trim()) continue;
      const field = byKey.get(simpleFieldKey(question)) || { name: question, options: [] };
      let candidate = null;
      try { candidate = validator.deriveOcrCandidate(question, blocks, field); }
      catch (error) {
        globalThis.EbayLogger?.debug?.("Local OCR direct recovery skipped", { field: String(question || ""), message: error?.message || String(error) });
        continue;
      }
      if (!candidate?.value) continue;
      const exactValue = exactLocalOcrOptionValue(field, candidate.value);
      if (!exactValue) continue;
      candidate = { ...candidate, value: exactValue };
      const checked = reliableOcrConfirmation(question, candidate.value, validator, blocks);
      if (!checked || checked.status !== "confirmed") {
        if (checked?.status === "weak") weak.push(question);
        continue;
      }
      const sourceBlocks = Array.isArray(checked.validation?.blocks) ? checked.validation.blocks : (Array.isArray(candidate.blocks) ? candidate.blocks : []);
      const sources = localOcrSources(question, sourceBlocks);
      if (!sources.length) continue;
      const photoSources = Array.from(new Set(sources.flatMap(source => [source.photo, source.photoId]).map(value => String(value ?? "").trim()).filter(Boolean))).slice(0, 6);
      const maxConfidence = Math.max(0, ...sources.map(source => Number(source.confidence || 0)).filter(Number.isFinite));
      const evidenceText = sources.map(source => source.evidence).filter(Boolean).join(" | ").slice(0, 420);
      next.answers[question] = String(candidate.value).trim();
      delete next.rejectionReasons[question];
      next.modelResults[question] = {
        ...(next.modelResults[question] || {}),
        value: String(candidate.value).trim(),
        proposedValue: String(candidate.value).trim(),
        rawValue: String(candidate.value).trim(),
        candidateValues: [String(candidate.value).trim()],
        confidence: Math.max(0.90, maxConfidence),
        evidenceType: "physical_tag",
        evidenceScope: sources[0]?.scope || "whole_item",
        evidence: evidenceText,
        photoSources,
        sources,
        status: "confirmed_by_tag",
        modelStatus: "confirmed",
        autoFillAllowed: true,
        localOcrRecovery: true,
        localOcrConfidence: maxConfidence
      };
      next.evidence[question] = {
        ...(next.evidence[question] || {}),
        value: String(candidate.value).trim(),
        status: "confirmed_by_tag",
        evidenceType: "physical_tag",
        evidenceScope: sources[0]?.scope || "whole_item",
        evidence: evidenceText,
        sources,
        localOcrRecovery: true
      };
      recovered.push(question);
    }
    return { bundle: next, recovered, weak, available: true };
  }

  function fastOcrEvidenceContext(ocrResult = {}, questions = [], validator = null, primaryImages = []) {
    const empty = { promptHint: "", recoverableQuestionKeys: new Set(), facts: [] };
    if (ocrResult?.available !== true || ocrResult?.ok !== true || !validator?.photoBlocks || !validator?.detectLabelFacts) return empty;
    let blocks = [], facts = [];
    try {
      blocks = validator.photoBlocks(ocrResult);
      facts = validator.detectLabelFacts(blocks);
    } catch (error) {
      globalThis.EbayLogger?.debug?.("OCR prompt hint extraction skipped", { message: error?.message || String(error) });
      return empty;
    }
    if (!blocks.length || !facts.length) return empty;

    const requested = (Array.isArray(questions) ? questions : []).map(question => ({ question, key: simpleFieldKey(question) }));
    const suppliedPhotoNumbers = new Map((Array.isArray(primaryImages) ? primaryImages : []).map((image, index) => [String(image?.photoId || image?.photo_id || "").trim(), Number(image?.requestPhotoNumber || index + 1)]).filter(([id]) => id));
    const policy = global.EbayAiItemSpecificsV7100;
    const relevantQuestionKeys = factField => {
      const factKey = simpleFieldKey(factField);
      const out = [];
      for (const item of requested) {
        if (factKey === item.key) out.push(item.key);
        else if (factKey === "brand" && item.key === "brand") out.push(item.key);
        else if (factKey === "size" && (item.key === "size" || policy?.isShoeSizeField?.(item.question) === true)) out.push(item.key);
        else if (factKey === "material" && item.key === "material") out.push(item.key);
        else if (factKey === "garment care" && item.key === "garment care") out.push(item.key);
        else if (factKey === "country of origin" && ["country of origin", "country region of manufacture", "country region of origin"].includes(item.key)) out.push(item.key);
      }
      return out;
    };

    const accepted = [];
    const recoverableQuestionKeys = new Set();
    for (const fact of facts) {
      const targets = relevantQuestionKeys(fact?.field);
      if (!targets.length) continue;
      const sourceBlocks = Array.isArray(fact?.blocks) ? fact.blocks : [];
      const maxConfidence = Math.max(0, ...sourceBlocks.map(block => Number(block?.confidence || 0)).filter(Number.isFinite));
      const consensus = sourceBlocks.some(block => Number(block?.votes || 0) >= 2);
      const fieldKey = simpleFieldKey(fact?.field);
      const floor = ["brand", "size", "country of origin", "us shoe size", "shoe width"].includes(fieldKey)
        ? 0.88
        : ["upper material", "lining material", "outsole material"].includes(fieldKey) ? 0.86 : 0.84;
      if (Number(fact?.confidence || 0) < 0.9) continue;
      if (maxConfidence < floor && !(consensus && maxConfidence >= 0.76)) continue;
      const photos = Array.from(new Set(sourceBlocks.map(block => suppliedPhotoNumbers.get(String(block?.photoId || "").trim())).filter(photo => Number.isInteger(photo) && photo > 0))).slice(0, 2);
      for (const key of targets) recoverableQuestionKeys.add(key);
      const photoIds = Array.from(new Set(sourceBlocks.map(block => String(block?.photoId || "").trim()).filter(Boolean))).slice(0, 4);
      accepted.push({ field: String(fact.field || ""), value: String(fact.value || ""), photos, photoIds, targetKeys: [...targets], confidence: maxConfidence, consensus, supplied: photos.length > 0 });
      if (accepted.length >= 6) break;
    }
    if (!accepted.length) return empty;
    const lines = accepted.filter(fact => fact.supplied).map(fact => `${fact.field}: ${fact.value} [photo ${fact.photos.join(",")}]`);
    return {
      promptHint: lines.length ? [
        "LOCAL OCR HINTS (untrusted assist only): local macOS Vision independently detected the following label text. Use it to focus the first read, but verify every strict value against the referenced supplied photo; OCR text alone is never proof and may be wrong.",
        ...lines
      ].join("\n") : "",
      recoverableQuestionKeys,
      facts: accepted
    };
  }

  function repairDecisionReason(question, bundle = {}, recoverableOcrKeys = new Set()) {
    const result = bundle.modelResults?.[question] || {};
    const answered = Boolean(String(bundle.answers?.[question] || "").trim());
    const hadRejectedCandidate = Boolean(String(result.rawValue || result.proposedValue || result.primaryValue || "").trim());
    const ocrConflict = result.localOcrConflict === true;
    const recoverableMissing = recoverableOcrKeys.has(simpleFieldKey(question));
    if (ocrConflict) return { code: "ocr_conflict", reason: "Local OCR conflicts with the primary strict value; independently re-read this exact field." };
    if (answered) return { code: "accepted_without_local_confirmation", reason: "Primary returned a strict value, but direct local evidence was not strong enough to independently confirm it." };
    if (hadRejectedCandidate) return { code: "primary_candidate_rejected", reason: "Primary proposed a strict value that failed deterministic/evidence validation." };
    if (recoverableMissing) return { code: "local_direct_evidence_detected", reason: "Primary left this strict field blank, but local OCR detected direct product evidence worth one targeted re-read." };
    return { code: "no_direct_evidence", reason: "No accepted value and no direct local evidence signal; do not spend a repair request on this field." };
  }

  function buildLocalEvidenceRepairPlan(bundle = {}, verificationPlan = {}, fastOcrContext = {}, ocrVerifiedQuestions = []) {
    const verified = new Set(Array.isArray(ocrVerifiedQuestions) ? ocrVerifiedQuestions : []);
    const recoverableOcrKeys = fastOcrContext?.recoverableQuestionKeys || new Set();
    const questions = [];
    const skippedNoEvidence = [];
    const decisions = [];
    for (const question of (Array.isArray(verificationPlan?.questions) ? verificationPlan.questions : [])) {
      if (verified.has(question)) {
        decisions.push({ field: question, action: "skip", code: "local_ocr_verified", reason: "Local OCR independently confirmed the strict value." });
        continue;
      }
      const detail = repairDecisionReason(question, bundle, recoverableOcrKeys);
      const repair = detail.code !== "no_direct_evidence";
      decisions.push({ field: question, action: repair ? "repair" : "skip", ...detail });
      if (repair) questions.push(question);
      else skippedNoEvidence.push(question);
    }
    return { questions, skippedNoEvidence, decisions };
  }

  function promoteOcrEvidenceImages(images = [], ocrResult = {}) {
    const text = (value, limit = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
    const byId = new Map((Array.isArray(ocrResult?.photos) ? ocrResult.photos : []).map(photo => [text(photo?.photoId, 180), photo]));
    const labelPattern = /(?:\bsize\b|\bmade in\b|\bcountry of origin\b|\bmaterial\b|\bcomposition\b|\bcotton\b|\bpolyester\b|\bnylon\b|\bwool\b|\blinen\b|\bsilk\b|\bcashmere\b|\bleather\b|\bsuede\b|\bsynthetic\b|\bman[- ]made\b|\bupper\b|\blining\b|\boutsole\b|\bsole\b|\bstyle(?:\s*no)?\b|\bmodel\b|\brn\s*#?\s*\d|\bmachine wash\b|\bdry clean\b|\bhand wash\b)/i;
    return (Array.isArray(images) ? images : []).map((image, index) => {
      const id = text(image?.photoId || image?.photo_id || `photo-${index + 1}`, 180);
      const photo = byId.get(id);
      const blocks = Array.isArray(photo?.blocks) ? photo.blocks : [];
      const directBlocks = blocks.filter(block => labelPattern.test(text(block?.text, 500)));
      const strongDirect = directBlocks.filter(block => Number(block?.confidence || 0) >= 0.93);
      const consensusDirect = directBlocks.filter(block => Number(block?.confidence || 0) >= 0.78 && (Number(block?.votes || 0) >= 2 || Number(block?.variantVotes || 0) >= 2));
      const medium = blocks.filter(block => Number(block?.confidence || 0) >= 0.62);
      const careToken = medium.some(block => /^(?:P|F|W|30|40|60)$/i.test(text(block?.text, 20)) && (Number(block?.votes || 0) >= 2 || Number(block?.variantVotes || 0) >= 2));
      const geometry = photo?.rectangleDetected === true && Number(photo?.rectangleConfidence || 0) >= 0.60;
      const strongLocalRead = strongDirect.length > 0 || consensusDirect.length > 0;
      const hasLabelSignal = directBlocks.length > 0 || (geometry && careToken);
      if (strongLocalRead) {
        return { ...image, localOcrEvidenceCandidate: true, localOcrStrongEvidenceCandidate: true, localOcrNeedsHighDetail: false, careSymbolCandidate: careToken };
      }
      if (hasLabelSignal) {
        return { ...image, forceHighDetail: true, localOcrEvidenceCandidate: true, localOcrStrongEvidenceCandidate: false, localOcrNeedsHighDetail: true, careSymbolCandidate: careToken };
      }
      return image;
    });
  }

  async function runFastFillOcr({ payload, settings, images, questions, ocrClient }) {
    const eligible = fastOcrEligibleQuestions(questions);
    if (!eligible.length || settings?.smartLocalOcrVerify === false || !ocrClient?.analyzeSmart) return emptyOcr(false);
    const pool = Array.isArray(payload?.allImages) && payload.allImages.length ? payload.allImages : (Array.isArray(images) ? images : []);
    const likely = ocrClient.likelyEvidenceImages ? ocrClient.likelyEvidenceImages(pool) : [];
    const byId = new Map();
    const add = image => {
      const id = String(image?.photoId || image?.photo_id || image?.canonicalUrl || image?.url || image?.src || '').trim();
      if (!id || byId.has(id)) return;
      byId.set(id, image);
    };
    likely.forEach(add);
    pool.forEach(add);
    const selected = Array.from(byId.values()).slice(0, 12);
    if (!selected.length) return emptyOcr(false);
    await emit(payload, "fast_ocr_verification", "started", { photoCount: selected.length, questionCount: eligible.length, provider: "local_macos_vision" });
    let result;
    try {
      result = await ocrClient.analyzeSmart(selected, {
        maxPhotos: selected.length,
        accurateRetry: true,
        accurateRetryPhotos: 3,
        languageCorrection: false,
        smartPreprocess: true,
        languages: ["en-US", "fr-FR", "es-ES", "de-DE", "it-IT", "pt-BR"]
      });
    } catch (error) {
      result = { ok: false, available: false, engine: "macos_vision", photos: [], warnings: [String(error?.message || error || "OCR failed.")] };
    }
    result = normalizedOcrResult(result || emptyOcr(false));
    await emit(payload, "fast_ocr_verification", result?.healthy ? "completed" : result?.ok ? "no_text" : "unavailable", {
      durationMs: Number(result?.durationMs || 0),
      photoCount: Number(result?.photoCount || selected.length),
      blockCount: Number(result?.blockCount || 0),
      provider: "local_macos_vision"
    });
    return result;
  }

  function normalizedOcrResult(result = {}, fallbackEngine = "macos_vision") {
    const photos = Array.isArray(result?.photos) ? result.photos : [];
    const blockCount = Number(result?.blockCount ?? photos.reduce((sum, photo) => sum + (Array.isArray(photo?.blocks) ? photo.blocks.length : 0), 0));
    return {
      ...result,
      engine: String(result?.engine || fallbackEngine),
      blockCount,
      healthy: result?.available === true && result?.ok === true && blockCount > 0
    };
  }

  function emptyOcr(reviewMode = false) {
    return { ok: false, available: false, healthy: false, engine: reviewMode ? "unavailable" : "not_run", photos: [], warnings: reviewMode ? ["OCR verification is unavailable."] : [] };
  }

  function buildAnalysisSummary(bundle = {}, questions = [], reviewerQuestions = [], reviewerRecoveredCount = 0) {
    const ordered = Array.isArray(questions) ? questions : [];
    const answerKeys = ordered.filter(question => String(bundle.answers?.[question] || bundle.suggestedAnswers?.[question] || bundle.modelResults?.[question]?.value || "").trim());
    const confirmedCount = answerKeys.filter(question => confirmedResult(bundle.modelResults?.[question] || {})).length;
    const ocr = bundle.ocr && typeof bundle.ocr === "object" ? bundle.ocr : {};
    return {
      questionsProcessed: ordered.length,
      questionCount: ordered.length,
      answerCount: answerKeys.length,
      confirmedCount,
      reviewCandidateCount: Math.max(0, answerKeys.length - confirmedCount),
      notFilledCount: Math.max(0, ordered.length - answerKeys.length),
      reviewEntryCount: ordered.length,
      ocr: {
        available: ocr.available === true, healthy: ocr.healthy === true, engine: String(ocr.engine || ""), helperVersion: String(ocr.helperVersion || ""),
        photoCount: Number(ocr.photoCount || 0), successfulPhotoCount: Number(ocr.successfulPhotoCount || 0), textPhotoCount: Number(ocr.textPhotoCount || 0), emptyPhotoCount: Number(ocr.emptyPhotoCount || 0),
        blockCount: Number(ocr.blockCount || 0), cacheHitCount: Number(ocr.cacheHitCount || 0), preprocessVariantCount: Number(ocr.preprocessVariantCount || 0), preprocessedPhotoCount: Number(ocr.preprocessedPhotoCount || 0),
        factCount: Number(ocr.factCount || 0), confirmedCount: Number(ocr.confirmedCount || 0), recoveredCount: Number(ocr.recoveredCount || 0), correctedCount: Number(ocr.correctedCount || 0),
        conflictCount: Number(ocr.conflictCount || 0), notConfirmedCount: Number(ocr.notConfirmedCount || 0), warnings: Array.isArray(ocr.warnings) ? ocr.warnings.slice(0, 5) : []
      },
      claude: { checkedCount: Array.isArray(reviewerQuestions) ? reviewerQuestions.length : 0, recoveredCount: Number(reviewerRecoveredCount || 0) }
    };
  }

  async function confirmedRequest({ analyzer, payload, settings, prompt, images, questions, fields = [], stage, timeoutMs, provider = "openai", analysisRequestId = "", reviewMode = false, systemInstructions = "", requestMeta = {}, requestBudget = null }) {
    const startedAt = Date.now();
    const label = providerLabel(provider);
    if (provider === "openai" && requestBudget) {
      const max = Math.max(1, Number(requestBudget.maxOpenAiRequests || 1));
      const used = Math.max(0, Number(requestBudget.openAiRequests || 0));
      if (used >= max) {
        const error = new Error(`OpenAI request budget exhausted for this analysis (${used}/${max}); remaining fields require review.`);
        error.code = "ANALYSIS_REQUEST_BUDGET_EXHAUSTED";
        throw error;
      }
      requestBudget.openAiRequests = used + 1;
    }
    await emit(payload, stage, "started", {
      timeoutMs, questionCount: questions.length, photoCount: images.length, provider,
      fields: (Array.isArray(requestMeta?.questionNames) ? requestMeta.questionNames : questions).slice(0, 12),
      repairReasons: (Array.isArray(requestMeta?.repairReasons) ? requestMeta.repairReasons : []).slice(0, 12)
    });
    try {
      const response = await analyzer.analyzePhotos({ settings, prompt, images, questions, fields, stage, provider, requestId: analysisRequestId, estimate: payload.estimate || {}, apiTimeoutMs: timeoutMs, reviewMode, systemInstructions, requestMeta });
      if (response?.ok !== true || response?.requestConfirmed !== true || !String(response?.text || "").trim()) throw new Error(`${label} request was not confirmed by the secure backend.`);
      const durationMs = Date.now() - startedAt;
      await emit(payload, stage, "completed", {
        durationMs, provider, requestConfirmed: true, upstreamStatus: Number(response.transport?.upstreamStatus || 0),
        inputTokens: Number(response.usage?.inputTokens || 0), outputTokens: Number(response.usage?.outputTokens || 0), totalTokens: Number(response.usage?.totalTokens || 0), cost: Number(response.usage?.cost || 0),
        fields: (Array.isArray(requestMeta?.questionNames) ? requestMeta.questionNames : questions).slice(0, 12),
        repairReasons: (Array.isArray(requestMeta?.repairReasons) ? requestMeta.repairReasons : []).slice(0, 12),
        providerRequestId: String(response.transport?.providerRequestId || ""), proxyRequestId: String(response.transport?.proxyRequestId || "")
      });
      return { response, durationMs };
    } catch (error) {
      const message = /timeout|timed out|aborted/i.test(String(error?.message || error))
        ? `${label} ${stage} request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
        : `${label} ${stage} request failed: ${error?.message || error}`;
      await emit(payload, stage, "failed", { durationMs: Date.now() - startedAt, message, provider });
      throw new Error(message);
    }
  }

  async function runReviewOcr({ payload, images, ocrClient }) {
    if (payload.settings?.localOcrValidationEnabled === false || !ocrClient?.analyze) return emptyOcr(true);
    await emit(payload, "ocr_validation", "started", { photoCount: images.length, provider: "local_macos_vision" });
    const analyzeOcr = typeof ocrClient.analyzeSmart === "function" ? ocrClient.analyzeSmart.bind(ocrClient) : ocrClient.analyze.bind(ocrClient);
    const result = normalizedOcrResult(await analyzeOcr(images, { maxPhotos: images.length, accurateRetry: true, accurateRetryPhotos: 2, languageCorrection: false, smartPreprocess: true, languages: ["en-US", "fr-FR", "es-ES", "de-DE", "it-IT", "pt-BR"] }));
    const blockCount = Number(result.blockCount || 0);
    await emit(payload, "ocr_validation", result.healthy ? "completed" : result?.ok ? "no_text" : "unavailable", { durationMs: Number(result?.durationMs || 0), photoCount: Array.isArray(result?.photos) ? result.photos.length : 0, blockCount, warning: String((result?.warnings || [])[0] || ""), provider: "local_macos_vision" });
    return result;
  }

  async function analyzeListingOnce(payload = {}) {
    const promptApi = global.EbayAiPromptV711;
    const analyzer = global.EbayAiAnalyzeV711;
    const processor = global.EbayCoreAiAnswerProcessorV800;
    const reviewerApi = global.EbayClaudeReviewerV850;
    const ocrClient = global.EbayOcrClientV860;
    const evidenceValidator = global.EbayEvidenceValidatorV860;
    if (!promptApi || !analyzer || !processor) throw new Error("Core AI modules are not loaded.");

    const reviewMode = payload.reviewMode === true || payload.mode === "review";
    const settings = boundedSettings(payload, reviewMode);
    const images = payload.imagesPrepared === true ? (Array.isArray(payload.images) ? payload.images : []) : preparedImages(payload.images, settings);
    const photoSelection = global.EbayAiPhotoSelectorV790?.selectionSummary?.(images) || { selectedCount: images.length, highDetailCount: 0, evidenceCandidateCount: 0, reasons: [] };
    const questions = promptApi.cleanQuestionList(payload.questions || []);
    const fields = payload.fields || payload.pageContext?.fields || payload.pageContext?.fieldCatalog || [];
    const analysisRunId = requestId(reviewMode ? "review" : "fill");
    // Hard invariant for normal Fill: one primary OpenAI request plus at most one
    // targeted repair. This budget is counted before transport, so no later code
    // path can silently create a third paid analysis stage. Review Mode still uses
    // one OpenAI primary plus its separate optional Claude reviewer.
    const requestBudget = { maxOpenAiRequests: reviewMode ? 1 : 2, openAiRequests: 0 };
    const pipelineStartedAt = Date.now();
    if (!images.length) throw new Error("No product photos were supplied to GPT.");
    if (!questions.length) throw new Error("No Item Specific questions were supplied to GPT.");

    // V8.23.21 cost-first evidence routing: local OCR runs before the paid Vision
    // request. It does not create normal-Fill answers, but it may identify which
    // selected photos actually contain small printed label evidence. Only those
    // photos are promoted to HIGH detail; ordinary visual photos stay LOW.
    let ocrResult = emptyOcr(reviewMode);
    if (!reviewMode && payload.allowRecovery !== false && settings.smartLocalOcrVerify !== false) {
      ocrResult = await runFastFillOcr({ payload: { ...payload, settings }, settings, images, questions, ocrClient });
    }
    const primaryImages = !reviewMode && ocrResult?.healthy ? promoteOcrEvidenceImages(images, ocrResult) : images;
    const fastOcrContext = !reviewMode ? fastOcrEvidenceContext(ocrResult, questions, evidenceValidator, primaryImages) : { promptHint: "", recoverableQuestionKeys: new Set(), facts: [] };

    const primaryPromptBase = String(payload.prompt || "").trim() || promptApi.buildItemSpecificsPrompt({ existingTitle: payload.existingTitle || payload.pageContext?.currentTitle || "", category: payload.category || payload.pageContext?.category || "", questions, fields, currentValues: payload.pageContext?.fieldSummary || payload.currentValues || {}, pageContext: payload.pageContext || {}, customInstruction: payload.customInstruction ?? settings.customAiInstruction ?? "", purpose: reviewMode ? "review" : "fill" });
    const primaryPrompt = fastOcrContext.promptHint ? `${primaryPromptBase}\n\n${fastOcrContext.promptHint}` : primaryPromptBase;
    const primaryTimeoutMs = Math.max(30000, Math.min(Number(payload.primaryTimeoutMs || 75000), 90000));
    const primary = await confirmedRequest({
      analyzer, payload, settings, prompt: primaryPrompt, images: primaryImages, questions, fields, stage: "primary",
      timeoutMs: primaryTimeoutMs, provider: "openai", analysisRequestId: analysisRunId, reviewMode, requestBudget,
      requestMeta: {
        questionNames: questions.slice(0, 40),
        repairReasons: [],
        photoIds: primaryImages.map(image => String(image?.photoId || image?.photo_id || "").trim()).filter(Boolean).slice(0, 10),
        highDetailPhotoCount: primaryImages.filter(image => global.EbayAiRequestV711?.imageDetail?.(image, settings, "primary") === "high" || image?.forceHighDetail === true).length
      }
    });
    const requireSources = reviewMode && global.EbayAiRequestV711?.isOpenAiHost?.(settings) === true;
    const sellerContextOptions = {
      existingTitle: payload.existingTitle || payload.pageContext?.currentTitle || "",
      customInstruction: payload.customInstruction ?? settings.customAiInstruction ?? ""
    };
    let bundle = processor.parseAnswerBundle(primary.response.text, questions, fields, { reviewMode, requireSources, requireFacts: false, photoCatalog: images, modelProvider: "openai", ...sellerContextOptions });
    let fastOcrRecoveredQuestions = [], fastOcrRecoveryWeakQuestions = [];
    if (!reviewMode && ocrResult?.healthy) {
      const localRecovery = applyFastOcrMissingRecovery(bundle, questions, ocrResult, evidenceValidator, fields);
      bundle = localRecovery.bundle;
      fastOcrRecoveredQuestions = localRecovery.recovered;
      fastOcrRecoveryWeakQuestions = localRecovery.weak;
    }
    let usage = primary.response.usage || {};
    const confirmations = [{
      stage: "primary", provider: "openai", upstreamStatus: Number(primary.response.transport?.upstreamStatus || 0),
      inputTokens: Number(primary.response.usage?.inputTokens || 0), outputTokens: Number(primary.response.usage?.outputTokens || 0), totalTokens: Number(primary.response.usage?.totalTokens || 0),
      cost: Number(primary.response.usage?.cost || 0), costKnown: primary.response.usage?.reported === true,
      questionNames: questions.slice(0, 40),
      providerRequestId: String(primary.response.transport?.providerRequestId || ""), proxyRequestId: String(primary.response.transport?.proxyRequestId || "")
    }];
    let requests = 1;
    let attemptedRequests = 1;
    let fastRepairUsed = false, fastRepairStatus = reviewMode ? "not_run" : "not_needed", fastRepairError = "", fastRepairMs = 0, fastRepairQuestions = [], fastRepairSkippedDirect = [], fastRepairSkippedNoEvidence = [], fastRepairPhotoCount = 0, fastRepairRecoveredCount = 0, fastRepairDecisions = [];
    let fastOcrVerifiedQuestions = [], fastOcrConflictQuestions = [], fastOcrWeakQuestions = [];
    let reviewerUsed = false, reviewerStatus = reviewMode ? "not_requested" : "not_run", reviewerError = "", reviewerMs = 0, reviewerQuestions = [], reviewerRecoveredCount = 0, validationMs = 0;

    // Normal Fill may use at most one bounded second request. V8.23.21 reserves it
    // for rejected/conflicting strict evidence or a missing strict fact that has a
    // concrete local evidence signal. Validated direct primary support stays single-pass.
    // The verifier never sees the primary candidate value.
    if (!reviewMode && payload.allowRecovery !== false) {
      // V8.23.21: run local OCR conflict detection across the full strict candidate
      // set first. Then plan a paid second read only for unresolved/rejected evidence.
      // A valid direct primary support record is accepted in normal Fill; full independent
      // verification remains available in Review Mode.
      const verificationLimit = 8;
      const locallyRecoveredSet = new Set(fastOcrRecoveredQuestions);
      const ocrCheckQuestions = processor.strictVerificationQuestions(bundle, questions, fields, 40).filter(question => !locallyRecoveredSet.has(question));
      const fastOcrCheck = applyFastOcrIndependentVerification(bundle, ocrCheckQuestions, ocrResult, evidenceValidator, fields);
      bundle = fastOcrCheck.bundle;
      fastOcrVerifiedQuestions = fastOcrCheck.confirmed;
      fastOcrConflictQuestions = fastOcrCheck.conflicts;
      fastOcrWeakQuestions = fastOcrCheck.weak;

      const verificationPlan = processor.smartStrictVerificationPlan(bundle, questions, fields, verificationLimit);
      fastRepairSkippedDirect = verificationPlan.skippedDirect;
      const localEvidencePlan = buildLocalEvidenceRepairPlan(bundle, verificationPlan, fastOcrContext, fastOcrVerifiedQuestions);
      fastRepairQuestions = localEvidencePlan.questions;
      fastRepairSkippedNoEvidence = localEvidencePlan.skippedNoEvidence;
      fastRepairDecisions = localEvidencePlan.decisions;
      if (!fastRepairQuestions.length) {
        if (fastOcrRecoveredQuestions.length) fastRepairStatus = "not_needed_local_ocr_recovery";
        else if (fastOcrVerifiedQuestions.length) fastRepairStatus = "not_needed_local_ocr";
        else if (fastRepairSkippedNoEvidence.length) fastRepairStatus = "not_needed_no_direct_evidence";
      }

      if (fastRepairQuestions.length) {
        fastRepairStatus = "attempted";
        const recoveryPool = Array.isArray(payload.allImages) && payload.allImages.length ? payload.allImages : images;
        const repairPhotoLimit = settings.tokenMode === "quality" ? 3 : 2;
        const ocrPreferredPhotosByQuestion = Object.fromEntries(fastRepairQuestions.map(question => {
          const qKey = simpleFieldKey(question);
          const ids = Array.from(new Set((fastOcrContext.facts || [])
            .filter(fact => Array.isArray(fact?.targetKeys) && fact.targetKeys.includes(qKey))
            .flatMap(fact => Array.isArray(fact?.photoIds) ? fact.photoIds : [])
            .map(value => String(value || "").trim()).filter(Boolean)));
          return [question, ids];
        }));
        const repairImages = smartStrictRecoveryImages(images, recoveryPool, bundle, fastRepairQuestions, repairPhotoLimit, ocrPreferredPhotosByQuestion);
        fastRepairPhotoCount = repairImages.length;
        const reasons = { ...(bundle.rejectionReasons || {}) };
        const repairDecisionByField = new Map(fastRepairDecisions.filter(item => item.action === "repair").map(item => [item.field, item]));
        for (const question of fastRepairQuestions) {
          const decision = repairDecisionByField.get(question);
          if (decision?.reason) reasons[question] = decision.reason;
          if (bundle.modelResults?.[question]?.localOcrConflict === true) {
            reasons[question] = "Local OCR conflicts with the primary strict value. Independently re-read this exact field; do not assume any candidate value.";
          }
        }
        const repairFieldKeys = new Set(fastRepairQuestions.map(simpleFieldKey));
        const repairFields = fields.filter(field => repairFieldKeys.has(simpleFieldKey(field?.name || field?.label)));
        const repairPrompt = promptApi.buildStrictVerificationPrompt({
          // Do not expose seller title/current values during strict verification; they
          // can anchor a second read to the same wrong identity/size.
          existingTitle: "",
          category: payload.category || payload.pageContext?.category || "",
          questions: fastRepairQuestions,
          recoveryQuestions: fastRepairQuestions,
          fields: repairFields,
          currentValues: {},
          pageContext: { ...(payload.pageContext || {}), currentTitle: "", fieldSummary: {} },
          customInstruction: "",
          rejectionReasons: reasons,
          purpose: "fill",
          independentVerification: true
        });
        const repairTimeoutMs = Math.max(25000, Math.min(Number(payload.recoveryTimeoutMs || 45000), 60000));
        try {
          attemptedRequests = Math.max(attemptedRequests, 2);
          const before = new Set(Object.keys(bundle.answers || {}));
          const repair = await confirmedRequest({
            analyzer, payload, settings, prompt: repairPrompt, images: repairImages, questions: fastRepairQuestions, fields: repairFields,
            stage: "recovery", timeoutMs: repairTimeoutMs, provider: "openai", analysisRequestId: analysisRunId, reviewMode: false, requestBudget,
            systemInstructions: promptApi.getStrictVerificationStructuredSystemInstructions(),
            requestMeta: {
              questionNames: fastRepairQuestions.slice(0, 12),
              repairReasons: fastRepairDecisions.filter(item => item.action === "repair").map(item => ({ field: item.field, code: item.code, reason: item.reason })).slice(0, 12),
              photoIds: repairImages.map(image => String(image?.photoId || image?.photo_id || "").trim()).filter(Boolean).slice(0, 6),
              highDetailPhotoCount: repairImages.length
            }
          });
          const repairBundle = processor.parseAnswerBundle(repair.response.text, fastRepairQuestions, repairFields, { reviewMode: false, requireSources: false, requireFacts: false, photoCatalog: repairImages, modelProvider: "openai", existingTitle: "", customInstruction: "" });
          bundle = processor.mergeStrictVerification(bundle, repairBundle, fastRepairQuestions, questions);
          fastRepairRecoveredCount = fastRepairQuestions.filter(question => !before.has(question) && Boolean(bundle.answers?.[question])).length;
          usage = processor.combineUsage(usage, repair.response.usage || {});
          confirmations.push({
            stage: "recovery", provider: "openai", upstreamStatus: Number(repair.response.transport?.upstreamStatus || 0),
            inputTokens: Number(repair.response.usage?.inputTokens || 0), outputTokens: Number(repair.response.usage?.outputTokens || 0), totalTokens: Number(repair.response.usage?.totalTokens || 0),
            cost: Number(repair.response.usage?.cost || 0), costKnown: repair.response.usage?.reported === true,
            questionNames: fastRepairQuestions.slice(0, 12), repairReasons: fastRepairDecisions.filter(item => item.action === "repair"),
            providerRequestId: String(repair.response.transport?.providerRequestId || ""), proxyRequestId: String(repair.response.transport?.proxyRequestId || "")
          });
          requests = 2; fastRepairUsed = true; fastRepairStatus = "completed"; fastRepairMs = repair.durationMs;
        } catch (error) {
          fastRepairStatus = "failed";
          fastRepairError = String(error?.message || error).slice(0, 700);
          // Safety over coverage: accepted strict values that were scheduled for
          // independent verification are not auto-filled if that verification failed.
          bundle = processor.dropUnverifiedStrictAnswers(bundle, fastRepairQuestions, questions, fastRepairError);
          bundle.warnings = Array.from(new Set([...(bundle.warnings || []), `Strict GPT verification was unavailable; affected strict fields were left unchanged: ${fastRepairError}`])).slice(0, 100);
        }
      }
    }

    if (reviewMode) {
      const validationStartedAt = Date.now();
      ocrResult = await runReviewOcr({ payload: { ...payload, settings }, images, ocrClient });
      if (evidenceValidator?.validateBundle) bundle = evidenceValidator.validateBundle(bundle, questions, ocrResult, { phase: "after_gpt", fields });
      validationMs += Date.now() - validationStartedAt;

      let roleMap = null;
      const roleMapApi = global.EbayAiPhotoRoleMapV843;
      if (roleMapApi?.buildRoleMap) { try { roleMap = roleMapApi.buildRoleMap(bundle, images); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); } }
      const reviewerEnabled = settings.claudeReviewEnabled === true && payload.allowRecovery !== false;
      const reviewerModeCap = settings.tokenMode === "quality" ? 10 : settings.tokenMode === "cheap" ? 3 : 6;
      const reviewerLimit = Math.max(0, Math.min(Number(settings.claudeMaxFields ?? payload.recoveryLimit ?? reviewerModeCap) || reviewerModeCap, reviewerModeCap, 12));
      reviewerQuestions = reviewerEnabled ? processor.targetedReviewQuestions(bundle, questions, fields, reviewerLimit) : [];
      if (reviewerEnabled && reviewerQuestions.length && reviewerApi) {
        reviewerStatus = "attempted";
        const reviewerPrompt = promptApi.buildItemSpecificsRecoveryPrompt({ existingTitle: payload.existingTitle || payload.pageContext?.currentTitle || "", category: payload.category || payload.pageContext?.category || "", questions: reviewerQuestions, recoveryQuestions: reviewerQuestions, fields, currentValues: payload.pageContext?.fieldSummary || payload.currentValues || {}, pageContext: payload.pageContext || {}, customInstruction: payload.customInstruction ?? settings.customAiInstruction ?? "", rejectionReasons: bundle.rejectionReasons || {} });
        const reviewerTimeoutMs = Math.max(25000, Math.min(Number(payload.recoveryTimeoutMs || settings.claudeTimeoutMs || 45000), 75000));
        const repairImages = recoveryImages(images, reviewerQuestions, roleMap).slice(0, 3);
        try {
          attemptedRequests = Math.max(attemptedRequests, 2);
          const before = new Set(Object.keys(bundle.answers || {}));
          const reviewer = await confirmedRequest({ analyzer, payload, settings: reviewerApi.reviewerSettings(settings), prompt: reviewerPrompt, images: repairImages, questions: reviewerQuestions, fields, stage: "claude_review", timeoutMs: reviewerTimeoutMs, provider: "anthropic", analysisRequestId: analysisRunId, reviewMode: true });
          const reviewerBundle = processor.parseAnswerBundle(reviewer.response.text, reviewerQuestions, fields, { requireSources: true, requireFacts: false, photoCatalog: repairImages, modelProvider: "anthropic", ...sellerContextOptions });
          bundle = processor.mergeReviewerBundles(bundle, reviewerBundle, questions);
          reviewerRecoveredCount = reviewerQuestions.filter(question => !before.has(question) && Boolean(bundle.answers?.[question])).length;
          usage = processor.combineUsage(usage, reviewer.response.usage || {});
          confirmations.push({ stage: "claude_review", provider: "anthropic", upstreamStatus: Number(reviewer.response.transport?.upstreamStatus || 0), totalTokens: Number(reviewer.response.usage?.totalTokens || 0), providerRequestId: String(reviewer.response.transport?.providerRequestId || ""), proxyRequestId: String(reviewer.response.transport?.proxyRequestId || "") });
          requests = 2; reviewerUsed = true; reviewerStatus = "completed"; reviewerMs = reviewer.durationMs;
        } catch (error) {
          reviewerStatus = "failed"; reviewerError = String(error?.message || error).slice(0, 700);
          bundle.warnings = Array.from(new Set([...(bundle.warnings || []), `Claude targeted review was unavailable: ${reviewerError}`])).slice(0, 100);
        }
      } else if (reviewerEnabled && !reviewerApi) {
        reviewerStatus = "unavailable"; reviewerError = "Claude reviewer module is not loaded.";
      } else if (reviewerEnabled) reviewerStatus = "not_needed";
      else reviewerStatus = "disabled";

      const postStarted = Date.now();
      if (evidenceValidator?.validateBundle) bundle = evidenceValidator.validateBundle(bundle, questions, ocrResult, { phase: "after_claude", fields });
      validationMs += Date.now() - postStarted;
    }

    // Normal Fill keeps ordinary best-supported answers. A narrow local OCR gate may
    // recover only missing allowlisted direct-label facts; conflicting GPT values are never
    // overwritten locally. Broader OCR correction and Claude verification remain Review-only.
    if (reviewMode) bundle = processor.applyFillPolicy(bundle, questions, settings.reviewFillMode || "safe");
    else bundle = { ...bundle, fillPolicy: "best_answer", coverageReadyCount: Object.keys(bundle.answers || {}).length };
    bundle.ocr = ocrResult;
    const summary = buildAnalysisSummary(bundle, questions, reviewerQuestions, reviewerRecoveredCount);
    if (!reviewMode) {
      summary.bestAnswerCount = summary.answerCount;
      summary.confirmedCount = fastOcrVerifiedQuestions.length + fastOcrRecoveredQuestions.length;
      summary.reviewCandidateCount = 0;
      summary.notFilledCount = Math.max(0, summary.questionCount - summary.answerCount);
      summary.fastOcrVerifiedCount = fastOcrVerifiedQuestions.length;
      summary.fastOcrRecoveredCount = fastOcrRecoveredQuestions.length;
      summary.fastOcrConflictCount = fastOcrConflictQuestions.length;
      summary.fastOcrWeakCount = fastOcrWeakQuestions.length + fastOcrRecoveryWeakQuestions.length;
    }
    bundle.suggestedCount = reviewMode ? summary.reviewCandidateCount : 0;
    const text = processor.toFieldValueText(bundle, questions);
    const totalMs = Date.now() - pipelineStartedAt;
    const itemCostTarget = 0.07;
    const itemCost = Number(usage?.cost || 0);
    const itemCostKnown = confirmations.length > 0 && confirmations.every(item => item?.costKnown === true);
    const itemCostTargetMet = itemCostKnown ? itemCost <= itemCostTarget + 1e-9 : null;
    const finalOmitted = questions.filter(question => !bundle.answers?.[question] && !bundle.suggestedAnswers?.[question] && !bundle.modelResults?.[question]?.value && !(bundle.modelResults?.[question]?.candidateValues || []).length);
    bundle.omitted = finalOmitted;
    bundle.analysisRunId = analysisRunId;
    bundle.reviewer = { provider: "anthropic", model: String(settings.claudeModel || reviewerApi?.DEFAULT_MODEL || "claude-sonnet-5"), enabled: reviewMode && settings.claudeReviewEnabled === true, used: reviewerUsed, status: reviewerStatus, error: reviewerError, questions: reviewerQuestions, recoveredCount: reviewerRecoveredCount };

    return {
      ok: true, text, answers: bundle.answers || {}, evidence: bundle.evidence || {}, facts: bundle.facts || [], suggestedAnswers: bundle.suggestedAnswers || {}, suggestedCount: Number(summary.reviewCandidateCount || 0), warnings: bundle.warnings || [], reviewDetails: bundle.reviewDetails || [], modelResults: bundle.modelResults || {}, validationIssues: bundle.validationIssues || [], ocr: ocrResult, summary, fieldCatalog: bundle.fieldCatalog || fields, photoCatalog: bundle.photoCatalog || images, photoSelection, omitted: finalOmitted, missing: [], bundle, usage,
      requestConfirmed: true, transport: primary.response.transport || {}, providerUsageConfirmed: primary.response.providerUsageConfirmed === true, confirmations, itemCost, itemCostKnown, itemCostTarget, itemCostTargetMet,
      timings: { primaryMs: primary.durationMs, reviewerMs, recoveryMs: reviewMode ? reviewerMs : fastRepairMs, ocrMs: Number(ocrResult?.durationMs || 0), validationMs, totalMs },
      stages: { photo: true, ocr: summary.ocr.healthy === true, web: false, requests, primaryProvider: "openai", repairProvider: !reviewMode && fastRepairUsed ? "openai" : "not_run", reviewerProvider: reviewMode ? "anthropic" : "not_run", validatorProvider: summary.ocr.healthy === true ? "local_macos_vision" : "not_run" },
      requests, attemptedRequests, openAiRequestsAttempted: Number(requestBudget.openAiRequests || 0), openAiRequestLimit: Number(requestBudget.maxOpenAiRequests || 0), requestBudgetExhausted: Number(requestBudget.openAiRequests || 0) >= Number(requestBudget.maxOpenAiRequests || 0), recoveryUsed: reviewMode ? reviewerUsed : fastRepairUsed, recoveryError: reviewMode ? reviewerError : fastRepairError, recoveryQuestions: reviewMode ? reviewerQuestions : fastRepairQuestions,
      fastRepairUsed, fastRepairStatus, fastRepairError, fastRepairQuestions, fastRepairSkippedDirect, fastRepairSkippedNoEvidence, fastRepairPhotoCount, fastRepairRecoveredCount, fastRepairDecisions,
      fastOcrVerifiedQuestions, fastOcrRecoveredQuestions, fastOcrRecoveryWeakQuestions, fastOcrConflictQuestions, fastOcrWeakQuestions, fastOcrVerifiedCount: fastOcrVerifiedQuestions.length, fastOcrRecoveredCount: fastOcrRecoveredQuestions.length,
      claudeReviewEnabled: reviewMode && settings.claudeReviewEnabled === true, claudeReviewUsed: reviewerUsed, reviewerProvider: "anthropic", reviewerStatus, reviewerError, reviewerQuestions,
      analysisRunId, aiResponseSchemaVersion: 3, fillPolicy: bundle.fillPolicy || (reviewMode ? "safe" : "best_answer"), reviewMode,
      promptOwner: "core/ai.js", processorOwner: "core/ai.js",
      sourceGrounded: Object.values(bundle.evidence || {}).some(item => Array.isArray(item?.sources) && item.sources.length > 0),
      message: reviewMode
        ? `Review analysis finished: ${summary.answerCount}/${summary.questionCount} candidate answer(s). GPT ${(primary.durationMs/1000).toFixed(1)}s; OCR ${(Number(ocrResult?.durationMs||0)/1000).toFixed(1)}s; Claude ${(reviewerMs/1000).toFixed(1)}s; total ${(totalMs/1000).toFixed(1)}s.`
        : `Fast Fill analysis finished: ${summary.answerCount}/${summary.questionCount} candidate answer(s). Primary GPT ${(primary.durationMs/1000).toFixed(1)}s.${fastOcrRecoveredQuestions.length ? ` Local OCR safely recovered ${fastOcrRecoveredQuestions.length} missing direct label fact(s).` : ""}${fastOcrVerifiedQuestions.length ? ` Local OCR independently verified ${fastOcrVerifiedQuestions.length} strict field(s).` : ""}${fastOcrConflictQuestions.length ? ` OCR flagged ${fastOcrConflictQuestions.length} conflict(s) for GPT re-check.` : ""}${fastRepairUsed ? ` Strict GPT verification ${(fastRepairMs/1000).toFixed(1)}s for ${fastRepairQuestions.length} unresolved field(s) using ${fastRepairPhotoCount} photo(s), recovered ${fastRepairRecoveredCount}.` : ""}${fastRepairSkippedDirect.length ? ` ${fastRepairSkippedDirect.length} strict field(s) stayed single-pass on validated direct support.` : ""}${fastRepairSkippedNoEvidence.length ? ` ${fastRepairSkippedNoEvidence.length} missing strict field(s) were not retried because no direct evidence was detected.` : ""} AI total ${(totalMs/1000).toFixed(1)}s. Full Claude Review verification was not run.`
    };
  }

  const ACTIVE_ANALYSES = new Map();

  function stableAnalysisIdentity(payload = {}) {
    const page = payload.pageContext || {};
    const questions = (Array.isArray(payload.questions) ? payload.questions : []).map(item => String(item || "").trim()).filter(Boolean);
    const images = (Array.isArray(payload.images) ? payload.images : []).map(image => String(image?.photoId || image?.photo_id || image?.url || image?.src || image || "").trim()).filter(Boolean);
    const fields = (Array.isArray(payload.fields) ? payload.fields : Array.isArray(page.fields) ? page.fields : []).map(field => ({
      name: String(field?.name || field?.label || "").trim(),
      optionsComplete: field?.optionsComplete === true,
      optionCount: Array.isArray(field?.options) ? field.options.length : 0
    }));
    const settings = payload.settings || {};
    return JSON.stringify({
      mode: payload.reviewMode === true || payload.mode === "review" ? "review" : "fill",
      draft: String(payload.draftId || page.draftId || page.itemId || page.listingId || page.url || payload.url || ""),
      title: String(payload.existingTitle || page.currentTitle || "").trim(),
      category: String(payload.category || page.category || "").trim(),
      questions,
      images,
      fields,
      model: String(settings.model || settings.openAiModel || ""),
      tokenMode: String(settings.tokenMode || ""),
      allowRecovery: payload.allowRecovery !== false
    });
  }

  async function analyzeListing(payload = {}) {
    const identity = stableAnalysisIdentity(payload);
    const existing = ACTIVE_ANALYSES.get(identity);
    if (existing) {
      globalThis.EbayLogger?.warn?.("Duplicate analysis joined existing in-flight request", { mode: payload.reviewMode === true || payload.mode === "review" ? "review" : "fill" });
      const shared = await existing;
      return { ...shared, singleFlightJoined: true, duplicateAnalysisPrevented: true };
    }
    const promise = analyzeListingOnce(payload);
    ACTIVE_ANALYSES.set(identity, promise);
    try {
      const result = await promise;
      return { ...result, singleFlightJoined: false, duplicateAnalysisPrevented: false };
    } finally {
      if (ACTIVE_ANALYSES.get(identity) === promise) ACTIVE_ANALYSES.delete(identity);
    }
  }

  async function run(payload = {}) {
    if (!global.chrome?.runtime?.sendMessage) throw new Error("Chrome runtime is not available for Core AI.");
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "CORE_AI_ANALYZE_LISTING", payload }, response => {
        if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
        else resolve(response || { ok: false, message: "No Core AI response." });
      });
    });
  }

  global.EbayCoreAiV800 = Object.freeze({
    analyzeListing,
    run,
    smartStrictRecoveryImages,
    fastOcrEvidenceContext,
    applyFastOcrIndependentVerification,
    applyFastOcrMissingRecovery,
    exactLocalOcrOptionValue,
    reliableOcrConfirmation,
    primaryLabelSupportsOcrSkip,
    localEvidenceSupportsIndependentSkip,
    buildLocalEvidenceRepairPlan,
    promoteOcrEvidenceImages,
    fastOcrEligibleQuestions,
    stableAnalysisIdentity,
    activeAnalysisCount: () => ACTIVE_ANALYSES.size
  });
})(globalThis);

/* ===== AI PUBLIC API ===== */
/* Public Core AI facade. Every mode uses this one object. */
(function initEbayCoreAiIndex(global) {
  "use strict";
  const core = global.EbayCoreAiV800;
  if (!core) throw new Error("Core AI pipeline is not loaded.");
  global.EbayCore = global.EbayCore || {};
  global.EbayCore.ai = core;
})(globalThis);
