/* Cross-marketplace photo transfer — V8.23.21.
   Uses eBay's own photo selection, one Drag handle, an extension transfer session,
   an early destination receiver, native file-input upload, and real DOM verification. */
(function initMarketplacePhotoTransferV8220(global) {
  "use strict";

  const VERSION = "8.23.21";
  const PREFIX = "MARKETPLACE_AI_PHOTOS_V1:";
  const MIME = "application/x-marketplace-ai-photos";
  const SOURCE_ID = "marketplace-ai-photo-drag-source-v8220";
  const LEGACY_SOURCE_ID = "marketplace-ai-photo-drag-source-v8210";
  const TOAST_ID = "marketplace-ai-photo-transfer-toast-v8220";
  const DROP_OVERLAY_ID = "marketplace-ai-photo-drop-overlay-v8220";
  const TARGET_LIMITS = Object.freeze({ depop: 8, poshmark: 16, vinted: 20, chatgpt: 10 });
  const MAX_SOURCE_PHOTOS = 25;
  const DESTINATION_READY_TIMEOUT_MS = 20000;
  const platformApi = global.MarketplacePlatformV8200;

  function clean(value, limit = 4000) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function currentPlatform() { return platformApi?.detect?.() || "unknown"; }
  function platformLabel(platform = currentPlatform()) { return platform === "chatgpt" ? "ChatGPT" : platform === "depop" ? "Depop" : platform === "poshmark" ? "Poshmark" : platform === "vinted" ? "Vinted" : platform === "ebay" ? "eBay" : "Marketplace"; }

  function showToast(message, { error = false, timeoutMs = 6000 } = {}) {
    return global.EbayUI?.photoTransfer?.notice?.(clean(message, 800), { error, timeoutMs, id: TOAST_ID });
  }

  function showDropOverlay(text) {
    return global.EbayUI?.photoTransfer?.dropOverlay?.(clean(text || "Drop photos here", 300), { id: DROP_OVERLAY_ID });
  }

  function hideDropOverlay() {
    return global.EbayUI?.photoTransfer?.hideDropOverlay?.(DROP_OVERLAY_ID);
  }

  function friendlyRuntimeMessage(value) {
    const message = clean(value || "", 500);
    if (/extension context invalidated|context invalidated/i.test(message)) return "Extension was updated. Refresh this marketplace page once, then drag again.";
    if (/receiving end does not exist|could not establish connection/i.test(message)) return "The extension page connection is not ready. Refresh this marketplace page once, then drag again.";
    return message || "No extension response.";
  }

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime.lastError?.message || "";
          resolve(error ? { ok: false, message: friendlyRuntimeMessage(error) } : (response || { ok: false, message: "No extension response." }));
        });
      } catch (error) {
        resolve({ ok: false, message: friendlyRuntimeMessage(error?.message || String(error)) });
      }
    });
  }

  function sourceSelection() {
    const collector = global.EbayPhotoCollectorV8220;
    if (!collector?.selection) return { mode: "all", selectedCount: 0, photos: [], complete: false, allCount: 0 };
    return collector.selection(MAX_SOURCE_PHOTOS);
  }

  function sourcePhotos() { return sourceSelection().photos || []; }
  function expectedSourcePhotoCount() { return global.EbayPhotoCollectorV8220?.expectedPhotoCount?.() || sourcePhotos().length; }

  function buildPayload(photos, selection = {}) {
    return {
      kind: "marketplace_ai_photo_transfer",
      version: 2,
      transferId: global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      source: "ebay",
      selectionMode: selection.mode || "all",
      selectedCount: Number(selection.selectedCount || 0),
      photos: photos.map((photo, index) => ({ url: photo.url || photo.src, name: photo.name || `ebay-photo-${index + 1}.jpg`, index, photoId: photo.photoId || "" }))
    };
  }

  function encodePayload(payload) { return `${PREFIX}${JSON.stringify(payload)}`; }

  function parsePayload(value) {
    const text = String(value || "");
    if (!text.startsWith(PREFIX)) return null;
    try {
      const parsed = JSON.parse(text.slice(PREFIX.length));
      if (parsed?.kind !== "marketplace_ai_photo_transfer" || parsed?.source !== "ebay" || !Array.isArray(parsed?.photos)) return null;
      const photos = parsed.photos.slice(0, MAX_SOURCE_PHOTOS).map((photo, index) => ({
        url: clean(photo?.url || "", 5000),
        name: clean(photo?.name || `ebay-photo-${index + 1}.jpg`, 160),
        index: Number.isFinite(Number(photo?.index)) ? Number(photo.index) : index,
        photoId: clean(photo?.photoId || "", 220)
      })).filter(photo => /^https:\/\/i\.ebayimg\.com\//i.test(photo.url));
      if (!photos.length) return null;
      return { ...parsed, photos };
    } catch (error) {
      console.debug("[Photo Transfer V8.23.21] Payload parse skipped", error?.message || error);
      return null;
    }
  }

  function refreshSourceLabel(source) {
    const selection = sourceSelection();
    const photos = selection.photos || [];
    const selected = selection.mode === "selected";
    const expected = expectedSourcePhotoCount();
    source.dataset.photoCount = String(photos.length);
    source.dataset.selectedCount = String(selection.selectedCount || 0);
    source.dataset.selectionMode = selection.mode || "all";
    source.dataset.expectedPhotoCount = String(expected || selection.allCount || photos.length);

    if (selected) {
      const incomplete = !selection.complete;
      source.textContent = incomplete
        ? `↗ Drag ${photos.length}/${selection.selectedCount} selected`
        : `↗ Drag ${photos.length} selected photo${photos.length === 1 ? "" : "s"}`;
      source.title = incomplete
        ? `eBay says ${selection.selectedCount} photo(s) are selected, but only ${photos.length} selected photo(s) could be identified. Re-click the selected photos before dragging.`
        : `Drag only the ${photos.length} photo(s) selected with eBay's own Select tool.`;
      source.style.opacity = selection.complete ? "1" : ".7";
      return selection;
    }

    const incompleteAll = expected > photos.length;
    source.textContent = photos.length
      ? `↗ Drag ${incompleteAll ? `${photos.length}/${expected}` : photos.length} photo${(incompleteAll ? expected : photos.length) === 1 ? "" : "s"}`
      : "↗ Drag photos";
    source.title = incompleteAll
      ? `Detected ${photos.length} of ${expected} eBay photos. Wait for the gallery to finish loading and try again.`
      : photos.length
        ? "Nothing is selected in eBay, so Drag transfers all detected listing photos."
        : "No eBay listing photos detected yet.";
    source.style.opacity = photos.length ? "1" : ".65";
    return selection;
  }

  function setActiveSession(payload) {
    runtimeMessage({ type: "MARKETPLACE_PHOTO_SESSION_SET_V8220", payload }).then(response => {
      if (!response?.ok) console.debug("[Photo Transfer V8.23.21] Session cache unavailable", response?.message || response);
    });
  }

  function mountSourceHandle() {
    if (currentPlatform() !== "ebay") return null;
    const listingEditor = /\/lstng(?:\/|$)/i.test(location.pathname) || /(?:^|[?&])draftid=/i.test(location.search) || Boolean(global.EbayPageFieldsV810?.draftIdFromUrl?.());
    if (!listingEditor) return null;
    document.getElementById(LEGACY_SOURCE_ID)?.remove?.();
    if (document.getElementById(SOURCE_ID)) return document.getElementById(SOURCE_ID);

    const source = global.EbayUI?.photoTransfer?.source?.({ id: SOURCE_ID, label: "↗ Drag photos", title: "Drag selected eBay photos to Depop, Poshmark, Vinted, or ChatGPT" });
    if (!source) return null;
    source.setAttribute("role", "button");
    source.setAttribute("aria-label", "Drag selected eBay photos to Depop, Poshmark, Vinted, or ChatGPT");

    source.addEventListener("pointerenter", () => refreshSourceLabel(source), { passive: true });
    document.addEventListener("EBAY_PHOTO_SELECTION_CHANGED_V8220", () => refreshSourceLabel(source));
    source.addEventListener("dragstart", event => {
      const selection = refreshSourceLabel(source);
      const photos = selection.photos || [];
      if (!photos.length || !event.dataTransfer) {
        event.preventDefault();
        showToast(selection.mode === "selected" ? "The selected eBay photos could not be identified yet. Click them once more and retry." : "No eBay listing photos were detected on this page.", { error: true });
        return;
      }
      if (selection.mode === "selected" && !selection.complete) {
        event.preventDefault();
        showToast(`eBay shows ${selection.selectedCount} selected, but only ${photos.length} selected photo(s) were identified. Re-click the selection and try again.`, { error: true, timeoutMs: 9000 });
        return;
      }
      if (selection.mode === "all" && !selection.complete) {
        event.preventDefault();
        showToast(`Only ${photos.length}/${expectedSourcePhotoCount()} eBay photos are ready. Wait for the thumbnails to load and drag again.`, { error: true });
        return;
      }
      const payload = buildPayload(photos, selection);
      const encoded = encodePayload(payload);
      setActiveSession(payload);
      try { event.dataTransfer.effectAllowed = "copy"; }
      catch (error) { console.debug("[Photo Transfer V8.23.21] effectAllowed skipped", error?.message || error); }
      try { event.dataTransfer.setData(MIME, encoded); }
      catch (error) { console.debug("[Photo Transfer V8.23.21] custom DataTransfer type skipped", error?.message || error); }
      event.dataTransfer.setData("text/plain", encoded);
      source.style.cursor = "grabbing";
      showToast(`Drag ${photos.length} ${selection.mode === "selected" ? "selected " : ""}eBay photo${photos.length === 1 ? "" : "s"} to Depop, Poshmark, Vinted, or ChatGPT.`, { timeoutMs: 3500 });
    });
    source.addEventListener("dragend", () => { source.style.cursor = "grab"; });
    // Keep the label current when eBay loads, adds, removes, or replaces tiles.
    // Ignore our own UI mutations so the observer cannot trigger itself forever.
    let refreshTimer = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (source.isConnected) refreshSourceLabel(source);
      }, 120);
    };
    const galleryObserver = new MutationObserver(records => {
      if (records.some(record => {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return !node?.closest?.('[id^="marketplace-ai-"],[id^="ebay-ai-"]');
      })) scheduleRefresh();
    });
    galleryObserver.observe(document.body || document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ["src", "srcset", "style", "data-src", "data-image-url", "data-photo-url", "aria-label"]
    });
    document.addEventListener("load", event => {
      if (event.target?.tagName === "IMG") scheduleRefresh();
    }, true);
    refreshSourceLabel(source);
    return source;
  }


  function findSectionByHeading(text) {
    const wanted = clean(text, 80).toLowerCase();
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']"));
    const heading = headings.find(node => clean(node.textContent, 120).toLowerCase() === wanted);
    if (!heading) return null;
    let node = heading;
    for (let depth = 0; depth < 7 && node; depth += 1, node = node.parentElement) {
      if (node.querySelector?.('input[type="file"]')) return node;
    }
    return heading.parentElement;
  }

  function vintedListingRoot() {
    const path = String(location.pathname || "");
    const main = document.querySelector("main") || document.body || document.documentElement;
    if (/\/items\/new(?:\/|$)/i.test(path)) return main;
    const candidates = Array.from(document.querySelectorAll('form,main,[role="main"]')).filter(node => {
      if (!node?.querySelector?.('input[type="file"]')) return false;
      const text = clean(node.textContent || "", 5000).toLowerCase();
      const hasPrice = Boolean(node.querySelector('input[name*="price" i],input[id*="price" i],input[inputmode="decimal"],input[inputmode="numeric"]')) || /\bprice\b/.test(text);
      const hasListingControls = Boolean(node.querySelector('[name*="category" i],[id*="category" i],[name*="brand" i],[id*="brand" i],[name*="condition" i],[id*="condition" i]'));
      const hasListingLanguage = hasListingControls || ["category", "condition", "brand", "size", "item details", "sell"].some(token => text.includes(token));
      return hasPrice && hasListingLanguage;
    });
    return candidates[0] || (/\/items\/(?:new|edit)(?:\/|$)/i.test(path) ? main : null);
  }

  function vintedPhotoInput() {
    const root = vintedListingRoot();
    if (!root) return null;
    const inputs = Array.from(root.querySelectorAll('input[type="file"]')).filter(input => input.isConnected && !input.disabled);
    if (!inputs.length) return null;
    const score = input => {
      const accept = clean(input.getAttribute("accept") || "", 300).toLowerCase();
      const attrs = clean(`${input.id || ""} ${input.name || ""} ${input.className || ""} ${input.getAttribute("data-testid") || ""} ${input.getAttribute("aria-label") || ""}`, 900).toLowerCase();
      let points = 0;
      if (input.multiple) points += 8;
      if (accept.includes("image")) points += 7;
      if (/photo|image|upload|picture/.test(attrs)) points += 5;
      if (/avatar|profile|message|chat/.test(attrs)) points -= 12;
      return points;
    };
    return inputs.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function vintedPhotoZone(input) {
    if (!input) return null;
    for (const selector of [
      '[data-testid*="photo" i]', '[data-testid*="image" i]', '[data-testid*="upload" i]',
      '[class*="photo" i]', '[class*="image" i]', '[class*="upload" i]', 'section', 'fieldset'
    ]) {
      try {
        const hit = input.closest(selector);
        if (hit && hit.isConnected) return hit;
      } catch (error) { console.debug("[Photo Transfer V8.23.21] Vinted photo-zone selector skipped", error?.message || error); }
    }
    let node = input.parentElement;
    let fallback = node;
    for (let depth = 0; depth < 6 && node; depth += 1, node = node.parentElement) {
      fallback = node;
      const text = clean(node.textContent || "", 1400).toLowerCase();
      if (/photo|image|upload|picture/.test(text) && !/avatar|profile photo/.test(text)) return node;
    }
    return fallback || vintedListingRoot();
  }

  // Scope previews to the active composer: old conversation images are not attachments.
  function chatgptControls() {
    const editor = document.querySelector('#prompt-textarea');
    const zone = editor?.closest('form') || editor?.closest('[data-type="unified-composer"]') || editor?.closest('[data-testid="composer"]');
    if (!editor || !zone) return { input: null, zone: null, limit: TARGET_LIMITS.chatgpt };
    const candidates = Array.from(document.querySelectorAll('input[type="file"]')).filter(input => {
      const accept = (input.accept || "").toLowerCase();
      return !input.disabled && !input.closest('[role="dialog"]') &&
        (accept.includes('image') || /\.(png|jpe?g|webp)/.test(accept));
    });
    const input = candidates.find(input => zone.contains(input)) || candidates.find(input => input.multiple);
    // Paste is supported by the composer even when the attachment menu has not mounted its input.
    return { input: input || editor, zone, limit: TARGET_LIMITS.chatgpt };
  }

  function destinationControls(platform = currentPlatform()) {
    if (platform === "chatgpt") return chatgptControls();
    if (platform === "depop") {
      const input = document.querySelector('form[aria-label="List an item"] input[type="file"][multiple]#upload-input__input')
        || document.querySelector('form[aria-label="List an item"] input[type="file"][multiple][accept*="image"]');
      const zone = findSectionByHeading("Photos") || input?.closest?.('[data-testid="upload-input"]')?.parentElement || input?.parentElement || null;
      return { input, zone, limit: TARGET_LIMITS.depop };
    }
    if (platform === "poshmark") {
      const input = document.getElementById("img-file-input") || document.querySelector('#imagePlaceholder input[type="file"][multiple]');
      const zone = document.getElementById("imagePlaceholder") || findSectionByHeading("Photos & Video") || input?.parentElement || null;
      return { input, zone, limit: TARGET_LIMITS.poshmark };
    }
    if (platform === "vinted") {
      const input = vintedPhotoInput();
      const zone = findSectionByHeading("Photos") || findSectionByHeading("Add photos") || vintedPhotoZone(input);
      return { input, zone, limit: TARGET_LIMITS.vinted };
    }
    return { input: null, zone: null, limit: 0 };
  }

  function destinationReadyState(platform = currentPlatform()) {
    const controls = destinationControls(platform);
    const input = controls.input;
    const zone = controls.zone;
    if (!input || !controls.limit || !input.isConnected || input.disabled) return { ...controls, ready: false, reason: "photo_input_missing" };
    if (!zone || !zone.isConnected) return { ...controls, ready: false, reason: "photo_zone_missing" };
    return { ...controls, ready: true, reason: "ready" };
  }

  async function waitForDestinationControls(platform, timeoutMs = DESTINATION_READY_TIMEOUT_MS) {
    const first = destinationReadyState(platform);
    if (first.ready) return first;
    showToast(`Waiting for ${platformLabel(platform)} photo uploader…`, { timeoutMs: 0 });
    return new Promise(resolve => {
      let done = false;
      let observer = null;
      let timer = null;
      const finish = value => {
        if (done) return;
        done = true;
        try { observer?.disconnect?.(); }
        catch (error) { console.debug("[Photo Transfer V8.23.21] Destination observer cleanup skipped", error?.message || error); }
        if (timer) clearTimeout(timer);
        resolve(value);
      };
      const check = () => {
        const state = destinationReadyState(platform);
        if (state.ready) finish(state);
      };
      observer = new MutationObserver(check);
      try {
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch (error) {
        finish({ input: null, zone: null, limit: 0, ready: false, error: error?.message || String(error) });
        return;
      }
      timer = setTimeout(() => finish(destinationReadyState(platform)), Math.max(2500, Number(timeoutMs) || DESTINATION_READY_TIMEOUT_MS));
      check();
    });
  }

  function photoNodeLooksReal(node, value = "") {
    const src = clean(value || "", 5000);
    if (!src) return false;
    const context = `${node?.alt || ""} ${node?.className || ""} ${src}`;
    if (/barcode|logo|avatar|icon|sprite|cloud-white|placeholder/i.test(context)) return false;
    if (/^data:image\/svg/i.test(src)) return false;
    try {
      const rect = node?.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0 && rect.width < 20 && rect.height < 20) return false;
    } catch (error) { console.debug("[Photo Transfer V8.23.21] Destination photo rectangle skipped", error?.message || error); }
    return true;
  }

  function destinationPhotoNodes(platform = currentPlatform()) {
    const { zone } = destinationControls(platform);
    if (!zone) return [];

    // Count DOM photo nodes, not unique URLs. Two intentionally identical photos
    // are still two marketplace slots and must count as two confirmed uploads.
    const images = [];
    for (const img of Array.from(zone.querySelectorAll("img")).slice(0, 100)) {
      if (img.closest?.('[data-test="modal-container"],[role="dialog"],.modal')) continue;
      const src = img.currentSrc || img.src || "";
      if (photoNodeLooksReal(img, src)) images.push(img);
    }
    if (images.length) return images;

    const backgrounds = [];
    for (const node of Array.from(zone.querySelectorAll("[style]")).slice(0, 220)) {
      if (node.closest?.('[data-test="modal-container"],[role="dialog"],.modal')) continue;
      try {
        const style = getComputedStyle(node).backgroundImage || node.getAttribute("style") || "";
        const match = String(style).match(/url\(["']?([^"')]+)["']?\)/i);
        if (match && photoNodeLooksReal(node, match[1])) backgrounds.push(node);
      } catch (error) { console.debug("[Photo Transfer V8.23.21] Destination background photo scan skipped", error?.message || error); }
    }
    return backgrounds;
  }

  function photoImageCount(platform = currentPlatform()) {
    return destinationPhotoNodes(platform).length;
  }

  function elementVisible(node) {
    if (!node || node.isConnected === false) return false;
    try {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return false;
      const rect = node.getBoundingClientRect?.();
      return !rect || rect.width > 0 || rect.height > 0;
    } catch (_) { return true; }
  }

  function exactButton(root, wanted) {
    const key = clean(wanted, 80).toLowerCase();
    return Array.from(root?.querySelectorAll?.("button") || []).find(button => elementVisible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" && clean(button.textContent, 120).toLowerCase() === key) || null;
  }

  function poshmarkCovershotModal() {
    if (currentPlatform() !== "poshmark") return null;
    const roots = Array.from(document.querySelectorAll('[data-test="modal-container"],[role="dialog"],.modal')).slice(0, 40);
    for (const root of roots) {
      if (!elementVisible(root)) continue;
      const text = clean(root.textContent, 4000).toLowerCase();
      if (!text.includes("select a covershot") && !/\bcovershot\b/.test(text)) continue;
      const apply = exactButton(root, "Apply");
      if (apply) return { root, apply };
    }
    return null;
  }

  function createPoshmarkCovershotGuard() {
    if (currentPlatform() !== "poshmark") return null;
    const state = { seen: false, applied: false, closed: false };
    const waiters = new Set();
    let observer = null;
    let stopped = false;

    const notify = () => {
      for (const fn of Array.from(waiters)) {
        try { fn(); } catch (error) { console.debug("[Photo Transfer V8.23.21] Covershot waiter notification skipped", error?.message || error); }
      }
    };

    const check = () => {
      if (stopped) return;
      const modal = poshmarkCovershotModal();
      if (modal) {
        state.seen = true;
        state.closed = false;
        if (!state.applied) {
          state.applied = true;
          showToast("Confirming Poshmark covershot…", { timeoutMs: 0 });
          try { modal.apply.click(); }
          catch (error) { console.debug("[Photo Transfer V8.23.21] Poshmark covershot Apply failed", error?.message || error); }
        }
      } else if (state.seen && state.applied) {
        state.closed = true;
      }
      notify();
    };

    try {
      observer = new MutationObserver(check);
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "disabled", "aria-disabled"] });
    } catch (error) { console.debug("[Photo Transfer V8.23.21] Poshmark covershot observer unavailable", error?.message || error); }
    check();

    return {
      state,
      check,
      async waitForSettled(timeoutMs = 1400) {
        check();
        if (state.seen && state.closed) return { ...state };
        return new Promise(resolve => {
          let timer = null;
          const finish = () => {
            if (timer) clearTimeout(timer);
            waiters.delete(onChange);
            resolve({ ...state });
          };
          const onChange = () => {
            if (state.seen && state.closed) finish();
          };
          waiters.add(onChange);
          timer = setTimeout(finish, Math.max(300, Number(timeoutMs) || 1400));
          onChange();
        });
      },
      stop() {
        stopped = true;
        try { observer?.disconnect?.(); } catch (error) { console.debug("[Photo Transfer V8.23.21] Observer cleanup skipped", error?.message || error); }
        waiters.clear();
      }
    };
  }

  function base64ToBlob(base64, mime) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: clean(mime || "image/jpeg", 120) || "image/jpeg" });
  }

  async function convertToAcceptedImage(blob) {
    if (/^image\/(?:jpeg|png)$/i.test(blob?.type || "")) return blob;
    if (!(blob instanceof Blob) || !blob.size) return null;
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { alpha: false });
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.94));
    } catch (error) {
      console.debug("[Photo Transfer V8.23.21] Image conversion skipped", error?.message || error);
      return null;
    }
  }

  function extensionForMime(mime) { return /png/i.test(String(mime || "")) ? "png" : "jpg"; }

  async function fetchPhotoFile(photo, index) {
    const response = await runtimeMessage({ type: "MARKETPLACE_PHOTO_FETCH_V8210", payload: { url: photo.url } });
    if (!response?.ok || !response?.base64) throw new Error(response?.message || `Photo ${index + 1} could not be fetched.`);
    let blob = base64ToBlob(response.base64, response.mime || "image/jpeg");
    blob = await convertToAcceptedImage(blob);
    if (!blob?.size) throw new Error(`Photo ${index + 1} is not a supported JPEG/PNG image.`);
    const extension = extensionForMime(blob.type);
    const baseName = clean(photo.name || `ebay-photo-${index + 1}.${extension}`, 120).replace(/\.[a-z0-9]{2,5}$/i, "");
    return new File([blob], `${baseName}.${extension}`, { type: blob.type || "image/jpeg", lastModified: Date.now() });
  }

  async function fetchFiles(photos) {
    const files = new Array(photos.length);
    let nextIndex = 0;
    let completed = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= photos.length) return;
        files[index] = await fetchPhotoFile(photos[index], index);
        completed += 1;
        showToast(`Preparing photos ${completed}/${photos.length}…`, { timeoutMs: 0 });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, photos.length) }, () => worker()));
    return files.filter(Boolean);
  }

  function dataTransferForFiles(files) {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    return transfer;
  }

  function setInputFiles(input, files) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || !files.length || input.disabled) return false;
    const transfer = dataTransferForFiles(files);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
      if (descriptor?.set) descriptor.set.call(input, transfer.files);
      else input.files = transfer.files;
    } catch (error) {
      try { input.files = transfer.files; }
      catch (fallbackError) {
        console.debug("[Photo Transfer V8.23.21] File input setter failed", fallbackError?.message || fallbackError);
        return false;
      }
    }
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }

  async function waitForPhotoCount(platform, targetCount, timeoutMs = 10000) {
    const initial = photoImageCount(platform);
    if (initial >= targetCount) return { complete: true, count: initial };
    const { zone } = destinationControls(platform);
    if (!zone) return { complete: false, count: initial };
    return new Promise(resolve => {
      let done = false;
      let observer = null;
      let timer = null;
      let best = initial;
      const finish = (complete, count) => {
        if (done) return;
        done = true;
        try { observer?.disconnect?.(); }
        catch (error) { console.debug("[Photo Transfer V8.23.21] Upload observer cleanup skipped", error?.message || error); }
        if (timer) clearTimeout(timer);
        resolve({ complete, count });
      };
      const check = () => {
        const count = photoImageCount(platform);
        best = Math.max(best, count);
        if (count >= targetCount) finish(true, count);
      };
      observer = new MutationObserver(check);
      try { observer.observe(zone, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style"] }); }
      catch (error) { finish(false, best); return; }
      timer = setTimeout(() => finish(false, best), Math.max(1800, Number(timeoutMs) || 10000));
      check();
    });
  }

  async function waitForUploaderMutation(platform, previousInput, timeoutMs = 1200) {
    const current = destinationControls(platform).input;
    if (current && current !== previousInput) return true;
    const root = destinationControls(platform).zone || document.body || document.documentElement;
    if (!root) return false;
    return new Promise(resolve => {
      let done = false;
      let observer = null;
      let timer = null;
      const finish = value => {
        if (done) return;
        done = true;
        try { observer?.disconnect?.(); } catch (error) { console.debug("[Photo Transfer V8.23.21] Observer cleanup skipped", error?.message || error); }
        if (timer) clearTimeout(timer);
        resolve(Boolean(value));
      };
      const check = () => {
        const next = destinationControls(platform).input;
        if (next && next !== previousInput) finish(true);
      };
      observer = new MutationObserver(check);
      try { observer.observe(root, { childList: true, subtree: true }); }
      catch (_) { finish(false); return; }
      timer = setTimeout(() => finish(false), Math.max(300, Number(timeoutMs) || 1200));
      check();
    });
  }

  async function uploadFilesOnce(platform, files, beforeCount) {
    const controls = await waitForDestinationControls(platform, 12000);
    if (!controls.ready || !controls.input) return { added: 0, count: photoImageCount(platform), complete: false, input: controls.input || null };

    const targetCount = beforeCount + files.length;
    const covershot = platform === "poshmark" ? createPoshmarkCovershotGuard() : null;
    showToast(`Uploading ${files.length}/${files.length} to ${platformLabel(platform)}…`, { timeoutMs: 0 });
    let accepted;
    if (platform === "chatgpt" && controls.input.type !== "file") {
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      controls.input.focus();
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: transfer });
      controls.input.dispatchEvent(event);
      accepted = true; // Attachment previews below determine actual acceptance.
    } else {
      accepted = setInputFiles(controls.input, files);
    }
    if (!accepted) {
      covershot?.stop?.();
      return { added: 0, count: photoImageCount(platform), complete: false, input: controls.input };
    }

    let verification = await waitForPhotoCount(platform, targetCount, platform === "poshmark" ? 12000 : 9000);
    if (covershot) {
      // On the first Poshmark upload, listing previews can appear a little before
      // the Covershot modal itself. Keep the guard alive long enough to catch
      // that known commit step instead of reporting a false success. Later photo
      // additions use a shorter ceiling because Covershot is normally not shown.
      const state = await covershot.waitForSettled(beforeCount === 0 ? 3500 : 1200);
      covershot.stop();
      // Poshmark can render preview tiles before the covershot modal is committed.
      // Re-read only after the exact Covershot Apply flow has settled.
      if (state.seen && !state.closed) {
        return { added: 0, count: Math.max(beforeCount, photoImageCount(platform)), complete: false, input: controls.input, covershot: state };
      }
      const finalCount = photoImageCount(platform);
      if (finalCount < targetCount && verification.complete) verification = await waitForPhotoCount(platform, targetCount, 3500);
      else verification = { complete: finalCount >= targetCount, count: Math.max(finalCount, verification.count || 0) };
    }

    const count = Math.max(beforeCount, verification.count || photoImageCount(platform));
    const added = Math.max(0, Math.min(files.length, count - beforeCount));
    return { added, count, complete: added >= files.length, input: controls.input };
  }

  async function uploadFilesVerified(platform, files, beforeCount) {
    const first = await uploadFilesOnce(platform, files, beforeCount);
    if (platform === "chatgpt" || first.complete || first.added > 0) return first;

    // Retry only zero-progress failures. Partial automatic retries can duplicate
    // already accepted marketplace photos, so they are deliberately avoided.
    showToast(`${platformLabel(platform)} did not accept the files yet. Retrying once…`, { timeoutMs: 0 });
    await waitForUploaderMutation(platform, first.input, 1200);
    return uploadFilesOnce(platform, files, beforeCount);
  }

  async function importPayload(payload) {
    const platform = currentPlatform();
    if (!(platform in TARGET_LIMITS)) throw new Error("Open a Depop, Poshmark, Vinted, or ChatGPT Create Listing page first.");
    const controls = await waitForDestinationControls(platform);
    if (!controls.ready || !controls.input || !controls.limit) throw new Error(`${platformLabel(platform)} photo uploader is not ready. The transfer is still available; drop again after the page finishes loading.`);

    const destinationUrl = location.href;
    const beforeCount = photoImageCount(platform);
    const availableSlots = Math.max(0, controls.limit - beforeCount);
    if (!availableSlots) return { ok: false, review: true, message: `${platformLabel(platform)} already appears to have the maximum ${controls.limit} photos.` };

    const progressKey = `marketplaceAiPhotoTransferProgress:${platform}:${clean(payload.transferId || "unknown", 180)}`;
    let confirmedOffset = 0;
    try {
      confirmedOffset = Math.max(0, Math.min(payload.photos.length, Number(sessionStorage.getItem(progressKey) || 0)));
      // If the destination now contains fewer photos than the saved progress,
      // the user changed/reloaded the listing; do not skip source photos.
      if (beforeCount < confirmedOffset) confirmedOffset = 0;
    } catch (error) { console.debug("[Photo Transfer V8.23.21] Transfer progress read skipped", error?.message || error); }

    const remainingSource = payload.photos.slice(confirmedOffset);
    const selected = remainingSource.slice(0, availableSlots);
    const truncated = Math.max(0, remainingSource.length - selected.length);
    if (!selected.length) return { ok: true, transferred: 0, totalSource: payload.photos.length, truncated: 0, message: `All photos from this transfer are already confirmed on ${platformLabel(platform)}.` };

    showToast(`Preparing ${selected.length} photo${selected.length === 1 ? "" : "s"} for ${platformLabel(platform)}…`, { timeoutMs: 0 });
    const files = await fetchFiles(selected);
    if (files.length !== selected.length) throw new Error(`Only ${files.length}/${selected.length} photo files could be prepared.`);

    if (platform === "chatgpt" && (location.href !== destinationUrl || !controls.zone.isConnected || chatgptControls().zone !== controls.zone)) {
      throw new Error("The ChatGPT conversation changed while preparing photos. Drop again in the intended conversation.");
    }
    const upload = await uploadFilesVerified(platform, files, beforeCount);
    const totalConfirmed = confirmedOffset + upload.added;
    try {
      if (totalConfirmed > 0 && totalConfirmed < payload.photos.length) sessionStorage.setItem(progressKey, String(totalConfirmed));
      else sessionStorage.removeItem(progressKey);
    } catch (error) { console.debug("[Photo Transfer V8.23.21] Transfer progress save skipped", error?.message || error); }

    const allRequestedConfirmed = totalConfirmed >= payload.photos.length || (upload.complete && truncated === 0);
    if (upload.complete) {
      if (allRequestedConfirmed) await runtimeMessage({ type: "MARKETPLACE_PHOTO_SESSION_CLEAR_V8220", payload: { transferId: payload.transferId || "" } });
      const limitNote = truncated > 0 ? ` ${truncated} remaining eBay photo${truncated === 1 ? " is" : "s are"} still ready, but ${platformLabel(platform)} has no more free slots in this pass.` : "";
      return { ok: true, transferred: upload.added, totalSource: payload.photos.length, truncated, message: `${upload.added}/${files.length} photos ${platform === "chatgpt" ? "attached to the draft (not sent)" : "uploaded"} to ${platformLabel(platform)} ✓.${limitNote}` };
    }

    if (upload.added > 0) {
      return { ok: false, review: true, transferred: upload.added, requested: files.length, message: `${platformLabel(platform)} visibly confirmed ${upload.added}/${files.length} photos. Automatic retry stopped to avoid duplicates; the transfer remains ready for the unconfirmed tail.` };
    }
    return { ok: false, review: true, transferred: 0, requested: files.length, message: `${platformLabel(platform)} did not confirm any uploaded photos. The transfer remains ready; refresh the destination page once and drop again.` };
  }

  async function activeSessionPayload() {
    const response = await runtimeMessage({ type: "MARKETPLACE_PHOTO_SESSION_GET_V8220" });
    return response?.ok ? response.payload || null : null;
  }

  async function importPendingPayload(payload = null) {
    const early = global.MarketplaceEarlyPhotoDropV8220;
    const candidate = payload || early?.pendingPayload || await activeSessionPayload();
    if (!candidate?.photos?.length) return { ok: false, message: "No active eBay photo transfer is ready." };
    if (early?.importing) return { ok: false, message: "Photo transfer is already running." };
    if (early) early.importing = true;
    try {
      const result = await importPayload(candidate);
      if (result.ok && early) early.pendingPayload = null;
      return result;
    } finally {
      if (early) early.importing = false;
    }
  }

  function installDestinationDropBridge() {
    const platform = currentPlatform();
    if (!(platform in TARGET_LIMITS)) return false;

    // document_start photo_drop_early.js is the single owner of dragover/drop.
    // This late bridge only renders status UI and consumes the captured payload.
    document.addEventListener("dragenter", event => {
      const types = Array.from(event.dataTransfer?.types || []);
      if (!types.includes(MIME)) return;
      const limit = TARGET_LIMITS[platform];
      showDropOverlay(`Drop eBay photos here\n${platformLabel(platform)} ${platform === "chatgpt" ? "transfer batch" : "limit"}: ${limit}`);
      activeSessionPayload().then(payload => {
        if (!payload?.photos?.length) return;
        const current = photoImageCount(platform);
        const available = Math.max(0, limit - current);
        const count = Math.min(payload.photos.length, available);
        showDropOverlay(available > 0 ? `Drop ${count} photo${count === 1 ? "" : "s"} here` : `${platformLabel(platform)} photo limit is already full`);
      });
    }, true);

    document.addEventListener("dragleave", event => {
      if (!event.relatedTarget) hideDropOverlay();
    }, true);

    document.addEventListener("MARKETPLACE_PHOTO_EARLY_DROP_V8220", () => {
      hideDropOverlay();
      importPendingPayload().then(result => showToast(result.message || "Photo transfer finished.", { error: result.ok === false, timeoutMs: result.ok ? 7500 : 10000 }))
        .catch(error => showToast(error?.message || String(error), { error: true, timeoutMs: 10000 }));
    });

    const early = global.MarketplaceEarlyPhotoDropV8220;
    if (early?.pendingPayload?.photos?.length) {
      queueMicrotask(() => {
        importPendingPayload().then(result => showToast(result.message || "Photo transfer finished.", { error: result.ok === false, timeoutMs: result.ok ? 7500 : 10000 }))
          .catch(error => showToast(error?.message || String(error), { error: true, timeoutMs: 10000 }));
      });
    }
    return true;
  }

  function init() {
    const platform = currentPlatform();
    if (platform === "ebay") mountSourceHandle();
    else if (platform in TARGET_LIMITS) installDestinationDropBridge();
  }

  const api = Object.freeze({
    VERSION, PREFIX, MIME, parsePayload, encodePayload, sourcePhotos, sourceSelection, expectedSourcePhotoCount,
    destinationControls, destinationReadyState, waitForDestinationControls, photoImageCount, poshmarkCovershotModal,
    importPayload, importPendingPayload, mountSourceHandle, installDestinationDropBridge
  });
  global.MarketplacePhotoTransferV8220 = api;

  init();
})(globalThis);
