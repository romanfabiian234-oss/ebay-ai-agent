(() => {
  globalThis.EbayHelperRuntimeLoadedV8130 = true;
  const VERSION = "8.23.21";
  if (window.__EBAY_AI_FILLER_VERSION__ === VERSION) return;
  window.__EBAY_AI_FILLER_VERSION__ = VERSION;
  if (window.top !== window) return;

  // #region SHARED DOM SAFETY, TEXT PARSING, AND INPUT EVENTS
  // These helpers are used by normal Fill, Queue, and the on-demand Helper.
  const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });
  const normalize = text => String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const clean = text => String(text || "").replace(/^\$\s*/, "").trim();

  function toast(message, ms = 12000) {
    return globalThis.EbayUI?.notifications?.show?.(message, ms);
  }

  

  

  function suppressHelperOpen(ms = 900) {
    const until = Date.now() + Math.max(0, Number(ms) || 0);
    window.__ebayAiFillerSuppressHelperOpenUntil = Math.max(window.__ebayAiFillerSuppressHelperOpenUntil || 0, until);
    try {
      if (typeof HOVER_ASSISTANT !== "undefined" && HOVER_ASSISTANT) {
        HOVER_ASSISTANT.suppressOpenUntil = Math.max(HOVER_ASSISTANT.suppressOpenUntil || 0, until);
      }
    } catch (_) {}
  }

  function helperOpenIsSuppressed(e = null) {
    if (e && e.isTrusted === false) return true;
    const now = Date.now();
    let until = window.__ebayAiFillerSuppressHelperOpenUntil || 0;
    try {
      if (typeof HOVER_ASSISTANT !== "undefined" && HOVER_ASSISTANT) {
        until = Math.max(until, HOVER_ASSISTANT.suppressOpenUntil || 0);
        if (HOVER_ASSISTANT.panelActionRunning) return true;
      }
    } catch (_) {}
    return now < until;
  }

  function isVisible(el) {
    if (!el) return false;
    const st = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0;
  }

  function isAssistantOverlayElement(el) {
    return !!(el && el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel, #ebay-ai-filler-toast"));
  }

  

  function isControl(el) {
    if (!el || el.disabled) return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) {
      const type = (el.type || "").toLowerCase();
      return !["hidden", "file", "button", "submit", "checkbox", "radio"].includes(type);
    }
    return el.isContentEditable || role === "textbox" || role === "combobox" || role === "button" || tag === "button";
  }

  function isTextControl(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return el.isContentEditable || role === "textbox";
  }

  function isDropdownControl(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    if (tag === "select") return true;
    return tag === "button" || role === "button" || role === "combobox";
  }

  

  function findValueSetter(element) {
    let proto = element;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor && descriptor.set) return descriptor.set;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function fireInputEvents(el, value) {
    for (const event of [
      new Event("input", { bubbles: true }),
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
      new Event("change", { bubbles: true })
    ]) {
      try { el.dispatchEvent(event); } catch (_) {}
    }
  }

  function setNativeValue(el, value, opts = {}) {
    if (!el || value === undefined || value === null || clean(value) === "") return false;
    const text = clean(value);
    const tag = (el.tagName || "").toLowerCase();
    try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch (_) {}
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }

    if (tag === "select") {
      const exact = Array.from(el.options || []).find(o => normalize(o.textContent) === normalize(text) || normalize(o.value) === normalize(text));
      if (!exact) return false;
      el.value = exact.value;
      fireInputEvents(el, text);
      return true;
    }

    if (el.isContentEditable || el.getAttribute?.("role") === "textbox") {
      try { document.execCommand("selectAll", false, null); document.execCommand("insertText", false, text); }
      catch (_) { el.textContent = text; }
      if (normalize(el.textContent) !== normalize(text)) el.textContent = text;
      fireInputEvents(el, text);
      if (!opts.keepFocus) { try { el.blur(); } catch (_) {} }
      return true;
    }

    try { el.select && el.select(); } catch (_) {}
    const setter = findValueSetter(el);
    if (setter) setter.call(el, text); else el.value = text;
    fireInputEvents(el, text);
    if (!opts.keepFocus) { try { el.blur(); } catch (_) {} }
    return true;
  }

  function isDangerousActionElement(el) {
    if (!el) return false;
    const text = normalize(`${el.innerText || ""} ${el.textContent || ""} ${el.getAttribute?.("aria-label") || ""} ${el.value || ""}`);
    return /\b(publish|list it|submit|pay|payment|delete|remove listing|promote listing|finish update)\b/.test(text);
  }

  function dispatchMouseSequence(el) {
    if (!el) return false;
    if (isDangerousActionElement(el)) {
      toast("A3 No Publish Guard blocked a dangerous button/action.", 8000);
      return false;
    }
    suppressHelperOpen(1400);
    const opts = { bubbles: true, cancelable: true, view: window };
    try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch (_) {}
    try { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true })); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent("mousedown", opts)); } catch (_) {}
    try { el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true })); } catch (_) {}
    try { el.dispatchEvent(new MouseEvent("mouseup", opts)); } catch (_) {}
    let clicked = false;
    try { el.click(); clicked = true; } catch (_) {}
    if (!clicked) { try { el.dispatchEvent(new MouseEvent("click", opts)); } catch (_) {} }
    return true;
  }

  function parseSmartKeyValueLine(line) {
    const raw = String(line || "")
      .replace(/\u00a0/g, " ")
      .replace(/^[\s"'“”‘’`•*]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return null;
    const m = raw.match(/^(.{2,90}?)\s*(?:[:：=]|\s[-–—]\s)\s*(.+)$/);
    if (!m) return null;
    const label = scrubLabel(m[1]);
    const value = clean(m[2]).replace(/^[-–—•\s]+/, "").trim();
    if (!label || !value || label.length > 80) return null;
    if (/^(https?|www\.)/i.test(label)) return null;
    return { label, value };
  }

  function parseKeyValueLines(text) {
    const result = {};
    if (!text) return result;
    for (const raw of String(text).split(/\r?\n|;/)) {
      const parsed = parseSmartKeyValueLine(raw);
      if (parsed) result[parsed.label] = parsed.value;
    }
    return result;
  }

  function normalizeSpecificKey(key) {
    const raw = scrubLabel(key);
    const n = normalize(raw);
    const map = {
      "colour": "Color",
      "exterior colour": "Exterior Color",
      "upper material": "Upper Material",
      "outer shell material": "Outer Shell Material",
      "item condition": "Item condition",
      "condition": "Item condition",
      "item description": "Description",
      "description": "Description",
      "condition note": "Condition description",
      "condition notes": "Condition description",
      "condition details": "Condition description",
      "us size": "US Shoe Size",
      "shoe size": "US Shoe Size",
      "us shoe size": "US Shoe Size",
      "uk shoe size": "UK Shoe Size",
      "au shoe size": "AU Shoe Size",
      "eu shoe size": "EU Shoe Size"
    };
    return map[n] || raw || key;
  }

  function canonicalLabelKey(text) {
    return normalize(normalizeSpecificKey(scrubLabel(text)))
      .replace(/\b(searches|search|trending|required|optional)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // A5.34: bag dimensions must be measured by the seller, not guessed by AI.
  // Match only the three requested fields, while tolerating harmless eBay label
  // suffixes such as "(in)", "(cm)", Required, Optional, or Add measurement.
  const MANUAL_ONLY_BAG_MEASUREMENT_LABELS_A534 = new Set([
    "bag depth", "bag width", "bag height"
  ]);

  function bagMeasurementLabelKeyA534(label) {
    return canonicalLabelKey(label)
      .replace(/\badd (?:a )?measurements?\b/g, "")
      .replace(/\b(?:in|inch|inches|cm|centimeter|centimeters|centimetre|centimetres|mm|millimeter|millimeters|millimetre|millimetres)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isManualOnlyBagMeasurementLabelA534(label) {
    return MANUAL_ONLY_BAG_MEASUREMENT_LABELS_A534.has(bagMeasurementLabelKeyA534(label));
  }

  // A5.35: identifiers and seller-only details that AI must never guess or fill.
  // Matching stays exact after normal label cleanup so similar normal fields remain usable.
  // UPC is included as the standard eBay identifier and UPS is kept exactly as requested.
  const MANUAL_ONLY_PROTECTED_FIELD_LABELS_A535 = new Set([
    "ups", "upc", "upc code", "universal product code", "upc universal product code",
    "universal product code upc", "mpn", "manufacturer part number",
    "manufacturer part number mpn",
    "personalization instruction",
    "personalization instructions", "personalisation instruction",
    "personalisation instructions"
  ]);

  function isManualOnlyProtectedFieldA535(label) {
    return isManualOnlyBagMeasurementLabelA534(label)
      || MANUAL_ONLY_PROTECTED_FIELD_LABELS_A535.has(canonicalLabelKey(label));
  }

  function manualOnlyProtectedFieldMessageA535(label) {
    return isManualOnlyBagMeasurementLabelA534(label)
      ? "Manual-only bag measurement. Measure and enter it yourself."
      : "Protected manual-only field. Enter it yourself; AI filling is disabled.";
  }

  // A5.36: body-garment measurements must come from an exact seller measurement.
  // Keep the generic Size field working; only these exact measurement labels are manual-only.
  const MANUAL_ONLY_GARMENT_MEASUREMENT_LABELS_A536 = new Set([
    "waist size", "inseam"
  ]);

  function garmentMeasurementLabelKeyA536(label) {
    return canonicalLabelKey(label)
      .replace(/\b(?:in|inch|inches|cm|centimeter|centimeters|centimetre|centimetres|mm|millimeter|millimeters|millimetre|millimetres)$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isManualOnlyProtectedFieldA536(label) {
    return isManualOnlyProtectedFieldA535(label)
      || MANUAL_ONLY_GARMENT_MEASUREMENT_LABELS_A536.has(garmentMeasurementLabelKeyA536(label));
  }

  function manualOnlyProtectedFieldMessageA536(label) {
    if (MANUAL_ONLY_GARMENT_MEASUREMENT_LABELS_A536.has(garmentMeasurementLabelKeyA536(label))) {
      return "Manual-only garment measurement. Enter an exact measured value yourself.";
    }
    return manualOnlyProtectedFieldMessageA535(label);
  }

  // A5.32: exact whole-value guard for non-answers produced by AI/listing text.
  // Do not use a broad "not" or "no" check: legitimate answers such as No,
  // Not Vintage, and normal product names must remain fillable.
  const BLOCKED_PLACEHOLDER_VALUES_A532 = new Set([
    "does not apply", "doesn't apply", "not applicable", "not measured",
    "not confirmed", "not provided", "not specified", "not available", "not known",
    "not shown", "not visible", "not listed", "not determined", "not required",
    "not relevant", "not selected", "not entered", "not supplied", "unknown",
    "unconfirmed", "unspecified", "unavailable", "leave blank", "blank", "skip",
    "null", "tbd", "to be determined", "to be confirmed", "add measurement",
    "add a measurement", "add measurements"
  ]);

  function placeholderValueKeyA532(value) {
    return normalize(String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[’]/g, "'")
      .replace(/\s*\/\s*/g, "/")
      .replace(/[-_]+/g, " "))
      .replace(/^[\s"'`.,;:!?()[\]{}]+|[\s"'`.,;:!?()[\]{}]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isBlockedPlaceholderValueA532(value) {
    const v = placeholderValueKeyA532(value);
    if (!v) return true;
    if (BLOCKED_PLACEHOLDER_VALUES_A532.has(v)) return true;
    if (/^n[\s./-]*a$/.test(v)) return true;
    if (/^does(?: not|n't) apply(?: (?:to|for) (?:this|the) item)?$/.test(v)) return true;
    if (/^not (?:applicable|measured|confirmed|provided|specified|available|known|shown|visible|listed|determined|required|relevant|selected|entered|supplied)$/.test(v)) return true;
    if (/^(?:cannot|can't|unable to) (?:confirm|determine|measure|verify)$/.test(v)) return true;
    if (/^(?:add (?:a )?measurements?|measure and enter|enter if available)(?: .*)?$/.test(v)) return true;
    return false;
  }

  function safeFillValueA532(value) {
    const v = clean(value);
    return isBlockedPlaceholderValueA532(v) ? "" : v;
  }

  function addValueMapAliases(map, key, value) {
    if (isManualOnlyProtectedFieldA536(key)) return;
    const v = safeFillValueA532(value);
    if (!v) return;
    const k = normalizeSpecificKey(key);
    map[k] = v;
    map[scrubLabel(key)] = v;
    const n = canonicalLabelKey(k);
    if (n) map[`__canon__${n}`] = v;
    if (n === "upper material" || n === "outer shell material" || n === "material") {
      map["Material"] = v;
      map["__canon__material"] = v;
    }
    if (n === "us shoe size") {
      map["Size"] = v;
      map["Shoe Size"] = v;
      map["__canon__size"] = v;
      map["__canon__shoe size"] = v;
    }
  }

  function splitMulti(label, value) {
    if (isManualOnlyProtectedFieldA536(label)) return [];
    const text = clean(value);
    if (!text || isBlockedPlaceholderValueA532(text)) return [];
    const n = normalize(label);
    const multi = /(occasion|theme|features|accents|season|activity|performance|character|garment care|care instructions?)/.test(n);
    if (!multi) return [text];
    const out = text.split(/[,;|\n]+/).map(clean).filter(Boolean);
    const seen = new Set();
    return out.filter(x => {
      const k = normalize(x);
      if (!k || seen.has(k) || isBlockedPlaceholderValueA532(x)) return false;
      seen.add(k);
      return true;
    });
  }

  function badOptionText(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    const n = normalize(raw.replace(/^\+\s*/, ""));
    if (!n) return true;
    if (/^(add custom value|search results|no results found|no results|custom template|enter number|search|select|choose|save|done|cancel|clear)$/i.test(raw.replace(/^\+\s*/, ""))) return true;
    if (/custom template|access to ad placements|ad placements|promotions?|advertis|sponsored/i.test(raw)) return true;
    return false;
  }

  

  

  

  // #endregion

  // #region EXACT DROPDOWN AND MULTI-SELECT ENGINE
  // All modes use these verified menu adapters; success requires a visible value.
  


  // A4.44 manual helper fill: do not auto-open fields and do not scan the whole page.
  // It only works inside the currently open eBay menu/dropdown. One-Button Fill keeps using the older engine.
  

  function compactDisplayMatchesWanted(display, value) {
    const current = normalize(display);
    const wanted = normalize(value);
    if (!current || !wanted) return false;
    if (current === wanted) return true;
    const parts = String(display || "").split(/\n|,|;|\||\s[-–—]\s|\(|\)/).map(x => normalize(x)).filter(Boolean);
    return parts.includes(wanted);
  }


  // A4.118: eBay can store Size as grouped values like "Regular - 16" or "Plus - 16W".
  // The AI suggestion may be only "16". Exact string verification then falsely reports
  // "clicked but not confirmed" even when eBay selected "Regular - 16". Keep this scoped
  // to size-like fields and size-group prefixes only, so colors/materials are not loosened.
  function sizeFieldHintFromControl(control) {
    const parts = [];
    try { parts.push(control?.getAttribute?.("name") || ""); } catch (_) {}
    try { parts.push(control?.getAttribute?.("aria-label") || ""); } catch (_) {}
    try { parts.push(control?.getAttribute?.("placeholder") || ""); } catch (_) {}
    try { parts.push(control?.id || ""); } catch (_) {}
    try { parts.push(labelFromControl(control) || findLabelForControl(control) || ""); } catch (_) {}
    return normalize(parts.filter(Boolean).join(" "));
  }

  function isSizeLikeFieldControl(control) {
    const hint = sizeFieldHintFromControl(control);
    return /\b(size|shoe size|us shoe size|uk shoe size|au shoe size|eu shoe size|waist size|chest size|inseam)\b/.test(hint);
  }

  function normalizeSizePiece(text) {
    let t = normalize(text)
      .replace(/[’']/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return "";
    t = t.replace(/^womens?\s+|^mens?\s+|^girls?\s+|^boys?\s+/i, "").trim();
    return t;
  }


  function canonicalLetterSizeV731(text) {
    const raw = String(text || "").toLowerCase()
      .replace(/[’']/g, "")
      .replace(/\b(?:women|womens|men|mens|girls|boys|kids|youth|size|regular|standard)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";
    const patterns = [
      ["5XL", /(?:^|\s)(?:5xl|5x|xxxxxlarge|5xlarge)(?:\s|$)/],
      ["4XL", /(?:^|\s)(?:4xl|4x|xxxxlarge|4xlarge)(?:\s|$)/],
      ["3XL", /(?:^|\s)(?:3xl|3x|xxxlarge|3xlarge)(?:\s|$)/],
      ["2XL", /(?:^|\s)(?:2xl|2x|xxl|xxlarge|double extra large)(?:\s|$)/],
      ["XL", /(?:^|\s)(?:xl|xlarge|extra large)(?:\s|$)/],
      ["L", /(?:^|\s)(?:l|large)(?:\s|$)/],
      ["M", /(?:^|\s)(?:m|medium)(?:\s|$)/],
      ["S", /(?:^|\s)(?:s|small)(?:\s|$)/],
      ["XS", /(?:^|\s)(?:xs|xsmall|extra small)(?:\s|$)/],
      ["XXS", /(?:^|\s)(?:xxs|xxsmall|double extra small)(?:\s|$)/]
    ];
    return patterns.find(([, pattern]) => pattern.test(` ${raw} `))?.[0] || "";
  }

  

  function sizeAliasTextMatchesV731(optionText, wanted) {
    const wantedSize = canonicalLetterSizeV731(wanted);
    const optionSize = canonicalLetterSizeV731(optionText);
    if (!wantedSize || !optionSize || wantedSize !== optionSize) return false;
    const wantedGroup = sizeGroupKeyV61(wanted);
    const optionGroup = sizeGroupKeyV61(optionText);
    if (wantedGroup && optionGroup && wantedGroup !== optionGroup) return false;
    const wantedRegion = sizeRegionKeyV61(wanted);
    const optionRegion = sizeRegionKeyV61(optionText);
    if (wantedRegion && optionRegion && wantedRegion !== optionRegion) return false;
    if (wantedRegion && wantedRegion !== "us" && optionRegion !== wantedRegion) return false;
    return true;
  }

  function sizeTokensFromText(text) {
    const raw = clean(text);
    const out = new Set();
    const add = v => {
      const t = normalizeSizePiece(v);
      if (!t) return;
      if (/^(regular|plus|petite|tall|short|long|standard|women|womens|men|mens|juniors?|misses|selected|size)$/.test(t)) return;
      if (t.length > 18) return;
      out.add(t);
    };
    add(raw);
    const spaced = raw.replace(/([0-9])([a-zA-Z])/g, "$1 $2").replace(/([a-zA-Z])([0-9])/g, "$1 $2");
    for (const part of spaced.split(/\n|,|;|\||\/|\s[-–—]\s|\(|\)|\[|\]|:/)) add(part);
    const parts = spaced.split(/\n|,|;|\||\/|\s[-–—]\s|\(|\)|\[|\]|:/).map(normalizeSizePiece).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i], b = parts[i + 1];
      if (/^\d+$/.test(a) && /^[a-z]+$/.test(b)) add(a + b);
      if (/^[a-z]+$/.test(a) && /^\d+$/.test(b)) add(a + " " + b);
    }
    return out;
  }

  function looksLikeGroupedSizeText(text) {
    const n = normalize(text);
    return /\b(regular|plus|petite|tall|short|long|womens?|mens?|juniors?|misses|us|uk|eu|it|au)\b/.test(n) && /[-–—]|\n|\s{2,}/.test(String(text || ""));
  }

  function compoundSizeTextMatchesWanted(text, wanted) {
    const w = normalizeSizePiece(wanted);
    if (!w) return false;
    const n = normalize(text);
    if (n === w) return true;
    if (sizeAliasTextMatchesV731(text, wanted)) return true;
    if (!looksLikeGroupedSizeText(text)) return false;
    const tokens = sizeTokensFromText(text);
    return tokens.has(w);
  }

  

  function displayLooksLikeOpenMenuText(display) {
    const raw = clean(display);
    if (!raw) return false;
    const n = normalize(raw);
    if (/search results|no results found|add custom value|search or enter your own|enter your own/.test(n)) return true;
    const lines = raw.split(/\n+/).map(x => clean(x)).filter(Boolean);
    if (lines.length >= 4) return true;
    if (raw.length > 160) return true;
    return false;
  }

  function isSearchInputInsideOpenMenu(el) {
    return !!(el && isControl(el) && nearestMenuScopeFrom(el));
  }

  function controlHasVerifiedValue(control, value) {
    // A4.90: verify only the real field summary/value, never the open menu text.
    if (isSearchInputInsideOpenMenu(control)) return false;
    const display = getControlDisplayValue(control);
    if (!display || /^search$/i.test(display) || /search or enter your own/i.test(display)) return false;
    if (displayLooksLikeOpenMenuText(display)) return false;
    if (compactDisplayMatchesWanted(display, value)) return true;
    if (isSizeLikeFieldControl(control) && compoundSizeTextMatchesWanted(display, value)) return true;
    return false;
  }

  


  function rectIsOnScreenEnough(r) {
    if (!rectLooksUsable(r)) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1200;
    const vh = window.innerHeight || document.documentElement.clientHeight || 900;
    // Closed eBay menus can remain in the DOM with size, but outside the real viewport
    // or behind a collapsed wrapper. Fill All should only use a menu the user could see.
    return r.bottom > 0 && r.right > 0 && r.top < vh + 80 && r.left < vw + 80;
  }

  function menuExpandedOwnerState(menu, control = null) {
    // Returns true = owner control says the menu is open, false = owner says closed,
    // null = no reliable owner was found. This is the important A5.7 guard.
    const owners = [];
    const addOwner = el => { if (el && !owners.includes(el)) owners.push(el); };
    try {
      if (control && isVisible(control)) addOwner(control);
    } catch (_) {}
    try {
      const id = menu?.id || "";
      if (id) {
        const esc = CSS.escape(id);
        document.querySelectorAll(`[aria-controls~="${esc}"], [aria-owns~="${esc}"]`).forEach(addOwner);
      }
    } catch (_) {}
    try {
      const wrapper = menu?.closest?.(".fake-menu-button, .se-expand-button, .se-filter-menu-button");
      if (wrapper) {
        wrapper.querySelectorAll("button[aria-expanded], [role='button'][aria-expanded], [role='combobox'][aria-expanded]").forEach(addOwner);
      }
    } catch (_) {}
    const visibleOwners = owners.filter(o => {
      try { return o && isVisible(o) && o.hasAttribute?.("aria-expanded"); } catch (_) { return false; }
    });
    if (!visibleOwners.length) return null;
    if (visibleOwners.some(o => String(o.getAttribute("aria-expanded") || "").toLowerCase() === "true")) return true;
    return false;
  }

  function isCollapsedEbayMenuDom(menu, control = null) {
    if (!menu) return true;
    try {
      if (menu.hidden || menu.getAttribute?.("aria-hidden") === "true") return true;
      const st = window.getComputedStyle(menu);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return true;
      const ownerState = menuExpandedOwnerState(menu, control);
      // eBay keeps the full fake-menu DOM mounted even when aria-expanded="false".
      // That hidden DOM was the reason Fill All typed into a closed menu and got Done: 0.
      if (ownerState === false) return true;
      const r = menu.getBoundingClientRect?.();
      if (!rectIsOnScreenEnough(r)) return true;
      return false;
    } catch (_) { return true; }
  }

  function isRealOpenMenuPanel(menu, control = null) {
    if (!menu || !isVisible(menu) || isAssistantOverlayElement(menu)) return false;
    if (isCollapsedEbayMenuDom(menu, control)) return false;
    try {
      const role = (menu.getAttribute?.("role") || "").toLowerCase();
      const cls = String(menu.className || "");
      const hasMenuClass = /fake-menu-button__menu|se-filter-menu-button__menu-container|se-toggle-group-menu|menu__items|menu\b|dropdown|listbox/i.test(cls);
      const hasMenuRole = /^(listbox|dialog|menu|presentation)$/i.test(role);
      const hasSearch = !!menu.querySelector("input[placeholder*='search' i], input[aria-label*='search' i], [role='textbox']");
      const hasOption = !!menu.querySelector("[role='option'], [role='menuitem'], [aria-selected], [aria-checked], button, label, li, input[type='checkbox'], [role='checkbox']");
      const text = normalize(menu.innerText || menu.textContent || "");
      const hasMarker = /selected|search results|no results found|add custom value|search or enter your own|all options/.test(text);
      return hasMenuClass || hasMenuRole || hasSearch || hasOption || hasMarker;
    } catch (_) { return false; }
  }

  function visibleOpenMenuPanelInside(el) {
    if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel") || el.closest?.("#ebay-ai-filler-toast, #ebay-ai-fillall-panel")) return null;
    const selectors = [
      ".fake-menu-button__menu",
      ".se-filter-menu-button__menu-container",
      ".se-toggle-group-menu",
      ".menu__items",
      "[role='listbox']",
      "[role='dialog']",
      "[role='menu']"
    ];
    const cls = String(el.className || "");
    const isWrapper = /(^|\s)(fake-menu-button|se-expand-button|se-filter-menu-button)(\s|$)/.test(cls);
    // Important: never return the field wrapper itself as a menu. The wrapper contains
    // hidden option HTML even when the dropdown is closed, which caused Fill All review-only.
    if (!isWrapper && isRealOpenMenuPanel(el)) return el;
    try {
      for (const sel of selectors) {
        for (const node of Array.from(el.querySelectorAll(sel))) {
          if (isRealOpenMenuPanel(node)) return node;
        }
      }
    } catch (_) {}
    return null;
  }

  function controlledMenuPanelFromControl(control) {
    if (!control || !isVisible(control)) return null;
    const ids = [control.getAttribute?.("aria-controls"), control.getAttribute?.("aria-owns")]
      .filter(Boolean)
      .flatMap(v => String(v).split(/\s+/).filter(Boolean));
    for (const id of ids) {
      let node = null;
      try { node = document.getElementById(id) || document.querySelector(`#${CSS.escape(id)}`); } catch (_) {}
      const panel = visibleOpenMenuPanelInside(node);
      if (panel) return panel;
    }
    // If eBay supplied an explicit owner ID, a wrapper fallback could belong to a
    // stale sibling portal. Wait for that exact owner instead.
    if (ids.length) return null;
    const wrapper = control.closest?.(".fake-menu-button, .se-field.se-expand-button, .se-filter-menu-button");
    return visibleOpenMenuPanelInside(wrapper);
  }

  function isOpenMenuCandidate(el) {
    if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel") || el.closest?.("#ebay-ai-filler-toast, #ebay-ai-fillall-panel")) return false;
    if (el === document.body || el === document.documentElement) return false;
    const r = el.getBoundingClientRect?.();
    if (!rectIsOnScreenEnough(r) || r.width < 80 || r.height < 35) return false;

    // A5.7: closed eBay fake-menu DOM is still mounted. It must not be treated as open.
    const cls = String(el.className || "");
    const isFieldWrapper = /(^|\s)(fake-menu-button|se-expand-button|se-filter-menu-button)(\s|$)/.test(cls);
    if (isFieldWrapper) return !!visibleOpenMenuPanelInside(el);
    return isRealOpenMenuPanel(el);
  }

  function nearestMenuScopeFrom(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node && node !== document.body && node !== document.documentElement; depth++, node = node.parentElement) {
      if (isOpenMenuCandidate(node)) return node;
    }
    return null;
  }

  function addUniqueElement(list, el) {
    if (el && !list.includes(el)) list.push(el);
  }

  function findOpenMenuScopesNear(control = null) {
    const scopes = [];

    // First priority: the visible menu panel controlled by THIS field.
    // This prevents an old/hidden eBay menu from another field from becoming the helper source.
    addUniqueElement(scopes, controlledMenuPanelFromControl(control));

    const active = document.activeElement;
    addUniqueElement(scopes, nearestMenuScopeFrom(active));

    const searchInputs = [];
    try { searchInputs.push(...Array.from(document.querySelectorAll("input[placeholder*='search' i], input[aria-label*='search' i], [role='textbox']"))); } catch (_) {}
    for (const input of searchInputs.slice(0, 20)) {
      if (!isVisible(input) || input.closest?.("#ebay-ai-hover-panel")) continue;
      addUniqueElement(scopes, nearestMenuScopeFrom(input));
    }

    const roleScopes = [];
    try { roleScopes.push(...Array.from(document.querySelectorAll("[role='listbox'], [role='dialog'], [role='menu'], [role='presentation'], .fake-menu-button__menu, .se-filter-menu-button__menu-container, .se-toggle-group-menu"))); } catch (_) {}
    for (const el of roleScopes.slice(0, 60)) if (isOpenMenuCandidate(el)) addUniqueElement(scopes, el);

    const filtered = scopes.filter(Boolean).filter(isOpenMenuCandidate);
    if (!control || !isVisible(control)) return filtered.slice(0, 6);
    const cr = control.getBoundingClientRect?.();
    if (!cr) return filtered.slice(0, 6);
    return filtered.map(el => {
      const r = el.getBoundingClientRect?.();
      const sameField = controlledMenuPanelFromControl(control) === el ? -1000 : 0;
      const score = r ? sameField + Math.abs((r.top + r.height / 2) - (cr.top + cr.height / 2)) + Math.abs(r.left - cr.left) * 0.02 : 9999;
      return { el, score };
    }).sort((a, b) => a.score - b.score).map(x => x.el).slice(0, 6);
  }


  

  function scopeLooksAttachedToControl(control, scope) {
    // A4.118: only treat a menu as valid for Fill if it belongs to THIS dropdown.
    // This prevents recovery from opening/using another field's dropdown.
    if (!control || !scope || !isVisible(control) || !isOpenMenuCandidate(scope)) return false;
    // A5.6: Fill All opens one field at a time from a clean state. eBay sometimes portals
    // the visible dropdown outside the field wrapper without aria-controls, so the normal
    // geometry/ownership proof can fail. If the menu was created by the last exclusive
    // same-control open attempt, allow that exact scope only.
    try {
      if (!controlHasExplicitMenuOwnerV621(control)
          && typeof HOVER_ASSISTANT !== "undefined"
          && HOVER_ASSISTANT.fillAllExclusiveControl === control
          && HOVER_ASSISTANT.fillAllExclusiveScope === scope
          && Date.now() - (HOVER_ASSISTANT.fillAllExclusiveAt || 0) < 15000) return true;
    } catch (_) {}
    if (controlledMenuPanelFromControl(control) === scope) return true;

    const ids = [control.getAttribute?.("aria-controls"), control.getAttribute?.("aria-owns")]
      .filter(Boolean)
      .flatMap(v => String(v).split(/\s+/).filter(Boolean));
    if (ids.length) {
      const sid = scope.getAttribute?.("id") || "";
      if (sid && ids.includes(sid)) return true;
      for (const id of ids) {
        try {
          const node = document.getElementById(id) || document.querySelector(`#${CSS.escape(id)}`);
          if (node && (node === scope || scope.contains?.(node) || node.contains?.(scope))) return true;
        } catch (_) {}
      }
      // The field exposes an exact eBay menu owner, but this scope is not it.
      // Never let geometry override an aria-controls/aria-owns mismatch.
      return false;
    }

    const wrapper = control.closest?.(".fake-menu-button, .se-field.se-expand-button, .se-filter-menu-button");
    if (wrapper && (wrapper === scope || wrapper.contains?.(scope) || scope.contains?.(wrapper))) return true;

    const cr = control.getBoundingClientRect?.();
    const sr = scope.getBoundingClientRect?.();
    if (!rectLooksUsable(cr) || !rectLooksUsable(sr)) return false;
    const horizontalOverlap = Math.max(0, Math.min(cr.right, sr.right) - Math.max(cr.left, sr.left));
    const overlapOk = horizontalOverlap >= Math.min(cr.width, sr.width) * 0.35;
    const nearBelow = sr.top >= cr.top - 6 && sr.top <= cr.bottom + 220;
    const nearSameRow = Math.abs((sr.top + sr.height / 2) - (cr.top + cr.height / 2)) <= 90;
    return overlapOk && (nearBelow || nearSameRow);
  }

  function exactOpenMenuScopesForControl(control) {
    const out = [];
    const add = el => { if (el && !out.includes(el) && isOpenMenuCandidate(el) && scopeLooksAttachedToControl(control, el)) out.push(el); };
    add(controlledMenuPanelFromControl(control));
    try { for (const el of findOpenMenuScopesNear(control)) add(el); } catch (_) {}
    return out.slice(0, 3);
  }


  

  

  function explicitMenuOwnerIdsV621(control) {
    if (!control) return [];
    return [control.getAttribute?.("aria-controls"), control.getAttribute?.("aria-owns")]
      .filter(Boolean)
      .flatMap(value => String(value).split(/\s+/).filter(Boolean));
  }

  function controlHasExplicitMenuOwnerV621(control) {
    return explicitMenuOwnerIdsV621(control).length > 0;
  }

  

  

  function findSearchInputInScope(scope) {
    if (!scope) return null;
    const selectors = ["input[placeholder*='search' i]", "input[aria-label*='search' i]", "[role='textbox']", "input[type='text']", "input:not([type])"];
    for (const sel of selectors) {
      try {
        const hit = Array.from(scope.querySelectorAll(sel)).find(el => isVisible(el) && isControl(el) && !el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel"));
        if (hit) return hit;
      } catch (_) {}
    }
    return null;
  }

  function optionTextInMenuElement(el) {
    if (!el) return "";
    const aria = el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "";
    const raw = (aria || el.innerText || el.textContent || el.value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const lines = String(el.innerText || el.textContent || aria || "").split(/\n+/).map(clean).filter(Boolean);
    if (lines.length === 1) return lines[0];
    const useful = lines.filter(x => !badOptionText(x));
    return clean(useful[useful.length - 1] || lines[lines.length - 1] || raw);
  }

  function menuOptionClickTarget(el, scope) {
    if (!el) return null;
    let node = el;
    for (let depth = 0; depth < 5 && node && node !== scope && node !== document.body; depth++, node = node.parentElement) {
      if (!isVisible(node) || isAssistantOverlayElement(node)) continue;
      const role = (node.getAttribute?.("role") || "").toLowerCase();
      const tag = (node.tagName || "").toLowerCase();
      if (/^(option|menuitem|button|radio|checkbox)$/.test(role) || ["button", "label", "li"].includes(tag) || node.getAttribute?.("aria-selected") !== null) return node;
      const style = window.getComputedStyle?.(node);
      if (style && style.cursor === "pointer") return node;
    }
    return el;
  }

  function rowLooksCheckedByVisualMark(row, scope) {
    if (!row || !scope || !isVisible(row)) return false;
    const rowRect = row.getBoundingClientRect?.();
    if (!rowRect || rowRect.width < 12 || rowRect.height < 8 || rowRect.height > 96) return false;
    const candidates = [row];
    try {
      candidates.push(...Array.from(row.querySelectorAll?.("input, svg, [class*='check' i], [aria-label*='check' i], [aria-label*='selected' i], [role='checkbox'], span, div") || []).slice(0, 80));
    } catch (_) {}
    for (const el of candidates) {
      if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) continue;
      const r = el.getBoundingClientRect?.();
      try {
        if (el.matches?.("input:checked, [aria-checked='true'], [aria-selected='true'], [aria-pressed='true']")) return true;
      } catch (_) {}
      const cls = String(el.className || "").toLowerCase();
      const aria = clean(`${el.getAttribute?.("aria-label") || ""} ${el.getAttribute?.("title") || ""}`);
      if (/\b(selected|checked|is-selected|is-checked|checkmark|checkbox--checked)\b/.test(cls)) return true;
      if (/\b(selected|checked|check mark|checkmark)\b/i.test(aria)) return true;
      if (!r || r.width < 8 || r.height < 8 || r.width > 42 || r.height > 42) continue;
      const nearLeft = r.left >= rowRect.left - 8 && r.left <= rowRect.left + Math.max(80, rowRect.width * 0.30);
      const verticallyAligned = r.bottom >= rowRect.top - 4 && r.top <= rowRect.bottom + 4;
      const text = clean(el.innerText || el.textContent || "");
      // A4.90: do not treat a dark empty checkbox border as selected.
      // Only an actual check mark / checked attribute / selected class can prove green.
      if (nearLeft && verticallyAligned && /^[✓✔]+$/.test(text) && /svg|span|div/i.test(el.tagName || "")) return true;
    }
    return false;
  }


  function selectedStateNearOptionElement(el, scope) {
    if (!el) return false;
    let node = el;
    for (let depth = 0; depth < 6 && node && node !== scope && node !== document.body; depth++, node = node.parentElement) {
      if (!isVisible(node) || node.closest?.("#ebay-ai-hover-panel")) continue;
      const r = node.getBoundingClientRect?.();
      const compactRow = !!(r && r.height >= 8 && r.height <= 96 && r.width >= 12);
      try {
        if (node.matches?.("input:checked, [aria-checked='true'], [aria-selected='true'], [aria-pressed='true']")) return true;
        // A4.90: only inspect children inside a compact option row.
        // Do not let a large menu parent with some other checked option verify this answer.
        if (compactRow && node.querySelector?.("input:checked, [aria-checked='true'], [aria-selected='true'], [aria-pressed='true']")) return true;
      } catch (_) {}
      const cls = String(node.className || "").toLowerCase();
      if (compactRow && /\b(selected|checked|is-selected|is-checked)\b/.test(cls)) return true;
      if (compactRow && rowLooksCheckedByVisualMark(node, scope)) return true;
    }
    return false;
  }

  function findExactRowInOpenMenu(value, scopes = []) {
    const wanted = normalize(value);
    if (!wanted || !Array.isArray(scopes) || !scopes.length) return null;
    for (const scope of scopes) {
      if (!scope || !isOpenMenuCandidate(scope)) continue;
      const direct = exactTextResultInScope(scope, value);
      if (direct?.element) return { scope, element: direct.element, direct };
      for (const opt of collectOptionsInScope(scope).slice(0, 120)) {
        if (normalize(opt.text) === wanted && opt.element) return { scope, element: opt.element, direct: opt };
      }
    }
    return null;
  }



  function compactMenuRowFromTextNode(parent, scope) {
    if (!parent || !scope) return null;
    let node = parent;
    for (let depth = 0; depth < 7 && node && node !== scope && node !== document.body; depth++, node = node.parentElement) {
      if (!node || !isVisible(node) || node.closest?.("#ebay-ai-hover-panel")) continue;
      const r = node.getBoundingClientRect?.();
      if (!r || r.width < 18 || r.height < 10 || r.height > 98) continue;
      const role = (node.getAttribute?.("role") || "").toLowerCase();
      const tag = (node.tagName || "").toLowerCase();
      const cls = String(node.className || "").toLowerCase();
      let hasChoiceControl = false;
      try { hasChoiceControl = !!node.querySelector?.("input[type='checkbox'], input[type='radio'], [role='checkbox'], [role='radio'], [aria-checked], [aria-selected], [aria-pressed]"); } catch (_) {}
      const rowLike = hasChoiceControl || /^(option|menuitem|checkbox|radio)$/.test(role) || ["label", "li", "button"].includes(tag) || /option|menuitem|checkbox|radio|listbox|item|row/.test(cls);
      if (rowLike) return node;
    }
    return parent;
  }

  function exactVisibleRowsByTextInOpenMenu(value, scopes = []) {
    // A4.90: most reliable live status check for eBay multi-select rows.
    // It finds the visible exact text line, then climbs only to that compact row.
    // This prevents old hidden Selected text or an empty checkbox border from making green.
    const wanted = normalize(value);
    const rows = [];
    const seen = new Set();
    if (!wanted || !Array.isArray(scopes) || !scopes.length) return rows;
    for (const scope of scopes) {
      if (!scope || !isOpenMenuCandidate(scope)) continue;
      try {
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || !isVisible(parent) || parent.closest?.("#ebay-ai-hover-panel")) return NodeFilter.FILTER_REJECT;
            const txt = clean(node.nodeValue || "");
            if (!txt || normalize(txt) !== wanted || badOptionText(txt)) return NodeFilter.FILTER_REJECT;
            const box = parent.closest?.("#ebay-ai-hover-panel");
            if (box) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        let node, count = 0;
        while ((node = walker.nextNode()) && ++count <= 180) {
          const parent = node.parentElement;
          const row = compactMenuRowFromTextNode(parent, scope);
          if (!row || !isVisible(row)) continue;
          const r = row.getBoundingClientRect?.();
          if (!r || r.width < 18 || r.height < 10 || r.height > 120) continue;
          const key = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}:${wanted}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ scope, element: row, text: clean(parent?.innerText || parent?.textContent || value), rect: r });
        }
      } catch (_) {}
    }
    return rows;
  }

  function exactRowsInOpenMenu(value, scopes = []) {
    const wanted = normalize(value);
    const rows = [];
    if (!wanted || !Array.isArray(scopes) || !scopes.length) return rows;
    for (const hit of exactVisibleRowsByTextInOpenMenu(value, scopes)) rows.push(hit);
    const selectors = ["[role='option']", "[role='menuitem']", "[aria-selected]", "button", "label", "li", "div", "span"];
    for (const scope of scopes) {
      if (!scope || !isOpenMenuCandidate(scope)) continue;
      let inspected = 0;
      for (const sel of selectors) {
        try {
          for (const el of Array.from(scope.querySelectorAll(sel))) {
            if (++inspected > 700) break;
            if (!isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) continue;
            const r = el.getBoundingClientRect?.();
            if (!r || r.width < 12 || r.height < 10 || r.height > 96) continue;
            const txt = optionTextInMenuElement(el);
            if (normalize(txt) !== wanted || badOptionText(txt)) continue;
            rows.push({ scope, element: menuOptionClickTarget(el, scope) || el, text: txt, rect: r });
          }
        } catch (_) {}
      }
    }
    return rows;
  }

  function valueAlreadySelectedInOpenMenu(value, scopes = []) {
    // A4.90: verify against every exact row in the open menu.
    // eBay can show the same value in Selected and again in the full list.
    // One unchecked duplicate must not hide a checked Selected row.
    if (customValueAlreadySelectedInOpenMenu(value, scopes)) return true;
    const rows = exactRowsInOpenMenu(value, scopes);
    if (rows.some(hit => hit?.element && selectedStateNearOptionElement(hit.element, hit.scope))) return true;
    const hit = findExactRowInOpenMenu(value, scopes);
    return !!(hit?.element && selectedStateNearOptionElement(hit.element, hit.scope));
  }


  // A4.90 verification-only: multi-select status must be read from eBay's real UI,
  // not only from the currently filtered search result. This avoids false red chips
  // when the field already shows "Fall (+2)" and the open menu Selected block shows
  // Fall / Spring / Summer.
  function displayPlusCount(display) {
    const m = String(display || "").match(/\(\s*\+\s*(\d+)\s*\)/);
    return m ? Number(m[1]) : 0;
  }

  function isLikelyMenuSearchInput(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag !== "input" && (el.getAttribute?.("role") || "").toLowerCase() !== "textbox") return false;
    const hint = normalize([el.getAttribute?.("placeholder"), el.getAttribute?.("aria-label"), el.getAttribute?.("name"), el.getAttribute?.("id")].filter(Boolean).join(" "));
    if (/search/.test(hint)) return true;
    return !!nearestMenuScopeFrom(el);
  }

  function fieldSummaryDisplaysForLabel(label, control = null) {
    const candidates = [];
    addUniqueElement(candidates, control);
    try { addUniqueElement(candidates, findControlForLabel(label)); } catch (_) {}
    try {
      for (const node of labelNodes(label)) {
        for (const item of visibleRightSideControlsForLabelNode(node).slice(0, 3)) addUniqueElement(candidates, item.el);
      }
    } catch (_) {}
    const out = [];
    for (const el of candidates) {
      if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel") || isLikelyMenuSearchInput(el)) continue;
      const display = getControlDisplayValue(el);
      if (!display || /^search$/i.test(display) || /search or enter your own/i.test(display) || displayLooksLikeOpenMenuText(display)) continue;
      out.push({ el, display });
    }
    return out;
  }

  function fieldSummaryHasVerifiedValue(label, control, value) {
    // A4.119: eBay sometimes already shows the correct selected value in the
    // field summary (for example Country of Origin = China), while the open
    // menu/search is closed or filtered and cannot find the option again.
    // Trust only the real field summary for this same label/control, not menu text.
    const val = clean(value);
    if (!val) return false;
    if (controlHasVerifiedValue(control, val)) return true;
    const labelText = clean(label || labelFromControl(control) || findLabelForControl(control));
    if (!labelText) return false;
    for (const item of fieldSummaryDisplaysForLabel(labelText, control)) {
      const display = clean(item?.display || "");
      if (!display || displayLooksLikeOpenMenuText(display)) continue;
      if (compactDisplayMatchesWanted(display, val)) return true;
      if (isSizeLikeFieldControl(item?.el || control) && compoundSizeTextMatchesWanted(display, val)) return true;
    }
    return false;
  }

  

  function fieldSummaryIndicatesAllValues(labelOrControl, controlOrValues = null, maybeValues = []) {
    // Backward compatible signatures:
    //   fieldSummaryIndicatesAllValues(control, values)
    //   fieldSummaryIndicatesAllValues(label, control, values)
    let label = "";
    let control = null;
    let values = [];
    if (Array.isArray(controlOrValues)) {
      control = labelOrControl;
      values = controlOrValues;
    } else {
      label = clean(labelOrControl || "");
      control = controlOrValues;
      values = maybeValues;
    }
    if (!Array.isArray(values) || values.length < 2) return false;

    // A5.11 exactness: a summary such as "Fall (+2)" proves only the number of
    // selected answers, not which answers they are. Never use the +N count alone.
    // Require every requested value to be present in this exact field's checked/Selected DOM.
    const selected = new Set();
    try {
      for (const v of collectSelectedTextsFromSameFieldDom(control, values)) selected.add(exactChoiceKeyA511(v));
    } catch (_) {}
    try {
      const scopes = exactOpenMenuScopesForControl(control);
      for (const v of collectSelectedTextsFromOpenMenu(scopes, values)) selected.add(exactChoiceKeyA511(v));
    } catch (_) {}
    return values.every(v => selected.has(exactChoiceKeyA511(v)));
  }

  

  function sameFieldDomScope(control) {
    if (!control || !isVisible(control)) return null;
    return control.closest?.(".se-field.se-expand-button, .se-filter-menu-button, .fake-menu-button") || null;
  }

  function itemTextForSelectedRow(row) {
    if (!row) return "";
    const preferred = row.querySelector?.(".filter-menu__text, .toggle-button__title, .selected-value, span:not(.filter-menu__checkbox)");
    const txt = clean(preferred?.innerText || preferred?.textContent || optionTextInMenuElement(row));
    if (!txt || badOptionText(txt) || /^(selected|all options|search results|clear|no results found|add custom value)$/i.test(txt)) return "";
    return txt;
  }

  function collectSelectedTextsFromSameFieldDom(control, targetValues = []) {
    // DOM snapshot showed the reliable eBay truth:
    //   same field wrapper -> selectedOptions-attributesX / aria-checked="true" rows.
    // This is safer than scanning every hidden dropdown on the page.
    const selected = new Set();
    const wanted = (targetValues || []).map(v => normalize(v)).filter(Boolean);
    const wantedSet = new Set(wanted);
    const scope = sameFieldDomScope(control);
    if (!scope) return selected;

    const addText = txt => {
      const key = normalize(txt);
      if (!key) return;
      if (wantedSet.size && !wantedSet.has(key)) {
        for (const rawWanted of targetValues || []) {
          const wantedKey = normalize(rawWanted);
          if (compoundSizeTextMatchesWanted(txt, rawWanted)) { selected.add(wantedKey); return; }
        }
        return;
      }
      selected.add(key);
    };

    try {
      const selectedBlocks = Array.from(scope.querySelectorAll("[name^='selectedOptions-'], .selectedOptions, .se-toggle-group-menu__selected") || []);
      for (const block of selectedBlocks) {
        for (const row of Array.from(block.querySelectorAll("[aria-checked='true'], [aria-selected='true'], [aria-pressed='true'], input:checked, .selected-value") || [])) {
          addText(itemTextForSelectedRow(row));
        }
      }

      // Fallback: checked rows anywhere inside the same field wrapper are valid proof.
      // This catches eBay duplicate rows in "All options" that also carry aria-checked=true.
      for (const row of Array.from(scope.querySelectorAll("[aria-checked='true'], [aria-selected='true'], [aria-pressed='true'], input:checked") || [])) {
        addText(itemTextForSelectedRow(row.closest?.("[role='menuitemcheckbox'], [role='menuitemradio'], [role='option'], .filter-menu__item, .menu__item, .toggle-button") || row));
      }
    } catch (_) {}

    return selected;
  }

  function collectSelectedTextsFromOpenMenu(scopes = [], targetValues = []) {
    const wanted = (targetValues || []).map(v => normalize(v)).filter(Boolean);
    const wantedSet = new Set(wanted);
    const selected = new Set();
    const scopesArr = Array.isArray(scopes) ? scopes.filter(Boolean) : [];

    for (const scope of scopesArr) {
      if (!scope || !isOpenMenuCandidate(scope)) continue;

      // 1) Strong evidence: exact row has a checked/selected visual state.
      for (const val of targetValues || []) {
        const key = normalize(val);
        if (!key || selected.has(key)) continue;
        try {
          if (valueAlreadySelectedInOpenMenu(val, [scope])) selected.add(key);
        } catch (_) {}
      }

      // 2) A4.90: do NOT infer selected answers from raw menu text after a "Selected" label.
      // eBay can keep stale/hidden Selected text in the DOM.
      // Only checked exact rows/custom checked rows above are proof.
      // If proof is not visible, leave the chip gray instead of lying green.
    }
    return selected;
  }

  // A4.90: custom-value verification + open-menu anchor summary.
  // eBay can show an answer under "Add custom value" with a checked mark while the
  // normal Search results section says "No results found". That is a valid selected
  // value, not a failure. Keep this check scoped to the already-open menu only.
  function checkedIndicatorNearTextRect(scope, rect) {
    if (!scope || !rect) return false;
    const indicators = [];
    try {
      indicators.push(...Array.from(scope.querySelectorAll("input:checked, [aria-checked='true'], [aria-selected='true'], [aria-pressed='true'], [class*='check' i], [aria-label*='check' i], svg, span, div") || []).slice(0, 180));
    } catch (_) {}
    for (const el of indicators) {
      if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width < 8 || r.height < 8 || r.width > 42 || r.height > 42) continue;
      const sameLine = r.bottom >= rect.top - 6 && r.top <= rect.bottom + 6;
      const leftOfText = r.right <= rect.left + 18 && r.left >= rect.left - 90;
      if (!sameLine || !leftOfText) continue;
      const txt = clean(el.innerText || el.textContent || "");
      // A4.90: a plus sign in the Add custom value row is NOT a selected checkbox.
      if (/^\+/.test(txt)) continue;
      try {
        if (el.matches?.("input:checked, [aria-checked='true'], [aria-selected='true'], [aria-pressed='true']")) return true;
      } catch (_) {}
      const cls = String(el.className || "").toLowerCase();
      const aria = clean(`${el.getAttribute?.("aria-label") || ""} ${el.getAttribute?.("title") || ""}`);
      if (/\b(selected|checked|checkmark|checkbox--checked|is-selected|is-checked)\b/.test(cls)) return true;
      if (/\b(selected|checked|check mark|checkmark)\b/i.test(aria)) return true;
      if (/^[✓✔]+$/.test(txt)) return true;
      // No generic dark-icon heuristic here. It confused eBay's '+' custom-value icon with a check.
    }
    return false;
  }


  function exactTextHitsInScope(scope, value) {
    const wanted = normalize(value);
    const hits = [];
    if (!scope || !wanted || !isOpenMenuCandidate(scope)) return hits;
    try {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !isVisible(parent) || parent.closest?.("#ebay-ai-hover-panel")) return NodeFilter.FILTER_REJECT;
          const txt = clean(node.nodeValue || "");
          if (!txt || normalize(txt) !== wanted || badOptionText(txt)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node, count = 0;
      while ((node = walker.nextNode()) && ++count <= 220) {
        const parent = node.parentElement;
        if (!parent) continue;
        const range = document.createRange();
        try { range.selectNodeContents(node); } catch (_) { continue; }
        const rects = Array.from(range.getClientRects?.() || []).filter(r => r.width >= 8 && r.height >= 8);
        range.detach?.();
        const rect = rects[0] || parent.getBoundingClientRect?.();
        if (rect) hits.push({ node, parent, rect });
      }
    } catch (_) {}
    return hits;
  }

  function customValueAlreadySelectedInOpenMenu(value, scopes = []) {
    const wanted = normalize(value);
    if (!wanted || !Array.isArray(scopes)) return false;
    for (const scope of scopes) {
      if (!scope || !isOpenMenuCandidate(scope)) continue;
      const menuText = normalize(scope.innerText || scope.textContent || "");
      if (!menuText.includes("add custom value")) continue;
      for (const hit of exactTextHitsInScope(scope, value)) {
        // Strong evidence: the exact custom value line itself has a check mark.
        if (selectedStateNearOptionElement(hit.parent, scope)) return true;
        if (checkedIndicatorNearTextRect(scope, hit.rect)) return true;
        // If the exact value appears between Add custom value and Search results and
        // the line has a nearby checked visual, treat it as selected. Do not infer
        // selected just because the text appears; custom values can also be offered unchecked.
        try {
          const beforeText = clean(scope.innerText || scope.textContent || "");
          const addIdx = normalize(beforeText).indexOf("add custom value");
          const foundIdx = normalize(beforeText).indexOf(wanted);
          const searchIdx = normalize(beforeText).indexOf("search results");
          const inCustomBlock = addIdx >= 0 && foundIdx > addIdx && (searchIdx < 0 || foundIdx < searchIdx);
          if (inCustomBlock && checkedIndicatorNearTextRect(scope, hit.rect)) return true;
        } catch (_) {}
      }
    }
    return false;
  }

  

  

  function refreshAnswerStatesFromEbay(rec, panel, control, scopes = null, valuesOverride = null) {
    // A4.90: strict live status. Green is allowed only from current eBay proof.
    // For multi-select, do not keep old green memory when the open menu does not
    // currently show a checked exact row or a real Selected section for that value.
    if (!rec) return { selected: new Set(), allSelected: false };
    const values = (Array.isArray(valuesOverride) && valuesOverride.length ? valuesOverride : splitMulti(rec.label, rec.value)).map(clean).filter(Boolean);
    if (!values.length) return { selected: new Set(), allSelected: false };

    const freshScopes = (Array.isArray(scopes) && scopes.length) ? scopes : findOpenMenuScopesNear(control);
    const selected = collectSelectedTextsFromOpenMenu(freshScopes, values);
    for (const key of collectSelectedTextsFromSameFieldDom(control, values)) selected.add(key);
    const isMulti = values.length > 1;
    const hasOpenMenu = freshScopes.length > 0;

    // A5.1: eBay often closes multi-select menus after a click and only leaves
    // a compact field summary like "Tie (+1)". If that summary exactly matches
    // the number of requested answers, use it as same-field proof for all chips.
    // This prevents false red "exact option not found" after eBay actually selected
    // the requested multi answers. Scoped to same field summary only; menu text is ignored.
    if (isMulti && fieldSummaryIndicatesAllValues(rec.label, control, values)) {
      for (const v of values) setAnswerState(rec, panel, v, "ok");
      return { selected, allSelected: true, source: "field-summary-plus-count" };
    }

    for (const val of values) {
      const key = answerStateKey(val);
      const norm = normalize(val);
      let ok = false;

      const rows = exactRowsInOpenMenu(val, freshScopes);
      if (rows.length) {
        // Exact visible checked row = proof. Exact visible unchecked row = not proof.
        ok = rows.some(hit => hit?.element && selectedStateNearOptionElement(hit.element, hit.scope));
      } else if (selected.has(norm)) {
        // Real Selected section / checked custom row = proof.
        ok = true;
      } else if (!isMulti && fieldSummaryHasVerifiedValue(rec.label, control, val)) {
        // Single dropdown/text field: same-field summary/value is proof. This keeps text confirmation stable.
        ok = true;
      } else if (isMulti && !hasOpenMenu) {
        // Closed multi menu: only exact summary without (+N) can prove one visible answer.
        const displays = fieldSummaryDisplaysForLabel(rec.label, control);
        ok = displays.some(item => {
          const display = clean(item?.display || "");
          return display && !displayPlusCount(display) && compactDisplayMatchesWanted(display, val) && !displayLooksLikeOpenMenuText(display);
        });
      }

      if (ok) {
        setAnswerState(rec, panel, val, "ok");
      } else if (isMulti && hasOpenMenu) {
        // This is the important fix: an open menu with no proof must not keep a stale green chip.
        // Keep explicit red failures, but turn old green/active back to gray pending.
        const prev = ensureAnswerState(rec)[key];
        if (prev === "ok" || prev === "active" || !prev) setAnswerState(rec, panel, val, "pending");
      } else if (!isMulti && hasOpenMenu) {
        const prev = ensureAnswerState(rec)[key];
        if (prev === "ok" && rows.length && !controlHasVerifiedValue(control, val)) setAnswerState(rec, panel, val, "pending");
      }
      // Red is reserved for explicit failed Fill attempts in fillHoverRecord().
    }

    const states = ensureAnswerState(rec);
    const allSelected = values.every(v => states[answerStateKey(v)] === "ok");
    return { selected, allSelected };
  }

  

  

  function collectOptionsInScope(scope) {
    if (!scope) return [];
    // A4.43: include div/span only inside the already-open eBay menu.
    // This catches visible search-result rows like "Regular" without restoring any full-page scan.
    const selectors = ["[role='option']", "[role='menuitem']", "[aria-selected]", "button", "label", "li", "div", "span"];
    const out = [];
    let inspected = 0;
    for (const sel of selectors) {
      try {
        for (const el of Array.from(scope.querySelectorAll(sel))) {
          if (++inspected > 520) break;
          if (!isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) continue;
          const r = el.getBoundingClientRect?.();
          if (!r || r.width < 20 || r.height < 12) continue;
          const text = optionTextInMenuElement(el);
          if (!text || text.length > 90 || badOptionText(text)) continue;
          const hasChildSameText = Array.from(el.children || []).some(ch => isVisible(ch) && normalize(optionTextInMenuElement(ch)) === normalize(text));
          if (hasChildSameText && !/^(option|menuitem)$/.test((el.getAttribute?.("role") || "").toLowerCase())) continue;
          out.push({ text, element: menuOptionClickTarget(el, scope) || el });
        }
      } catch (_) {}
    }
    const seen = new Set();
    return out.filter(o => { const k = normalize(o.text); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 120);
  }

  function dispatchKeyboardKey(el, key) {
    if (!el) return false;
    suppressHelperOpen(1200);
    const codeMap = { Enter: "Enter", ArrowDown: "ArrowDown", ArrowUp: "ArrowUp", Tab: "Tab" };
    const code = codeMap[key] || key;
    const opts = { key, code, bubbles: true, cancelable: true, composed: true };
    try { el.focus?.({ preventScroll: true }); } catch (_) {}
    try { el.dispatchEvent(new KeyboardEvent("keydown", opts)); } catch (_) {}
    try { el.dispatchEvent(new KeyboardEvent("keypress", opts)); } catch (_) {}
    try { el.dispatchEvent(new KeyboardEvent("keyup", opts)); } catch (_) {}
    return true;
  }

  

  function exactTextResultInScope(scope, value) {
    const wanted = normalize(value);
    if (!scope || !wanted) return null;

    // First prefer leaf elements whose full visible text is exactly the desired answer.
    const selectors = ["[role='option']", "[role='menuitem']", "[aria-selected]", "button", "label", "li", "div", "span"];
    let inspected = 0;
    for (const sel of selectors) {
      try {
        for (const el of Array.from(scope.querySelectorAll(sel))) {
          if (++inspected > 700) break;
          if (!isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) continue;
          const txt = optionTextInMenuElement(el);
          if (normalize(txt) !== wanted || badOptionText(txt)) continue;
          const r = el.getBoundingClientRect?.();
          if (!r || r.width < 12 || r.height < 10) continue;
          return { text: txt, element: menuOptionClickTarget(el, scope) || el, rect: r, via: "element" };
        }
      } catch (_) {}
    }

    // eBay sometimes renders Search results as plain text nodes inside non-option divs.
    // Use a text-node Range inside the already-open menu only; never scan the full page.
    try {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !isVisible(parent) || parent.closest?.("#ebay-ai-hover-panel")) return NodeFilter.FILTER_REJECT;
          const txt = clean(node.nodeValue || "");
          if (!txt || normalize(txt) !== wanted || badOptionText(txt)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node, count = 0;
      while ((node = walker.nextNode()) && ++count <= 700) {
        const parent = node.parentElement;
        if (!parent) continue;
        const range = document.createRange();
        try { range.selectNodeContents(node); } catch (_) { continue; }
        const rects = Array.from(range.getClientRects?.() || []).filter(r => r.width >= 8 && r.height >= 8);
        range.detach?.();
        const rect = rects[0] || parent.getBoundingClientRect?.();
        if (!rect) continue;
        return { text: clean(node.nodeValue), element: menuOptionClickTarget(parent, scope) || parent, rect, via: "text-node" };
      }
    } catch (_) {}
    return null;
  }

  

  


  function scrubLabel(text) {
    let t = String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    t = t.replace(/\s*~\s*[\d.]+\s*[kmb]?\s*searches?.*$/i, "").trim();
    t = t.replace(/\s*\*$/, "").trim();
    return t.slice(0, 80);
  }

  const KNOWN_LABELS = [
    "Title", "Item title", "Brand", "Size", "Color", "Colour", "Department", "Type", "Style", "UPC",
    "Sleeve Type", "Sleeve Length", "Pattern", "Occasion", "Material", "Theme", "Neckline", "Fabric Type", "Character",
    "Vintage", "Season", "Closure", "Accents", "Features", "Country of Origin", "Handmade", "Personalize",
    "Dress Length", "Outer Shell Material", "Lining Material", "Insole Material", "Outsole Material", "Upper Material",
    "Exterior Material", "Exterior Color", "US Shoe Size", "UK Shoe Size", "AU Shoe Size", "EU Shoe Size",
    "Condition", "Item condition", "Condition description", "Description", "Item price", "Price", "Quantity",
    "Shoe Width", "Heel Height", "Heel Style", "Toe Shape", "Shoe Shaft Style", "Shoe Shaft Style", "Shoe Shaft",
    "California Prop 65 Warning", "MPN", "Model", "Product Line", "Performance/Activity", "Swim Bottom Style", "Swim Top Style",
    "Cup Size", "Strap Type", "Number of Pieces", "Garment Care", "Fabric Weight", "Package weight", "Package dimensions",
    "Format", "Shipping policy", "Payment policy", "Allow offers", "Minimum offer", "Auto accept", "Item location", "Return policy"
  ];

  const LABEL_NODE_SELECTOR = "label, span, div, p, a, legend, h1, h2, h3, h4, h5, h6, strong, b";

  function directText(node) {
    if (!node) return "";
    const parts = [];
    for (const child of Array.from(node.childNodes || [])) {
      if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent || "");
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function nodeTextForLabel(node) {
    if (!node) return "";
    const direct = directText(node);
    const aria = node.getAttribute?.("aria-label") || "";
    const title = node.getAttribute?.("title") || "";
    const inner = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    // Prefer direct text so parent wrappers do not become one huge fake label.
    const raw = direct || aria || title || (inner.length <= 120 ? inner : "");
    return scrubLabel(raw);
  }

  function isSkippableLabelText(label) {
    const t = String(label || "").trim();
    if (!t) return true;
    if (/^(yes|no|trending|required|recommended|optional|review|show more|show less|edit|add|select|main|photos? & video|photos? and video)$/i.test(t)) return true;
    if (/^(buyers need these details|buyers also search|save time and money|disclose all flaws|examples of flaws)$/i.test(t)) return true;
    if (/^(item specifics|required|additional|additional \(optional\)|condition|description|pricing|shipping|preferences|item disclosures)$/i.test(t) && !/^(condition|description)$/i.test(t)) return true;
    if (t.length > 80) return true;
    return false;
  }

  function isKnownLabel(text) {
    const cleanLabel = scrubLabel(text);
    const n = normalize(cleanLabel);
    if (!n || isSkippableLabelText(cleanLabel)) return false;
    return KNOWN_LABELS.some(k => normalize(k) === n) || /^[a-z][a-z0-9/&' .#()-]{1,54}$/i.test(cleanLabel);
  }

  function allLabelNodes() {
    return Array.from(document.querySelectorAll(LABEL_NODE_SELECTOR)).filter(node => {
      if (!isVisible(node) || node.closest?.("#ebay-ai-fill-preview-panel")) return false;
      const label = nodeTextForLabel(node);
      return !!label && isKnownLabel(label);
    });
  }

  function labelNodes(label) {
    const wanted = normalize(label);
    return allLabelNodes().filter(node => normalize(nodeTextForLabel(node)) === wanted);
  }

  // #endregion

  // #region EBAY FIELD DISCOVERY, DESCRIPTION, CONDITION, AND YES/NO
  function findControlForLabel(label) {
    const nodes = labelNodes(label);
    for (const node of nodes) {
      const forId = node.getAttribute?.("for");
      if (forId) {
        const linked = document.getElementById(forId);
        if (linked && controlLooksLikeRightMenuBox(linked, node.getBoundingClientRect())) return linked;
      }

      const candidates = visibleRightSideControlsForLabelNode(node);
      if (candidates[0]) return candidates[0].el;
    }
    return null;
  }

  


  function findLabelForControl(control) {
    if (!control || !isVisible(control)) return "";
    const cr = control.getBoundingClientRect?.();
    if (!rectLooksUsable(cr)) return "";

    const hint = normalize([
      control.getAttribute?.("aria-label"),
      control.getAttribute?.("name"),
      control.getAttribute?.("id"),
      control.getAttribute?.("placeholder"),
      control.getAttribute?.("data-testid")
    ].filter(Boolean).join(" "));
    if (/condition description|condition.*description/.test(hint)) return "Condition description";
    if (/item condition|conditionid|condition_/.test(hint)) return "Item condition";
    if (/description|editor|wysiwyg|rich text/.test(hint)) return "Description";

    const candidates = [];
    const nodes = allLabelNodes();
    for (const node of nodes) {
      try {
        if (!isVisible(node) || node.closest?.("#ebay-ai-fill-preview-panel")) continue;
        const label = nodeTextForLabel(node);
        if (!label || !isKnownLabel(label)) continue;
        if (/^(yes|no|trending|required|recommended|optional|review|show more|show less)$/i.test(label)) continue;
        const r = node.getBoundingClientRect?.();
        if (!rectLooksUsable(r)) continue;
        const sameRowDistance = Math.abs((r.top + r.height / 2) - (cr.top + cr.height / 2));
        const aboveDistance = Math.max(0, cr.top - r.bottom);
        const leftSide = r.left < cr.left - 8;
        const aboveOrSame = aboveDistance >= 0 && aboveDistance <= 90 && Math.abs(r.left - cr.left) <= 120;
        if (!leftSide && !aboveOrSame) continue;
        if (sameRowDistance > 72 && !aboveOrSame) continue;
        const score = sameRowDistance + Math.max(0, cr.left - r.right) * 0.015 + (aboveOrSame ? 18 : 0);
        candidates.push({ label, node, score, r });
      } catch (_) {}
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.label || "";
  }

  

  

  function descriptionText(data) {
    return [data.description, data.measurements ? `Measurements:\n${data.measurements}` : ""].filter(Boolean).join("\n\n").trim();
  }

  

  

  

  

  


  // V8.23.21: protected Description writer removed. Description lookup below is read-only.

  

  

  

  

  

  function buildValueMap(data) {
    const specifics = { ...parseKeyValueLines(data.specifics || ""), ...(data.specificsObject || {}) };
    const map = {};
    const add = (key, value) => {
      if (!isManualOnlyProtectedFieldA536(key) && !isBlockedPlaceholderValueA532(value)) addValueMapAliases(map, key, value);
    };
    add("Brand", data.brand);
    add("Size", data.size);
    add("Color", data.color);
    add("Condition", data.condition);
    add("Item condition", data.condition);
    add("Item price", data.price);
    add("Price", data.price);
    add("Quantity", data.quantity || "1");
    add("Condition description", data.conditionDescription);
    add("Description", descriptionText(data));
    for (const [key, value] of Object.entries(specifics)) {
      add(key, value);
      if (normalize(key) === "exterior color") add("Color", value);
      if (normalize(key) === "us shoe size") add("Size", value);
    }
    return map;
  }

  function yesNoTextOfElement(el) {
    return normalize(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || el?.value || "");
  }

  function isYesNoOptionElement(el) {
    if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) return false;
    const text = yesNoTextOfElement(el);
    if (text !== "yes" && text !== "no") return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const type = (el.type || "").toLowerCase();
    return tag === "button" || role === "button" || tag === "label" || type === "radio" || /button|radio/.test(role);
  }

  


  


  function choiceTextOfElement(el) {
    return clean(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || el?.value || "");
  }

  function isBinaryChoiceOptionElement(el) {
    if (!el || !isVisible(el) || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel")) return false;
    // A4.118: dropdown fields and dropdown answer rows are not two-choice questions.
    // eBay item-specific dropdowns can display values like "Sun Hat" / "Style" / "Beige".
    // Older binary detection could group nearby real fields and open helper as "Sun Hat"
    // with fake choices "Brand / Style". Reject any control or ancestor that is a real field trigger.
    const fieldHost = el.closest?.("button[aria-expanded], [role='combobox'], [name^='attributes.'], [name^='itemOrigin.'], [id*='item-specific-dropdown-label-'], .fake-menu-button__button, .se-expand-button__button, .se-filter-menu-button") || el;
    if (isInsideVisibleMenuPanelOnly(el) || isRealEbayFieldTrigger(el) || isRealEbayFieldTrigger(fieldHost)) return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const type = (el.type || "").toLowerCase();
    const name = clean(el.getAttribute?.("name") || "");
    const id = clean(el.getAttribute?.("id") || "");
    const clsEarly = String(el.className || "");
    if (el.hasAttribute?.("aria-expanded") || /^(attributes\.|itemOrigin\.)/i.test(name) || /item-specific-dropdown-label|fake-menu-button__button|se-expand-button__button|btn--form|se-filter-menu-button|menu__item|dropdown|combobox|expand/i.test(`${id} ${clsEarly}`)) return false;
    const text = choiceTextOfElement(el);
    if (!text || text.length > 34) return false;
    if (/^(show more|show less|edit|add|clear|search|select|finish update|save|cancel|delete|remove|search results|add custom value)$/i.test(text)) return false;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width < 20 || r.height < 16 || r.width > 280 || r.height > 78) return false;
    if (el.closest?.("#gh, header, nav, footer, [role='listbox'], [role='menu'], [role='menuitem'], [role='option']")) return false;

    const directlyButtonLike = tag === "button" || role === "button" || tag === "label" || type === "radio" || /button|radio/.test(role) ||
      el.hasAttribute?.("aria-checked") || el.hasAttribute?.("aria-pressed") || el.hasAttribute?.("aria-selected");
    if (directlyButtonLike) return true;

    // A4.90: eBay sometimes renders two-choice pills as span/div text inside a clickable pill.
    // Accept these only when they look like a small inline pill, not normal form text.
    if (!(tag === "span" || tag === "div" || tag === "a")) return false;
    let st = null;
    try { st = window.getComputedStyle(el); } catch (_) {}
    const cls = String(el.className || "");
    const buttonishClass = /btn|button|pill|chip|radio|toggle|segmented|choice|selection|fake|textbox__control/i.test(cls);
    const cursorPointer = st?.cursor === "pointer";
    const tabbable = Number(el.getAttribute?.("tabindex")) >= 0;
    const rounded = (() => {
      try { return parseFloat(st?.borderRadius || "0") >= 8 || parseFloat(st?.borderTopLeftRadius || "0") >= 8; } catch (_) { return false; }
    })();
    return cursorPointer || tabbable || buttonishClass || rounded;
  }

  

  function labelNearBinaryChoiceRow(row) {
    if (!row) return "";
    const cy = row.cy;
    const choiceKeys = new Set((row.choices || []).map(c => c.key));
    const nodes = Array.from(document.querySelectorAll("label, span, div, p, a, legend"))
      .filter(node => isVisible(node) && !node.closest?.("#ebay-ai-hover-panel") && !(row.els || []).some(el => node.contains(el) || el.contains(node)))
      .map(node => ({ node, r: node.getBoundingClientRect(), text: scrubLabel(node.innerText || node.textContent || "") }))
      .filter(x => {
        if (!x.text || x.text.length > 80) return false;
        if (choiceKeys.has(normalize(x.text))) return false;
        if (/^(yes|no)$/i.test(x.text)) return false;
        const ny = x.r.top + x.r.height / 2;
        const sameLine = Math.abs(ny - cy) <= 62 && x.r.left < row.left && x.r.right <= row.left + 70;
        const justAbove = x.r.bottom <= row.top + 10 && x.r.bottom >= row.top - 90 && x.r.left <= row.right && x.r.right >= row.left - 80;
        return (sameLine || justAbove) && x.r.width <= 360 && x.r.height <= 90;
      })
      .sort((a, b) => {
        const ay = Math.abs((a.r.top + a.r.height / 2) - cy);
        const by = Math.abs((b.r.top + b.r.height / 2) - cy);
        const ax = Math.max(0, row.left - a.r.right);
        const bx = Math.max(0, row.left - b.r.right);
        return (ay + ax / 12) - (by + bx / 12);
      });
    return nodes[0]?.text || "";
  }

  

  

  

  

  function findYesNoNearControl(control, value) {
    if (!control || !isVisible(control)) return null;
    const wanted = normalize(value);
    const cr = control.getBoundingClientRect?.();
    if (!cr) return null;
    const candidates = [];
    try { candidates.push(...Array.from(document.querySelectorAll("button, [role='button'], label, span, input[type='radio']"))); } catch (_) {}
    return candidates
      .filter(el => isYesNoOptionElement(el) && yesNoTextOfElement(el) === wanted)
      .map(el => ({ el, r: el.getBoundingClientRect?.() }))
      .filter(x => x.r && Math.abs((x.r.top + x.r.height / 2) - (cr.top + cr.height / 2)) <= 74 && x.r.left >= cr.left - 40 && x.r.left <= cr.right + 320)
      .sort((a, b) => Math.abs((a.r.top + a.r.height / 2) - (cr.top + cr.height / 2)) - Math.abs((b.r.top + b.r.height / 2) - (cr.top + cr.height / 2)))[0]?.el || null;
  }

  function findYesNoInRow(label, value, control = null) {
    const nodes = labelNodes(label);
    const wanted = normalize(value);
    for (const node of nodes) {
      let parent = node;
      for (let depth = 0; depth < 8 && parent; depth++, parent = parent.parentElement) {
        const controls = Array.from(parent.querySelectorAll("button, [role='button'], label, span, input[type='radio']")).filter(isVisible);
        const hit = controls.find(el => isYesNoOptionElement(el) && yesNoTextOfElement(el) === wanted);
        if (hit) return hit;
      }
    }
    return findYesNoNearControl(control, value);
  }

  // #endregion

  // #region HELPER FILL SUPPORT AND CANCELLATION
  

  

  const FILL_ENGINE = { cancelRequested: false };

  

  

  

  

  

  

  

  function rectLooksUsable(r) {
    return !!r && Number.isFinite(r.left) && Number.isFinite(r.top) && r.width >= 35 && r.height >= 18;
  }


  function textLooksLikeBadgeControl(el) {
    const text = normalize(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || el?.value || "");
    if (!text) return false;
    return /^(trending|required|recommended|optional|review|new|hot)$/.test(text) || /searches$/.test(text);
  }

  function controlLooksLikeRightMenuBox(el, labelRect = null) {
    if (!el || !isVisible(el) || !isControl(el)) return false;
    if (el.closest?.("#ebay-ai-fill-preview-panel")) return false;
    if (isDangerousActionElement(el)) return false;
    if (textLooksLikeBadgeControl(el)) return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const r = el.getBoundingClientRect?.();
    if (!rectLooksUsable(r)) return false;

    // The item-specifics menus on eBay are wide controls on the right side.
    // Reject small left-side badges like "Trending" that sit beside the question text.
    const isNativeText = tag === "input" || tag === "textarea" || tag === "select" || role === "textbox" || role === "combobox";
    const isLikelyDropdownButton = tag === "button" || role === "button";
    const wideEnough = r.width >= 140 || isNativeText;
    if (!wideEnough) return false;

    if (labelRect) {
      const vertical = Math.abs((r.top + r.height / 2) - (labelRect.top + labelRect.height / 2));
      if (vertical > 58) return false;
      const strongRightSide = r.left >= labelRect.right + 40 || r.left >= Math.max(260, window.innerWidth * 0.32);
      if (!strongRightSide) return false;
    }

    if (isLikelyDropdownButton && r.width < 120 && !/^(yes|no)$/i.test((el.innerText || el.textContent || "").trim())) return false;
    return true;
  }

  function visibleRightSideControlsForLabelNode(node) {
    const nr = node.getBoundingClientRect();
    return Array.from(document.querySelectorAll("input, textarea, select, button, [role='textbox'], [role='combobox'], [role='button'], [contenteditable='true']"))
      .filter(el => controlLooksLikeRightMenuBox(el, nr))
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(x => {
        const vertical = Math.abs((x.r.top + x.r.height / 2) - (nr.top + nr.height / 2));
        return vertical <= 58 && x.r.height >= 20;
      })
      .sort((a, b) => {
        const aNative = ["input", "textarea", "select"].includes((a.el.tagName || "").toLowerCase()) ? 0 : 1;
        const bNative = ["input", "textarea", "select"].includes((b.el.tagName || "").toLowerCase()) ? 0 : 1;
        const aWide = a.r.width >= 180 ? 0 : 1;
        const bWide = b.r.width >= 180 ? 0 : 1;
        const aDist = Math.abs((a.r.top + a.r.height / 2) - (nr.top + nr.height / 2)) + Math.max(0, a.r.left - nr.right) * 0.01;
        const bDist = Math.abs((b.r.top + b.r.height / 2) - (nr.top + nr.height / 2)) + Math.max(0, b.r.left - nr.right) * 0.01;
        return (aNative - bNative) || (aWide - bWide) || (aDist - bDist);
      });
  }

  

  

  

  

  

  

  function getControlDisplayValue(control) {
    if (!control) return "";
    const tag = (control.tagName || "").toLowerCase();
    if (tag === "select") {
      const opt = control.options?.[control.selectedIndex];
      return clean(opt?.textContent || control.value || "");
    }
    if (tag === "input" || tag === "textarea") return clean(control.value || "");
    return clean(control.getAttribute?.("aria-label") || control.innerText || control.textContent || control.value || "");
  }

  

  

  


  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  function requestStopAllActions() {
    FILL_ENGINE.cancelRequested = true;
    if (!HOVER_ASSISTANT?.fillAll?.running) toast("V8.23.21 Stop Actions: no fill is running.", 5000);
    else toast("V8.23.21 Stop Actions requested.", 7000);
  }

  

  

  

  

  // #endregion

  // #region QUEUE PAGE READY SIGNAL
  const QUEUE_RUNNER_STORAGE_KEY_V710 = "ebayAiQueueRunnerV710";

  let QUEUE_ACTIVE_DRAFT_ID_V741 = "";
  let QUEUE_PAGE_SUSPENDED_V741 = false;

  

  function queueExpectedPortCloseV741(error) {
    return /back\/forward cache|message channel is closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(String(error?.message || error || ""));
  }

  window.addEventListener("pagehide", () => {
    QUEUE_PAGE_SUSPENDED_V741 = true;
  }, { capture: true });

  window.addEventListener("pageshow", () => {
    QUEUE_PAGE_SUSPENDED_V741 = false;
    const draftId = queueExtractDraftIdV710(location.href);
    if (draftId !== QUEUE_ACTIVE_DRAFT_ID_V741) QUEUE_ACTIVE_DRAFT_ID_V741 = "";
    setTimeout(() => notifyQueueRunnerReadyV710(), 80);
  }, { capture: true });

  function queueExtractDraftIdV710(input) {
    const value = String(input || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value, location.href);
      for (const [name, candidate] of parsed.searchParams.entries()) {
        if (name.toLowerCase().replace(/[^a-z0-9]/g, "") === "draftid" && /^[a-z0-9_-]{4,}$/i.test(candidate)) return candidate;
      }
    } catch (_) {}
    const match = value.match(/[?&](?:draftId|draft_id)=([a-z0-9_-]{4,})/i);
    return match ? match[1] : "";
  }

  

  

  

  

  

  

  

  





  

  

  

  

  

  

  


  

  

  

  

  

  

  

  

  

  

  

  

  


  

  

  


  

  

  

  

  

  

  

  

  

  

  

  

  


  

  

  

  

  

  

  function notifyQueueRunnerReadyV710() {
    if (QUEUE_PAGE_SUSPENDED_V741 || document.prerendering) return;
    try {
      chrome.runtime.sendMessage({ type: "AI_QUEUE_TAB_READY_V710", payload: { url: location.href, draftId: queueExtractDraftIdV710(location.href) } }, () => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError && !queueExpectedPortCloseV741(runtimeError)) {
          try { console.debug("[AI Queue] ready message was not delivered:", runtimeError.message); } catch (_) {}
        }
      });
    } catch (error) {
      if (!queueExpectedPortCloseV741(error)) {
        try { console.debug("[AI Queue] ready message failed:", error?.message || String(error)); } catch (_) {}
      }
    }
  }



  // ------------------------------
  // V5.0 A4.20: On-demand Click Field Assistant + AI/Text mode support
  // Performance mode: no hover tracking, no full scan on enable, no cached rectangles loop.
  // The helper is resolved only when the user clicks an actual field/control or its visible label.
  // ------------------------------
  // #endregion

  // #region ON-DEMAND HELPER — DRAGGABLE PANEL, FILL ALL, AND NAVIGATION
  const HOVER_ASSISTANT = {
    enabled: false,
    mode: "fill",
    data: {},
    settings: {},
    reviewItem: null,
    reviewByKey: new Map(),
    reviewByFieldId: new Map(),
    reviewFilter: "needs_attention",
    reviewPendingChange: null,
    activeRecord: null,
    button: null,
    panel: null,
    panelActionRunner: null,
    helperShieldInstalled: false,
    lastGlobalPanelActionAt: 0,
    suppressOpenUntil: 0,
    panelActionRunning: false,
    positionRaf: 0,
    lastAnchorLabel: "",
    panelPinned: false,
    dragState: null,
    navRouteCache: null,
    navRouteBuiltAt: 0,
    navRouteSignature: "",
    navRoutePrebuildStartedAt: 0,
    navRoutePrebuildDoneAt: 0,
    actionLog: [],
    debugErrors: [],
    fillAll: { running: false, stopRequested: false, panel: null, results: [] },
    queueFastModeV740: false
  };

  


  function safeDebugValue(value, depth = 0) {
    if (depth > 3) return "[depth-limit]";
    if (value == null) return value;
    if (value instanceof Element) {
      let rect = null;
      try {
        const r = value.getBoundingClientRect();
        rect = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      } catch (_) {}
      return {
        tag: (value.tagName || "").toLowerCase(),
        name: clean(value.getAttribute?.("name") || ""),
        id: clean(value.getAttribute?.("id") || ""),
        role: clean(value.getAttribute?.("role") || ""),
        text: clean(value.innerText || value.textContent || value.value || "").slice(0, 120),
        rect
      };
    }
    if (Array.isArray(value)) return value.slice(0, 40).map(v => safeDebugValue(v, depth + 1));
    if (typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value).slice(0, 80)) out[k] = safeDebugValue(v, depth + 1);
      return out;
    }
    if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value;
    return value;
  }

  function recordDebugSummary(rec) {
    if (!rec) return null;
    let r = null;
    try { r = helperNavRectForRecord(rec); } catch (_) {}
    let key = "";
    try { key = helperNavRecordKey(rec); } catch (_) {}
    return {
      label: clean(rec.label || ""),
      value: clean(rec.value || ""),
      isYesNoField: !!rec.isYesNoField,
      isBinaryChoiceField: !!rec.isBinaryChoiceField,
      binaryChoices: Array.isArray(rec.binaryChoices) ? rec.binaryChoices.slice(0, 6) : [],
      key,
      rect: rectLooksUsable(r) ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null,
      control: safeDebugValue(rec.control)
    };
  }

  function logHelperAction(type, detail = {}) {
    try {
      const arr = HOVER_ASSISTANT.actionLog || (HOVER_ASSISTANT.actionLog = []);
      arr.push({
        t: Date.now(),
        ts: new Date().toISOString(),
        version: VERSION,
        type: clean(type || "event"),
        url: location.href,
        scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
        activeRecord: recordDebugSummary(HOVER_ASSISTANT.activeRecord),
        detail: safeDebugValue(detail)
      });
      while (arr.length > 150) arr.shift();
      window.__ebayAiFillerActionLog = arr;
    } catch (err) {
      try {
        const errs = HOVER_ASSISTANT.debugErrors || (HOVER_ASSISTANT.debugErrors = []);
        errs.push({ ts: new Date().toISOString(), where: "logHelperAction", message: err?.message || String(err) });
        while (errs.length > 50) errs.shift();
      } catch (_) {}
    }
  }

  function clearHelperActionLog() {
    HOVER_ASSISTANT.actionLog = [];
    window.__ebayAiFillerActionLog = HOVER_ASSISTANT.actionLog;
    return true;
  }

  function ensureHoverStyles() {
    return globalThis.EbayUI?.assistantPanel?.ensureStyles?.();
  }

  function hoverValueMap(data) {
    const d = data || {};
    const map = buildValueMap(d);
    const add = (label, value) => { const v = safeFillValueA532(value); if (v) map[label] = v; };
    add("Price", d.price);
    add("Item price", d.price);
    add("Condition description", d.conditionDescription);
    add("Description", descriptionText(d));
    add("Condition", d.condition);
    return map;
  }

  

  function rememberedChoices() {
    try { return JSON.parse(localStorage.getItem("ebayAiFillerRememberedChoices") || "{}"); }
    catch (_) { return {}; }
  }

  function saveRememberedChoice(label, value) {
    const choices = rememberedChoices();
    choices[normalize(label)] = { label, value: clean(value), savedAt: new Date().toISOString() };
    try { localStorage.setItem("ebayAiFillerRememberedChoices", JSON.stringify(choices)); return true; }
    catch (_) { return false; }
  }

  function rememberedValueForLabel(label) {
    const choices = rememberedChoices();
    return clean(choices[normalize(label)]?.value || "");
  }

  function isYesNoLikelyField(label, value = "") {
    // A5.21: only the field name or an exact Yes/No value can enable binary mode.
    // Ordinary description text often contains words such as "no stains" and must never
    // make the helper display Yes/No choices.
    const labelKey = normalize(label);
    const valueKey = normalize(value);
    return /\b(vintage|handmade|personalize|personalization|signed)\b/.test(labelKey)
      || /^(yes|no)$/.test(valueKey);
  }

  function snapshotControl(control) {
    if (!control) return null;
    const tag = (control.tagName || "").toLowerCase();
    if (tag === "select" || tag === "input" || tag === "textarea") return { type: "value", value: control.value || "" };
    if (control.isContentEditable || control.getAttribute?.("role") === "textbox") return { type: "text", value: control.textContent || "" };
    return { type: "none", value: "" };
  }

  function restoreSnapshot(control, snap) {
    if (!control || !snap) return false;
    if (snap.type === "value") return setNativeValue(control, snap.value || "");
    if (snap.type === "text") return setNativeValue(control, snap.value || "");
    return false;
  }

  function hoverStatus(label, value, control) {
    if (isManualOnlyProtectedFieldA536(label)) return { cls: "risk", text: manualOnlyProtectedFieldMessageA536(label) };
    if (!clean(value)) return { cls: "empty", text: "No AI value for this field." };
    if (isBlockedPlaceholderValueA532(value)) return { cls: "risk", text: "Blocked placeholder value. This field will be left blank." };
    // V6.4.5: ordinary material/descriptive terms are allowed by the helper.
    if (isDropdownControl(control)) return { cls: "warn", text: "Manual menu mode: open this eBay dropdown first, then click Fill. Only the open menu will be searched." };
    return { cls: "ok", text: "Text field ready to fill." };
  }

  function isAssistantElement(target) {
    return !!(target?.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel, #ebay-ai-filler-toast") || target?.classList?.contains("ebay-ai-hover-btn"));
  }

  

  function labelFromControl(control) {
    if (!control) return "";

    // A4.99: eBay item-specific dropdown buttons expose the real field in name="attributes.X".
    // Use that before reading visible value text like "Casual (+1)".
    const nameAttr = clean(control.getAttribute?.("name") || "");
    if (/^attributes\./i.test(nameAttr)) return scrubLabel(nameAttr.replace(/^attributes\./i, ""));
    if (/^itemOrigin\./i.test(nameAttr)) return scrubLabel(nameAttr.replace(/^itemOrigin\./i, ""));

    const described = clean(control.getAttribute?.("aria-describedby") || "");
    if (described) {
      for (const idPart of described.split(/\s+/).filter(Boolean)) {
        let node = null;
        try { node = document.getElementById(idPart) || document.querySelector(`#${CSS.escape(idPart)}`); } catch (_) {}
        const txt = scrubLabel(node?.innerText || node?.textContent || "");
        if (txt && !isBadHelperFieldLabel(txt) && !displayLooksLikeOpenMenuText(txt)) return txt;
      }
    }

    // A4.118: for eBay dropdown buttons without name="attributes.X", aria-label/text can be the
    // current value (for example "Sun Hat"), not the question label. Prefer the left-side label.
    const tagForSide = (control.tagName || "").toLowerCase();
    const roleForSide = (control.getAttribute?.("role") || "").toLowerCase();
    const clsForSide = String(control.className || "");
    const dropdownLikeForSide = tagForSide === "button" || roleForSide === "button" || roleForSide === "combobox" || control.hasAttribute?.("aria-expanded") || /fake-menu|dropdown|combobox|expand|se-filter-menu/i.test(clsForSide);
    if (dropdownLikeForSide) {
      const side = findLabelForControl(control);
      if (side && !isBadHelperFieldLabel(side)) return side;
    }

    const ariaLabel = scrubLabel(control.getAttribute?.("aria-label") || "");
    if (ariaLabel && !isBadHelperFieldLabel(ariaLabel) && !displayLooksLikeOpenMenuText(ariaLabel)) return ariaLabel;

    const id = control.id;
    if (id) {
      const linked = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (linked && isVisible(linked)) return scrubLabel(linked.innerText || linked.textContent || "");
    }
    const cr = control.getBoundingClientRect();
    const cy = cr.top + cr.height / 2;
    const nodes = Array.from(document.querySelectorAll("label, span, div, p, a, legend"))
      .filter(node => isVisible(node) && !node.contains(control))
      .map(node => {
        const r = node.getBoundingClientRect();
        const text = scrubLabel(node.innerText || node.textContent || "");
        return { node, r, text };
      })
      .filter(x => x.text && x.text.length <= 80 && Math.abs((x.r.top + x.r.height / 2) - cy) <= 58 && x.r.right <= cr.left + 24 && x.r.left < cr.left)
      .sort((a, b) => {
        const av = Math.abs((a.r.top + a.r.height / 2) - cy) + Math.max(0, cr.left - a.r.right) / 12;
        const bv = Math.abs((b.r.top + b.r.height / 2) - cy) + Math.max(0, cr.left - b.r.right) / 12;
        return av - bv;
      });
    return nodes[0]?.text || control.getAttribute?.("aria-label") || control.getAttribute?.("placeholder") || "";
  }

  

  

  function valueForLabel(label) {
    if (isManualOnlyProtectedFieldA536(label)) return "";
    const map = hoverValueMap(HOVER_ASSISTANT.data || {});
    const rawLabel = scrubLabel(label);
    const n = normalize(rawLabel);
    const canon = canonicalLabelKey(rawLabel);

    // A4.20: direct generic field fallback from imported Item Specifics.
    // This fixes pasted lists like "Style - Graphic Tee" and "Material - 100% Cotton".
    const data = HOVER_ASSISTANT.data || {};
    const specifics = parseKeyValueLines(data.specifics || "");
    const genericWanted = {
      "style": "Style",
      "material": "Material",
      "fabric type": "Fabric Type",
      "features": "Features",
      "theme": "Theme",
      "pattern": "Pattern",
      "country of origin": "Country of Origin",
      "vintage": "Vintage",
      "handmade": "Handmade",
      "personalize": "Personalize",
      "season": "Season",
      "model": "Model",
      "fit": "Fit",
      "neckline": "Neckline",
      "sleeve length": "Sleeve Length",
      "character": "Character",
      "character family": "Character Family",
      "product line": "Product Line",
      "mpn": "MPN"
    };
    if (genericWanted[canon] && specifics[genericWanted[canon]]) return safeFillValueA532(specifics[genericWanted[canon]]);

    // 1) Exact label match.
    for (const [key, value] of Object.entries(map)) {
      if (!key.startsWith("__canon__") && normalize(key) === n) return safeFillValueA532(value);
    }

    // 2) Canonical item-specific match: handles labels like "UK Shoe Size ~ 302.6K searches".
    if (map[`__canon__${canon}`]) return safeFillValueA532(map[`__canon__${canon}`]);
    const normalizedKey = normalizeSpecificKey(rawLabel);
    const normalizedCanon = canonicalLabelKey(normalizedKey);
    if (map[`__canon__${normalizedCanon}`]) return safeFillValueA532(map[`__canon__${normalizedCanon}`]);

    // 3) Soft contains match for longer item specifics only.
    if (canon.length >= 6) {
      for (const [key, value] of Object.entries(map)) {
        if (!key.startsWith("__canon__")) continue;
        const k = key.replace("__canon__", "");
        if (k === canon || k.includes(canon) || canon.includes(k)) return safeFillValueA532(value);
      }
    }

    // 4) Common top-level fields.
    if (/item title|^title$/.test(n)) return "";
    if (/item price|^price$|pricing/.test(n)) return safeFillValueA532(HOVER_ASSISTANT.data?.price || "");
    if (/condition description/.test(n)) return safeFillValueA532(HOVER_ASSISTANT.data?.conditionDescription || "");
    if (/^description$|item description/.test(n)) return safeFillValueA532(descriptionText(HOVER_ASSISTANT.data || {}));

    // 5) Saved manual choice fallback.
    return safeFillValueA532(rememberedValueForLabel(rawLabel));
  }


  

  


  function isBadHelperFieldLabel(label) {
    const t = scrubLabel(label || "");
    if (!t) return true;
    if (/^\(?\+\d+\)?$/i.test(t)) return true;
    if (/^(search|search results|selected|clear|no results found|add custom value|enter your own|search or enter your own)$/i.test(t)) return true;
    // A4.106: navigation must not treat eBay action/menu buttons as questions.
    // These caused Next to jump to title/photo/header controls like "More options".
    if (/^(more options|see title options|title options|see photo options|photo options|tips for taking pro photos|select|add|edit|help|close|open|menu)$/i.test(t)) return true;
    if (/^(edit or view photo|empty slot|upload photo)/i.test(t)) return true;
    // A5.28: Condition and Description remain manual-only. The helper must not open
    // or offer Fill/Fill All for these unstable eBay editors.
    if (/^(title|item title|condition|item condition|condition description|description|item description)$/i.test(t)) return true;
    return false;
  }

  function isEbayMenuInteriorClickTarget(target) {
    if (!target || target.closest?.("#ebay-ai-hover-panel")) return false;
    const scope = nearestMenuScopeFrom(target);
    if (!scope || !isOpenMenuCandidate(scope)) return false;
    const el = target.nodeType === 1 ? target : target.parentElement;
    if (!el) return false;

    // A4.99: clicks inside the opened eBay results menu must NOT create a new helper.
    // This is what caused helpers named (+1), (+2), Casual, Travel, Beach, etc.
    // Keep the normal dropdown field click from A4.90 working; only suppress inner menu rows/search.
    if (el.closest?.("input[type='checkbox'], input[type='radio'], [role='checkbox'], [role='radio'], [role='option'], [role='menuitem'], [aria-selected], label, li")) return true;
    const input = el.closest?.("input, textarea, [contenteditable='true'], [role='textbox']");
    if (input && nearestMenuScopeFrom(input)) return true;
    const txt = scrubLabel(el.innerText || el.textContent || "");
    if (/^(selected|search results|clear|no results found|add custom value)$/i.test(txt)) return true;
    return false;
  }

  

  

  

  function refreshExactMappedHelperRecord(rec) {
    if (!rec?.fieldRecord) return null;
    const fieldRecord = rec.fieldRecord;
    try { fieldRecord.refresh?.(); } catch (_) {}
    const control = fieldRecord.control || rec.control;
    const row = fieldRecord.row || control?.closest?.("[data-testid='attribute']") || null;
    if (!control || !row || control.isConnected === false || row.isConnected === false) return null;
    rec.label = fieldRecord.label || rec.label;
    rec.value = valueForLabel(rec.label);
    rec.control = control;
    rec.isBinaryChoiceField = fieldRecord.type === "choice";
    if (rec.isBinaryChoiceField) {
      let choices = [];
      try { choices = fieldRecord.options(); } catch (_) { choices = Array.isArray(rec.binaryChoices) ? rec.binaryChoices : []; }
      rec.binaryChoices = choices;
      rec.isYesNoField = choices.map(value => normalize(value)).sort().join("|") === "no|yes";
    } else {
      rec.binaryChoices = [];
      rec.isYesNoField = false;
    }
    return rec;
  }

  function exactMappedItemSpecificRecordFromClick(e) {
    // V8.23.21: Helper may only open from a row returned by the exact
    // EbayPageFieldsV810.collectFieldMap() snapshot. Photo controls, title,
    // editors, pricing and every other page button are outside this route.
    const target = e?.target?.nodeType === 1 ? e.target : e?.target?.parentElement;
    if (!target || !Array.isArray(HOVER_ASSISTANT.navRouteCache)) return null;
    for (const sourceRecord of HOVER_ASSISTANT.navRouteCache) {
      const rec = refreshExactMappedHelperRecord(sourceRecord);
      if (!rec) continue;
      const row = rec.fieldRecord?.row;
      const control = rec.control;
      const insideControl = target === control || control?.contains?.(target);
      const insideExactRow = target === row || row?.contains?.(target);
      if (insideControl || insideExactRow) return rec;
    }
    return null;
  }

  function recordFromClickEvent(e) {
    // V8.23.21: no label guessing and no whole-page button fallback.
    // Open menu options are actions inside an already selected Item Specific,
    // not new Helper questions.
    if (isEbayMenuInteriorClickTarget(e?.target)) return null;
    return exactMappedItemSpecificRecordFromClick(e);
  }

  function ensureHoverButton() {
    // A4.90: floating AI dot is fully removed. Helper opens by clicking a field,
    // label, or the side zone next to a two-choice row.
    ensureHoverStyles();
    try { document.querySelectorAll(".ebay-ai-hover-btn").forEach(el => el.remove()); } catch (_) {}
    HOVER_ASSISTANT.button = null;
    return null;
  }

  function hideHoverButton() {
    if (HOVER_ASSISTANT.button) {
      try { HOVER_ASSISTANT.button.remove(); } catch (_) {}
      HOVER_ASSISTANT.button = null;
    }
    try { document.querySelectorAll(".ebay-ai-hover-btn").forEach(el => el.remove()); } catch (_) {}
    HOVER_ASSISTANT.activeRecord = null;
  }

  function closeHoverPanel() {
    if (HOVER_ASSISTANT.positionRaf) {
      try { cancelAnimationFrame(HOVER_ASSISTANT.positionRaf); } catch (_) {}
      HOVER_ASSISTANT.positionRaf = 0;
    }
    HOVER_ASSISTANT.panelPinned = false;
    HOVER_ASSISTANT.dragState = null;
    if (HOVER_ASSISTANT.panel) {
      globalThis.EbayUI?.assistantPanel?.removePanel?.(HOVER_ASSISTANT.panel);
      HOVER_ASSISTANT.panel = null;
      HOVER_ASSISTANT.panelActionRunner = null;
    }
  }


  

  function setPanelMessage(panel, message, cls = "") {
    return globalThis.EbayUI?.assistantPanel?.setMessage?.(panel, message, cls) || false;
  }


  function answerStateKey(value) {
    return normalize(value);
  }

  function ensureAnswerState(rec) {
    if (!rec) return {};
    if (!rec.answerStates || typeof rec.answerStates !== "object") rec.answerStates = {};
    return rec.answerStates;
  }

  

  

  function setAnswerState(rec, panel, value, state) {
    const key = answerStateKey(value);
    if (!key) return;
    ensureAnswerState(rec)[key] = state || "pending";
    globalThis.EbayUI?.assistantPanel?.setChip?.(panel, { key, value: clean(value), state: state || "pending" });
  }


  


  function startHoverPanelDrag(e, panel) {
    const drag = globalThis.EbayUI?.assistantPanel?.startDrag?.(panel, e);
    if (!drag) return false;
    HOVER_ASSISTANT.panelPinned = true;
    HOVER_ASSISTANT.dragState = drag;
    return true;
  }


  function moveHoverPanelDrag(e) {
    const drag = HOVER_ASSISTANT.dragState;
    const panel = HOVER_ASSISTANT.panel;
    if (!drag || !panel) return false;
    return globalThis.EbayUI?.assistantPanel?.moveDrag?.(panel, e, drag) || false;
  }


  function endHoverPanelDrag(e) {
    globalThis.EbayUI?.assistantPanel?.endDrag?.(HOVER_ASSISTANT.panel, e);
    HOVER_ASSISTANT.dragState = null;
  }



  function ensureFillAllPanel() {
    ensureHoverStyles();
    let panel = HOVER_ASSISTANT.fillAll.panel || document.getElementById("ebay-ai-fillall-panel");
    if (panel) return panel;
    panel = globalThis.EbayUI?.assistantPanel?.ensureFillAll?.({
      onStop: () => {
        HOVER_ASSISTANT.fillAll.stopRequested = true;
        updateFillAllPanel({ status: "Stop requested. Finishing current field safely..." });
      }
    });
    if (!panel) throw new Error("Assistant Panel UI is not available.");
    HOVER_ASSISTANT.fillAll.panel = panel;
    return panel;
  }


  function updateFillAllPanel(update = {}) {
    const panel = HOVER_ASSISTANT.fillAll.panel || document.getElementById("ebay-ai-fillall-panel");
    return globalThis.EbayUI?.assistantPanel?.updateFillAll?.(panel, update) || false;
  }


  function closeFillAllPanel(delay = 0) {
    const done = () => {
      globalThis.EbayUI?.assistantPanel?.removePanel?.(HOVER_ASSISTANT.fillAll.panel || "ebay-ai-fillall-panel");
      HOVER_ASSISTANT.fillAll.panel = null;
    };
    if (delay) window.setTimeout(done, delay);
    else done();
  }


  

  


  

  


  


  

  

  

  

  


  

  

  

  

  

  

  

  

  



  // A5.8.3: direct same-field menu fallback.
  // eBay keeps the controlled dropdown menu in the DOM even when it is visually closed.
  // Fill All was opening/searching too late and then clicking the wrong/closed place.
  // This fallback uses only the exact menu linked by aria-controls for the current field.
  

  

  

  

  

  

  

  

  

  


  

  

  

  


  


  



  // A5.10: stable ordered Fill All engine with bounded multi-select handling.
  // Goal: use the same mechanics as manual mode, but make them deterministic:
  // exact field -> exact attached menu -> exact option/search/custom row -> verify -> next.

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  


  // A5.11: strict exact-option engine for both Fill and Fill All.
  // It never accepts substring matches and never counts a click as success without
  // confirming the requested value in the same eBay field/menu.
  function exactChoiceKeyA511(text) {
    return normalize(text)
      .replace(/[’']/g, "")
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}%+]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  

  function sizeGroupKeyV61(text) {
    const n = normalize(text);
    if (/\bplus(?: size)?\b/.test(n)) return "plus";
    if (/\bpetites?\b/.test(n)) return "petite";
    if (/\btall\b/.test(n)) return "tall";
    if (/\bshort\b/.test(n)) return "short";
    if (/\blong\b/.test(n)) return "long";
    if (/\bjuniors?\b/.test(n)) return "junior";
    if (/\bmisses\b/.test(n)) return "misses";
    if (/\bmaternity\b/.test(n)) return "maternity";
    if (/\bregular\b/.test(n)) return "regular";
    return "";
  }

  function sizeRegionKeyV61(text) {
    const n = normalize(text);
    const hit = n.match(/(?:^|\s)(us|uk|eu|it|au)(?:\s|$)/);
    return hit?.[1] || "";
  }

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  async function sharedHelperFillOneV8130(rec, panel, overrideValue = "") {
    const label = scrubLabel(rec?.label || "");
    const value = safeFillValueA532(overrideValue || rec?.value || "");
    if (!label || !value) {
      const result = { status: "skipped", reason: "No safe Field - Value answer was supplied." };
      setPanelMessage(panel, result.reason, "hf-status-warn");
      return result;
    }
    const engine = globalThis.EbayAiFillEngineV790;
    if (!engine?.fillOne || !engine.adaptersRegistered) throw new Error("Shared Fill Engine is not ready on this marketplace page.");
    const result = await engine.fillOne({
      mode: "interactive_helper",
      payload: { label, value }
    });
    const confirmed = ["filled", "already"].includes(String(result?.status || ""));
    setPanelMessage(
      panel,
      `${label}: ${result?.reason || result?.status || "Fill finished."}`,
      confirmed ? "hf-status-ok" : "hf-status-warn"
    );
    return result;
  }

  async function startMarketplaceHelperFillAllV8200(fromRec = null) {
    if (HOVER_ASSISTANT.fillAll.running) {
      updateFillAllPanel({ status: "Fill All is already running." });
      return;
    }
    const runtime = globalThis.MarketplacePageRuntimeV8200;
    const platform = globalThis.MarketplacePlatformV8200?.detect?.() || "unknown";
    const platformLabel = globalThis.MarketplacePlatformV8200?.label?.(platform) || "Marketplace";
    if (!runtime?.smartFillAll) {
      updateFillAllPanel({ status: `${platformLabel} Fill All is not ready.` });
      return;
    }

    HOVER_ASSISTANT.fillAll.running = true;
    HOVER_ASSISTANT.fillAll.stopRequested = false;
    HOVER_ASSISTANT.fillAll.results = [];
    HOVER_ASSISTANT.panelActionRunning = true;
    FILL_ENGINE.cancelRequested = false;
    suppressHelperOpen(60000);
    try { closeHoverPanel(); hideHoverButton(); } catch (_) {}
    ensureFillAllPanel();
    updateFillAllPanel({ status: `${platformLabel}: reading photos and fields…`, current: fromRec?.label ? `Started from ${fromRec.label}` : "Preparing current listing…", percent: 2, summary: "One button • no publish action" });

    let result = null;
    try {
      result = await runtime.smartFillAll({
        onProgress(event = {}) {
          const stage = String(event.stage || "");
          const total = Math.max(1, Number(event.total || 1));
          const current = Math.max(0, Number(event.current || 0));
          const stageBase = stage === "snapshot" ? 5 : stage === "category_analysis" ? 12 : stage === "category_fill" ? 25 : stage === "analysis" ? 38 : stage === "fill" ? 68 : stage === "completed" ? 100 : 30;
          const stageSpan = stage === "fill" ? 28 : stage === "analysis" ? 25 : 8;
          const percent = stage === "completed" ? 100 : Math.min(98, Math.round(stageBase + stageSpan * Math.min(1, current / total)));
          updateFillAllPanel({
            status: `${platformLabel}: ${event.message || "working…"}`,
            current: stage === "fill" ? `Filling ${current}/${total}` : stage.replace(/_/g, " ") || "Processing",
            percent,
            summary: event.result ? `Done: ${Number(event.result.done || 0)} • Review: ${Number(event.result.review || 0) + Number(event.result.partial || 0)}` : "Photos → AI → shared Fill Engine → verification"
          });
        }
      });
      HOVER_ASSISTANT.fillAll.results = Array.isArray(result?.details) ? result.details : [];
    } catch (error) {
      result = { ok: false, message: error?.message || String(error), details: [] };
    } finally {
      const stopped = HOVER_ASSISTANT.fillAll.stopRequested || FILL_ENGINE.cancelRequested || result?.stopped;
      HOVER_ASSISTANT.fillAll.running = false;
      HOVER_ASSISTANT.panelActionRunning = false;
      FILL_ENGINE.cancelRequested = false;
      suppressHelperOpen(900);
      const done = Number(result?.filled || 0) + Number(result?.already || 0);
      const review = Number(result?.review || 0) + Number(result?.partial || 0);
      const unanswered = Number(result?.unanswered || 0);
      updateFillAllPanel({
        status: stopped ? "Stopped." : result?.ok ? `${platformLabel} finished.` : `${platformLabel} needs review.`,
        current: stopped ? "Stopped safely. Nothing was published." : (result?.message || "Fill All finished. Nothing was published."),
        percent: 100,
        summary: `Done: ${done} • Review: ${review} • No answer: ${unanswered}`
      });
      toast(`V8.23.21 ${platformLabel} Fill All ${stopped ? "stopped" : "complete"}. Done ${done}; review ${review}; no answer ${unanswered}.`, 7000);
      closeFillAllPanel(stopped ? 3500 : 6000);
    }
    return result;
  }

  async function startHelperFillAll(fromRec = null) {
    const platform = globalThis.MarketplacePlatformV8200?.detect?.() || "ebay";
    if (platform !== "ebay") return startMarketplaceHelperFillAllV8200(fromRec);
    if (HOVER_ASSISTANT.fillAll.running) {
      updateFillAllPanel({ status: "Fill All is already running." });
      return;
    }

    HOVER_ASSISTANT.fillAll.running = true;
    HOVER_ASSISTANT.fillAll.stopRequested = false;
    HOVER_ASSISTANT.fillAll.results = [];
    HOVER_ASSISTANT.panelActionRunning = true;
    FILL_ENGINE.cancelRequested = false;
    suppressHelperOpen(60000);
    try { closeHoverPanel(); hideHoverButton(); } catch (_) {}

    ensureFillAllPanel();
    const helperData = HOVER_ASSISTANT.data || {};
    const rawAnswers = {
      ...parseKeyValueLines(helperData.specifics || ""),
      ...(helperData.specificsObject || {})
    };
    const mapper = globalThis.EbayAiFieldMapperV790;
    const normalizedAnswers = mapper?.toAnswerMap ? mapper.toAnswerMap(rawAnswers) : rawAnswers;
    const answers = Object.fromEntries(Object.entries(normalizedAnswers).filter(([label, value]) => {
      return clean(label) && clean(value)
        && !isManualOnlyProtectedFieldA536(label)
        && !isBlockedPlaceholderValueA532(value)
        && !globalThis.EbayAiSafetyV790?.isBlockedField?.(label)
        && !globalThis.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label);
    }));
    const labels = Object.keys(answers);
    let done = 0, review = 0, skipped = 0;

    updateFillAllPanel({
      status: `Ready: ${labels.length} exact Item Specific answer(s).`,
      current: fromRec?.label ? `Starting from helper: ${fromRec.label}` : "Starting shared Fill Engine…",
      percent: 0,
      summary: `Done: ${done} • Review: ${review} • Skipped: ${skipped}`
    });

    if (!labels.length) {
      HOVER_ASSISTANT.fillAll.running = false;
      HOVER_ASSISTANT.panelActionRunning = false;
      updateFillAllPanel({ status: "Nothing to fill.", current: "No safe Field - Value answers were supplied.", percent: 100 });
      closeFillAllPanel(3500);
      return;
    }

    const engine = globalThis.EbayAiFillEngineV790;
    let result = null;
    try {
      result = await engine.fillAll({
        mode: "interactive_helper",
        payload: {
          answers,
          questions: labels,
          waitForAutosave: true,
          autosaveTimeoutMs: 10000,
          onProgress(detail) {
            const current = Number(detail?.current || 0);
            const total = Number(detail?.totalFields || labels.length);
            const status = String(detail?.status || "review");
            done = Number(result?.filled || 0) + Number(result?.already || 0);
            updateFillAllPanel({
              status: `${status === "filled" || status === "already" ? "Confirmed" : "Review"}: ${detail?.label || "Field"}`,
              current: detail?.reason || "Processing…",
              percent: total ? Math.round((current / total) * 100) : 0,
              summary: `Processed: ${current}/${total}`
            });
          }
        }
      });
      HOVER_ASSISTANT.fillAll.results = Array.isArray(result?.details) ? result.details : [];
      done = Number(result?.filled || 0) + Number(result?.already || 0);
      review = Number(result?.review || 0) + Number(result?.partial || 0);
      skipped += Number(result?.skipped || 0);
    } catch (error) {
      result = { ok: false, message: error?.message || String(error), details: [] };
      review = labels.length;
    } finally {
      const stopped = HOVER_ASSISTANT.fillAll.stopRequested || FILL_ENGINE.cancelRequested;
      HOVER_ASSISTANT.fillAll.running = false;
      HOVER_ASSISTANT.panelActionRunning = false;
      FILL_ENGINE.cancelRequested = false;
      suppressHelperOpen(900);
      updateFillAllPanel({
        status: stopped ? "Stopped." : result?.ok ? "Finished." : "Needs review.",
        current: stopped ? "Stopped by user. Review eBay before publishing." : (result?.message || "Fill All complete. Review eBay before publishing."),
        percent: 100,
        summary: `Done: ${done} • Review: ${review} • Skipped: ${skipped}`
      });
      toast(`V8.23.21 Fill All ${stopped ? "stopped" : "complete"}. Done ${done}; review ${review}; skipped ${skipped}.`, 7000);
      closeFillAllPanel(stopped ? 3500 : 5500);
    }
  }

  // A4.35: Window-level helper click shield.
  // Reason: eBay often closes an open dropdown on document/window mousedown before
  // a normal button click inside our helper can run. A listener on the helper panel
  // itself is too late in the capture path. This guard runs first at window capture,
  // prevents the event from reaching eBay, and then runs the helper action manually.
  function installHelperPanelEventShield() {
    if (HOVER_ASSISTANT.helperShieldInstalled) return;
    HOVER_ASSISTANT.helperShieldInstalled = true;
    const guardedEvents = ["pointerdown", "pointermove", "pointerup", "pointercancel", "mousedown", "mouseup", "click"];
    const handler = e => {
      const target = e.target;
      let panel = target?.closest?.("#ebay-ai-hover-panel");
      const isDragEvent = !!HOVER_ASSISTANT.dragState && (e.type === "pointermove" || e.type === "pointerup" || e.type === "pointercancel");
      if (!panel && isDragEvent) panel = HOVER_ASSISTANT.panel;
      if (!panel) return;

      // Prevent eBay from treating helper interaction as an outside-menu click.
      try { e.preventDefault(); } catch (_) {}
      try { e.stopPropagation(); } catch (_) {}
      try { e.stopImmediatePropagation(); } catch (_) {}

      if (e.type === "pointermove") { moveHoverPanelDrag(e); return; }
      if (e.type === "pointerup" || e.type === "pointercancel") { endHoverPanelDrag(e); return; }

      const actionEl = target?.closest?.("[data-action], .hf-close");
      const dragEl = target?.closest?.(".hf-drag-handle, .hf-title");
      if (dragEl && !actionEl && (e.type === "pointerdown" || e.type === "mousedown")) {
        startHoverPanelDrag(e, panel);
        return;
      }
      if (!actionEl) return;

      // A4.106: some Chrome/eBay states did not deliver a reliable pointerdown action
      // to the helper, so Next looked clickable but did nothing. Run helper actions from
      // pointerdown, mousedown, or click, with one shared de-dupe guard.
      if (e.type !== "pointerdown" && e.type !== "mousedown" && e.type !== "click") return;

      const now = Date.now();
      if (now - (HOVER_ASSISTANT.lastGlobalPanelActionAt || 0) < 220) return;
      HOVER_ASSISTANT.lastGlobalPanelActionAt = now;

      const runner = HOVER_ASSISTANT.panelActionRunner;
      if (typeof runner === "function") {
        try { runner(actionEl); }
        catch (err) { console.warn("[Fill:V8.23.21] helper shield action failed", err); }
      }
    };
    for (const type of guardedEvents) {
      window.addEventListener(type, handler, true);
    }
  }

  async function typeHoverValueOnly(rec, panel, onlyValue = "") {
    const label = rec?.label || "Field";
    const value = clean(onlyValue || rec?.value);
    if (!value) { setPanelMessage(panel, "No AI value to type.", "hf-status-empty"); return; }
    const control = (rec.control && isVisible(rec.control)) ? rec.control : findControlForLabel(label);
    if (!control || !isVisible(control)) { setPanelMessage(panel, "Field not visible. Click this field again.", "hf-status-warn"); return; }
    rec.control = control;
    rec.lastSnapshot = snapshotControl(control);

    if (isDropdownControl(control)) {
      let scopes = findOpenMenuScopesNear(control);
      if (!scopes.length) {
        dispatchMouseSequence(control);
        await sleep(240);
        scopes = findOpenMenuScopesNear(control);
      }
      for (const scope of scopes) {
        const search = findSearchInputInScope(scope);
        if (search) {
          setNativeValue(search, value, { keepFocus: true });
          setPanelMessage(panel, `Typed: ${value}. Now choose/confirm exact eBay option manually.`, "hf-status-warn");
          toast(`V8.23.21 ${label}: typed only — ${value}`, 4500);
          return;
        }
      }
      setPanelMessage(panel, "Open this dropdown menu first, then press Type.", "hf-status-warn");
      return;
    }

    if (isTextControl(control)) {
      const ok = setNativeValue(control, value, { keepFocus: false });
      setPanelMessage(panel, ok ? `Typed: ${value}.` : "Text input failed.", ok ? "hf-status-ok" : "hf-status-warn");
      if (ok) toast(`V8.23.21 ${label}: typed ${value}`, 4500);
      return;
    }

    setPanelMessage(panel, "This field does not support direct typing.", "hf-status-warn");
  }

  


  

  function isRealEbayFieldTrigger(el) {
    if (!el || !isVisible(el)) return false;
    const tag = (el.tagName || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const name = clean(el.getAttribute?.("name") || "");
    const cls = String(el.className || "");
    if (/^(attributes\.|itemOrigin\.)/i.test(name) || name === "condition") return true;
    if ((tag === "button" || role === "button" || role === "combobox") && el.hasAttribute?.("aria-expanded") && /fake-menu-button__button|se-expand-button__button|btn--form|se-filter-menu-button|combobox|dropdown|expand/i.test(cls)) return true;
    return false;
  }

  function isInsideVisibleMenuPanelOnly(el) {
    // A4.107: do not let Back/Next land on answers inside an opened eBay dropdown.
    // eBay keeps dropdown answers as real DOM buttons/divs such as .menu__item, role=menuitemradio,
    // selectedOptions-attributesX and options-attributesX. Those are answers, not questions.
    if (!el || el.closest?.("#ebay-ai-hover-panel, #ebay-ai-fillall-panel") || el.closest?.("#ebay-ai-filler-toast, #ebay-ai-fillall-panel")) return false;
    if (isRealEbayFieldTrigger(el)) return false;
    const self = el.nodeType === 1 ? el : el.parentElement;
    if (!self) return false;

    try {
      if (self.closest?.(".menu__item, .menu__items, [role='option'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [name^='options-attributes'], [name^='selectedOptions-attributes'], .se-search-box, .se-filter-menu-button__menu-container, .fake-menu-button__menu, .se-toggle-group-menu")) return true;
    } catch (_) {}

    let node = self.parentElement;
    for (let depth = 0; depth < 10 && node && node !== document.body && node !== document.documentElement; depth++, node = node.parentElement) {
      try {
        if (node.matches?.(".fake-menu-button__menu, .se-filter-menu-button__menu-container, .se-toggle-group-menu, [role='listbox'], [role='dialog'], [role='menu'], .menu__items")) {
          return !!isOpenMenuCandidate(node) || !!node.querySelector?.(".menu__item, [role='option'], [role='menuitem'], [role='menuitemradio'], input[placeholder*='search' i], .se-search-box");
        }
        // Stop at the outer field wrapper. The trigger itself is allowed, but anything
        // already caught above is menu interior.
        if (node.matches?.(".fake-menu-button, .se-field.se-expand-button, .se-filter-menu-button")) return false;
      } catch (_) {}
    }

    // Visual fallback: if the element's center is inside a visible open menu panel, exclude it.
    try {
      const r = self.getBoundingClientRect?.();
      if (rectLooksUsable(r)) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const panels = Array.from(document.querySelectorAll(".fake-menu-button__menu, .se-filter-menu-button__menu-container, .se-toggle-group-menu, [role='listbox'], [role='dialog'], [role='menu'], .menu__items"));
        for (const panel of panels.slice(0, 80)) {
          if (!isVisible(panel)) continue;
          const pr = panel.getBoundingClientRect?.();
          if (!rectLooksUsable(pr)) continue;
          const looksMenu = isOpenMenuCandidate(panel) || !!panel.querySelector?.(".menu__item, [role='option'], [role='menuitem'], [role='menuitemradio'], input[placeholder*='search' i], .se-search-box");
          if (!looksMenu) continue;
          if (cx >= pr.left - 2 && cx <= pr.right + 2 && cy >= pr.top - 2 && cy <= pr.bottom + 2) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  

  

  

  

  

  

  

  

  function helperNavRectForRecord(rec) {
    const control = rec?.control;
    if (control && isVisible(control)) {
      const r = control.getBoundingClientRect?.();
      if (rectLooksUsable(r)) return r;
    }
    const fresh = rec?.label ? findControlForLabel(rec.label) : null;
    if (fresh && isVisible(fresh)) {
      const r = fresh.getBoundingClientRect?.();
      if (rectLooksUsable(r)) return r;
    }
    return null;
  }

  

  

  function helperNavRecordKey(rec) {
    const label = normalize(rec?.label || "");
    const control = rec?.control;
    const name = clean(control?.getAttribute?.("name") || "");
    const id = clean(control?.getAttribute?.("id") || "");
    if (name) return `name:${name.toLowerCase()}`;
    if (id) return `id:${id.toLowerCase()}`;
    if (rec?.isBinaryChoiceField && label) return `binary:${label}`;
    const r = helperNavRectForRecord(rec);
    if (r && label) return `rect:${label}:${Math.round(r.top)}:${Math.round(r.left)}`;
    return `label:${label}`;
  }

  

  

  

  

  function routeAbsTopForEl(el) {
    const r = el?.getBoundingClientRect?.();
    if (!rectLooksUsable(r)) return 0;
    return r.top + (window.scrollY || window.pageYOffset || 0);
  }

  function findItemSpecificsVerticalBounds() {
    // A4.118: limit helper navigation to the ITEM SPECIFICS block.
    // This avoids scanning Pricing / Shipping / photo/title controls and keeps Next/Back fast.
    let top = Infinity;
    let bottom = -Infinity;
    const anchors = [];
    const selector = [
      "button[name^='attributes.']",
      "button[name^='itemOrigin.']",
      "input[name='universalProductCode']",
      "input[id*='@ATTRIBUTES']",
      "textarea[id*='@ATTRIBUTES']",
      "input[name^='attributes.']",
      "textarea[name^='attributes.']",
      "button[id*='item-specific-dropdown-label-']",
      "[id*='item-specific-dropdown-label-']"
    ].join(",");
    try { anchors.push(...Array.from(document.querySelectorAll(selector))); } catch (_) {}
    for (const el of anchors) {
      if (!el || !isVisible(el) || isInsideVisibleMenuPanelOnly(el) || textLooksLikeBadgeControl(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!rectLooksUsable(r)) continue;
      const absTop = r.top + (window.scrollY || window.pageYOffset || 0);
      const absBottom = r.bottom + (window.scrollY || window.pageYOffset || 0);
      top = Math.min(top, absTop);
      bottom = Math.max(bottom, absBottom);
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;

    // Expand slightly so Yes/No and Enter-your-own controls in the same item-specific rows are included.
    let lower = Math.max(0, top - 180);
    let upper = bottom + 420;

    // Try to stop before CONDITION / PRICING / SHIPPING if a visible heading exists below.
    try {
      const heads = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,[role='heading']"));
      let best = Infinity;
      for (const h of heads) {
        if (!h || !isVisible(h)) continue;
        const text = clean(h.innerText || h.textContent || "");
        if (!/^(CONDITION|DESCRIPTION|PRICING|SHIPPING|ITEM DISCLOSURES|PROMOTE YOUR LISTING|CHARITY)$/i.test(text)) continue;
        const ht = routeAbsTopForEl(h);
        if (ht > top + 80 && ht < best) best = ht;
      }
      if (Number.isFinite(best)) upper = Math.min(upper, best - 8);
    } catch (_) {}

    return { top: lower, bottom: upper, signature: `${Math.round(lower)}:${Math.round(upper)}:${anchors.length}` };
  }

  function isElInsideItemSpecificsBounds(el, bounds) {
    if (!el || !bounds) return false;
    const r = el.getBoundingClientRect?.();
    if (!rectLooksUsable(r)) return false;
    const mid = (r.top + r.bottom) / 2 + (window.scrollY || window.pageYOffset || 0);
    return mid >= bounds.top && mid <= bounds.bottom;
  }

  

  


  function buildBinaryChoiceRowsInItemSpecifics(bounds) {
    // A4.118: fast route scan for Yes/No style fields inside Item Specifics only.
    // Do not scan every span/div on the whole page during Back/Next.
    if (!bounds) return [];
    let options = [];
    try {
      options = Array.from(document.querySelectorAll("button, [role='button'], label, input[type='radio'], [aria-checked], [aria-pressed], [aria-selected]"))
        .filter(el => el && isElInsideItemSpecificsBounds(el, bounds) && isBinaryChoiceOptionElement(el));
    } catch (_) { return []; }
    const rows = [];
    for (const el of options) {
      if (isInsideVisibleMenuPanelOnly(el) || isRealEbayFieldTrigger(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || !rectLooksUsable(r)) continue;
      const cy = r.top + r.height / 2;
      let row = rows.find(row => Math.abs(row.cy - cy) <= 18 && Math.abs(row.left - r.left) < 620);
      if (!row) { row = { cy, els: [], left: r.left, right: r.right, top: r.top, bottom: r.bottom, choices: [] }; rows.push(row); }
      row.els.push(el);
      row.left = Math.min(row.left, r.left);
      row.right = Math.max(row.right, r.right);
      row.top = Math.min(row.top, r.top);
      row.bottom = Math.max(row.bottom, r.bottom);
    }
    for (const row of rows) {
      const seen = new Set();
      row.choices = [];
      for (const el of row.els.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)) {
        const text = choiceTextOfElement(el);
        const key = normalize(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        row.choices.push({ text, key, el, r: el.getBoundingClientRect() });
      }
    }
    return rows.filter(row => {
      if (row.choices.length !== 2 || (row.right - row.left) > 520) return false;
      if ((row.els || []).some(el => isRealEbayFieldTrigger(el) || el?.hasAttribute?.("aria-expanded"))) return false;
      return true;
    });
  }

  

  

  function helperAllQuestionRecords() {
    // V8.23.21: Back/Next is permanently restricted to the exact map
    // captured by EbayPageFieldsV810.collectFieldMap(). Refresh live controls,
    // but never create a second route from unrelated page elements.
    if (!Array.isArray(HOVER_ASSISTANT.navRouteCache)) return [];
    return HOVER_ASSISTANT.navRouteCache
      .map(refreshExactMappedHelperRecord)
      .filter(rec => rec && rec.control && isVisible(rec.control));
  }

  function indexOfRecordInNavOrder(list, rec) {
    if (!list.length || !rec) return -1;
    const key = helperNavRecordKey(rec);
    let idx = list.findIndex(x => helperNavRecordKey(x) === key);
    if (idx >= 0) return idx;
    const label = normalize(rec.label || "");
    if (label) {
      idx = list.findIndex(x => normalize(x.label) === label);
      if (idx >= 0) return idx;
    }
    const cr = helperNavRectForRecord(rec);
    if (!rectLooksUsable(cr)) return -1;
    let best = -1, bestScore = Infinity;
    list.forEach((candidate, i) => {
      const r = helperNavRectForRecord(candidate);
      if (!rectLooksUsable(r)) return;
      const score = Math.abs(r.top - cr.top) + Math.abs(r.left - cr.left) * 0.25;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  function adjacentRecordByPosition(records, rec, direction = 1) {
    if (!records.length || !rec) return null;
    const cr = helperNavRectForRecord(rec);
    if (!rectLooksUsable(cr)) return null;
    const cy = cr.top + cr.height / 2;
    const cx = cr.left + cr.width / 2;
    const currentKey = helperNavRecordKey(rec);
    let best = null;
    let bestScore = Infinity;
    for (const candidate of records) {
      if (!candidate || helperNavRecordKey(candidate) === currentKey) continue;
      const r = helperNavRectForRecord(candidate);
      if (!rectLooksUsable(r)) continue;
      const y = r.top + r.height / 2;
      const x = r.left + r.width / 2;
      const dy = y - cy;
      if (direction > 0) {
        if (dy < -6) continue;
        if (Math.abs(dy) <= 6 && x <= cx + 8) continue;
      } else {
        if (dy > 6) continue;
        if (Math.abs(dy) <= 6 && x >= cx - 8) continue;
      }
      const score = Math.abs(dy) * 1000 + Math.abs(x - cx);
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    return best;
  }



  

  async function closeOpenDropdownMenusForNav(control = null) {
    // A4.118: close the current eBay dropdown before moving to Back/Next.
    // This prevents the previous menu from covering the next Enter-your-own / Yes-No field
    // and keeps menu-answer rows out of the next route decision.
    let scopes = [];
    try { scopes = findOpenMenuScopesNear(control).filter(Boolean); } catch (_) { scopes = []; }
    if (!scopes.length) return false;
    suppressHelperOpen(1200);
    const active = document.activeElement;
    try { dispatchKeyboardKey(active || document.body, "Escape"); } catch (_) {}
    try { dispatchKeyboardKey(control || document.body, "Escape"); } catch (_) {}
    try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true })); } catch (_) {}
    await sleep(70);
    try {
      const stillOpen = findOpenMenuScopesNear(control).filter(Boolean);
      if (stillOpen.length && active && active.blur) active.blur();
    } catch (_) {}
    await sleep(30);
    return true;
  }


  function navShouldAutoOpenDropdown(rec) {
    if (!rec || rec.isYesNoField || rec.isBinaryChoiceField || rec.isMenuAnswer) return false;
    const control = rec.control;
    if (!control || !isVisible(control)) return false;
    if (!isDropdownControl(control)) return false;
    const tag = (control.tagName || "").toLowerCase();
    const role = (control.getAttribute?.("role") || "").toLowerCase();
    const type = (control.getAttribute?.("type") || control.type || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || control.isContentEditable) return false;
    if (/^(submit|hidden|file|checkbox|radio)$/i.test(type)) return false;
    if (isDangerousActionElement(control) || isInsideVisibleMenuPanelOnly(control)) return false;
    if (tag === "select") return false; // native select cannot be opened reliably without user gesture.
    return tag === "button" || role === "button" || role === "combobox" || control.hasAttribute?.("aria-expanded");
  }

  async function autoOpenDropdownForNav(rec, panel = null) {
    if (!navShouldAutoOpenDropdown(rec)) return false;
    const control = rec.control;
    const beforeScopes = findOpenMenuScopesNear(control);
    if (beforeScopes.length && String(control.getAttribute?.("aria-expanded") || "").toLowerCase() === "true") return true;
    HOVER_ASSISTANT.panelActionRunning = true;
    suppressHelperOpen(1600);
    try {
      try { control.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" }); } catch (_) {}
      await sleep(35);
      dispatchMouseSequence(control);
      await sleep(180);
      const scopes = findOpenMenuScopesNear(control);
      if (scopes.length && panel) {
        const values = splitMulti(rec.label, rec.value).slice(0, 8);
        try { refreshAnswerStatesFromEbay(rec, panel, control, scopes, values); } catch (_) {}
      }
      return scopes.length > 0 || String(control.getAttribute?.("aria-expanded") || "").toLowerCase() === "true";
    } finally {
      HOVER_ASSISTANT.panelActionRunning = false;
      suppressHelperOpen(700);
    }
  }

  async function goToAdjacentHoverField(rec, panel, direction = 1) {
    logHelperAction(direction < 0 ? "nav-back-start" : "nav-next-start", { record: recordDebugSummary(rec) });
    setPanelMessage(panel, direction < 0 ? "Finding previous…" : "Finding next…", "hf-status-empty");
    await closeOpenDropdownMenusForNav(rec?.control || null);
    await sleep(0);
    const records = helperAllQuestionRecords().filter(r => r && !r.isMenuAnswer && r.control && isVisible(r.control) && !isInsideVisibleMenuPanelOnly(r.control));
    const currentIndex = indexOfRecordInNavOrder(records, rec);
    let nextRec = currentIndex >= 0 ? records[currentIndex + (direction < 0 ? -1 : 1)] || null : null;
    // Beta 64 may use a position fallback, but only among the same exact
    // collectFieldMap records. It never rebuilds from page buttons or visual scans.
    if (!nextRec) nextRec = adjacentRecordByPosition(records, rec, direction);
    if (!nextRec) {
      logHelperAction(direction < 0 ? "nav-back-not-found" : "nav-next-not-found", { record: recordDebugSummary(rec), routeCount: records.length });
      setPanelMessage(panel, direction < 0 ? "No previous Item Specifics field found." : "No next Item Specifics field found.", "hf-status-warn");
      return;
    }
    logHelperAction(direction < 0 ? "nav-back-found" : "nav-next-found", { from: recordDebugSummary(rec), to: recordDebugSummary(nextRec), routeCount: records.length });
    await closeOpenDropdownMenusForNav(rec?.control || null);
    setPanelMessage(panel, `${direction < 0 ? "Back" : "Next"}: ${nextRec.label}`, "hf-status-ok");
    HOVER_ASSISTANT.panelActionRunning = true;
    suppressHelperOpen(900);
    try {
      try { nextRec.control?.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch (_) {}
      await sleep(80);
      openAssistantPanel(nextRec);
      await sleep(60);
      const livePanel = HOVER_ASSISTANT.panel;
      await autoOpenDropdownForNav(nextRec, livePanel);
    } finally {
      HOVER_ASSISTANT.panelActionRunning = false;
      suppressHelperOpen(200);
    }
  }

  async function goToNextHoverField(rec, panel) {
    return goToAdjacentHoverField(rec, panel, 1);
  }

  async function goToPreviousHoverField(rec, panel) {
    return goToAdjacentHoverField(rec, panel, -1);
  }

  function reviewKeyV830(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function reviewStatusLabelV830(status) {
    return ({
      confirmed_by_tag: "Confirmed by tag",
      confirmed_by_photo: "Confirmed by photo",
      supported_by_two_models: "Supported by two models",
      likely_correct: "Likely correct",
      suggested: "Suggested",
      needs_review: "Needs review",
      conflict: "Conflict",
      user_confirmed: "User confirmed",
      user_corrected: "User corrected",
      cleared_by_user: "Cleared by user",
      not_filled: "Not filled"
    })[clean(status)] || "Needs review";
  }

  function reviewFieldIdForRecordV850(rec) {
    return clean(rec?.fieldRecord?.fieldId || rec?.fieldId || rec?.reviewAnswer?.fieldId, 180);
  }

  function rebuildReviewMapsV850(item) {
    const answers = Array.isArray(item?.answers) ? item.answers : [];
    HOVER_ASSISTANT.reviewByFieldId = new Map(
      answers.filter(answer => clean(answer?.fieldId)).map(answer => [clean(answer.fieldId), answer])
    );
    HOVER_ASSISTANT.reviewByKey = new Map(
      answers.filter(answer => clean(answer?.field)).map(answer => [reviewKeyV830(answer.field), answer])
    );
  }

  function reviewRebindAnswerV850(answer, record, item = HOVER_ASSISTANT.reviewItem) {
    if (!answer || !record) return answer;
    const currentFieldId = clean(record.fieldId || record.field_id, 180);
    const previousFieldId = clean(answer.fieldId || answer.field_id, 180);
    if (!currentFieldId || !previousFieldId || currentFieldId === previousFieldId) return answer;
    if (reviewKeyV830(answer.taxonomyName || answer.field) !== reviewKeyV830(record.label)) return answer;
    const itemCategory = clean(item?.categoryId || "unknown", 40);
    const recordCategory = clean(record.categoryId || "unknown", 40);
    if (itemCategory !== "unknown" && recordCategory !== "unknown" && itemCategory !== recordCategory) return answer;
    const catalog = (Array.isArray(item?.fieldCatalog) ? item.fieldCatalog : []).find(candidate =>
      clean(candidate?.fieldId || candidate?.field_id, 180) === previousFieldId
      || reviewKeyV830(candidate?.field || candidate?.name || candidate?.label) === reviewKeyV830(answer.field)
    ) || {};
    const oldType = clean(catalog.type || catalog.controlType, 40);
    const newType = clean(record.type, 40);
    if (oldType && newType && oldType !== newType) return answer;
    let currentOptions = [];
    try { currentOptions = Array.isArray(record.options?.()) ? record.options() : Array.isArray(record.options) ? record.options : []; } catch (_) {}
    const oldOptions = Array.isArray(catalog.allowedValues) ? catalog.allowedValues : Array.isArray(catalog.options) ? catalog.options : [];
    if (oldOptions.length && currentOptions.length) {
      const currentKeys = new Set(currentOptions.map(reviewKeyV830));
      const compatible = oldOptions.some(value => currentKeys.has(reviewKeyV830(value)))
        || [answer.aiValue, answer.currentValue, answer.changedTo].some(value => value && currentKeys.has(reviewKeyV830(value)));
      if (!compatible) return answer;
    }
    const rebound = { ...answer, previousFieldId, fieldId: currentFieldId, fieldKeySource: "rebound_by_name", orphaned: false };
    HOVER_ASSISTANT.reviewByFieldId?.set?.(currentFieldId, rebound);
    HOVER_ASSISTANT.reviewByKey?.set?.(reviewKeyV830(record.label), rebound);
    return rebound;
  }

  function reviewAnswerForRecordV830(rec) {
    const fieldId = reviewFieldIdForRecordV850(rec);
    const exact = fieldId ? HOVER_ASSISTANT.reviewByFieldId?.get?.(fieldId) : null;
    const fallback = HOVER_ASSISTANT.reviewByKey?.get?.(reviewKeyV830(rec?.label)) || rec?.reviewAnswer;
    return exact
      || reviewRebindAnswerV850(fallback, rec?.fieldRecord || rec)
      || {
        field: clean(rec?.label), fieldKey: reviewKeyV830(rec?.label), fieldId,
        aiValue: clean(rec?.value), currentValue: "", status: "not_filled", sources: []
      };
  }

  function reviewCurrentValueV830(rec) {
    try { return clean(rec?.fieldRecord?.read?.() ?? rec?.control?.value ?? ""); } catch (_) { return clean(rec?.control?.value || ""); }
  }

  function reviewEffectiveStatusV830(answer, currentValue) {
    const current = clean(currentValue);
    const aiValue = clean(answer?.aiValue);
    const saved = clean(answer?.status);
    const savedCurrent = clean(answer?.currentValue || answer?.changedTo || answer?.filledValue);
    if (!current && savedCurrent) return "cleared_by_user";
    if (current && savedCurrent && reviewKeyV830(current) !== reviewKeyV830(savedCurrent)) return "user_corrected";
    if (current && aiValue && reviewKeyV830(current) !== reviewKeyV830(aiValue)) return "user_corrected";
    if (["user_confirmed", "user_corrected", "cleared_by_user"].includes(saved)) return saved;
    return saved || (aiValue ? "needs_review" : "not_filled");
  }

  function reviewSendV830(type, payload = {}) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type, payload }, response => {
          if (chrome.runtime.lastError) resolve({ ok: false, message: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, message: "No Review response." });
        });
      } catch (error) {
        resolve({ ok: false, message: error?.message || String(error) });
      }
    });
  }

  async function persistReviewFieldV830(rec, status, fromValue, toValue) {
    const answer = reviewAnswerForRecordV830(rec);
    const payload = {
      itemKey: HOVER_ASSISTANT.reviewItem?.itemKey || "",
      draftId: HOVER_ASSISTANT.reviewItem?.draftId || globalThis.EbayPageFieldsV810?.draftIdFromUrl?.() || "",
      url: HOVER_ASSISTANT.reviewItem?.url || location.href,
      field: answer.field || rec.label,
      fieldKey: answer.fieldKey || reviewKeyV830(rec.label),
      fieldId: reviewFieldIdForRecordV850(rec) || answer.fieldId,
      previousFieldId: answer.previousFieldId || ((answer.fieldId && answer.fieldId !== reviewFieldIdForRecordV850(rec)) ? answer.fieldId : ""),
      status,
      currentValue: clean(toValue),
      changedFrom: clean(fromValue),
      changedTo: clean(toValue)
    };
    const result = await reviewSendV830("REVIEW_UPDATE_FIELD_V830", payload);
    if (result?.ok && result.item) {
      HOVER_ASSISTANT.reviewItem = result.item;
      rebuildReviewMapsV850(result.item);
      rec.reviewAnswer = reviewAnswerForRecordV830(rec) || answer;
    } else {
      answer.status = status;
      answer.currentValue = clean(toValue);
      answer.changedFrom = clean(fromValue);
      answer.changedTo = clean(toValue);
      answer.fieldId = answer.fieldId || reviewFieldIdForRecordV850(rec);
      if (answer.fieldId) HOVER_ASSISTANT.reviewByFieldId.set(answer.fieldId, answer);
      HOVER_ASSISTANT.reviewByKey.set(reviewKeyV830(rec.label), answer);
    }
    return result;
  }

  function scheduleReviewChangeCheckV830(delay = 120) {
    const pending = HOVER_ASSISTANT.reviewPendingChange;
    if (!pending || pending.timer) return;
    pending.timer = window.setTimeout(async () => {
      pending.timer = 0;
      const rec = pending.rec;
      if (!rec) return;
      try { rec.fieldRecord?.refresh?.(); } catch (_) {}
      const current = reviewCurrentValueV830(rec);
      if (reviewKeyV830(current) === reviewKeyV830(pending.fromValue)) return;
      const status = current ? "user_corrected" : "cleared_by_user";
      await persistReviewFieldV830(rec, status, pending.fromValue, current);
      HOVER_ASSISTANT.reviewPendingChange = null;
      if (HOVER_ASSISTANT.activeRecord === rec && document.getElementById("ebay-ai-hover-panel")) openReviewPanelV830(rec);
    }, delay);
  }

  function attachReviewChangeListenersV830(rec, fromValue) {
    const control = rec?.fieldRecord?.control || rec?.control;
    const row = rec?.fieldRecord?.row || control?.parentElement;
    HOVER_ASSISTANT.reviewPendingChange = { rec, fromValue: clean(fromValue), timer: 0 };
    const handler = () => scheduleReviewChangeCheckV830(80);
    try { control?.addEventListener?.("input", handler, { once: true, capture: true }); } catch (_) {}
    try { control?.addEventListener?.("change", handler, { once: true, capture: true }); } catch (_) {}
    try { row?.addEventListener?.("input", handler, { once: true, capture: true }); } catch (_) {}
    try { row?.addEventListener?.("change", handler, { once: true, capture: true }); } catch (_) {}
  }

  async function beginReviewChangeV830(rec, panel) {
    const field = rec?.fieldRecord;
    if (!field) {
      setPanelMessage(panel, "Exact Item Specific field is unavailable.", "hf-status-warn");
      return;
    }
    try { field.refresh?.(); } catch (_) {}
    const before = reviewCurrentValueV830(rec);
    attachReviewChangeListenersV830(rec, before);
    const type = clean(field.type).toLowerCase();
    const tag = clean(field.control?.tagName).toLowerCase();
    if (type === "text" || tag === "input" || tag === "textarea") {
      try { field.write?.(""); } catch (_) {}
      const cleared = reviewCurrentValueV830(rec);
      if (reviewKeyV830(cleared) !== reviewKeyV830(before)) {
        await persistReviewFieldV830(rec, "cleared_by_user", before, cleared);
        attachReviewChangeListenersV830(rec, cleared);
      }
      try { field.control?.focus?.(); } catch (_) {}
      setPanelMessage(panel, "Field cleared. Enter the correct value; the change will be saved.", "hf-status-warn");
      return;
    }
    try { await field.centerForFill?.(); } catch (_) {}
    try { await field.open?.(); } catch (_) {}
    await sleep(80);
    try {
      const search = searchInput(field.row, field.control);
      if (search) {
        writeSearchValue(search, "");
        try { search.focus(); } catch (_) {}
      }
    } catch (_) {}
    setPanelMessage(panel, "Choose the correct value in the open eBay menu. The old and new answers will be saved.", "hf-status-warn");
  }

  async function confirmReviewFieldV830(rec, panel) {
    const current = reviewCurrentValueV830(rec);
    const answer = reviewAnswerForRecordV830(rec);
    if (!current) {
      setPanelMessage(panel, "This eBay field is empty. Choose or enter a value before confirming it.", "hf-status-warn");
      return;
    }
    const fromValue = clean(answer.changedFrom || answer.aiValue || current);
    const status = clean(answer.aiValue) && reviewKeyV830(current) !== reviewKeyV830(answer.aiValue) ? "user_corrected" : "user_confirmed";
    const result = await persistReviewFieldV830(rec, status, fromValue, current);
    const successText = status === "user_corrected" ? `Correction saved: ${fromValue || "Empty"} → ${current}.` : "Current eBay value confirmed by user.";
    setPanelMessage(panel, result?.ok === false ? `Saved locally in this page only: ${result.message || "backend unavailable"}` : successText, result?.ok === false ? "hf-status-warn" : "hf-status-ok");
    window.setTimeout(() => openReviewPanelV830(rec), 180);
  }

  function reviewSourcesTextV830(answer) {
    const sources = Array.isArray(answer?.sources) ? answer.sources : [];
    if (sources.length) return sources.slice(0, 3).map(source => {
      const display = Number(source.photo || source.displayNumber || 0);
      const stableId = clean(source.photoId, 180);
      const photoLabel = display ? `Photo ${display}` : (stableId ? stableId : "Photo");
      const provider = clean(source.provider, 40);
      const evidence = clean(source.evidence);
      return `${photoLabel}${provider ? ` (${provider})` : ""}: ${evidence || "source saved"}`;
    }).join(" | ");
    return clean(answer?.reason || (answer?.sourceType === "safe_default" ? "Standard suggestion for this product type." : "No direct photo source saved."));
  }

  function openReviewPanelV830(rec) {
    if (!rec) return;
    closeHoverPanel();
    ensureHoverStyles();
    try { rec.fieldRecord?.refresh?.(); } catch (_) {}
    const answer = reviewAnswerForRecordV830(rec);
    const current = reviewCurrentValueV830(rec);
    const status = reviewEffectiveStatusV830(answer, current);
    const changedFrom = clean(answer.changedFrom || (status === "user_corrected" ? (answer.currentValue || answer.filledValue || answer.aiValue) : ""));
    const changedTo = clean(answer.changedTo || (status === "user_corrected" ? current : ""));
    const primaryValue = clean(answer.primaryValue || answer.primary?.value || answer.aiValue);
    const reviewerValue = clean(answer.reviewerValue || answer.reviewer?.value);
    const evidenceScope = clean(answer.evidenceScope || answer.primary?.evidenceScope || answer.reviewer?.evidenceScope);
    const reviewReason = clean(answer.reviewReason || answer.primary?.reviewReason || answer.reviewer?.reviewReason);
    const validationIssues = Array.isArray(answer.validationIssues) ? answer.validationIssues.map(clean).filter(Boolean) : [];

    let panel = null;
    const run = async (action, target) => {
      if (!action || target?.disabled) return;
      if (action === "close") { closeHoverPanel(); return; }
      if (action === "back") { await goToPreviousHoverField(rec, panel); return; }
      if (action === "next") { await goToNextHoverField(rec, panel); return; }
      if (action === "review-confirm") { await confirmReviewFieldV830(rec, panel); return; }
      if (action === "review-change") { await beginReviewChangeV830(rec, panel); }
    };

    installHelperPanelEventShield();
    panel = globalThis.EbayUI?.assistantPanel?.renderReview?.({
      version: `V${VERSION}`,
      label: rec.label,
      status,
      statusLabel: reviewStatusLabelV830(status),
      aiValue: clean(answer.aiValue),
      primaryValue,
      reviewerValue,
      current,
      sources: reviewSourcesTextV830(answer),
      evidenceScope,
      reviewReason,
      validationIssues,
      changedFrom,
      changedTo
    }, run);
    if (!panel) throw new Error("Assistant Panel UI is not available.");

    HOVER_ASSISTANT.panelActionRunner = target => {
      const action = target?.classList?.contains("hf-close") ? "close" : target?.dataset?.action;
      return run(action, target);
    };
    HOVER_ASSISTANT.panel = panel;
    HOVER_ASSISTANT.activeRecord = rec;
    HOVER_ASSISTANT.lastAnchorLabel = rec.label || "";
    HOVER_ASSISTANT.panelPinned = false;
    positionHoverPanel(panel);
    scheduleHoverPanelPositionUpdate();
  }


  function openAssistantPanel(rec) {
    return HOVER_ASSISTANT.mode === "review" ? openReviewPanelV830(rec) : openHoverPanel(rec);
  }

  function openHoverPanel(rec) {
    if (!rec) return;
    logHelperAction("helper-open", { record: recordDebugSummary(rec) });
    closeHoverPanel();
    ensureHoverStyles();
    const control = rec.isMenuAnswer
      ? (rec.control && isVisible(rec.control) ? rec.control : null)
      : (rec.control && isVisible(rec.control) ? rec.control : findControlForLabel(rec.label));
    if (control) rec.control = control;
    const status = hoverStatus(rec.label, rec.value, control);
    const values = splitMulti(rec.label, rec.value).slice(0, 8);
    rec.answerStates = {};
    try { refreshAnswerStatesFromEbay(rec, null, control, findOpenMenuScopesNear(control), values); } catch (_) {}

    const fillDisabled = !clean(rec.value) || status.cls === "risk";
    const nonBinarySpecial = /^(description|condition description|condition)$/i.test(clean(rec.label || ""));
    const binaryChoices = nonBinarySpecial ? [] : (Array.isArray(rec.binaryChoices) ? rec.binaryChoices.map(clean).filter(Boolean).slice(0, 2) : []);
    const yesNoMode = nonBinarySpecial ? false : (!!rec.isYesNoField || isYesNoLikelyField(rec.label, rec.value));
    const choiceMode = binaryChoices.length === 2;
    const suggestion = clean(rec.value) || (choiceMode ? `Choose: ${binaryChoices.join(" / ")}` : yesNoMode ? "Choose Yes or No" : "No AI value");
    const answers = values.map(value => {
      const state = ensureAnswerState(rec)[answerStateKey(value)] || "pending";
      return { value, key: answerStateKey(value), state };
    });
    const choices = choiceMode
      ? binaryChoices.map(value => ({ value, key: answerStateKey(value), state: "pending" }))
      : (yesNoMode ? [
          { value: "Yes", key: "yes", state: "pending" },
          { value: "No", key: "no", state: "pending" }
        ] : []);

    let panel = null;
    let lastPointerFillAt = 0;
    const runPanelAction = async (action, target) => {
      if (!action || target?.disabled) return;
      logHelperAction(`helper-action-${action}`, { label: rec?.label, value: rec?.value });
      if (action === "close" || action === "skip") { closeHoverPanel(); return; }
      if (action === "back") { await goToPreviousHoverField(rec, panel); return; }
      if (action === "next") { await goToNextHoverField(rec, panel); return; }
      if (action === "fill-all") { await startHelperFillAll(rec); return; }
      if (action === "copy") {
        try { await navigator.clipboard.writeText(clean(rec.value)); setPanelMessage(panel, "Copied.", "hf-status-ok"); }
        catch (_) { setPanelMessage(panel, "Copy failed. Select text manually.", "hf-status-warn"); }
        return;
      }
      if (action === "remember") {
        const ok = saveRememberedChoice(rec.label, rec.value);
        setPanelMessage(panel, ok ? "Remembered for this browser." : "Could not save remembered choice.", ok ? "hf-status-ok" : "hf-status-warn");
        return;
      }
      if (action === "undo") {
        const ok = restoreSnapshot(rec.control, rec.lastSnapshot);
        setPanelMessage(panel, ok ? "Undo restored previous value." : "Nothing to undo for this field.", ok ? "hf-status-ok" : "hf-status-warn");
        return;
      }
      if (action === "fill" || action === "fill-one" || action === "type-only") {
        if (Date.now() - lastPointerFillAt < 900) return;
        lastPointerFillAt = Date.now();
        HOVER_ASSISTANT.panelActionRunning = true;
        suppressHelperOpen(5000);
        try {
          const liveControl = rec.control && isVisible(rec.control) ? rec.control : findControlForLabel(rec.label) || findYesNoInRow(rec.label, "Yes") || findYesNoInRow(rec.label, "No");
          if (liveControl) rec.control = liveControl;
          if (action === "type-only") {
            const engine = globalThis.EbayAiFillEngineV790;
            if (!engine?.withOperation) throw new Error("Item Specifics operation lock is not ready.");
            const locked = await engine.withOperation("helper_type_only", () => typeHoverValueOnly(rec, panel, target?.dataset?.value || ""), { mode: "interactive_helper" });
            if (locked?.busy) setPanelMessage(panel, locked.message || "Another Item Specifics operation is already running.", "hf-status-warn");
          }
          if (action === "fill-one") await sharedHelperFillOneV8130(rec, panel, target?.dataset?.value || "");
          if (action === "fill") await sharedHelperFillOneV8130(rec, panel, "");
        } catch (err) {
          console.warn("[Fill:V8.23.21] helper fill failed", err);
          setPanelMessage(panel, `Fill failed: ${err?.message || err}`, "hf-status-warn");
        } finally {
          HOVER_ASSISTANT.panelActionRunning = false;
          suppressHelperOpen(900);
        }
      }
    };

    installHelperPanelEventShield();
    panel = globalThis.EbayUI?.assistantPanel?.renderSuggestion?.({
      version: `V${VERSION}`,
      label: rec.label,
      suggestion,
      answers,
      choices,
      statusClass: status.cls,
      statusText: status.text,
      fillDisabled
    }, runPanelAction);
    if (!panel) throw new Error("Assistant Panel UI is not available.");

    HOVER_ASSISTANT.panelActionRunner = target => {
      const action = target?.classList?.contains("hf-close") ? "close" : target?.dataset?.action;
      return runPanelAction(action, target);
    };
    HOVER_ASSISTANT.panel = panel;
    HOVER_ASSISTANT.activeRecord = rec;
    HOVER_ASSISTANT.lastAnchorLabel = rec.label || "";
    HOVER_ASSISTANT.panelPinned = false;
    if (HOVER_ASSISTANT.button) HOVER_ASSISTANT.button.style.display = "none";
    positionHoverPanel(panel);
    scheduleHoverPanelPositionUpdate();
    window.setTimeout(scheduleHoverPanelPositionUpdate, 90);
    window.setTimeout(scheduleHoverPanelPositionUpdate, 220);

    const delayedRealStatusRefresh = () => {
      try {
        if (!document.getElementById("ebay-ai-hover-panel") || HOVER_ASSISTANT.activeRecord !== rec) return;
        const liveControl = rec.control && isVisible(rec.control) ? rec.control : control;
        const liveScopes = findOpenMenuScopesNear(liveControl);
        refreshAnswerStatesFromEbay(rec, panel, liveControl, liveScopes, values);
      } catch (_) {}
    };
    window.setTimeout(delayedRealStatusRefresh, 160);
    window.setTimeout(delayedRealStatusRefresh, 420);
    window.setTimeout(delayedRealStatusRefresh, 900);
  }


  function currentHoverAnchorRect() {
    const rec = HOVER_ASSISTANT.activeRecord;
    if (!rec) return null;
    if (rec.isMenuAnswer) {
      let br = rec.control && isVisible(rec.control) ? rec.control.getBoundingClientRect?.() : null;
      if (!rectLooksUsable(br) && rec.anchorRect && Date.now() - (rec.anchorRectAt || 0) < 2500) br = rec.anchorRect;
      if (!rectLooksUsable(br)) return null;
      if (br.bottom < 0 || br.top > window.innerHeight || br.right < 0 || br.left > window.innerWidth) return null;
      return br;
    }
    if (!rec.control || !isVisible(rec.control)) {
      const fresh = rec.label ? findControlForLabel(rec.label) : null;
      if (fresh && isVisible(fresh)) rec.control = fresh;
    }
    let br = rec.control?.getBoundingClientRect?.() || rec.labelNode?.getBoundingClientRect?.() || null;
    if (!rectLooksUsable(br)) return null;
    if (br.bottom < 0 || br.top > window.innerHeight || br.right < 0 || br.left > window.innerWidth) return null;
    return br;
  }

  function positionHoverPanel(panel = HOVER_ASSISTANT.panel) {
    if (!panel || HOVER_ASSISTANT.panelPinned) return;
    const anchor = currentHoverAnchorRect();
    globalThis.EbayUI?.assistantPanel?.placeNear?.(panel, anchor, { mode: HOVER_ASSISTANT.mode === "review" ? "review" : "helper" });
  }


  function scheduleHoverPanelPositionUpdate() {
    if (!HOVER_ASSISTANT.panel || HOVER_ASSISTANT.panelPinned || HOVER_ASSISTANT.positionRaf) return;
    HOVER_ASSISTANT.positionRaf = requestAnimationFrame(() => {
      HOVER_ASSISTANT.positionRaf = 0;
      positionHoverPanel();
    });
  }

  function scheduleActivePanelStatusRefresh(delay = 180) {
    // A4.90: cheap click-triggered verification. When the user opens/changes an eBay
    // dropdown while the helper is already open, repaint chips from the current real menu.
    // This is not an observer/interval and only runs after user clicks.
    window.setTimeout(() => {
      try {
        const panel = document.getElementById("ebay-ai-hover-panel");
        const rec = HOVER_ASSISTANT.activeRecord;
        if (!panel || !rec) return;
        const control = rec.control && isVisible(rec.control) ? rec.control : findControlForLabel(rec.label);
        const values = splitMulti(rec.label, rec.value).slice(0, 8);
        if (!control || !values.length) return;
        refreshAnswerStatesFromEbay(rec, panel, control, exactOpenMenuScopesForControl(control), values);
      } catch (_) {}
    }, delay);
  }

  function helperRecordLooksDifferent(a, b) {
    if (!a || !b) return !!a;
    const al = normalize(a.label || "");
    const bl = normalize(b.label || "");
    if (al && bl && al !== bl) return true;
    const an = clean(a.control?.getAttribute?.("name") || "");
    const bn = clean(b.control?.getAttribute?.("name") || "");
    if (an && bn && an !== bn) return true;
    return false;
  }

  function clearHelperOpenSuppressionForUserSwitch() {
    window.__ebayAiFillerSuppressHelperOpenUntil = 0;
    try { HOVER_ASSISTANT.suppressOpenUntil = 0; } catch (_) {}
  }

  function handleHoverClick(e) {
    if (!HOVER_ASSISTANT.enabled) return;
    if (isAssistantElement(e.target)) return;

    // Review edits often finish by clicking an option rendered in eBay's menu portal.
    // That click is intentionally not treated as another Helper field, but it must trigger
    // one read-back of the exact field so the old → new correction can be persisted.
    if (HOVER_ASSISTANT.mode === "review" && HOVER_ASSISTANT.reviewPendingChange && e?.isTrusted !== false) {
      scheduleReviewChangeCheckV830(140);
    }

    // A4.118: when the user clicks another real eBay question while the helper is still
    // open, switch the helper immediately. Older builds kept the old helper during the
    // post-Fill suppression window, so clicking Occasion could leave Dress Length visible.
    const rec = recordFromClickEvent(e);
    const suppressed = helperOpenIsSuppressed(e);
    if (suppressed) {
      const manualSwitch = !!(e && e.isTrusted !== false && rec && !rec.isMenuAnswer && !HOVER_ASSISTANT.panelActionRunning && helperRecordLooksDifferent(rec, HOVER_ASSISTANT.activeRecord));
      if (!manualSwitch) return;
      clearHelperOpenSuppressionForUserSwitch();
    }

    if (HOVER_ASSISTANT.panel) scheduleActivePanelStatusRefresh(160);
    if (!rec) {
      // A4.36 stable helper: clicks inside an open eBay dropdown/menu do not close the helper.
      return;
    }
    HOVER_ASSISTANT.activeRecord = rec;
    // Let eBay open its dropdown first, then render our helper. Also retry once because
    // eBay sometimes moves/repaints the row after the first click.
    window.setTimeout(() => {
      if (!HOVER_ASSISTANT.enabled) return;
      // A4.118: do not let a stale suppress window block a trusted manual switch.
      if (helperOpenIsSuppressed(e) && !(e && e.isTrusted !== false && HOVER_ASSISTANT.activeRecord === rec && !HOVER_ASSISTANT.panelActionRunning)) return;
      openAssistantPanel(rec);
      window.setTimeout(() => {
        if (HOVER_ASSISTANT.enabled && HOVER_ASSISTANT.activeRecord === rec && !document.getElementById("ebay-ai-hover-panel")) {
          openAssistantPanel(rec);
        }
      }, 120);
    }, 60);
  }

  function handleSpecialFieldActivation(e) {
    // A5.28: no helper for Condition, Condition description, or Description.
    return;
  }

  function clearHoverButtons() {
    hideHoverButton();
    if (HOVER_ASSISTANT.button) {
      try { HOVER_ASSISTANT.button.remove(); } catch (_) {}
      HOVER_ASSISTANT.button = null;
    }
  }

  function onHoverScrollOrResize() {
    // A4.43: lightweight anchor update only. No page scan, no mouse tracking, no interval.
    scheduleHoverPanelPositionUpdate();
  }

  async function enableHoverAssistant(payload = {}) {
    disableHoverAssistant();
    HOVER_ASSISTANT.enabled = true;
    HOVER_ASSISTANT.mode = "fill";
    HOVER_ASSISTANT.reviewItem = null;
    HOVER_ASSISTANT.reviewByKey = new Map();
    HOVER_ASSISTANT.reviewByFieldId = new Map();
    HOVER_ASSISTANT.reviewFilter = "needs_attention";
    HOVER_ASSISTANT.reviewPendingChange = null;
    HOVER_ASSISTANT.data = payload.data || {};
    HOVER_ASSISTANT.settings = payload.settings || {};
    ensureHoverButton();
    if (HOVER_ASSISTANT.button) hideHoverButton();
    // Remove all old listeners from previous builds, then add only one click listener.
    installAssistantListenersV830();
    // Build the Helper navigation route from the same exact DOM reader used by Fill All.
    // No technical IDs and no second page-wide Helper scan.
    HOVER_ASSISTANT.navRouteCache = null;
    HOVER_ASSISTANT.navRouteBuiltAt = 0;
    HOVER_ASSISTANT.navRouteSignature = "core-item-specifics";
    const platform = globalThis.MarketplacePlatformV8200?.detect?.() || "ebay";
    const platformLabel = globalThis.MarketplacePlatformV8200?.label?.(platform) || "eBay";
    const pageAdapter = platform === "ebay" ? globalThis.EbayPageFieldsV810 : globalThis.MarketplaceAdaptersV8200?.get?.(platform);
    if (!pageAdapter?.collectFieldMap) throw new Error(`${platformLabel} listing adapter is not ready.`);
    const fieldMap = await pageAdapter.collectFieldMap({ force: true, expand: platform === "ebay" });
    const route = [];
    for (const record of fieldMap.values()) {
      let recordOptions = [];
      try { recordOptions = await record.options?.() || []; } catch (_) { recordOptions = []; }
      const normalizedOptions = recordOptions.map(value => normalize(value)).sort().join("|");
      route.push({
        label: record.label,
        value: platform === "ebay" ? valueForLabel(record.label) : "",
        control: record.control || null,
        fieldRecord: record,
        isYesNoField: normalizedOptions === "no|yes",
        isBinaryChoiceField: record.type === "choice" || record.type === "yesno",
        binaryChoices: recordOptions
      });
    }
    HOVER_ASSISTANT.navRouteCache = route;
    HOVER_ASSISTANT.navRouteBuiltAt = Date.now();
    toast(`V8.23.21 ${platformLabel} DOM route ready: ${route.length} field(s).`, 5000);
    return { ok: true, message: platform === "ebay"
      ? `V8.23.21 Helper enabled for ${Object.keys(parseKeyValueLines(HOVER_ASSISTANT.data?.specifics || "")).length} supplied answer(s). ${route.length} Item Specific fields mapped.`
      : `V8.23.21 ${platformLabel} Helper ready. Transfer photos, then press Fill All. ${route.length} field(s) mapped.` };
  }

  function reviewFilterAcceptsV830(answer, filter = "needs_attention") {
    const status = clean(answer?.status || "not_filled");
    if (filter === "all") return true;
    if (filter === "suggested") return ["suggested", "likely_correct", "supported_by_two_models"].includes(status);
    if (filter === "changed") return ["user_corrected", "cleared_by_user"].includes(status);
    if (filter === "confirmed") return ["confirmed_by_tag", "confirmed_by_photo", "user_confirmed"].includes(status);
    return ["supported_by_two_models", "likely_correct", "suggested", "needs_review", "conflict", "cleared_by_user", "not_filled"].includes(status);
  }

  function cleanupAssistantListenersV830() {
    document.removeEventListener("mousemove", handleHoverClick, true);
    document.removeEventListener("pointermove", handleHoverClick, true);
    document.removeEventListener("click", handleHoverClick, true);
    document.removeEventListener("pointerdown", handleSpecialFieldActivation, true);
    document.removeEventListener("mousedown", handleSpecialFieldActivation, true);
    document.removeEventListener("focusin", handleSpecialFieldActivation, true);
    window.removeEventListener("scroll", onHoverScrollOrResize, true);
    window.removeEventListener("resize", onHoverScrollOrResize, true);
  }

  function installAssistantListenersV830() {
    cleanupAssistantListenersV830();
    document.addEventListener("click", handleHoverClick, true);
    document.addEventListener("pointerdown", handleSpecialFieldActivation, true);
    document.addEventListener("mousedown", handleSpecialFieldActivation, true);
    document.addEventListener("focusin", handleSpecialFieldActivation, true);
    window.addEventListener("scroll", onHoverScrollOrResize, true);
    window.addEventListener("resize", onHoverScrollOrResize, true);
  }

  async function enableReviewAssistantV830(payload = {}) {
    const platform = globalThis.MarketplacePlatformV8200?.detect?.() || "ebay";
    if (platform !== "ebay") return { ok: false, message: "Review Assistant is currently eBay-only." };
    disableHoverAssistant();
    const item = payload?.item && typeof payload.item === "object" ? payload.item : null;
    if (!item || !Array.isArray(item.answers)) {
      return { ok: false, message: "No saved Review item was supplied." };
    }
    HOVER_ASSISTANT.enabled = true;
    HOVER_ASSISTANT.mode = "review";
    HOVER_ASSISTANT.reviewItem = item;
    HOVER_ASSISTANT.reviewFilter = clean(payload.filter || "needs_attention") || "needs_attention";
    HOVER_ASSISTANT.reviewPendingChange = null;
    rebuildReviewMapsV850(item);
    HOVER_ASSISTANT.data = {
      specifics: item.answers
        .filter(answer => clean(answer.aiValue))
        .map(answer => `${clean(answer.field)} - ${clean(answer.aiValue)}`)
        .join("\n")
    };
    HOVER_ASSISTANT.settings = {};
    ensureHoverButton();
    installAssistantListenersV830();

    const fieldMap = await globalThis.EbayPageFieldsV810.collectFieldMap({ force: true });
    const route = [];
    for (const record of fieldMap.values()) {
      const exactAnswer = record.fieldId ? HOVER_ASSISTANT.reviewByFieldId.get(record.fieldId) : null;
      const answer = exactAnswer || reviewRebindAnswerV850(HOVER_ASSISTANT.reviewByKey.get(reviewKeyV830(record.label)), record, item);
      if (!answer || !reviewFilterAcceptsV830(answer, HOVER_ASSISTANT.reviewFilter)) continue;
      route.push({
        label: record.label,
        value: clean(answer.aiValue),
        control: record.control,
        fieldRecord: record,
        reviewAnswer: answer,
        isYesNoField: record.type === "choice" && record.options().map(value => normalize(value)).sort().join("|") === "no|yes",
        isBinaryChoiceField: record.type === "choice",
        binaryChoices: record.type === "choice" ? record.options() : []
      });
    }
    HOVER_ASSISTANT.navRouteCache = route;
    HOVER_ASSISTANT.navRouteBuiltAt = Date.now();
    HOVER_ASSISTANT.navRouteSignature = `review:${HOVER_ASSISTANT.reviewFilter}`;
    const attention = route.length;
    toast(`V8.23.21 Review Assistant ready: ${attention} field(s).`, 5000);
    return {
      ok: true,
      message: attention
        ? `Review Assistant enabled for ${attention} ${HOVER_ASSISTANT.reviewFilter === "all" ? "saved" : "filtered"} Item Specific field(s). Click a field to review it.`
        : "Review Assistant enabled, but no current Item Specific fields match this filter. Choose All fields or another filter."
    };
  }

  function disableReviewAssistantV830() {
    const wasReview = HOVER_ASSISTANT.mode === "review";
    const result = disableHoverAssistant();
    return { ...result, message: wasReview ? "V8.23.21 Review Assistant closed." : result.message };
  }

  function disableHoverAssistant() {
    HOVER_ASSISTANT.enabled = false;
    if (HOVER_ASSISTANT.reviewPendingChange?.timer) {
      try { clearTimeout(HOVER_ASSISTANT.reviewPendingChange.timer); } catch (_) {}
    }
    HOVER_ASSISTANT.reviewPendingChange = null;
    clearHoverButtons();
    closeHoverPanel();
    cleanupAssistantListenersV830();
    HOVER_ASSISTANT.mode = "fill";
    HOVER_ASSISTANT.reviewItem = null;
    HOVER_ASSISTANT.reviewByKey = new Map();
    HOVER_ASSISTANT.reviewByFieldId = new Map();
    HOVER_ASSISTANT.navRouteCache = null;
    return { ok: true, message: "V8.23.21 Helper hidden." };
  }


  // #endregion

  // #region DIAGNOSTICS AND OPTIONAL DESCRIPTION/CONDITION FILL
  function buildDomSnapshotForDebug() {
    const MAX_FIELDS = 320;
    const MAX_MENUS = 40;
    const MAX_TEXT = 80000;
    const MAX_HTML = 180000;
    const MAX_SNIPPET = 4500;

    function normSpaceLocal(v) {
      return String(v || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }
    function trunc(v, n) {
      const s = String(v || "");
      return s.length > n ? s.slice(0, n) + `… [truncated ${s.length - n} chars]` : s;
    }
    function rectOf(el) {
      try {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom), right: Math.round(r.right) };
      } catch (_) { return null; }
    }
    function visibleEnough(el) {
      if (!el || !(el instanceof Element)) return false;
      try {
        const cs = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) !== 0 && r.width > 1 && r.height > 1;
      } catch (_) { return false; }
    }
    function attrsOf(el) {
      const out = {};
      if (!el || !el.attributes) return out;
      const keep = /^(id|class|role|type|name|aria-|data-testid|data-test-id|data-test|placeholder|title|value|for|checked|selected|disabled)$/i;
      for (const a of Array.from(el.attributes)) {
        if (keep.test(a.name) || a.name.startsWith("aria-")) out[a.name] = trunc(a.value, 500);
      }
      return out;
    }
    function cssPath(el) {
      if (!el || !(el instanceof Element)) return "";
      const parts = [];
      let cur = el;
      for (let i = 0; cur && cur.nodeType === 1 && i < 9; i++, cur = cur.parentElement) {
        let part = cur.tagName.toLowerCase();
        if (cur.id) { part += `#${CSS.escape(cur.id)}`; parts.unshift(part); break; }
        const cls = Array.from(cur.classList || []).slice(0, 3).map(c => `.${CSS.escape(c)}`).join("");
        if (cls) part += cls;
        const parent = cur.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter(x => x.tagName === cur.tagName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
        }
        parts.unshift(part);
      }
      return parts.join(" > ");
    }
    function compactHtml(el, max = MAX_SNIPPET) {
      if (!el || !(el instanceof Element)) return "";
      try {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("script,style,svg,canvas,img,video,source,picture").forEach(n => n.remove());
        return trunc(clone.outerHTML.replace(/\s+/g, " ").trim(), max);
      } catch (_) { return trunc(el.outerHTML || "", max); }
    }
    function valueOf(el) {
      if (!el) return "";
      if ("value" in el && typeof el.value !== "undefined") return normSpaceLocal(el.value);
      return "";
    }
    function checkedState(el) {
      if (!el) return null;
      if (el.matches?.('input[type="checkbox"],input[type="radio"]')) return !!el.checked;
      const ariaChecked = el.getAttribute?.("aria-checked");
      if (ariaChecked === "true") return true;
      if (ariaChecked === "false") return false;
      const ariaSelected = el.getAttribute?.("aria-selected");
      if (ariaSelected === "true") return true;
      if (ariaSelected === "false") return false;
      return null;
    }
    function nearestFieldLabel(el) {
      if (!el || !(el instanceof Element)) return "";
      const aria = el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder") || "";
      if (aria && !/search|enter your own/i.test(aria)) return normSpaceLocal(aria);
      try {
        const id = el.id;
        if (id) {
          const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lab && normSpaceLocal(lab.innerText)) return normSpaceLocal(lab.innerText);
        }
      } catch (_) {}
      let cur = el;
      for (let depth = 0; cur && depth < 7; depth++, cur = cur.parentElement) {
        const text = normSpaceLocal(cur.innerText || "");
        if (!text) continue;
        const lines = text.split(/\n| {2,}/).map(normSpaceLocal).filter(Boolean);
        const likely = lines.find(x => x.length < 60 && /[A-Za-z]/.test(x) && !/search|selected|clear|no results|add custom/i.test(x));
        if (likely) return likely.replace(/\s*~\s*[\d.]+\s*[KMB]?\s*searches?.*$/i, "").trim();
      }
      return "";
    }
    function summarizeElement(el, kind) {
      return {
        kind,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || "",
        text: trunc(normSpaceLocal(el.innerText || el.textContent || ""), 1200),
        value: trunc(valueOf(el), 500),
        checked: checkedState(el),
        labelGuess: nearestFieldLabel(el),
        attrs: attrsOf(el),
        rect: rectOf(el),
        path: cssPath(el),
        html: compactHtml(el)
      };
    }
    function rowSummaryFromCheckbox(box) {
      let row = box.closest('label,[role="option"],[role="menuitemcheckbox"],[role="checkbox"],li,div') || box.parentElement || box;
      return {
        text: trunc(normSpaceLocal(row.innerText || row.textContent || ""), 500),
        checked: checkedState(box),
        checkbox: summarizeElement(box, "checkbox"),
        rowPath: cssPath(row),
        rowHtml: compactHtml(row, 1400)
      };
    }

    const fieldSelector = [
      'input:not([type="hidden"])', 'textarea', 'select',
      '[role="combobox"]', '[aria-haspopup="listbox"]', '[aria-haspopup="menu"]',
      '[aria-expanded="true"]', 'button', '[contenteditable="true"]'
    ].join(',');

    const fields = Array.from(document.querySelectorAll(fieldSelector))
      .filter(visibleEnough)
      .slice(0, MAX_FIELDS)
      .map(el => summarizeElement(el, "fieldCandidate"));

    const menuSelector = [
      '[role="listbox"]', '[role="menu"]', '[role="dialog"]', '[role="presentation"]',
      '[aria-modal="true"]', '[data-testid*="menu" i]', '[data-testid*="dropdown" i]', '[class*="menu" i]', '[class*="dropdown" i]'
    ].join(',');
    const openMenus = Array.from(document.querySelectorAll(menuSelector))
      .filter(el => visibleEnough(el) && normSpaceLocal(el.innerText).length > 0)
      .slice(0, MAX_MENUS)
      .map((el, index) => {
        const boxes = Array.from(el.querySelectorAll('input[type="checkbox"],input[type="radio"],[role="checkbox"],[aria-checked]')).filter(visibleEnough);
        return {
          index,
          summary: summarizeElement(el, "openMenuCandidate"),
          checkboxRows: boxes.slice(0, 80).map(rowSummaryFromCheckbox)
        };
      });

    const visibleCheckedRows = Array.from(document.querySelectorAll('input[type="checkbox"],input[type="radio"],[role="checkbox"],[aria-checked="true"],[aria-selected="true"]'))
      .filter(visibleEnough)
      .slice(0, 220)
      .map(el => rowSummaryFromCheckbox(el));

    let activeElement = null;
    try { if (document.activeElement && document.activeElement !== document.body) activeElement = summarizeElement(document.activeElement, "activeElement"); } catch (_) {}

    let html = "";
    try {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll("script,style,svg,canvas,img,video,source,picture").forEach(n => n.remove());
      html = trunc(clone.outerHTML.replace(/\s+/g, " ").trim(), MAX_HTML);
    } catch (_) { html = trunc(document.documentElement.outerHTML || "", MAX_HTML); }

    return {
      version: "8.23.21",
      createdAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: Math.round(window.scrollX), scrollY: Math.round(window.scrollY), devicePixelRatio: window.devicePixelRatio || 1 },
      activeElement,
      fields,
      openMenus,
      visibleCheckedRows,
      visibleText: trunc(normSpaceLocal(document.body?.innerText || ""), MAX_TEXT),
      compactHtml: html,
      notes: [
        "Use openMenus.checkboxRows to compare visible checked/unchecked rows.",
        "Search input, Search results, No results found, and Add custom value are included only as DOM evidence, not proof of selected status.",
        "This snapshot is created only on button click; no observer or interval is added."
      ]
    };
  }


  function buildRouteDebugSummary() {
    let records = [];
    try { records = helperAllQuestionRecords(); } catch (_) { records = []; }
    let bounds = null;
    try { bounds = findItemSpecificsVerticalBounds(); } catch (_) {}
    return {
      builtAt: HOVER_ASSISTANT.navRouteBuiltAt || 0,
      builtAtIso: HOVER_ASSISTANT.navRouteBuiltAt ? new Date(HOVER_ASSISTANT.navRouteBuiltAt).toISOString() : "",
      signature: HOVER_ASSISTANT.navRouteSignature || "",
      count: records.length,
      bounds,
      records: records.slice(0, 260).map((rec, index) => ({ index, ...recordDebugSummary(rec) }))
    };
  }

  function buildYesNoRowsDebug() {
    try {
      const bounds = findItemSpecificsVerticalBounds();
      return buildBinaryChoiceRowsInItemSpecifics(bounds).slice(0, 120).map((row, index) => ({
        index,
        label: labelNearBinaryChoiceRow(row),
        choices: (row.choices || []).map(c => ({ text: c.text, rect: safeDebugValue(c.el)?.rect })),
        row: { top: Math.round(row.top), left: Math.round(row.left), right: Math.round(row.right), bottom: Math.round(row.bottom) }
      }));
    } catch (err) { return [{ error: err?.message || String(err) }]; }
  }

  function safeLocalStorageDebug() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^ebayAi/i.test(k || "")) continue;
        if (/api|key|token|secret|password/i.test(k)) { out[k] = "[hidden]"; continue; }
        const v = localStorage.getItem(k);
        out[k] = String(v || "").slice(0, 1200);
      }
    } catch (err) { out.error = err?.message || String(err); }
    return out;
  }

  function buildDiagnosticBundleForDebug(options = {}) {
    const opt = Object.assign({
      pageInfo: true, actionLog: true, helperState: true, route: true, fields: true,
      openMenus: true, checkedRows: true, yesNoRows: true, activeElement: true,
      performance: true, errors: true, storage: false, visibleText: false, compactHtml: false
    }, options || {});
    let snapshot = null;
    try { snapshot = buildDomSnapshotForDebug(); } catch (err) { snapshot = { snapshotError: err?.message || String(err) }; }
    const bundle = {
      version: VERSION,
      createdAt: new Date().toISOString(),
      selected: opt,
      notes: [
        "V8.23.21 debug bundle: choose only needed switches in Settings.",
        "API key is not included.",
        "Route is limited to Item Specifics. Action log is temporary on this page."
      ]
    };
    if (opt.pageInfo) bundle.pageInfo = { url: location.href, title: document.title, viewport: snapshot?.viewport || null, userAgent: navigator.userAgent };
    if (opt.activeElement) bundle.activeElement = snapshot?.activeElement || null;
    if (opt.helperState) bundle.helperState = {
      enabled: !!HOVER_ASSISTANT.enabled,
      activeRecord: recordDebugSummary(HOVER_ASSISTANT.activeRecord),
      lastAnchorLabel: HOVER_ASSISTANT.lastAnchorLabel || "",
      panelVisible: !!document.getElementById("ebay-ai-hover-panel"),
      panelPinned: !!HOVER_ASSISTANT.panelPinned,
      routeCount: (HOVER_ASSISTANT.navRouteCache || []).length,
      routeBuiltAt: HOVER_ASSISTANT.navRouteBuiltAt || 0,
      routeSignature: HOVER_ASSISTANT.navRouteSignature || ""
    };
    if (opt.actionLog) bundle.actionLog = (HOVER_ASSISTANT.actionLog || []).slice(-150);
    if (opt.route) bundle.itemSpecificsRoute = buildRouteDebugSummary();
    if (opt.fields) bundle.fields = snapshot?.fields || [];
    if (opt.openMenus) bundle.openMenus = snapshot?.openMenus || [];
    if (opt.checkedRows) bundle.visibleCheckedRows = snapshot?.visibleCheckedRows || [];
    if (opt.yesNoRows) bundle.yesNoRows = buildYesNoRowsDebug();
    if (opt.performance) bundle.performance = {
      now: Math.round(performance.now()),
      routePrebuildStartedAt: HOVER_ASSISTANT.navRoutePrebuildStartedAt || 0,
      routePrebuildDoneAt: HOVER_ASSISTANT.navRoutePrebuildDoneAt || 0,
      routeBuildMs: (HOVER_ASSISTANT.navRoutePrebuildDoneAt || 0) && (HOVER_ASSISTANT.navRoutePrebuildStartedAt || 0) ? (HOVER_ASSISTANT.navRoutePrebuildDoneAt - HOVER_ASSISTANT.navRoutePrebuildStartedAt) : null,
      memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null
    };
    if (opt.errors) bundle.errors = (HOVER_ASSISTANT.debugErrors || []).slice(-80);
    if (opt.storage) bundle.safeLocalStorage = safeLocalStorageDebug();
    if (opt.visibleText) bundle.visibleText = snapshot?.visibleText || "";
    if (opt.compactHtml) bundle.compactHtml = snapshot?.compactHtml || "";
    return bundle;
  }


  // Protected Description/Condition writer removed in V8.23.21.

  // #endregion

  // #region SHARED FILL ENGINE OWNERSHIP
  // V8.23.21: the common Fill Engine adapters and the only Chrome message
  // listener live in Extension/content.js. This on-demand Helper runtime contains UI
  // helpers only and must never override the page writer or register a second router.
  // #endregion

  // #region HELPER MESSAGE API
  // Single-router contract: Extension/content.js calls this function only for
  // Helper/debug messages after the Helper runtime has been loaded on demand.
  function handleHelperMessageV8130(message, sender, sendResponse) {
    if (!message) return false;
    if (message.type === "EXPORT_EBAY_DEBUG_BUNDLE_V5") {
      try { sendResponse({ ok: true, bundle: buildDiagnosticBundleForDebug(message.options || {}) }); }
      catch (error) { sendResponse({ ok: false, message: error.message || String(error) }); }
      return false;
    }
    if (message.type === "CLEAR_EBAY_ACTION_LOG_V5") {
      try { clearHelperActionLog(); sendResponse({ ok: true, message: "Action log cleared." }); }
      catch (error) { sendResponse({ ok: false, message: error.message || String(error) }); }
      return false;
    }
    if (message.type === "STOP_ALL_ACTIONS_V5") {
      try { requestStopAllActions(); sendResponse({ ok: true, message: "V8.23.21 Stop Actions requested." }); }
      catch (error) { sendResponse({ ok: false, message: error.message || String(error) }); }
      return false;
    }
    if (message.type === "ENABLE_REVIEW_ASSISTANT_V830") {
      enableReviewAssistantV830(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
      return true;
    }
    if (message.type === "DISABLE_REVIEW_ASSISTANT_V830") {
      try { sendResponse(disableReviewAssistantV830()); }
      catch (error) { sendResponse({ ok: false, message: error.message || String(error) }); }
      return false;
    }
    if (message.type === "ENABLE_HOVER_ASSISTANT_V5") {
      enableHoverAssistant(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || String(error) }));
      return true;
    }
    if (message.type === "DISABLE_HOVER_ASSISTANT_V5") {
      try { sendResponse(disableHoverAssistant()); }
      catch (error) { sendResponse({ ok: false, message: error.message || String(error) }); }
      return false;
    }
    return false;
  }

  globalThis.EbayHelperRuntimeV8130 = Object.freeze({
    version: VERSION,
    handleMessage: handleHelperMessageV8130,
    requestStop() {
      requestStopAllActions();
      return { ok: true, message: "Helper stop requested." };
    }
  });
  // #endregion

  function notifyQueueRunnerReadyAfterLoadV801() {
    notifyQueueRunnerReadyV710();
    // eBay can replace the draft form shortly after document_idle. A second signal
    // is harmless and prevents a lost ready event during that controlled rerender.
    setTimeout(notifyQueueRunnerReadyV710, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(notifyQueueRunnerReadyAfterLoadV801, 0), { once: true });
  } else {
    setTimeout(notifyQueueRunnerReadyAfterLoadV801, 0);
  }
  // #endregion
})();
