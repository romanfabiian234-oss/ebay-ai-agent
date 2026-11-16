/* Deterministic eBay option matching — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== EXACT RESOLVER ===== */
/* Field-aware deterministic resolver for exact current eBay options. */
(function initUniversalResolver(global) {
  "use strict";

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function fieldMap(fields = []) {
    const map = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const name = clean(field?.name || field?.label);
      if (name && !map.has(key(name))) map.set(key(name), field);
    }
    return map;
  }

  function exactOption(options, candidate) {
    const wanted = key(candidate);
    if (!wanted) return "";
    return (Array.isArray(options) ? options : []).find(option => key(option) === wanted) || "";
  }

  function sizeToken(candidate) {
    const normalized = key(candidate);
    const aliases = {
      "extra extra extra large": "3xl", "triple extra large": "3xl", "xxxl": "3xl", "3x": "3xl", "3xl": "3xl",
      "extra extra large": "2xl", "double extra large": "2xl", "xxl": "2xl", "2x": "2xl", "2xl": "2xl",
      "extra large": "xl", "x large": "xl", "xl": "xl",
      "large": "l", "lg": "l", "l": "l",
      "medium": "m", "med": "m", "m": "m",
      "small": "s", "sm": "s", "s": "s",
      "extra small": "xs", "x small": "xs", "xs": "xs",
      "extra extra small": "2xs", "xxs": "2xs", "2xs": "2xs"
    };
    if (aliases[normalized]) return aliases[normalized];

    // Numeric clothing/kids size tokens are direct manufacturer values, not a
    // conversion. Accept only compact size-like forms; 100, RN numbers, percentages
    // and arbitrary measurements are intentionally excluded.
    const compactRaw = clean(candidate).toLowerCase().replace(/\s+/g, "");
    const numeric = compactRaw.match(/^(00|0|[1-9]\d?)(p|w|t)?$/i);
    if (numeric) return `${numeric[1]}${(numeric[2] || "").toLowerCase()}`;

    const ordered = Object.keys(aliases).sort((a, b) => b.length - a.length);
    const suffix = ordered.find(alias => normalized.endsWith(` ${alias}`));
    if (suffix) return aliases[suffix];

    const numericSuffix = normalized.match(/^(?:(?:regular|petite|petites|plus|tall|junior|juniors|maternity)\s+)?(00|0|[1-9]\d?)(p|w|t)?$/i);
    return numericSuffix ? `${numericSuffix[1]}${(numericSuffix[2] || "").toLowerCase()}` : "";
  }

  function sizeGroupHint(text) {
    const normalized = key(text);
    if (/\b(?:petite|petites)\b/.test(normalized)) return "petite";
    if (/\b(?:plus|womens plus)\b/.test(normalized)) return "plus";
    if (/\b(?:tall|big and tall|big tall)\b/.test(normalized)) return "tall";
    if (/\b(?:juniors|junior)\b/.test(normalized)) return "junior";
    if (/\bmaternity\b/.test(normalized)) return "maternity";
    if (/\bregular\b/.test(normalized)) return "regular";
    return "";
  }

  function resolveSize(candidate, options, context = {}) {
    const token = sizeToken(candidate);
    if (!token) return { value: "", reason: "size_token_unrecognized", candidates: [] };
    const matching = (Array.isArray(options) ? options : []).filter(option => {
      const optionKey = key(option);
      const groupStripped = optionKey.replace(/^(?:regular|petite|petites|plus|tall|junior|juniors|maternity)\s+/, "");
      const optionToken = sizeToken(groupStripped) || sizeToken(optionKey);
      return optionToken === token || optionKey === token;
    });
    if (matching.length === 1) return { value: matching[0], reason: "unique_composite_size_match", candidates: matching };
    if (!matching.length) {
      if (context.allowLiveExactCandidate === true && context.optionsComplete === false) {
        return { value: clean(candidate), reason: "ocr_size_live_verification", candidates: [clean(candidate)], requiresFillVerification: true };
      }
      return { value: "", reason: "size_option_not_available", candidates: [] };
    }

    const hint = sizeGroupHint([candidate, context.rawValue, context.evidenceText, context.category, context.sizeType].join(" "));
    if (hint) {
      const grouped = matching.filter(option => key(option).includes(hint));
      if (grouped.length === 1) return { value: grouped[0], reason: "size_group_evidence_match", candidates: matching };
    }
    return { value: "", reason: "ambiguous_size_group", candidates: matching };
  }

  function resolveOne(fieldName, candidate, field = {}, context = {}) {
    const options = Array.isArray(field?.options) ? field.options.map(clean).filter(Boolean) : [];
    const raw = clean(candidate);
    if (!raw) return { value: "", reason: "empty_candidate", candidates: [] };
    if (!options.length) {
      const fieldType = key(field?.type || "");
      const textLike = ["text", "input", "number", "custom", "free text"].includes(fieldType);
      if (textLike || field?.customValueAllowed === true) return { value: raw, reason: "custom_value_allowed", candidates: [raw] };
      // eBay virtualizes many long dropdowns, so an empty compact option list does not
      // prove that the candidate is invalid. Size is normally held back because group
      // variants can be ambiguous. The one exception is a high-confidence direct local
      // OCR recovery: it may reach Fill only when the snapshot explicitly says the
      // option catalog is incomplete, and Fill must then confirm the exact live option.
      if (key(fieldName) === "size") {
        if ((context.allowLiveExactSize === true || context.allowLiveExactCandidate === true) && field?.optionsComplete === false && sizeToken(raw)) {
          return { value: raw, reason: "ocr_size_live_verification", candidates: [raw], requiresFillVerification: true };
        }
        return { value: "", reason: "size_options_unavailable", candidates: [] };
      }
      if (context.allowLiveExactCandidate === true && field?.optionsComplete === false) {
        return { value: raw, reason: "ocr_direct_live_verification", candidates: [raw], requiresFillVerification: true };
      }
      return { value: raw, reason: "option_catalog_unavailable", candidates: [raw], requiresFillVerification: true };
    }

    const exact = exactOption(options, raw);
    if (exact) return { value: exact, reason: "exact_option_match", candidates: [exact] };

    // Do not silently translate a semantic candidate into a different eBay option.
    // The model receives the exact option list when it is compact; writer matching
    // must therefore stay deterministic. A strong local physical-tag fact may cross
    // only an explicitly incomplete virtualized catalog, and Fill must verify it live.
    if (key(fieldName) === "size") return resolveSize(raw, options, { ...context, optionsComplete: field?.optionsComplete });
    if (context.allowLiveExactCandidate === true && field?.optionsComplete === false) {
      return { value: raw, reason: "ocr_direct_live_verification", candidates: [raw], requiresFillVerification: true };
    }
    return { value: "", reason: "option_not_available", candidates: [] };
  }

  function splitValues(value) {
    const out = [];
    for (const part of clean(value).split(/\s*,\s*/).filter(Boolean)) {
      if (!out.some(existing => key(existing) === key(part))) out.push(part);
    }
    return out;
  }

  function resolveField(fieldName, value, field = {}, context = {}) {
    const parts = splitValues(value);
    const multi = key(field?.type) === "multi";
    if (!multi && parts.length > 1) {
      const exactParts = parts.map(part => resolveOne(fieldName, part, field, context)).filter(item => item.value);
      if (exactParts.length === 1) return { value: exactParts[0].value, reason: "single_select_unique_candidate", dropped: parts.filter(part => key(part) !== key(exactParts[0].value)) };
      return { value: "", reason: "multiple_values_for_single_select", candidates: exactParts.map(item => item.value) };
    }

    if (!multi) return resolveOne(fieldName, parts[0] || value, field, context);

    const resolved = [], dropped = [];
    for (const part of parts) {
      const item = resolveOne(fieldName, part, field, context);
      if (item.value && !resolved.some(value => key(value) === key(item.value))) resolved.push(item.value);
      else dropped.push({ value: part, reason: item.reason, candidates: item.candidates || [] });
    }
    return {
      value: resolved.join(", "),
      values: resolved,
      dropped,
      reason: resolved.length ? (dropped.length ? "partial_multi_match" : "complete_multi_match") : "no_multi_options_matched"
    };
  }

  function resolveBundle(bundle = {}, questions = [], fields = [], context = {}) {
    const map = fieldMap(fields);
    const next = {
      ...bundle,
      answers: { ...(bundle.answers || {}) },
      suggestedAnswers: { ...(bundle.suggestedAnswers || {}) },
      modelResults: { ...(bundle.modelResults || {}) },
      rejectionReasons: { ...(bundle.rejectionReasons || {}) },
      reviewDetails: [...(bundle.reviewDetails || [])],
      warnings: [...(bundle.warnings || [])]
    };

    const reviewIndex = new Map(next.reviewDetails.map((item, index) => [key(item?.field), index]));
    for (const question of Array.isArray(questions) ? questions : []) {
      const result = next.modelResults[question] || {};
      const sourceValue = clean(next.answers[question] || next.suggestedAnswers[question] || result.value || (Array.isArray(result.candidateValues) ? result.candidateValues.join(", ") : ""));
      if (!sourceValue) continue;
      const field = map.get(key(question)) || {};
      const resolution = resolveField(question, sourceValue, field, {
        rawValue: result.rawValue || sourceValue,
        evidenceText: [result.evidence || "", ...(result.sources || []).map(source => source?.evidence || "")].join(" "),
        category: context.category || context.pageContext?.category || "",
        sizeType: next.answers["Size Type"] || next.suggestedAnswers["Size Type"] || ""
      });
      next.modelResults[question] = { ...result, resolver: resolution, unresolvedValue: sourceValue };
      if (resolution.value) {
        if (next.answers[question]) next.answers[question] = resolution.value;
        if (next.suggestedAnswers[question]) next.suggestedAnswers[question] = resolution.value;
        next.modelResults[question].value = resolution.value;
        next.modelResults[question].resolvedValue = resolution.value;
        next.modelResults[question].resolverStatus = resolution.reason;
        next.modelResults[question].requiresFillVerification = resolution.requiresFillVerification === true;
      } else {
        delete next.answers[question];
        if (sourceValue) next.suggestedAnswers[question] = sourceValue;
        next.modelResults[question].value = "";
        next.modelResults[question].resolvedValue = "";
        next.modelResults[question].autoFillAllowed = false;
        next.modelResults[question].status = next.modelResults[question].status === "conflict" ? "conflict" : "needs_review";
        const reason = resolution.reason === "ambiguous_size_group"
          ? `Size ${sourceValue} matches more than one eBay size group: ${(resolution.candidates || []).join(", ")}.`
          : `The suggested value ${sourceValue} does not resolve to one exact current eBay option.`;
        next.rejectionReasons[question] = reason;
        const detail = {
          field: question,
          proposedValue: sourceValue,
          confidence: Number(result.confidence || 0),
          sources: result.sources || [],
          reason,
          modelStatus: "needs_review",
          status: "needs_review",
          resolverReason: resolution.reason,
          resolverCandidates: resolution.candidates || []
        };
        const existingIndex = reviewIndex.get(key(question));
        if (Number.isInteger(existingIndex)) next.reviewDetails[existingIndex] = { ...next.reviewDetails[existingIndex], ...detail };
        else {
          reviewIndex.set(key(question), next.reviewDetails.length);
          next.reviewDetails.push(detail);
        }
      }
    }
    return next;
  }

  global.EbayUniversalResolverV860 = Object.freeze({ resolveOne, resolveField, resolveBundle, exactOption, sizeToken, sizeGroupHint, key, clean });
})(globalThis);

/* ===== MATCH ENTRY ===== */
/* BLOCK 05 — MATCH EBAY. The only exact eBay option resolver between AI/Text and Fill. */
(function initMatchEbayBlock(global) {
  "use strict";

  function clean(value, limit = 600) { return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }
  function key(value) { return clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function usable(value) {
    const text = clean(value);
    return Boolean(text) && !/^(?:unknown|not known|not sure|not confirmed|unconfirmed|n\/a|not applicable|does not apply|leave blank)$/i.test(text);
  }

  function fieldMap(fields = []) {
    const map = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      const name = clean(field?.name || field?.label, 140);
      if (name && !map.has(key(name))) map.set(key(name), field);
    }
    return map;
  }

  const LIVE_LOCAL_OCR_FIELDS = new Set([
    "brand", "size", "material", "garment care", "us shoe size", "shoe width",
    "upper material", "lining material", "outsole material", "country of origin", "country region of manufacture"
  ]);

  function localLiveVerificationAllowed(question, result = {}, field = {}) {
    if (field?.optionsComplete !== false || !LIVE_LOCAL_OCR_FIELDS.has(key(question))) return false;
    const local = result.localOcrRecovery === true || result.localOcrSpecificityUpgrade === true;
    const physical = key(result.evidenceType || "") === "physical tag";
    const confirmed = key(result.status || "") === "confirmed by tag" || key(result.modelStatus || "") === "confirmed";
    return local && physical && confirmed;
  }

  function candidateFor(question, analysis = {}, field = {}) {
    const result = analysis.modelResults?.[question] || {};
    const direct = [analysis.answers?.[question], analysis.suggestedAnswers?.[question], result.value].map(value => clean(value)).find(usable);
    if (direct) return direct;
    const candidates = (Array.isArray(result.candidateValues) ? result.candidateValues : []).map(value => clean(value)).filter(usable);
    if (candidates.length) return String(field?.type || "").toLowerCase() === "multi" ? candidates.join(", ") : candidates[0];
    return usable(result.rawValue) ? clean(result.rawValue) : "";
  }

  function run({ analysis = {}, questions = [], fields = [], pageContext = {}, reviewMode = false, automaticPolicy = false } = {}) {
    const answers = {};
    const unresolved = [];
    const policyOmitted = [];
    const policySkipped = [];
    const fallbackCandidates = {};
    const resolver = global.EbayUniversalResolverV860;
    const byField = fieldMap(fields);

    for (const question of Array.isArray(questions) ? questions : []) {
      const field = byField.get(key(question)) || {};
      let automaticDecision = null;
      if (automaticPolicy && !reviewMode) {
        automaticDecision = global.EbayAiItemSpecificsV7100?.automaticDecision?.(field) || null;
        if (automaticDecision && !automaticDecision.allow) { policySkipped.push(question); continue; }
      }
      const candidate = candidateFor(question, analysis, field);
      if (!candidate) {
        if (automaticDecision?.evidenceOnly || automaticDecision?.contextRequired || automaticDecision?.strongSupport
          || (automaticPolicy && (global.EbayAiItemSpecificsV7100?.isEvidenceOnly?.(question)
            || global.EbayAiItemSpecificsV7100?.isContextRequired?.(question)
            || global.EbayAiItemSpecificsV7100?.isStrongSupport?.(question)))) {
          policyOmitted.push(question);
        } else unresolved.push(question);
        continue;
      }
      if (reviewMode || !resolver?.resolveField) {
        answers[question] = candidate;
        continue;
      }
      const result = analysis.modelResults?.[question] || {};
      const resolution = resolver.resolveField(question, candidate, field, {
        rawValue: result.rawValue || candidate,
        evidenceText: result.evidence || "",
        category: pageContext.category || "",
        sizeType: answers["Size Type"] || analysis.answers?.["Size Type"] || analysis.suggestedAnswers?.["Size Type"] || "",
        // Only locally-derived, evidence-gated Size recovery may bypass an omitted
        // compact option list. Ordinary GPT Size candidates remain blocked until the
        // exact catalog is available.
        allowLiveExactSize: key(question) === "size" && localLiveVerificationAllowed(question, result, field),
        allowLiveExactCandidate: localLiveVerificationAllowed(question, result, field)
      });
      if (usable(resolution?.value)) {
        answers[question] = clean(resolution.value);
      } else {
        // If the snapshot contained a complete current option catalog and the
        // deterministic resolver found no exact value, do not open that dropdown
        // again just to prove the same mismatch. Leave it unchanged for Review.
        const reason = String(resolution?.reason || "");
        const fullCatalogMismatch = [
          "option_not_available",
          "size_option_not_available",
          "ambiguous_size_group",
          "multiple_values_for_single_select",
          "no_multi_options_matched"
        ].includes(reason);
        if (!fullCatalogMismatch && resolution?.requiresFillVerification === true) {
          answers[question] = candidate;
          fallbackCandidates[question] = candidate;
        }
        unresolved.push(question);
      }
    }
    return {
      answers,
      unresolved: [...new Set(unresolved)],
      policyOmitted: [...new Set(policyOmitted)],
      policySkipped: [...new Set(policySkipped)],
      fallbackCandidates,
      answerCount: Object.keys(answers).length
    };
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.matchEbay = Object.freeze({ run, usable, candidateFor });
})(globalThis);
