/* Marketplace platform detection and reusable DOM helpers — V8.23.21. */
(function initMarketplaceCommonV8200(global) {
  "use strict";

  const VERSION = "8.23.21";
  const PLATFORM = Object.freeze({ EBAY: "ebay", DEPOP: "depop", POSHMARK: "poshmark", VINTED: "vinted", CHATGPT: "chatgpt", UNKNOWN: "unknown" });

  function debug(message, error) {
    try { global.EbayLogger?.debug?.(message, { message: error?.message || String(error || "") }); }
    catch (loggerError) { console.debug(`[Marketplace V8.23.21] ${message}`, loggerError?.message || loggerError); }
  }

  function clean(value, limit = 500) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }
  function key(value) { return clean(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function same(a, b) { return key(a) === key(b); }
  function visible(element) {
    if (!element || element.isConnected === false) return false;
    try {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    } catch (_) { return false; }
  }
  function detect(value = global.location?.href || "") {
    try {
      const host = new URL(String(value || "")).hostname.toLowerCase().replace(/\.$/, "");
      if (["ebay.com", "ebay.ca", "ebay.co.uk"].some(domain => host === domain || host.endsWith(`.${domain}`))) return PLATFORM.EBAY;
      if (host === "chatgpt.com" || host === "chat.openai.com") return PLATFORM.CHATGPT;
      if (host === "depop.com" || host.endsWith(".depop.com")) return PLATFORM.DEPOP;
      if (host === "poshmark.com" || host.endsWith(".poshmark.com")) return PLATFORM.POSHMARK;
      if (host === "vinted.com" || host.endsWith(".vinted.com")) return PLATFORM.VINTED;
    } catch (error) { debug("Best-effort marketplace DOM operation skipped", error); }
    return PLATFORM.UNKNOWN;
  }
  function label(platform = detect()) {
    return platform === PLATFORM.CHATGPT ? "ChatGPT" : platform === PLATFORM.DEPOP ? "Depop" : platform === PLATFORM.POSHMARK ? "Poshmark" : platform === PLATFORM.VINTED ? "Vinted" : platform === PLATFORM.EBAY ? "eBay" : "Marketplace";
  }
  function isSupportedUrl(value) { return detect(value) !== PLATFORM.UNKNOWN; }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  async function waitUntil(check, timeoutMs = 900, intervalMs = 30) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    do {
      try { if (await check()) return true; } catch (error) { debug("Best-effort marketplace DOM operation skipped", error); }
      if (Date.now() >= deadline) return false;
      await sleep(intervalMs);
    } while (true);
  }
  async function nextFrame() { await new Promise(resolve => requestAnimationFrame(() => resolve())); }
  function safeClick(element) {
    if (!element || element.isConnected === false) return false;
    try {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "mouse" }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
      element.click();
      return true;
    } catch (_) {
      try { element.click(); return true; } catch (_) { return false; }
    }
  }
  function nativeSet(element, value, { blur = true } = {}) {
    if (!element) return false;
    const text = String(value ?? "");
    try {
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(element, text); else element.value = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      if (blur) element.dispatchEvent(new FocusEvent("blur", { bubbles: false, composed: true }));
      return true;
    } catch (_) {
      try { element.value = text; element.dispatchEvent(new Event("input", { bubbles: true })); return true; } catch (_) { return false; }
    }
  }
  function optionText(element) { return clean(element?.getAttribute?.("aria-label") || element?.textContent || element?.value || "", 180); }
  function unique(values = []) {
    const out = [];
    for (const value of values.map(item => clean(item, 180)).filter(Boolean)) if (!out.some(item => same(item, value))) out.push(value);
    return out;
  }
  function readSelectedOptions(root) {
    if (!root) return [];
    const nodes = root.querySelectorAll?.("[role='option'][aria-selected='true'],[role='menuitemcheckbox'][aria-checked='true'],[aria-pressed='true']") || [];
    return unique(Array.from(nodes).map(optionText));
  }
  async function fileToDataUrl(file) {
    if (!(file instanceof Blob)) return "";
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }
  async function blobUrlToDataUrl(url) {
    if (!/^blob:/i.test(String(url || ""))) return "";
    try { return await fileToDataUrl(await (await fetch(url)).blob()); } catch (_) { return ""; }
  }
  async function collectPhotos({ fileInput = null, root = null, platform = detect(), max = 16 } = {}) {
    const photos = [];
    const seen = new Set();
    const add = image => {
      const source = clean(image?.dataUrl || image?.url || image?.src || "", 10000000);
      if (!source) return;
      const identity = /^data:/i.test(source) ? `${source.length}:${source.slice(0, 80)}:${source.slice(-80)}` : source.replace(/#.*$/, "");
      if (seen.has(identity)) return;
      seen.add(identity);
      photos.push({
        ...image,
        kind: image?.kind || "marketplace",
        marketplaceSource: platform,
        trustedMarketplacePhoto: true,
        url: image?.url || (!image?.dataUrl ? source : ""),
        src: image?.src || (!image?.dataUrl ? source : ""),
        dataUrl: image?.dataUrl || ""
      });
    };

    const files = Array.from(fileInput?.files || []).filter(file => /^image\//i.test(file.type || ""));
    for (let index = 0; index < files.length && photos.length < max; index += 1) {
      const dataUrl = await fileToDataUrl(files[index]);
      if (dataUrl) add({ dataUrl, name: files[index].name || `photo-${index + 1}.jpg`, role: index === 0 ? "front overview" : "detail" });
    }

    for (const img of Array.from(root?.querySelectorAll?.("img") || [])) {
      if (photos.length >= max) break;
      const source = clean(img.currentSrc || img.src || "", 10000000);
      if (!source || /avatar|logo|barcode|icon/i.test(`${img.alt || ""} ${img.className || ""}`)) continue;
      let dataUrl = "";
      if (/^blob:/i.test(source)) dataUrl = await blobUrlToDataUrl(source);
      add({ dataUrl, url: dataUrl ? "" : source, src: dataUrl ? "" : source, alt: clean(img.alt || "", 160), role: photos.length === 0 ? "front overview" : "detail" });
    }
    return photos.slice(0, max).map((photo, index) => ({ ...photo, originalIndex: index, name: photo.name || `${platform}-photo-${index + 1}.jpg` }));
  }

  async function waitForSignatureChange(signatureFn, before, timeoutMs = 1800) {
    const initial = String(before ?? signatureFn?.() ?? "");
    if (String(signatureFn?.() ?? "") !== initial) return true;
    return new Promise(resolve => {
      let done = false;
      let observer = null;
      let timer = null;
      const finish = value => {
        if (done) return;
        done = true;
        try { observer?.disconnect?.(); } catch (error) { debug("Best-effort marketplace DOM operation skipped", error); }
        if (timer) clearTimeout(timer);
        resolve(Boolean(value));
      };
      observer = new MutationObserver(() => {
        try { if (String(signatureFn?.() ?? "") !== initial) finish(true); } catch (error) { debug("Best-effort marketplace DOM operation skipped", error); }
      });
      try { observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true }); }
      catch (_) { finish(false); return; }
      timer = setTimeout(() => finish(false), Math.max(250, Number(timeoutMs) || 1800));
    });
  }

  const adapterRegistry = new Map();
  const adapters = Object.freeze({
    register(platform, adapter) {
      const name = String(platform || "").toLowerCase();
      if (!name || !adapter || typeof adapter.collectFieldMap !== "function") return false;
      adapterRegistry.set(name, adapter);
      return true;
    },
    get(platform = detect()) { return adapterRegistry.get(String(platform || "").toLowerCase()) || null; },
    current() { return this.get(detect()); },
    list() { return Array.from(adapterRegistry.keys()); }
  });

  global.MarketplacePlatformV8200 = Object.freeze({ VERSION, PLATFORM, detect, label, isSupportedUrl });
  global.MarketplaceDomV8200 = Object.freeze({ clean, key, same, unique, visible, sleep, waitUntil, nextFrame, safeClick, nativeSet, optionText, readSelectedOptions, collectPhotos, waitForSignatureChange });
  global.MarketplaceAdaptersV8200 = adapters;
})(globalThis);
