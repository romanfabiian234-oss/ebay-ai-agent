/* Single shared Item Specifics Fill Engine and automatic writer entry — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== FIELD MAP ===== */
/* Shared answer normalization and exact Item Specific label mapping. */
(function initEbayAiFieldMapper(global) {
  "use strict";

  const ALWAYS_SKIP = new Set(["upc", "mpn"]);

  function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function normalizeValue(value) {
    if (Array.isArray(value)) return value.map(item => String(item ?? "").trim()).filter(Boolean).join(", ");
    return String(value ?? "").trim();
  }

  function safeValue(field, value) {
    const normalized = normalizeValue(value);
    const policy = global.EbayAiFieldParserV790;
    if (!normalized) return "";
    if (policy?.shouldSkipField?.(field) || policy?.isPlaceholderValue?.(normalized)) return "";
    return normalized;
  }

  function toAnswerMap(input) {
    if (!input) return {};
    if (input.answers && typeof input.answers === "object" && !Array.isArray(input.answers)) return toAnswerMap(input.answers);
    const out = {};
    if (Array.isArray(input)) {
      for (const item of input) {
        const field = String(item?.field || item?.label || item?.name || "").trim();
        const value = safeValue(field, item?.values ?? item?.value ?? item?.answer);
        if (field && value && !ALWAYS_SKIP.has(normalizeKey(field))) out[field] = value;
      }
      return out;
    }
    if (typeof input === "object") {
      for (const [field, rawValue] of Object.entries(input)) {
        const label = String(field || "").trim();
        const value = safeValue(label, rawValue);
        if (label && value && !ALWAYS_SKIP.has(normalizeKey(label))) out[label] = value;
      }
    }
    return out;
  }

  function mapAnswersToQuestions(answers, questions = []) {
    const source = toAnswerMap(answers);
    const cleanQuestions = Array.isArray(questions) ? questions.map(value => String(value || "").trim()).filter(Boolean) : [];
    if (!cleanQuestions.length) return source;
    const byKey = new Map(Object.entries(source).map(([label, value]) => [normalizeKey(label), { label, value }]));
    const mapped = {};
    for (const question of cleanQuestions) {
      const key = normalizeKey(question);
      if (!key || ALWAYS_SKIP.has(key)) continue;
      const hit = byKey.get(key);
      if (hit) mapped[question] = hit.value;
    }
    return mapped;
  }

  function toEntries(answers, questions = []) {
    return Object.entries(mapAnswersToQuestions(answers, questions)).map(([label, value]) => ({
      label,
      key: normalizeKey(label),
      value: normalizeValue(value)
    })).filter(item => item.label && item.value && !ALWAYS_SKIP.has(item.key));
  }

  global.EbayAiFieldMapperV790 = Object.freeze({
    ALWAYS_SKIP,
    normalizeKey,
    normalizeValue,
    toAnswerMap,
    mapAnswersToQuestions,
    toEntries
  });
})(globalThis);

/* ===== SINGLE FIELD FILL ===== */
/* Fast one-field filler. It receives one prepared eBay field and final value(s). */
(function initSimpleFill(global) {
  "use strict";

  function clean(value) {
    return String(value ?? "").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/\s+/g, " ");
  }

  function values(value) {
    const source = Array.isArray(value) ? value : clean(value).split(/\s*,\s*/);
    const out = [];
    for (const item of source.map(clean).filter(Boolean)) {
      if (!out.some(existing => key(existing) === key(item))) out.push(item);
    }
    return out;
  }

  function same(left, right) {
    return key(left) === key(right);
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function isMaterialField(field) {
    const label = key(field?.name || field?.label || "");
    return label === "material" || /(?:^| )(?:upper|lining|insole|outsole|outer shell|insulation|fabric) material$/.test(label);
  }

  function safeMaterialAlias(value, available = []) {
    const raw = clean(value);
    const exact = candidate => available.find(option => same(option, candidate)) || "";
    if (!raw) return "";
    const direct = exact(raw);
    if (direct) return direct;
    const stripped = raw.replace(/^\s*\d+(?:\.\d+)?\s*%\s*/, "").trim();
    const strippedExact = exact(stripped);
    if (strippedExact) return strippedExact;
    if (/^other\s+(?:fiber|fibers|fibre|fibres)$/i.test(stripped)) {
      const other = exact("Other");
      if (other) return other;
    }
    return raw;
  }

  function canonicalizeValuesForField(field, supplied, available = []) {
    const input = values(supplied);
    if (!isMaterialField(field) || !available.length) return input;
    const output = [];
    for (const value of input) {
      const canonical = safeMaterialAlias(value, available);
      if (canonical && !output.some(existing => same(existing, canonical))) output.push(canonical);
    }
    return output;
  }

  function debugFailure(stage, field, error) {
    try { console.debug(`[Fill Core] ${stage}`, field?.label || field?.name || "field", error?.message || error); }
    catch (_) { /* console itself is best-effort */ }
  }

  async function waitUntil(check, timeoutMs = 650, intervalMs = 25) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs || 0));
    let lastError = null;
    while (true) {
      try { if (await check()) return true; }
      catch (error) { lastError = error; }
      if (Date.now() >= deadline) {
        if (lastError) debugFailure("verification callback failed before timeout", null, lastError);
        return false;
      }
      await sleep(intervalMs);
    }
  }

  async function selected(field, value) {
    try { return Boolean(await field.isSelected?.(value)); }
    catch (error) { debugFailure(`isSelected(${clean(value)}) failed`, field, error); return false; }
  }

  function selectionOutcome(field) {
    try {
      if (typeof field?.selectionOutcome === "function") return field.selectionOutcome() || {};
      return field?.lastSelectionResult || {};
    } catch (error) { debugFailure("selectionOutcome failed", field, error); return {}; }
  }

  async function fillText(field, value) {
    if (same(await field.read(), value)) {
      return { status: "already", okCount: 1, total: 1, retryable: false, reason: "Exact value already set." };
    }
    if (!await field.write(value)) {
      return { status: "review", okCount: 0, total: 1, retryable: true, reason: "Text write failed." };
    }
    const confirmed = await waitUntil(async () => same(await field.read(), value), 650, 25);
    return confirmed
      ? { status: "filled", okCount: 1, total: 1, retryable: false, reason: "Text value confirmed." }
      : { status: "review", okCount: 0, total: 1, retryable: true, reason: "Text value was not confirmed." };
  }

  async function fillSingle(field, value) {
    if (same(await field.read(), value) || await selected(field, value)) {
      return { status: "already", okCount: 1, total: 1, retryable: false, reason: "Exact value already set." };
    }
    if (!await field.open()) {
      return { status: "review", okCount: 0, total: 1, retryable: true, failureCode: "menu_open_failed", reason: "Field menu did not open." };
    }
    const clicked = await field.selectExact(value);
    const outcome = selectionOutcome(field);
    const confirmed = clicked && await waitUntil(async () => same(await field.read(), value) || await selected(field, value), 800, 25);
    await field.close?.();
    if (confirmed) {
      const custom = outcome.kind === "custom";
      return {
        status: "filled",
        okCount: 1,
        total: 1,
        retryable: false,
        selectionKind: outcome.kind || "exact",
        reason: custom ? "Custom eBay value confirmed." : "Exact option confirmed."
      };
    }
    const retryable = outcome.retryable !== false;
    const code = outcome.code || (clicked ? "value_not_confirmed" : "exact_option_not_found");
    return {
      status: "review",
      okCount: 0,
      total: 1,
      retryable,
      failureCode: code,
      reason: retryable
        ? `Value was not confirmed and may be retried: ${value}`
        : `Exact option or allowed custom value is unavailable: ${value}`
    };
  }

  async function fillYesNo(field, value) {
    const normalized = key(value);
    if (!["yes", "no"].includes(normalized)) {
      return { status: "review", okCount: 0, total: 1, retryable: false, failureCode: "invalid_yesno_value", reason: `Yes/No field received an unsupported value: ${clean(value)}` };
    }
    return fillSingle(field, normalized === "yes" ? "Yes" : "No");
  }

  async function fillMulti(field, rawValue) {
    let wanted = values(rawValue);
    if (!wanted.length) return { status: "skipped", okCount: 0, total: 0, retryable: false, reason: "No values supplied." };

    const rawInitial = new Set();
    for (const value of wanted) if (await selected(field, value)) rawInitial.add(key(value));
    if (rawInitial.size === wanted.length) {
      return { status: "already", okCount: wanted.length, total: wanted.length, retryable: false, reason: "All exact values already set." };
    }

    // Open a multi-select once for the whole field. The legacy route used to reopen and
    // rescan the same menu for each value; the core route keeps it open and only retries
    // the missing values in Fill All pass 2.
    if (!await field.open()) {
      return { status: "review", okCount: rawInitial.size, total: wanted.length, retryable: true, failureCode: "menu_open_failed", reason: "Multi-select menu did not open." };
    }
    let available = [];
    try { available = values(await field.options?.()); }
    catch (error) { debugFailure("reading multi-select options failed", field, error); }
    wanted = canonicalizeValuesForField(field, wanted, available);

    const initial = new Set();
    for (const value of wanted) if (await selected(field, value)) initial.add(key(value));
    const nonRetryable = new Set();
    for (const value of wanted) {
      if (initial.has(key(value)) || await selected(field, value)) continue;
      const clicked = await field.selectExact(value);
      if (!clicked) {
        const outcome = selectionOutcome(field);
        if (outcome.retryable === false) nonRetryable.add(key(value));
      }
    }
    await field.close?.();

    const confirmedValues = [];
    for (const value of wanted) if (await selected(field, value)) confirmedValues.push(value);
    const missing = wanted.filter(value => !confirmedValues.some(item => same(item, value)));
    const nonRetryableMissing = missing.filter(value => nonRetryable.has(key(value)));
    const retryableMissing = missing.filter(value => !nonRetryable.has(key(value)));
    const changed = confirmedValues.some(value => !initial.has(key(value)));

    if (!missing.length) {
      return {
        status: changed ? "filled" : "already",
        okCount: wanted.length,
        total: wanted.length,
        retryable: false,
        resolvedValues: wanted,
        reason: changed ? "All exact or safely canonicalized values confirmed." : "All exact values already set."
      };
    }
    return {
      status: confirmedValues.length ? "partial" : "review",
      okCount: confirmedValues.length,
      total: wanted.length,
      missing,
      retryableMissing,
      nonRetryableMissing,
      resolvedValues: wanted,
      retryable: retryableMissing.length > 0,
      reason: confirmedValues.length
        ? `Confirmed ${confirmedValues.length}/${wanted.length}; missing ${missing.join(", ")}.`
        : nonRetryableMissing.length === missing.length
          ? `No exact option or allowed custom value is available: ${missing.join(", ")}.`
          : `No values were confirmed; retry ${retryableMissing.join(", ")}.`
    };
  }

  function resolveCompositeSize(value, available) {
    const raw = clean(value);
    if (!raw || !available.length) return "";
    const exact = candidate => available.find(option => same(option, candidate)) || "";

    // Manufacturer labels often combine alpha and numeric kids sizes, e.g. XXL (18).
    // Prefer the exact numeric size printed on the tag, then an exact eBay range that
    // contains it, and only then the equivalent alpha label (XXL -> 2XL).
    const numbers = [...raw.matchAll(/\d+/g)].map(match => Number(match[0])).filter(Number.isFinite);
    for (const number of numbers) {
      const numeric = exact(String(number));
      if (numeric) return numeric;
    }
    for (const number of numbers) {
      const range = available.find(option => {
        const match = clean(option).match(/^(\d+)\s*[-–—]\s*(\d+)$/);
        if (!match) return false;
        const low = Number(match[1]);
        const high = Number(match[2]);
        return low <= number && number <= high;
      });
      if (range) return range;
    }

    const alphaMatch = raw.toUpperCase().match(/\b(XXXL|XXL|XL|L|M|S|XS|XXS)\b/);
    if (!alphaMatch) return "";
    const aliases = {
      XXXL: ["3XL", "XXXL"],
      XXL: ["2XL", "XXL"],
      XL: ["XL"], L: ["L"], M: ["M"], S: ["S"], XS: ["XS"], XXS: ["2XS", "XXS"]
    };
    for (const alias of aliases[alphaMatch[1]] || []) {
      const match = exact(alias);
      if (match) return match;
    }
    return "";
  }


  function resolveShoeWidth(value, available = []) {
    const raw = clean(value);
    if (!raw || !available.length) return "";
    const exact = candidate => available.find(option => same(option, candidate)) || "";
    const direct = exact(raw);
    if (direct) return direct;
    const compact = key(raw).replace(/\s+/g, "");
    const aliases = {
      "2e": ["ee", "2e"],
      "ee": ["ee", "2e"],
      "3e": ["eee", "3e"],
      "eee": ["eee", "3e"],
      "4e": ["eeee", "4e"],
      "eeee": ["eeee", "4e"],
      "5e": ["eeeee", "5e"],
      "6e": ["eeeeee", "6e"],
      "xw": ["xw", "extra wide"],
      "xxw": ["xxw", "extra extra wide"],
      "w": ["w", "wide"],
      "m": ["m", "medium", "standard"],
      "n": ["n", "narrow"]
    };
    const probes = aliases[compact] || [compact];
    const matches = available.filter(option => {
      const normalized = key(option);
      const optionCompact = normalized.replace(/\s+/g, "");
      return probes.some(probe => {
        const p = key(probe);
        if (optionCompact === p.replace(/\s+/g, "")) return true;
        const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        return new RegExp(`(?:^|[\\s(])${escaped}(?:$|[\\s)])`, "i").test(normalized);
      });
    });
    return matches.length === 1 ? matches[0] : "";
  }

  async function resolveSingleValue(field, suppliedValues) {
    const wanted = values(suppliedValues);

    // A single composite Size value still needs safe resolution against the exact
    // options from this field. Other single values keep strict exact matching.
    let openedHere = false;
    try {
      if (typeof field.options === "function") {
        let available = values(await field.options());
        if (!available.length && typeof field.open === "function") {
          openedHere = Boolean(await field.open());
          available = values(await field.options());
        }
        const exact = candidate => available.find(option => same(option, candidate)) || "";
        const label = key(field.name || field.label || "");
        if (wanted.length > 1 && ["color", "colour", "exterior color"].includes(label)) {
          const multicolor = exact("Multicolor");
          if (multicolor) return multicolor;
        }
        for (const candidate of wanted) {
          const match = exact(candidate);
          if (match) return match;
          if (label === "shoe width") {
            const resolvedWidth = resolveShoeWidth(candidate, available);
            if (resolvedWidth) return resolvedWidth;
          }
          if (isMaterialField(field)) {
            const canonicalMaterial = safeMaterialAlias(candidate, available);
            if (canonicalMaterial && exact(canonicalMaterial)) return exact(canonicalMaterial);
          }
          if (label === "size") {
            const resolvedSize = resolveCompositeSize(candidate, available);
            if (resolvedSize) return resolvedSize;
          }
        }
      }
      return wanted.length === 1 ? wanted[0] : "";
    } finally {
      if (openedHere) {
        try { await field.close?.(); }
        catch (error) { debugFailure("menu close failed", field, error); }
      }
    }
  }

  async function fill(field, value) {
    if (!field) return { status: "review", okCount: 0, total: Math.max(1, values(value).length), retryable: false, reason: "Field not found." };
    if (!clean(value)) return { status: "skipped", okCount: 0, total: 0, retryable: false, reason: "Empty value." };
    try {
      const wanted = values(value);
      if (field.type === "text") return await fillText(field, clean(value));
      if (field.type === "yesno") return await fillYesNo(field, clean(value));
      if (field.type === "multi") return await fillMulti(field, value);
      if (wanted.length > 1 || ["size", "shoe width"].includes(key(field.name || field.label || ""))) {
        const resolved = await resolveSingleValue(field, wanted);
        if (!resolved) {
          return {
            status: "review",
            okCount: 0,
            total: wanted.length,
            retryable: false,
            failureCode: "no_exact_single_value_candidate",
            reason: `This eBay field accepts one value, but none of the supplied values exactly matches an available option: ${wanted.join(", ")}.`
          };
        }
        const result = await fillSingle(field, resolved);
        return { ...result, suppliedCount: wanted.length, resolvedValue: resolved };
      }
      return await fillSingle(field, clean(value));
    } catch (error) {
      try { await field.close?.(); }
      catch (closeError) { debugFailure("error cleanup close failed", field, closeError); }
      return { status: "review", okCount: 0, total: Math.max(1, values(value).length), retryable: true, reason: error?.message || "Fill failed." };
    }
  }

  global.EbaySimpleFillV810 = Object.freeze({ fill, fillYesNo, fillMulti, clean, key, values, resolveSingleValue, resolveCompositeSize, resolveShoeWidth, safeMaterialAlias, canonicalizeValuesForField });
})(globalThis);

/* ===== BATCH FILL ===== */
/* V8.23.21 — one verified Item Specifics Fill Engine.
   One writer lock, one main pass, one read-only verification, one retry pass for missing values only. */
(function initSimpleFillAll(global) {
  "use strict";

  const VERSION = "8.23.21";
  const engine = global.EbayAiFillEngineV790 || { adapters: {} };
  engine.adapters = engine.adapters || {};

  engine.registerAdapters = function registerAdapters(adapters = {}) {
    Object.assign(engine.adapters, adapters);
    engine.adaptersRegistered = true;
    return engine.adapters;
  };

  const normalize = value => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const operationState = engine.__operationState || { current: null, sequence: 0 };
  engine.__operationState = operationState;

  function operationSnapshot() {
    const current = operationState.current;
    return current ? { ...current } : null;
  }

  function acquireOperation(kind, metadata = {}) {
    if (operationState.current) {
      return {
        ok: false,
        busy: true,
        current: operationSnapshot(),
        message: `Another Item Specifics operation is already running: ${operationState.current.kind}.`
      };
    }
    operationState.sequence += 1;
    const token = `${Date.now()}-${operationState.sequence}-${Math.random().toString(16).slice(2)}`;
    operationState.current = {
      token,
      kind: String(kind || "item_specifics"),
      mode: String(metadata.mode || ""),
      startedAt: Date.now()
    };
    return { ok: true, token, current: operationSnapshot() };
  }

  function releaseOperation(token) {
    if (!operationState.current) return true;
    if (token && operationState.current.token !== token) return false;
    operationState.current = null;
    return true;
  }

  async function withOperation(kind, task, metadata = {}) {
    const lock = acquireOperation(kind, metadata);
    if (!lock.ok) return { ok: false, busy: true, message: lock.message, operation: lock.current };
    try {
      return await task(lock);
    } finally {
      releaseOperation(lock.token);
    }
  }

  engine.acquireOperation = acquireOperation;
  engine.releaseOperation = releaseOperation;
  engine.withOperation = withOperation;
  engine.operationStatus = operationSnapshot;

  function cleanAnswerMap(input) {
    const mapper = global.EbayAiFieldMapperV790;
    return mapper?.toAnswerMap ? mapper.toAnswerMap(input || {}) : (input || {});
  }

  function summary(details) {
    const result = { filled: 0, already: 0, partial: 0, review: 0, skipped: 0 };
    for (const detail of details) {
      const status = Object.prototype.hasOwnProperty.call(result, detail.status) ? detail.status : "review";
      result[status] += 1;
    }
    return result;
  }

  function isFieldMap(value) {
    return Boolean(value && typeof value.get === "function" && typeof value.values === "function");
  }

  async function fieldMapFor(payload = {}, force = false) {
    if (!force && isFieldMap(payload.fieldMap)) return payload.fieldMap;
    const adapter = engine.adapters.getPreparedFieldMap;
    if (typeof adapter !== "function") throw new Error("Prepared Item Specific field map is not available.");
    const map = await adapter({ force, mode: payload.mode || "automatic" });
    if (!isFieldMap(map)) throw new Error("Prepared Item Specific field map was not created.");
    return map;
  }

  function safeEntries(payload = {}) {
    const answers = cleanAnswerMap(payload.answers || payload.data || {});
    return Object.entries(answers).filter(([label, value]) => label && String(value ?? "").trim()
      && !global.EbayAiSafetyV790?.isBlockedField?.(label)
      && !global.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label));
  }

  function buildTopDownPlan(entries, fieldMap) {
    const matched = [];
    const unmatched = [];
    entries.forEach(([answerLabel, value], inputOrder) => {
      const field = fieldMap.get(normalize(answerLabel));
      const step = { answerLabel, value, originalValue: value, inputOrder, field };
      if (field) matched.push(step); else unmatched.push(step);
    });
    matched.sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.field?.order)) ? Number(left.field.order) : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(right.field?.order)) ? Number(right.field.order) : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.inputOrder - right.inputOrder;
    });
    return { matched, unmatched, steps: [...matched, ...unmatched] };
  }

  async function shouldStop(mode) {
    if (typeof engine.adapters.shouldStop !== "function") return false;
    return Boolean(await engine.adapters.shouldStop({ mode }));
  }

  async function reportProgress(callback, detail) {
    if (typeof callback !== "function") return;
    try {
      await callback(detail);
    } catch (error) {
      console.warn("[Fill Engine] progress callback failed", error?.message || error);
    }
  }

  async function closeOpenMenus() {
    if (typeof engine.adapters.closeOpenMenus !== "function") return;
    try {
      await engine.adapters.closeOpenMenus();
    } catch (error) {
      console.warn("[Fill Engine] menu cleanup failed", error?.message || error);
    }
  }

  async function fillPreparedField(field, value) {
    if (!field) return { status: "review", okCount: 0, total: 1, retryable: false, reason: "Exact Item Specific field was not found." };
    const filler = global.EbaySimpleFillV810;
    if (!filler?.fill) throw new Error("Core Item Specific Fill writer is not loaded.");
    return filler.fill(field, value);
  }

  async function verifyEntries(entries, fieldMap) {
    const verifier = global.EbaySimpleVerifyV817;
    if (!verifier?.verify) throw new Error("Read-only Fill verifier is not loaded.");
    const results = new Map();
    for (const [label, value] of entries) {
      const field = fieldMap.get(normalize(label)) || null;
      results.set(normalize(label), await verifier.verify(field, value));
    }
    return results;
  }

  function retryPlanFrom(entries, fieldMap, verification, firstPass) {
    const steps = [];
    entries.forEach(([answerLabel, originalValue], inputOrder) => {
      const normalizedLabel = normalize(answerLabel);
      const field = fieldMap.get(normalizedLabel) || null;
      const check = verification.get(normalizedLabel);
      const attempt = firstPass.get(normalizedLabel);
      if (!field || !check?.retryable || attempt?.retryable === false || !Array.isArray(check.missing) || !check.missing.length) return;
      let missing = check.missing.slice();
      if (Array.isArray(attempt?.retryableMissing)) {
        const allowed = new Set(attempt.retryableMissing.map(normalize));
        missing = missing.filter(value => allowed.has(normalize(value)));
      }
      if (!missing.length) return;
      steps.push({ answerLabel, originalValue, value: missing, inputOrder, field });
    });
    steps.sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.field?.order)) ? Number(left.field.order) : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(right.field?.order)) ? Number(right.field.order) : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.inputOrder - right.inputOrder;
    });
    return steps;
  }

  function finalDetail(step, firstPass, retryResult, verification) {
    const label = step.field?.label || step.answerLabel;
    const base = {
      label,
      requestedLabel: step.answerLabel,
      value: step.originalValue,
      order: step.field?.order,
      pass1Status: firstPass?.status || "review",
      retried: Boolean(retryResult),
      retryStatus: retryResult?.status || "",
      retryable: retryResult?.retryable ?? firstPass?.retryable ?? false,
      failureCode: retryResult?.failureCode || firstPass?.failureCode || "",
      confirmed: verification?.confirmed || [],
      missing: verification?.missing || []
    };
    if (verification?.status === "confirmed") {
      const already = firstPass?.status === "already" && !retryResult;
      return {
        ...base,
        status: already ? "already" : "filled",
        okCount: Number(verification.okCount || 0),
        total: Number(verification.total || 0),
        reason: retryResult ? "All requested values confirmed after retry pass." : already ? "Exact value already set and verified." : "All requested values confirmed after main pass."
      };
    }
    if (verification?.status === "partial") {
      return {
        ...base,
        status: "partial",
        okCount: Number(verification.okCount || 0),
        total: Number(verification.total || 0),
        reason: retryResult ? `Still partial after retry: ${(verification.missing || []).join(", ")}.` : verification.reason
      };
    }
    return {
      ...base,
      status: verification?.status === "skipped" ? "skipped" : "review",
      okCount: Number(verification?.okCount || 0),
      total: Number(verification?.total || 1),
      reason: retryResult
        ? (retryResult.reason || `Not confirmed after retry: ${(verification?.missing || []).join(", ") || "value missing"}.`)
        : firstPass?.retryable === false
          ? (firstPass.reason || "The value is unavailable in this eBay field.")
          : (verification?.reason || firstPass?.reason || "Value was not confirmed.")
    };
  }

  async function runFillOneUnlocked(request = {}) {
    const payload = request.payload || request;
    const label = String(payload.label || payload.field || "").trim();
    const value = payload.value ?? payload.values;
    if (!label || String(value ?? "").trim() === "") return { status: "skipped", label, value, okCount: 0, total: 0, reason: "Field or value is empty." };
    if (global.EbayAiSafetyV790?.isBlockedField?.(label) || global.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label)) {
      return { status: "skipped", label, value, okCount: 0, total: 0, reason: "Protected or excluded field." };
    }
    const map = await fieldMapFor(payload);
    const field = payload.fieldRecord || map.get(normalize(label));
    if (typeof field?.centerForFill === "function") await field.centerForFill();
    else await field?.scrollIntoView?.();
    const result = await fillPreparedField(field, value);
    return { label: field?.label || label, requestedLabel: label, value, fieldRecord: field || null, ...result };
  }

  async function runFillAllUnlocked(request = {}) {
    const payload = request.payload || request;
    const mode = request.mode || payload.mode || "automatic";
    const entries = safeEntries(payload);
    if (!entries.length) return { ok: false, message: "No safe Field - Value answers were supplied.", details: [], filled: 0, already: 0, partial: 0, skipped: 0, review: 0, answerCount: 0, processedCount: 0, retryCount: 0, fillPasses: 0 };

    const expectedDraftId = String(payload.expectedDraftId || "").trim();
    const actualDraftId = global.EbayPageFieldsV810?.draftIdFromUrl?.() || "";
    if (expectedDraftId && actualDraftId && expectedDraftId !== actualDraftId) {
      return { ok: false, message: `Draft safety check failed: expected ${expectedDraftId}, open page is ${actualDraftId}.`, details: [], answerCount: entries.length, processedCount: 0, retryCount: 0, fillPasses: 0 };
    }

    if (typeof engine.adapters.beginFill === "function") await engine.adapters.beginFill({ mode });

    const startedAt = Date.now();
    const firstMap = await fieldMapFor(payload);
    const firstPlan = buildTopDownPlan(entries, firstMap);
    const firstPass = new Map();
    let stopped = false;
    let progressIndex = 0;

    for (const step of firstPlan.matched) {
      if (await shouldStop(mode)) { stopped = true; break; }
      progressIndex += 1;
      if (typeof step.field.centerForFill === "function") await step.field.centerForFill();
      else await step.field.scrollIntoView?.();
      const result = await fillPreparedField(step.field, step.value);
      const detail = { label: step.field.label || step.answerLabel, requestedLabel: step.answerLabel, value: step.value, order: step.field.order, pass: 1, ...result };
      firstPass.set(normalize(step.answerLabel), detail);
      await reportProgress(payload.onProgress, { ...detail, current: progressIndex, totalFields: entries.length, fillPass: 1 });
    }

    if (!stopped) {
      for (const step of firstPlan.unmatched) {
        progressIndex += 1;
        const detail = { label: step.answerLabel, requestedLabel: step.answerLabel, value: step.value, status: "review", okCount: 0, total: 1, reason: "Exact Item Specific field was not found in the first page snapshot.", pass: 1 };
        firstPass.set(normalize(step.answerLabel), detail);
        await reportProgress(payload.onProgress, { ...detail, current: progressIndex, totalFields: entries.length, fillPass: 1 });
      }
    }

    await closeOpenMenus();

    if (stopped) {
      const details = firstPlan.steps.map(step => firstPass.get(normalize(step.answerLabel)) || {
        label: step.field?.label || step.answerLabel,
        requestedLabel: step.answerLabel,
        value: step.value,
        order: step.field?.order,
        status: "review",
        okCount: 0,
        total: 1,
        reason: "Fill stopped by user before this field.",
        pass: 1
      });
      const counts = summary(details);
      const message = `Verified Fill All stopped. Answers ${entries.length}; processed ${firstPass.size}; retry pass not started.`;
      return {
        ok: true,
        stopped: true,
        needsReview: true,
        questionCount: firstMap.size,
        pageQuestionCount: firstMap.size,
        answerCount: entries.length,
        processedCount: details.length,
        allAnswersProcessed: false,
        unprocessedFields: details.filter(item => /stopped by user/i.test(item.reason)).map(item => item.label),
        fillOrder: details.map(item => item.label),
        ...counts,
        omitted: 0,
        unanswered: 0,
        valuesFilled: details.reduce((sum, item) => sum + Number(item.okCount || 0), 0),
        changed: counts.filled > 0 || counts.partial > 0,
        details,
        reviewFields: details.filter(item => ["review", "partial"].includes(item.status)).map(item => `${item.label}: ${item.reason}`),
        requiredReviewFields: [],
        autosave: null,
        fillElapsedMs: Date.now() - startedAt,
        retryCount: 0,
        retryPlannedCount: 0,
        verifiedAfterPass1: 0,
        verifiedAfterPass2: 0,
        fillPasses: 1,
        message,
        engine: "single-core-fill-v8.23.21"
      };
    }

    let verificationMap = firstMap;
    try {
      verificationMap = await fieldMapFor(payload, true);
    } catch (error) {
      console.warn("[Fill Engine] fresh verification snapshot unavailable; using verified live records from the first snapshot", error?.message || error);
    }
    const afterPass1 = await verifyEntries(entries, verificationMap);
    const retryPlan = retryPlanFrom(entries, verificationMap, afterPass1, firstPass);
    const retryResults = new Map();

    for (let index = 0; index < retryPlan.length; index += 1) {
      if (await shouldStop(mode)) { stopped = true; break; }
      const step = retryPlan[index];
      if (typeof step.field.centerForFill === "function") await step.field.centerForFill();
      else await step.field.scrollIntoView?.();
      const result = await fillPreparedField(step.field, step.value);
      retryResults.set(normalize(step.answerLabel), result);
      await reportProgress(payload.onProgress, {
        label: step.field.label || step.answerLabel,
        requestedLabel: step.answerLabel,
        value: step.value,
        pass: 2,
        fillPass: 2,
        retryCurrent: index + 1,
        retryTotal: retryPlan.length,
        current: entries.length,
        totalFields: entries.length,
        ...result,
        reason: `Retry pass ${index + 1}/${retryPlan.length}: ${result.reason || "completed"}`
      });
    }

    await closeOpenMenus();

    const finalVerification = await verifyEntries(entries, verificationMap);
    const finalPlan = buildTopDownPlan(entries, verificationMap);
    const details = finalPlan.steps.map(step => finalDetail(
      step,
      firstPass.get(normalize(step.answerLabel)),
      retryResults.get(normalize(step.answerLabel)),
      finalVerification.get(normalize(step.answerLabel))
    ));

    const counts = summary(details);
    const changed = counts.filled > 0 || counts.partial > 0;
    let autosave = null;
    if (payload.waitForAutosave && typeof engine.adapters.waitAutosave === "function") {
      autosave = await engine.adapters.waitAutosave({ expectedDraftId, changed, timeoutMs: Number(payload.autosaveTimeoutMs || 10000) });
    }
    const reviewFields = details.filter(item => ["review", "partial"].includes(item.status)).map(item => `${item.label}: ${item.reason}`).slice(0, 20);
    const valuesFilled = details.reduce((sum, item) => sum + Number(item.okCount || 0), 0);
    const fillElapsedMs = Date.now() - startedAt;
    const processedCount = details.length;
    const allAnswersProcessed = processedCount === entries.length && !stopped;
    const verifiedAfterPass1 = Array.from(afterPass1.values()).filter(item => item.status === "confirmed").length;
    const verifiedAfterPass2 = Array.from(finalVerification.values()).filter(item => item.status === "confirmed").length;
    const unavailableAfterPass1 = Array.from(firstPass.values()).filter(item => item.retryable === false && ["review", "partial"].includes(item.status)).length;
    const fillPasses = retryPlan.length ? 2 : 1;
    const reviewSuffix = reviewFields.length ? ` Review: ${reviewFields.join(" | ")}.` : "";
    const message = `Verified Fill All finished in ${Math.round(fillElapsedMs / 1000)}s. Answers ${entries.length}; processed ${processedCount}; pass 1 verified ${verifiedAfterPass1}; retried ${retryResults.size}/${retryPlan.length}; unavailable ${unavailableAfterPass1}; final verified ${verifiedAfterPass2}; filled ${counts.filled}; already ${counts.already}; partial ${counts.partial}; review ${counts.review}; skipped ${counts.skipped}; confirmed values ${valuesFilled}.${reviewSuffix}`;
    if (typeof engine.adapters.showResult === "function") {
      try {
        await engine.adapters.showResult({ message, counts });
      } catch (error) {
        console.warn("[Fill Engine] result UI callback failed", error?.message || error);
      }
    }
    return {
      ok: true,
      stopped,
      needsReview: reviewFields.length > 0 || stopped,
      questionCount: verificationMap.size,
      pageQuestionCount: verificationMap.size,
      answerCount: entries.length,
      processedCount,
      allAnswersProcessed,
      unprocessedFields: stopped ? retryPlan.slice(retryResults.size).map(step => step.answerLabel) : [],
      fillOrder: details.map(item => item.label),
      filled: counts.filled,
      already: counts.already,
      partial: counts.partial,
      review: counts.review,
      skipped: counts.skipped,
      omitted: 0,
      unanswered: 0,
      valuesFilled,
      changed,
      details,
      reviewFields,
      requiredReviewFields: [],
      autosave,
      fillElapsedMs,
      retryCount: retryResults.size,
      retryPlannedCount: retryPlan.length,
      verifiedAfterPass1,
      verifiedAfterPass2,
      unavailableAfterPass1,
      fillPasses,
      message,
      engine: "single-core-fill-v8.23.21"
    };
  }

  engine.fillOne = function fillOne(request = {}) {
    const payload = request.payload || request;
    const mode = request.mode || payload.mode || "manual";
    return withOperation("fill_one", () => runFillOneUnlocked(request), { mode });
  };

  engine.fillAll = function fillAll(request = {}) {
    const payload = request.payload || request;
    const mode = request.mode || payload.mode || "automatic";
    return withOperation("fill_all", () => runFillAllUnlocked(request), { mode });
  };

  engine.describe = () => ({
    version: VERSION,
    rule: "One page writer and one operation lock. Prepared answers only; text, single dropdown, multi-select and Yes/No share one exact Fill Engine; one main pass; read-only verification; one retry pass for missing values only."
  });

  global.EbayAiFillEngineV790 = engine;
})(globalThis);

/* ===== FILL PUBLIC API ===== */
/* Public Fill facade shared by Text, Photo and Queue. */
(function initEbayCoreFill(global) {
  "use strict";

  function engine() {
    if (!global.EbayAiFillEngineV790) throw new Error("Simple Fill Engine is not loaded.");
    return global.EbayAiFillEngineV790;
  }

  function fill(payload = {}, mode = "manual") {
    return engine().fillOne({ mode, payload });
  }

  function fillAll(payload = {}, mode = "automatic") {
    return engine().fillAll({ mode, payload });
  }

  function verify(field, value) {
    if (!global.EbaySimpleVerifyV817?.verify) throw new Error("Read-only Fill verifier is not loaded.");
    return global.EbaySimpleVerifyV817.verify(field, value);
  }

  function describe() {
    return engine().describe();
  }

  global.EbayCoreFillV810 = Object.freeze({ fill, fillAll, verify, describe });
  global.EbayCore = global.EbayCore || {};
  global.EbayCore.fill = global.EbayCoreFillV810;
})(globalThis);

/* ===== PAGE WRITER ENTRY ===== */
/* BLOCK 06 — FILL FIELDS. The only automatic writer entry; it delegates to the protected shared Fill Engine. */
(function initFillFieldsBlock(global) {
  "use strict";

  async function stop(tabId) {
    const core = global.EbayCore?.ebay;
    if (!Number.isInteger(tabId) || !core?.stop) return { ok: false, message: "Stop route is unavailable." };
    return core.stop(tabId, {}, 5000);
  }

  async function run({ tabId, draftId = "", answers = {}, questions = [], omittedQuestions = [], mode = "automatic", timeoutMs = 70000 } = {}) {
    const core = global.EbayCore?.ebay;
    if (!Number.isInteger(tabId) || !core?.fillAll) throw new Error("FILL_FIELDS requires an eBay tab and the shared Fill Engine.");
    const answerCount = Object.keys(answers || {}).length;
    if (!answerCount) return { ok: true, filled: 0, already: 0, partial: 0, review: 0, skipped: 0, omitted: 0, valuesFilled: 0, answerCount: 0, message: "No answers to fill." };
    const result = await core.fillAll(tabId, { expectedDraftId: draftId || undefined, answers, questions, omittedQuestions, mode }, timeoutMs);
    if (result?.ok === false && /timed out|timeout/i.test(String(result?.message || ""))) {
      await stop(tabId).catch(() => {});
      return { ...result, stopped: true, message: `${result.message || "Fill timed out."} Current Fill was stopped before another stage can start.` };
    }
    return result || { ok: false, message: "Fill Engine returned no result." };
  }

  global.EbayBlocksV890 = global.EbayBlocksV890 || {};
  global.EbayBlocksV890.fillFields = Object.freeze({ run, stop });
})(globalThis);
