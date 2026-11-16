/* Depop create-listing platform adapter — V8.23.21. */
(function initDepopAdapterV8200(global) {
  "use strict";

  const dom = global.MarketplaceDomV8200;
  const registry = global.MarketplaceAdaptersV8200;
  if (!dom || !registry) return;

  const PLATFORM = "depop";
  function debug(message, error) { global.EbayLogger?.debug?.(`[${PLATFORM}] ${message}`, { message: error?.message || String(error || "") }); }
  const BLOCKED = new Set([
    "description", "item price", "price", "shipping", "shipping method", "shipping from",
    "package size", "quantity", "availability", "boost your listing", "promote your item",
    "post listing", "post and add another", "publish", "list", "delete", "remove"
  ]);

  function root() { return document.querySelector('form[aria-label="List an item"]'); }
  function supported() { return global.MarketplacePlatformV8200?.detect?.() === PLATFORM && Boolean(root()); }
  function esc(value) { try { return CSS.escape(String(value || "")); } catch (_) { return String(value || "").replace(/["\\]/g, "\\$&"); } }
  function isBlocked(label) {
    const k = dom.key(label);
    return !k || BLOCKED.has(k) || global.EbayAiSafetyV790?.isBlockedField?.(label, PLATFORM) === true;
  }
  function labelFor(target) {
    const id = String(target?.id || "");
    if (!id) return null;
    return root()?.querySelector(`label[for="${esc(id)}"]`) || document.querySelector(`label[for="${esc(id)}"]`);
  }
  function fieldContainer(target, label, menuId = "") {
    let node = target?.parentElement || null;
    const form = root();
    while (node && node !== form && node !== document.body) {
      const hasLabel = label ? node.contains(label) : true;
      const hasTarget = target ? node.contains(target) : true;
      const hasMenu = !menuId || Boolean(node.querySelector?.(`#${esc(menuId)}`));
      if (hasLabel && hasTarget && hasMenu) return node;
      node = node.parentElement;
    }
    return target?.parentElement || form;
  }
  function menuIdFor(input) {
    return String(input?.getAttribute?.("aria-controls") || input?.getAttribute?.("aria-owns") || "").trim();
  }
  function parseMax(label, container) {
    const text = dom.clean(`${label?.parentElement?.textContent || ""} ${container?.textContent || ""}`, 1200);
    const m = text.match(/(?:select|add)\s+up\s+to\s+(\d+|one|two|three|four|five)/i);
    if (!m) return 1;
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    return Math.max(1, Number(m[1]) || words[String(m[1]).toLowerCase()] || 1);
  }
  function optionNodes(input) {
    const menuId = menuIdFor(input);
    const menu = menuId ? document.getElementById(menuId) : null;
    return Array.from(menu?.querySelectorAll?.('[role="option"]') || []).filter(node => !node.hasAttribute("aria-disabled") || node.getAttribute("aria-disabled") !== "true");
  }
  function optionValue(node) { return dom.clean(node?.getAttribute?.("aria-label") || node?.textContent || "", 180); }
  function currentSelected(input, container) {
    const values = dom.readSelectedOptions(container || root());
    const inputValue = dom.clean(input?.value || "", 180);
    if (inputValue && !values.some(value => dom.same(value, inputValue))) values.push(inputValue);
    return dom.unique(values);
  }
  function makeComboboxRecord(input, order) {
    const labelNode = labelFor(input);
    const label = dom.clean(labelNode?.textContent || input?.getAttribute?.("aria-label") || input?.name || input?.id || "", 120).replace(/\s*\*\s*$/, "");
    if (!label || isBlocked(label)) return null;
    const menuId = menuIdFor(input);
    const container = fieldContainer(input, labelNode, menuId);
    const maxValues = parseMax(labelNode, container);
    const isMulti = maxValues > 1;
    const isCategory = dom.key(label) === "category";
    const displayOption = node => {
      const leaf = optionValue(node);
      if (!isCategory || !leaf) return leaf;
      const group = node.parentElement;
      const header = Array.from(group?.children || []).find(child => child !== node && !child.matches?.('[role="option"]'))?.textContent || "";
      const path = dom.clean(header, 140);
      return path && !dom.same(path, leaf) ? `${path} > ${leaf}` : leaf;
    };
    const leafValue = value => dom.clean(String(value || "").split(">").pop(), 180);
    let lastSelectionResult = {};

    const resolveInput = () => document.getElementById(input.id) || input;
    const resolveContainer = () => {
      const live = resolveInput();
      return fieldContainer(live, labelFor(live), menuIdFor(live));
    };
    const refresh = async () => Boolean(resolveInput()?.isConnected);
    const readValues = async () => currentSelected(resolveInput(), resolveContainer());
    const read = async () => {
      const values = await readValues();
      return isMulti ? values.join(", ") : (dom.clean(resolveInput()?.value || "", 180) || values[0] || "");
    };
    const open = async () => {
      const live = resolveInput();
      if (!live) return false;
      if (live.getAttribute("aria-expanded") === "true" && optionNodes(live).length) return true;
      const id = menuIdFor(live);
      const toggle = id ? resolveContainer()?.querySelector?.(`button[aria-controls="${esc(id)}"]`) : null;
      try { live.focus?.(); } catch (error) { debug("Best-effort Depop DOM operation skipped", error); }
      dom.safeClick(toggle || live);
      return dom.waitUntil(() => resolveInput()?.getAttribute("aria-expanded") === "true" || optionNodes(resolveInput()).length > 0, 900, 25);
    };
    const close = async () => {
      const live = resolveInput();
      if (!live || live.getAttribute("aria-expanded") !== "true") return true;
      try { live.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); } catch (error) { debug("Best-effort Depop DOM operation skipped", error); }
      return dom.waitUntil(() => resolveInput()?.getAttribute("aria-expanded") !== "true", 450, 25);
    };
    const options = async () => dom.unique(optionNodes(resolveInput()).map(displayOption));
    const isSelected = async value => {
      const wanted = dom.clean(value, 180);
      if (!wanted) return false;
      const live = resolveInput();
      const comparable = isCategory ? leafValue(wanted) : wanted;
      if (!isMulti && dom.same(live?.value || "", comparable)) return true;
      return currentSelected(live, resolveContainer()).some(valueNow => dom.same(valueNow, comparable));
    };
    const selectExact = async value => {
      const wanted = dom.clean(value, 180);
      lastSelectionResult = {};
      if (!wanted || await isSelected(wanted)) { lastSelectionResult = { kind: "exact", retryable: false }; return true; }
      let live = resolveInput();
      if (!await open()) { lastSelectionResult = { code: "menu_open_failed", retryable: true }; return false; }
      let nodes = optionNodes(live);
      let hit = nodes.find(node => dom.same(displayOption(node), wanted));
      if (!hit) {
        dom.nativeSet(live, isCategory ? leafValue(wanted) : wanted, { blur: false });
        try { live.focus?.(); } catch (error) { debug("Best-effort Depop DOM operation skipped", error); }
        await dom.waitUntil(() => optionNodes(resolveInput()).some(node => dom.same(isCategory ? leafValue(displayOption(node)) : displayOption(node), isCategory ? leafValue(wanted) : wanted)), 900, 30);
        live = resolveInput();
        nodes = optionNodes(live);
        hit = nodes.find(node => isCategory ? dom.same(displayOption(node), wanted) : dom.same(displayOption(node), wanted));
        if (!hit && isCategory) {
          const leafHits = nodes.filter(node => dom.same(leafValue(displayOption(node)), leafValue(wanted)));
          if (leafHits.length === 1) hit = leafHits[0];
        }
      }
      if (!hit) { lastSelectionResult = { code: "exact_option_not_found", retryable: false }; return false; }
      dom.safeClick(hit);
      const confirmed = await dom.waitUntil(() => isSelected(wanted), 900, 25);
      lastSelectionResult = confirmed ? { kind: "exact", retryable: false } : { code: "value_not_confirmed", retryable: true };
      return confirmed;
    };

    return {
      platform: PLATFORM,
      label, name: label, type: isMulti ? "multi" : "dropdown", order, maxValues, control: resolveInput(),
      required: input.getAttribute("aria-required") === "true" || /\brequired\b/i.test(dom.clean(labelNode?.parentElement?.textContent || "")),
      customValueAllowed: false,
      centerForFill: async () => { try { resolveInput()?.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch (error) { debug("Best-effort Depop DOM operation skipped", error); } return true; },
      refresh, read, readValues, open, close, options, isSelected, selectExact,
      selectionOutcome: () => lastSelectionResult,
      get lastSelectionResult() { return lastSelectionResult; }
    };
  }

  async function collectFieldMap() {
    const form = root();
    const map = new Map();
    if (!form) return map;
    const inputs = Array.from(form.querySelectorAll('input[role="combobox"]')).filter(input => input.id && labelFor(input));
    inputs.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1));
    for (let index = 0; index < inputs.length; index += 1) {
      const rec = makeComboboxRecord(inputs[index], index);
      if (!rec) continue;
      const k = dom.key(rec.label);
      if (!map.has(k)) map.set(k, rec);
    }
    return map;
  }

  async function collectListing({ requirePhotos = false, photoLimit = 8 } = {}) {
    if (!supported()) return { ok: false, message: "Open Depop Sell now / List an item first.", photos: [], routeQuestions: [], fields: [] };
    const fieldMap = await collectFieldMap();
    const fields = [];
    const fieldSummary = {};
    for (const rec of fieldMap.values()) {
      const options = await rec.options().catch(() => []);
      const currentValue = await rec.read().catch(() => "");
      fieldSummary[rec.label] = currentValue;
      fields.push({ name: rec.label, label: rec.label, type: rec.type, currentValue, options, required: rec.required === true, customValueAllowed: rec.customValueAllowed === true, maxValues: rec.maxValues, maxPromptOptions: dom.key(rec.label) === "category" ? 420 : 120 });
    }
    const questions = fields.filter(field => global.EbayAiItemSpecificsV7100?.automaticDecision?.(field)?.allow !== false).map(field => field.name);
    const photos = await dom.collectPhotos({ fileInput: document.getElementById("upload-input__input"), root: root(), platform: PLATFORM, max: Math.max(1, Math.min(Number(photoLimit || 8), 8)) });
    const category = fieldSummary.Category || "";
    const result = {
      ok: !requirePhotos || photos.length > 0,
      message: (!requirePhotos || photos.length) ? `Depop listing ready: ${photos.length} photo(s), ${questions.length} fillable field(s).` : "Transfer product photos to Depop first, then press Fill All.",
      platform: PLATFORM, platformLabel: "Depop", photos, routeQuestions: questions, fields, fieldMap,
      pageContext: { platform: PLATFORM, platformLabel: "Depop", url: location.href, pageTitle: document.title, category, currentTitle: "", fieldSummary, fields }
    };
    return result;
  }

  function fieldSignature() {
    const form = root();
    if (!form) return "";
    return Array.from(form.querySelectorAll('label[for]')).map(label => `${dom.key(label.textContent)}:${label.getAttribute("for")}`).join("|");
  }
  async function closeOpenMenus() {
    for (const input of Array.from(root()?.querySelectorAll?.('input[role="combobox"][aria-expanded="true"]') || [])) {
      try { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); } catch (error) { debug("Best-effort Depop DOM operation skipped", error); }
    }
    return { ok: true };
  }
  async function waitForDynamicFields(before) { return dom.waitForSignatureChange(fieldSignature, before, 1900); }

  registry.register(PLATFORM, Object.freeze({ version: "8.23.21", platform: PLATFORM, supported, collectFieldMap, collectListing, fieldSignature, waitForDynamicFields, closeOpenMenus }));
})(globalThis);
