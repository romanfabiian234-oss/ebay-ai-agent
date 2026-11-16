/* Shared eBay gallery photo collector + native-selection reader — V8.23.21.
   One source of truth is reused by Photo/Queue snapshot reading and mouse transfer. */
(function initEbayPhotoCollectorV8220(global) {
  "use strict";

  const VERSION = "8.23.21";
  const MAX_PHOTOS = 25;
  const selectedKeysFromClicks = new Set();
  let lastNativeSelectedCount = 0;
  const activeSelectionWatchers = new Set();

  function debug(message, error) {
    try { global.EbayLogger?.debug?.(message, { message: error?.message || String(error || "") }); }
    catch (loggerError) { console.debug(`[eBay Photos V8.23.21] ${message}`, loggerError?.message || loggerError); }
  }

  function clean(value, limit = 4000) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  const PHOTO_HEADING = /photos\s*(?:&|and)?\s*video/i;
  const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6,[role='heading'],legend";

  const NEXT_SECTION = /^(?:title|item title|subtitle|item category|category|item specifics|condition|description|pricing|shipping|delivery|preferences)$/i;

  function photoHeading() {
    const headings = Array.from(document.querySelectorAll(HEADING_SELECTOR));
    const match = headings.find(node => PHOTO_HEADING.test(clean(node.textContent, 120)));
    if (match) return match;
    // Some editor versions use a plain label instead of an h2/role=heading.
    return Array.from(document.querySelectorAll("span,div,label"))
      .find(node => /^(?:photos?\s*(?:&|and)\s*videos?|photos?)$/i.test(clean(node.textContent, 120))) || null;
  }

  function nextSection(node) {
    return NEXT_SECTION.test(clean(node?.textContent, 120));
  }

  function galleryNodes(scope, heading = photoHeading()) {
    if (!scope) return [];
    const all = [scope, ...Array.from(scope.querySelectorAll("*"))];
    if (!heading || !scope.contains(heading)) return all;
    const start = all.indexOf(heading);
    const tail = all.slice(start + 1);
    const end = tail.findIndex(nextSection);
    // Do not scan an ancestor's outerHTML: it can contain the next listing field.
    return end < 0 ? tail : tail.slice(0, end);
  }

  function photoSection() {
    const heading = photoHeading();
    if (!heading) return null;
    let best = heading.parentElement || heading;
    let bestCount = -1;
    // A nested SECTION can contain only the heading. Never stop at a tag name:
    // use actual current-gallery photo URLs, and stop scanning at the next field.
    for (let node = heading.parentElement, depth = 0; node && depth < 16;
         node = node.parentElement, depth += 1) {
      const nodes = galleryNodes(node, heading);
      const keys = new Set();
      for (const child of nodes) {
        const values = [child.currentSrc, child.src, child.href];
        for (const attr of Array.from(child.attributes || [])) {
          if (/(?:src|url|image|photo|style)/i.test(attr.name)) values.push(...urlsFromText(attr.value));
        }
        for (const value of values) if (normalizedPhotoUrl(value)) keys.add(photoKey(value));
      }
      if (keys.size > bestCount) { best = node; bestCount = keys.size; }
      // A complete gallery is enough; no history/resource-wide fallback needed.
      const expected = counterInNodes(nodes);
      if (keys.size > 0 && expected > 0 && keys.size >= expected) return node;
      if (node === document.body || node === document.documentElement) break;
    }
    return best;
  }

  function counterInNodes(nodes) {
    for (const node of nodes) {
      // Only short labels, not a whole form's concatenated text.
      const value = clean(node.textContent, 120);
      if (/^\d{1,2}\s*(?:\/|of|out of)\s*\d{1,2}$/i.test(value)) {
        const count = parseCounter(value);
        if (count) return count;
      }
      for (const attr of ["aria-label", "title"]) {
        const text = node.getAttribute?.(attr) || "";
        if (/photo|image|upload/i.test(text)) {
          const count = parseCounter(text);
          if (count) return count;
        }
      }
    }
    return 0;
  }

  function parseCounter(value) {
    const text = clean(value, 20000);
    const match = text.match(/(?:^|[^\d])(\d{1,2})\s*(?:\/|of|out of)\s*(\d{1,2})(?:$|[^\d])/i);
    const current = Number(match?.[1] || 0);
    const total = Number(match?.[2] || 0);
    if (!current || !total || current > total || total > 30) return 0;
    return current;
  }

  function expectedPhotoCount() {
    return counterInNodes(galleryNodes(photoSection()));
  }

  function decodedUrl(value) {
    let raw = String(value || "").trim().replace(/\\\//g, "/").replace(/&amp;/gi, "&");
    if (!raw) return "";
    try { raw = decodeURIComponent(raw); }
    catch (error) { debug("Photo URL was already decoded", error); }
    return raw;
  }

  function normalizedPhotoUrl(value) {
    const raw = decodedUrl(value);
    if (!raw) return "";
    try {
      const url = new URL(raw, location.href);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "i.ebayimg.com") return "";
      if (!/^\/(?:images\/g\/[^/]+\/|00\/s\/)/i.test(url.pathname)) return "";
      if (!/\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname)) return "";
      url.hash = "";
      url.pathname = url.pathname
        .replace(/\/s-l\d+([./])/ig, "/s-l1600$1")
        .replace(/\/\$_(\d{1,2})\.(jpe?g|png|webp|gif)$/i, (match, code, ext) => Number(code) < 57 ? `/$_57.${ext}` : match);
      return url.href;
    } catch (error) {
      debug("Invalid eBay photo candidate skipped", error);
      return "";
    }
  }

  function photoKey(value) {
    const url = normalizedPhotoUrl(value) || String(value || "");
    const gallery = url.match(/\/images\/g\/([^/]+)\//i);
    if (gallery) return `g:${gallery[1]}`;
    const legacy = url.match(/\/z\/([^/]+)\/\$_\d+\.(?:jpe?g|png|webp|gif)/i);
    if (legacy) return `z:${legacy[1]}`;
    return global.EbayIdentityV3?.canonicalPhotoUrl
      ? global.EbayIdentityV3.canonicalPhotoUrl(url)
      : url.replace(/[?#].*$/, "").toLowerCase();
  }

  function urlsFromText(value) {
    const text = String(value || "").replace(/\\\//g, "/").replace(/&amp;/gi, "&");
    const out = [];
    const regex = /https:\/\/i\.ebayimg\.com\/[^\s"'<>),]+/gi;
    let match;
    while ((match = regex.exec(text))) out.push(match[0]);
    return out;
  }

  function collectAllPhotos(limit = MAX_PHOTOS) {
    const max = Math.max(1, Math.min(Number(limit || MAX_PHOTOS), MAX_PHOTOS));
    const expectedCount = expectedPhotoCount();
    const expected = expectedCount > 0 ? Math.min(expectedCount, max) : 0;
    const scope = photoSection();
    const photos = [];
    const seen = new Set();
    let domCandidates = 0;
    let htmlCandidates = 0;
    let resourceCandidates = 0;

    const add = (value, node = null) => {
      if (photos.length >= max) return false;
      const url = normalizedPhotoUrl(value);
      if (!url) return false;
      const key = photoKey(url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      const index = photos.length;
      photos.push({
        kind: "ebay",
        marketplaceSource: "ebay",
        trustedMarketplacePhoto: true,
        url,
        src: url,
        name: `ebay-photo-${index + 1}.jpg`,
        role: index === 0 ? "Main product photo" : `Product photo ${index + 1}`,
        alt: clean(node?.alt || node?.title || node?.getAttribute?.("aria-label") || "", 160),
        photoId: `photo:${key}`,
        canonicalUrl: global.EbayIdentityV3?.canonicalPhotoUrl ? global.EbayIdentityV3.canonicalPhotoUrl(url) : url,
        key
      });
      return true;
    };

    if (scope) {
      const nodes = galleryNodes(scope).slice(0, 2000);
      for (const node of nodes) {
        const direct = [node.currentSrc, node.src, node.href];
        for (const value of direct) { domCandidates += 1; add(value, node); }
        for (const attr of Array.from(node.attributes || [])) {
          if (!/(?:src|url|image|photo|zoom|poster|style)/i.test(attr.name)) continue;
          for (const url of urlsFromText(attr.value)) { domCandidates += 1; add(url, node); }
          if (attr.name === "src" || attr.name === "href" || /data-(?:src|url|image|photo|zoom)/i.test(attr.name)) { domCandidates += 1; add(attr.value, node); }
          if (/srcset/i.test(attr.name)) {
            for (const part of String(attr.value || "").split(",")) { domCandidates += 1; add(part.trim().split(/\s+/)[0], node); }
          }
        }
        try {
          const style = getComputedStyle(node);
          for (const value of [style.backgroundImage, style.content]) {
            for (const url of urlsFromText(value)) { domCandidates += 1; add(url, node); }
          }
        } catch (error) { debug("Computed style photo scan skipped", error); }
        if (expected > 0 && photos.length >= expected) break;
      }
      if (!expected || photos.length < expected) {
        for (const url of urlsFromText(nodes.filter(node => !node.children?.length).map(node => node.outerHTML || "").join(" "))) {
          htmlCandidates += 1;
          add(url, null);
          if (expected > 0 && photos.length >= expected) break;
        }
      }
    }

    // Resource history can include a previously edited listing. Require a current
    // gallery reference before admitting any resource into this listing.
    const galleryKeys = new Set(galleryNodes(scope).flatMap(node => Array.from(node.attributes || []).flatMap(attr => urlsFromText(attr.value))).map(photoKey));
    // eBay sometimes keeps lazy thumbnails only in resources already fetched by the page.
    // This is bounded and used only when the local gallery counter proves more photos exist.
    if (expected > 0 && photos.length < expected && global.performance?.getEntriesByType) {
      for (const entry of global.performance.getEntriesByType("resource") || []) {
        if (!/^(?:img|image|css|other)$/i.test(String(entry?.initiatorType || "other"))) continue;
        resourceCandidates += 1;
        if (galleryKeys.has(photoKey(entry?.name))) add(entry?.name, null);
        if (photos.length >= expected) break;
      }
    }

    const targetCount = expected > 0 ? expected : photos.length;
    collectAllPhotos.lastDebug = {
      scopeFound: Boolean(scope), uploadedCount: expectedCount, expectedCountKnown: expectedCount > 0,
      targetCount, domCandidates, htmlCandidates, resourceCandidates,
      accepted: photos.length, complete: expected > 0 ? photos.length >= expected : photos.length > 0
    };
    return photos.slice(0, max).map((photo, index) => ({ ...photo, index, originalIndex: index, displayNumber: index + 1 }));
  }

  function selectedCountFromText(value) {
    const text = clean(value, 5000);
    const match = text.match(/(?:select\s+all\s*[-–—:]?\s*)?(\d{1,2})\s+selected\b/i);
    if (!match) return 0;
    const count = Number(match[1] || 0);
    return count >= 0 && count <= MAX_PHOTOS ? count : 0;
  }

  function nativeSelectedCount() {
    const scope = photoSection();
    if (!scope) return 0;

    // eBay currently renders the selection toolbar as a sibling/ancestor of the
    // gallery grid. Search a bounded ancestor chain first instead of assuming
    // the text lives inside the exact photo-grid node.
    let node = scope;
    for (let depth = 0; depth < 10 && node; depth += 1, node = node.parentElement) {
      const count = selectedCountFromText(node.textContent);
      if (count) return count;
    }

    // Fallback for layouts where React portals the toolbar outside that chain.
    // Only short visible controls containing the exact "N selected" phrase are
    // accepted, which avoids treating unrelated listing text as selection state.
    const expected = expectedPhotoCount();
    for (const candidate of Array.from(document.querySelectorAll("button,[role='button'],label,span,div,p")).slice(0, 1800)) {
      const text = clean(candidate.textContent, 140);
      if (!/\b\d{1,2}\s+selected\b/i.test(text)) continue;
      const count = selectedCountFromText(text);
      if (!count || (expected > 0 && count > expected)) continue;
      try {
        const rect = candidate.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
      } catch (error) { debug("Selection toolbar visibility read skipped", error); }
      return count;
    }

    const bodyCount = selectedCountFromText(document.body?.innerText || "");
    return expected > 0 && bodyCount > expected ? 0 : bodyCount;
  }

  function selectedState(node) {
    if (!node) return false;
    if (node.matches?.("input:checked,[aria-checked='true'],[aria-selected='true'],[aria-pressed='true'],[data-selected='true'],[data-checked='true']")) return true;
    if (node.querySelector?.("input:checked,[aria-checked='true'],[aria-selected='true'],[aria-pressed='true'],[data-selected='true'],[data-checked='true']")) return true;
    const attrs = `${node.getAttribute?.("aria-label") || ""} ${node.getAttribute?.("title") || ""} ${node.getAttribute?.("data-testid") || ""} ${node.getAttribute?.("data-test") || ""} ${node.className || ""}`.toLowerCase();
    if (/\b(?:is-)?selected\b|\b(?:is-)?checked\b|checkmark|deselect|unselect|remove\s+selection/.test(attrs) && !/select all/.test(attrs)) return true;
    return false;
  }

  function nodePhotoKey(node) {
    let current = node;
    for (let depth = 0; depth < 8 && current; depth += 1, current = current.parentElement) {
      for (const candidate of [current.currentSrc, current.src, current.href]) {
        const key = photoKey(candidate);
        if (key && normalizedPhotoUrl(candidate)) return key;
      }
      for (const attr of Array.from(current.attributes || [])) {
        if (!/(?:src|url|image|photo|zoom|style)/i.test(attr.name)) continue;
        for (const candidate of urlsFromText(attr.value)) {
          const key = photoKey(candidate);
          if (key) return key;
        }
      }
      for (const nested of Array.from(current.querySelectorAll?.("img,[src],[data-src],[data-image-url],[data-photo-url],[style]") || []).slice(0, 12)) {
        for (const candidate of [nested.currentSrc, nested.src, nested.getAttribute?.("data-src"), nested.getAttribute?.("data-image-url"), nested.getAttribute?.("data-photo-url")]) {
          const key = photoKey(candidate);
          if (key && normalizedPhotoUrl(candidate)) return key;
        }
        for (const candidate of urlsFromText(nested.getAttribute?.("style") || "")) {
          const key = photoKey(candidate);
          if (key) return key;
        }
      }
    }
    return "";
  }

  function photoKeyAtPoint(clientX, clientY) {
    const scope = photoSection();
    if (!scope || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return "";

    // The native eBay checkmark is an overlay and often has no photo URL of its
    // own. elementsFromPoint also returns the thumbnail underneath that overlay,
    // which gives us a stable identity without depending on eBay's CSS classes.
    try {
      for (const node of document.elementsFromPoint(clientX, clientY) || []) {
        if (!scope.contains(node)) continue;
        const key = nodePhotoKey(node);
        if (key) return key;
      }
    } catch (error) { debug("Selection hit-test skipped", error); }

    let best = null;
    for (const node of Array.from(scope.querySelectorAll("img,[src],[data-src],[data-image-url],[data-photo-url],[style]")).slice(0, 300)) {
      const key = nodePhotoKey(node);
      if (!key) continue;
      try {
        const rect = node.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 24) continue;
        const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        if (inside) {
          const area = rect.width * rect.height;
          if (!best || !best.inside || area < best.score) best = { key, inside: true, score: area };
        } else if ((!best || !best.inside) && distance < 120 && (!best || distance < best.score)) {
          best = { key, inside: false, score: distance };
        }
      } catch (error) { debug("Selection thumbnail rectangle skipped", error); }
    }
    return best?.key || "";
  }

  function nativeSelectedKeys() {
    const scope = photoSection();
    const keys = new Set();
    if (!scope) return keys;
    const selectors = [
      "input:checked", "[aria-checked='true']", "[aria-selected='true']", "[aria-pressed='true']",
      "[data-selected='true']", "[data-checked='true']", "[class*='selected' i]", "[class*='checked' i]",
      "[aria-label*='selected' i]", "[title*='selected' i]", "[aria-label*='deselect' i]", "[title*='deselect' i]",
      "[aria-label*='unselect' i]", "[title*='unselect' i]"
    ].join(",");
    for (const node of Array.from(scope.querySelectorAll(selectors)).slice(0, 220)) {
      let current = node;
      for (let depth = 0; depth < 7 && current && current !== scope; depth += 1, current = current.parentElement) {
        if (!selectedState(current)) continue;
        const key = nodePhotoKey(current);
        if (key) { keys.add(key); break; }
      }
    }

    // Some eBay revisions put the selected-state control beside the image rather
    // than inside the same DOM branch. Inspect each photo tile's bounded ancestor
    // chain as a second, deterministic visual-state source.
    for (const photoNode of Array.from(scope.querySelectorAll("img,[data-image-url],[data-photo-url]")).slice(0, 80)) {
      const key = nodePhotoKey(photoNode);
      if (!key || keys.has(key)) continue;
      let current = photoNode;
      for (let depth = 0; depth < 5 && current && current !== scope; depth += 1, current = current.parentElement) {
        if (selectedState(current)) { keys.add(key); break; }
      }
    }
    return keys;
  }

  function reconcileTrackedSelection() {
    const count = nativeSelectedCount();
    const all = collectAllPhotos(MAX_PHOTOS);
    const validKeys = new Set(all.map(photo => photo.key));
    for (const key of Array.from(selectedKeysFromClicks)) if (!validKeys.has(key)) selectedKeysFromClicks.delete(key);
    if (count === 0) selectedKeysFromClicks.clear();
    if (count === all.length && all.length) {
      selectedKeysFromClicks.clear();
      for (const photo of all) selectedKeysFromClicks.add(photo.key);
    }
    lastNativeSelectedCount = count;
    return count;
  }

  function selection(limit = MAX_PHOTOS) {
    const max = Math.max(1, Math.min(Number(limit || MAX_PHOTOS), MAX_PHOTOS));
    const all = collectAllPhotos(max);
    const selectedCount = reconcileTrackedSelection();
    if (selectedCount <= 0) return { mode: "all", selectedCount: 0, photos: all, complete: !expectedPhotoCount() || all.length >= Math.min(expectedPhotoCount(), max), allCount: all.length };

    const nativeKeys = nativeSelectedKeys();
    const keys = new Set([...nativeKeys, ...selectedKeysFromClicks]);
    const photos = all.filter(photo => keys.has(photo.key)).slice(0, selectedCount);
    return {
      mode: "selected",
      selectedCount,
      photos,
      complete: photos.length >= Math.min(selectedCount, max),
      allCount: all.length
    };
  }

  function emitSelectionChanged(before, after) {
    try { document.dispatchEvent(new CustomEvent("EBAY_PHOTO_SELECTION_CHANGED_V8220", { detail: { before, after } })); }
    catch (error) { debug("Selection change event skipped", error); }
  }

  function applyTrackedSelectionTransition(before, after, key = "", targetText = "") {
    const all = collectAllPhotos(MAX_PHOTOS);
    const selectAll = /select all/.test(targetText) || (after === all.length && after - before > 1);
    if (selectAll && all.length) {
      selectedKeysFromClicks.clear();
      for (const photo of all) selectedKeysFromClicks.add(photo.key);
    } else if (key && after > before) {
      selectedKeysFromClicks.add(key);
    } else if (key && after < before) {
      selectedKeysFromClicks.delete(key);
    } else if (after === 0) {
      selectedKeysFromClicks.clear();
    }
    lastNativeSelectedCount = after;
  }

  function selectionMutationRoot(scope = photoSection()) {
    if (!scope) return null;
    let best = scope;
    let node = scope;
    for (let depth = 0; depth < 6 && node && node !== document.body && node !== document.documentElement; depth += 1, node = node.parentElement) {
      const text = clean(node.textContent, 3000);
      best = node;
      if (/select\s+all/i.test(text) || /\b\d{1,2}\s+selected\b/i.test(text)) return node;
    }
    return best || scope;
  }

  function watchNativeSelectionChange(before, key = "", targetText = "") {
    const root = selectionMutationRoot();
    if (!root) return;
    let finished = false;
    let observer = null;
    let timer = null;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      try { observer?.disconnect?.(); }
      catch (error) { debug("Selection observer cleanup skipped", error); }
      if (timer) clearTimeout(timer);
      activeSelectionWatchers.delete(cleanup);
    };

    const check = () => {
      const after = nativeSelectedCount();
      if (after === before) return;
      applyTrackedSelectionTransition(before, after, key, targetText);
      emitSelectionChanged(before, after);
      cleanup();
    };

    observer = new MutationObserver(check);
    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-checked", "aria-selected", "aria-pressed", "data-selected", "data-checked", "class"]
      });
      activeSelectionWatchers.add(cleanup);
      // Timeout is only a cleanup ceiling. The observer finishes immediately
      // when eBay exposes the new native selection state.
      timer = setTimeout(() => {
        check();
        cleanup();
      }, 1500);
    } catch (error) {
      debug("Selection observer could not be attached", error);
      cleanup();
    }
  }

  function scheduleSelectionEvent() {
    const before = lastNativeSelectedCount;
    requestAnimationFrame(() => {
      queueMicrotask(() => {
        const after = reconcileTrackedSelection();
        emitSelectionChanged(before, after);
      });
    });
  }

  function installNativeSelectionTracking() {
    if (!/(^|\.)ebay\.(?:com|ca|co\.uk)$/i.test(String(location.hostname || ""))) return;
    if (global.__ebayPhotoSelectionTrackingV8220) return;
    global.__ebayPhotoSelectionTrackingV8220 = true;
    lastNativeSelectedCount = nativeSelectedCount();

    const captureSelectionIntent = event => {
      const scope = photoSection();
      if (!scope || !event.target || !scope.contains(event.target)) return;
      const before = nativeSelectedCount();
      const key = nodePhotoKey(event.target) || photoKeyAtPoint(Number(event.clientX), Number(event.clientY));
      const targetText = clean(`${event.target?.getAttribute?.("aria-label") || ""} ${event.target?.textContent || ""}`, 180).toLowerCase();

      // eBay updates its native "N selected" UI asynchronously. Arm a bounded
      // observer before React handles the click so the drag label updates at the
      // exact DOM mutation instead of waiting for pointer hover.
      watchNativeSelectionChange(before, key, targetText);

      // Fast path for eBay revisions that commit the selection in the same frame.
      requestAnimationFrame(() => {
        queueMicrotask(() => {
          const after = nativeSelectedCount();
          if (after === before) return;
          applyTrackedSelectionTransition(before, after, key, targetText);
          emitSelectionChanged(before, after);
        });
      });
    };

    document.addEventListener("click", captureSelectionIntent, true);
    document.addEventListener("change", event => {
      const scope = photoSection();
      if (scope && event.target && scope.contains(event.target)) scheduleSelectionEvent();
    }, true);
  }

  installNativeSelectionTracking();

  global.EbayPhotoCollectorV8220 = Object.freeze({
    VERSION, MAX_PHOTOS, photoSection, expectedPhotoCount, normalizedPhotoUrl, photoKey,
    collectAllPhotos, nativeSelectedCount, nativeSelectedKeys, photoKeyAtPoint, selection, scheduleSelectionEvent,
    selectionMutationRoot, watchNativeSelectionChange
  });
})(globalThis);
