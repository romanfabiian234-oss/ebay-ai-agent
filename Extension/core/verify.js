/* Post-fill verification — V8.23.21. Consolidated from the previous verified modules; behavior preserved. */

/* ===== VERIFY ===== */
/* Read-only verifier for prepared Item Specific answers. It never clicks, writes or scrolls. */
(function initSimpleFillVerifier(global) {
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

  function debugVerifyFailure(stage, field, error) {
    try { console.debug(`[Verify Core] ${stage}`, field?.label || field?.name || "field", error?.message || error); }
    catch (_) { /* console itself is best-effort */ }
  }

  async function valueIsConfirmed(field, value) {
    if (!field || !clean(value)) return false;
    try { field.refresh?.(); }
    catch (error) { debugVerifyFailure("refresh failed", field, error); }
    try {
      if (typeof field.isSelected === "function" && await field.isSelected(value)) return true;
    } catch (error) { debugVerifyFailure("isSelected failed", field, error); }
    try {
      if (typeof field.readValues === "function") {
        const currentValues = await field.readValues();
        if (Array.isArray(currentValues) && currentValues.some(current => same(current, value))) return true;
      }
    } catch (error) { debugVerifyFailure("readValues failed", field, error); }
    try {
      if (typeof field.read === "function" && same(await field.read(), value)) return true;
    } catch (error) { debugVerifyFailure("read failed", field, error); }
    return false;
  }

  async function verify(field, rawValue) {
    const wanted = values(rawValue);
    if (!wanted.length) {
      return { status: "skipped", confirmed: [], missing: [], okCount: 0, total: 0, retryable: false, reason: "No values supplied." };
    }
    if (!field) {
      return { status: "review", confirmed: [], missing: wanted, okCount: 0, total: wanted.length, retryable: false, reason: "Exact Item Specific field was not found in the verification snapshot." };
    }

    const confirmed = [];
    for (const value of wanted) {
      if (await valueIsConfirmed(field, value)) confirmed.push(value);
    }
    const missing = wanted.filter(value => !confirmed.some(current => same(current, value)));
    if (!missing.length) {
      return { status: "confirmed", confirmed, missing: [], okCount: wanted.length, total: wanted.length, retryable: false, reason: "All requested values are present." };
    }

    const incompatibleSingle = field.type !== "multi" && wanted.length > 1;
    return {
      status: confirmed.length ? "partial" : "retry",
      confirmed,
      missing,
      okCount: confirmed.length,
      total: wanted.length,
      retryable: !incompatibleSingle,
      reason: incompatibleSingle
        ? `This eBay field accepts one value; confirmed ${confirmed.length}/${wanted.length}.`
        : confirmed.length
          ? `Confirmed ${confirmed.length}/${wanted.length}; retry ${missing.join(", ")}.`
          : `Requested value was not found after the main pass: ${missing.join(", ")}.`
    };
  }

  global.EbaySimpleVerifyV817 = Object.freeze({ verify, valueIsConfirmed, values, same });
})(globalThis);
