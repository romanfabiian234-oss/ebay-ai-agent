/* Draft snapshot, exact eBay field map, photo identity, and page gateway — V8.23.21. Adds value-stability signatures and bounded high-resolution repair selection. */

/* ===== IDENTITY ===== */
/* Stable field and photo identifiers for Review schema V3. */
(function initEbayIdentityV3(global) {
  "use strict";
  function clean(value, limit = 4096) { return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }
  function normalizedKey(value) { return clean(value, 300).toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim().replace(/\s+/g, "_"); }
  function sha256Hex(input) {
    const text = unescape(encodeURIComponent(String(input ?? ""))); const words = []; const bitLength = text.length * 8;
    for (let i=0;i<text.length;i+=1) words[i>>2]=(words[i>>2]||0)|text.charCodeAt(i)<<(24-(i%4)*8);
    words[bitLength>>5]=(words[bitLength>>5]||0)|0x80<<(24-bitLength%32); words[((bitLength+64>>9)<<4)+15]=bitLength;
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w=new Array(64), rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let o=0;o<words.length;o+=16){for(let i=0;i<16;i+=1)w[i]=words[o+i]|0;for(let i=16;i<64;i+=1){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}let[a,b,c,d,e,f,g,hh]=h;for(let i=0;i<64;i+=1){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(hh+S1+ch+k[i]+w[i])|0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)|0;hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}for(let i=0;i<8;i+=1)h[i]=(h[i]+[a,b,c,d,e,f,g,hh][i])|0;}
    return h.map(v=>(v>>>0).toString(16).padStart(8,"0")).join("");
  }
  function marketplaceId(url=global.location?.href||""){try{const host=new URL(url).hostname.toLowerCase();if(host.endsWith("ebay.co.uk"))return"EBAY_GB";if(host.endsWith("ebay.ca"))return"EBAY_CA";return"EBAY_US";}catch(_){return"EBAY_US";}}
  function categoryIdFromDocument(doc=global.document,url=global.location?.href||""){try{const u=new URL(url);for(const n of["categoryId","category_id","category","catId"]){const v=clean(u.searchParams.get(n),40);if(/^\d{1,20}$/.test(v))return v;}}catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }for(const sel of["input[name='categoryId']","input[name='category_id']","[data-category-id]","[data-categoryid]"]){const node=doc?.querySelector?.(sel),v=clean(node?.value||node?.getAttribute?.("data-category-id")||node?.getAttribute?.("data-categoryid"),40);if(/^\d{1,20}$/.test(v))return v;}return"unknown";}
  function normalizedDomKey(value,label=""){const raw=clean(value,240).toLowerCase();return raw?raw.replace(/\s+/g,""):`label:${normalizedKey(label)||"unknown"}`;}
  function fieldId({marketplace="EBAY_US",categoryId="unknown",domKey="",label=""}={}){const basis=`${clean(marketplace,40).toUpperCase()}|${clean(categoryId,40)||"unknown"}|${normalizedDomKey(domKey,label)}`;return`aspect:v3:${sha256Hex(basis).slice(0,20)}`;}
  function canonicalPhotoUrl(value) {
    const raw = clean(value, 10000000);
    if (!raw) return "";
    if (/^data:image\//i.test(raw)) return raw;
    try {
      const u = new URL(raw);
      u.protocol = "https:";
      u.hostname = u.hostname.toLowerCase();
      u.username = "";
      u.password = "";
      u.hash = "";
      u.search = "";
      u.pathname = u.pathname
        .replace(/\/s-l\d+(?=\.|\/)/ig, "/s-l1600")
        .replace(/\/s-l\d+([./])/ig, "/s-l1600$1")
        // Legacy eBay gallery thumbnails use $_1/$_2/... while the same image is
        // available through $_12. Upgrade only smaller legacy variants; never
        // downgrade larger/supersize codes such as $_57.
        .replace(/\/\$_(\d{1,2})\.(jpe?g|png|webp|gif)$/i, (match, code, ext) => Number(code) < 12 ? `/$_12.${ext}` : match)
        .replace(/\/{2,}/g, "/");
      return u.toString();
    } catch (_) {
      return raw.replace(/\?.*$/, "").toLowerCase();
    }
  }
  function photoId(image={}){const source=image.url||image.src||image.dataUrl||"",canonical=canonicalPhotoUrl(source);return canonical?`photo:${sha256Hex(canonical).slice(0,20)}`:"";}
  global.EbayIdentityV3=Object.freeze({clean,normalizedKey,sha256Hex,marketplaceId,categoryIdFromDocument,normalizedDomKey,fieldId,canonicalPhotoUrl,photoId});
})(globalThis);

/* ===== FIELD VALUE PARSER ===== */
/* Shared Field - Value parser and safety filter for Text, Photo and Queue. */
(function initEbayAiFieldParser(global) {
  "use strict";

  // Runtime source of truth is core/policy.js. This parser is loaded
  // after that policy in every production context, so UPC/MPN cannot drift between
  // Text, Photo, Queue and Fill.
  const ALWAYS_SKIP_FIELDS = global.EbayAiItemSpecificsV7100?.ALWAYS_SKIP_FIELDS || new Set();

  const PLACEHOLDER_VALUES = new Set([
    "unknown", "not known", "not sure", "not confirmed", "unconfirmed",
    "not applicable", "does not apply", "doesn t apply", "n a", "na",
    "not provided", "not specified", "not available", "not visible", "not shown",
    "no ai value", "leave blank", "blank", "skip", "null", "tbd",
    "cannot determine", "unable to determine", "cannot confirm", "unable to confirm"
  ]);

  // Legacy strict mode can still reject common AI defaults for compatibility.
  // Current Text/Fast Fill explicitly use strictAiDefaults:false; Review owns verification.
  const STRICT_DEFAULT_NO_FIELDS = new Set(["vintage", "handmade", "personalize"]);


  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cleanLabel(value) {
    return cleanText(value)
      .replace(/^[\s"'`*•-]+/, "")
      .replace(/[:：=\-–—]+$/, "")
      .trim();
  }

  function shouldSkipField(label) {
    return Boolean(global.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label)) || ALWAYS_SKIP_FIELDS.has(normalizeKey(label));
  }

  function placeholderKey(value) {
    return normalizeKey(String(value || "").replace(/[’']/g, ""));
  }

  function isPlaceholderValue(value) {
    const key = placeholderKey(value);
    if (!key || PLACEHOLDER_VALUES.has(key)) return true;
    if (/^not (?:confirmed|provided|specified|available|known|visible|shown|listed|applicable)$/.test(key)) return true;
    if (/^(?:does not|doesnt) apply(?: to (?:this|the) item)?$/.test(key)) return true;
    return false;
  }

  function isUnsafeAiDefault(label, value) {
    const fieldKey = normalizeKey(label);
    const valueKey = placeholderKey(value);
    return STRICT_DEFAULT_NO_FIELDS.has(fieldKey) && valueKey === "no";
  }

  function sanitizeAnswer(label, value, options = {}) {
    const text = cleanText(value).replace(/^[-–—•\s]+/, "").trim();
    if (!cleanLabel(label) || shouldSkipField(label) || isPlaceholderValue(text)) return "";
    if (options.strictAiDefaults !== false && isUnsafeAiDefault(label, text)) return "";
    return text.slice(0, 500);
  }

  function parseFieldValueLine(line) {
    const raw = cleanText(line);
    if (!raw) return null;
    const match = raw.match(/^(.{2,90}?)\s*(?:[:：=]|\s[-–—]\s)\s*(.+)$/);
    if (!match) return null;
    const label = cleanLabel(match[1]);
    const value = cleanText(match[2]).replace(/^[-–—•\s]+/, "").trim();
    if (!label || !value || label.length > 80 || /^(https?|www\.)/i.test(label)) return null;
    return { label, value };
  }

  function parseFieldValueText(text, options = {}) {
    const answers = {};
    const rows = [];
    const ignored = [];
    let candidateCount = 0;
    for (const rawLine of String(text || "").split(/\r?\n|;/)) {
      const parsed = parseFieldValueLine(rawLine);
      if (!parsed) continue;
      candidateCount += 1;
      const value = sanitizeAnswer(parsed.label, parsed.value, options);
      if (!value) {
        ignored.push({ label: parsed.label, value: parsed.value, reason: shouldSkipField(parsed.label) ? "excluded field" : "unsafe or placeholder value" });
        continue;
      }
      answers[parsed.label] = value;
      rows.push({ label: parsed.label, value });
    }
    return { answers, rows, ignored, candidateCount, answerCount: rows.length };
  }

  global.EbayAiFieldParserV790 = Object.freeze({
    ALWAYS_SKIP_FIELDS,
    PLACEHOLDER_VALUES,
    STRICT_DEFAULT_NO_FIELDS,
    cleanText,
    normalizeKey,
    cleanLabel,
    shouldSkipField,
    isPlaceholderValue,
    isUnsafeAiDefault,
    sanitizeAnswer,
    parseFieldValueLine,
    parseFieldValueText
  });
})(globalThis);

/* ===== PHOTO ROLE MAP ===== */
"use strict";
// V8.4.3 Beta 70 — runtime photo role map.
//
// The compact response requires the model to name the photo number and the
// source type behind every confirmed field. That is a factual statement about
// what each photo turned out to be, and it arrives free with an answer we have
// already paid for. This module turns it into a role map used to pick the
// photos for the recovery request of the SAME run.
//
// The map is deliberately runtime only: it is never stored, never read from a
// previous run and never influences a later analysis. Keeping every run
// independent is what preserves the system's ability to correct an earlier
// mistake instead of reinforcing it.
(function (global) {
  const CARE_FIELD_PATTERN = /material|fabric|care|country|region of manufacture|composition/;

  const ROLE_PRIORITY = ["care_material_tag", "brand_size_tag", "measurement"];

  function key(value) {
    return String(value || "").trim().toLowerCase();
  }

  function roleFor(sourceType, field) {
    const type = key(sourceType).replace(/[\s-]+/g, "_");
    if (type === "measurement") return "measurement";
    if (type !== "physical_tag") return "";
    return CARE_FIELD_PATTERN.test(key(field)) ? "care_material_tag" : "brand_size_tag";
  }

  // Only confirmed answers teach the map. A field still waiting for review has
  // not cleared its confidence policy, so its photo reference is not evidence.
  function confirmedFields(bundle) {
    const answers = bundle && bundle.answers ? bundle.answers : {};
    const confirmed = new Set();
    for (const field of Object.keys(answers)) {
      if (String(answers[field] || "").trim()) confirmed.add(field);
    }
    const suggested = bundle && bundle.suggestedAnswers ? bundle.suggestedAnswers : {};
    for (const field of Object.keys(suggested)) confirmed.delete(field);
    return confirmed;
  }

  function buildRoleMap(bundle, images) {
    const map = Object.create(null);
    try {
      const evidence = bundle && bundle.evidence ? bundle.evidence : null;
      if (!evidence || typeof evidence !== "object") return map;
      const photoCount = Array.isArray(images) ? images.length : 0;
      if (photoCount < 1) return map;

      const confirmed = confirmedFields(bundle);
      const votes = Object.create(null);

      for (const field of Object.keys(evidence)) {
        if (!confirmed.has(field)) continue;
        const sources = evidence[field] && Array.isArray(evidence[field].sources)
          ? evidence[field].sources
          : [];
        for (const source of sources) {
          const photo = Number(source && source.photo);
          if (!Number.isInteger(photo) || photo < 1 || photo > photoCount) continue;
          const role = roleFor(source.type || source.source_type, field);
          if (!role) continue;
          if (!votes[photo]) votes[photo] = Object.create(null);
          if (!votes[photo][role]) votes[photo][role] = { count: 0, fields: [] };
          votes[photo][role].count += 1;
          if (votes[photo][role].fields.length < 12) votes[photo][role].fields.push(String(field));
        }
      }

      for (const photo of Object.keys(votes)) {
        let best = "";
        let bestCount = 0;
        for (const role of Object.keys(votes[photo])) {
          const count = votes[photo][role].count;
          const better = count > bestCount
            || (count === bestCount && ROLE_PRIORITY.indexOf(role) < ROLE_PRIORITY.indexOf(best));
          if (better) { best = role; bestCount = count; }
        }
        if (!best) continue;
        map[Number(photo)] = {
          role: best,
          votes: bestCount,
          fields: votes[photo][best].fields.slice(0, 12)
        };
      }
    } catch (_) {
      return Object.create(null);
    }
    return map;
  }

  // Resolution is by the image's own requestPhotoNumber, never by array
  // position: selectRepairPhotos re-annotates its output and renumbers photos
  // for the recovery request.
  function roleForImage(image, roleMap) {
    if (!image || !roleMap) return "";
    const photo = Number(image.requestPhotoNumber);
    if (!Number.isInteger(photo)) return "";
    const entry = roleMap[photo];
    return entry && entry.role ? String(entry.role) : "";
  }

  function isEvidenceRole(role) {
    return ROLE_PRIORITY.indexOf(key(role)) >= 0;
  }

  global.EbayAiPhotoRoleMapV843 = Object.freeze({
    buildRoleMap,
    roleForImage,
    isEvidenceRole,
    roleFor
  });
})(globalThis);

/* ===== PHOTO SELECTOR ===== */
/* Shared listing-photo validator, duplicate cleanup, ranking and stable numbering. */
(function initEbayAiPhotoSelector(global) {
  "use strict";

  const SUPPORTED_DATA = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i;
  const SUPPORTED_PATH = /\.(?:jpeg|jpg|png|webp|gif)$/i;

  function source(image = {}) {
    return String(image.dataUrl || image.url || image.src || "").trim();
  }

  function identitySource(image = {}) {
    return String(image.url || image.src || image.dataUrl || "").trim();
  }

  function isSupportedPhoto(image = {}) {
    const value = source(image);
    if (!value) return false;
    if (SUPPORTED_DATA.test(value)) return true;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:") return false;
      if (image?.trustedMarketplacePhoto === true) {
        return !/(?:avatar|logo|icon|badge)/i.test(String(image?.alt || image?.role || ""));
      }
      if (!(host === "i.ebayimg.com" || host.endsWith(".ebayimg.com"))) return false;
      if (!/^\/(?:images\/g\/[^/]+\/|00\/s\/)/i.test(url.pathname)) return false;
      return SUPPORTED_PATH.test(url.pathname);
    } catch (_) { return false; }
  }

  function canonicalPhotoUrl(image = {}) {
    const identity = global.EbayIdentityV3;
    const value = identitySource(image);
    return identity?.canonicalPhotoUrl ? identity.canonicalPhotoUrl(value) : value.replace(/\?.*$/, "").toLowerCase();
  }

  function stablePhotoId(image = {}) {
    const existing = String(image.photoId || image.photo_id || "").trim();
    if (existing) return existing;
    const identity = global.EbayIdentityV3;
    return identity?.photoId ? identity.photoId(image) : `photo:${photoKey(image)}`;
  }

  function photoKey(image = {}) {
    const value = identitySource(image);
    const id = value.match(/\/images\/g\/([^/]+)\//i)?.[1];
    if (id) return `g:${id.toLowerCase()}`;
    const legacyId = value.match(/\/00\/s\/[^/]+\/z\/([^/]+)\//i)?.[1];
    if (legacyId) return `z:${legacyId.toLowerCase()}`;
    if (/^data:image\//i.test(value)) {
      const middle = Math.floor(value.length / 2);
      return `data:${value.length}:${value.slice(0, 72)}:${value.slice(middle, middle + 72)}:${value.slice(-72)}`;
    }
    return value.replace(/\?.*$/, "").toLowerCase();
  }

  function filterPhotos(photos = []) {
    const seen = new Set();
    return (Array.isArray(photos) ? photos : []).filter(image => {
      if (!isSupportedPhoto(image)) return false;
      const key = photoKey(image);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function descriptor(image = {}) {
    return String(`${image.role || ""} ${image.kind || ""} ${image.name || ""} ${image.alt || ""}`).toLowerCase();
  }

  function category(image = {}, index = 0) {
    const text = descriptor(image);
    if (/care|wash|laundry|fiber|fibre|material|composition|made in|country/.test(text)) return "care_material_tag";
    if (/brand|size|neck label|main label|tag|label/.test(text)) return "brand_size_tag";
    if (/measurement|measure|ruler|tape|waist|inseam|length|pit to pit/.test(text)) return "measurement";
    if (/flaw|defect|damage|stain|hole|condition/.test(text)) return "condition_detail";
    if (/back|rear/.test(text)) return "back_overview";
    if (/front|main|overview|first/.test(text) || index === 0) return "front_overview";
    return "detail";
  }

  function resolutionHint(image = {}) {
    const value = identitySource(image);
    const direct = value.match(/(?:^|[\/_-])s-l(\d{2,5})(?:\.|[\/_-])/i);
    if (direct) return Number(direct[1] || 0);
    const legacyVariant = value.match(/\/\$_(\d{1,3})\.(?:jpe?g|png|webp|gif)$/i);
    if (legacyVariant) {
      const code = Number(legacyVariant[1] || 0);
      if (code >= 57) return 1600;
      if (code >= 12) return 800;
      return 160;
    }
    const legacy = value.match(/\/00\/s\/([A-Za-z0-9+/=_-]+)\//i)?.[1] || "";
    if (legacy) {
      try {
        const decoded = typeof atob === "function" ? atob(legacy.replace(/-/g, "+").replace(/_/g, "/")) : "";
        const sizes = decoded.match(/(\d{2,5})/g) || [];
        return Math.max(0, ...sizes.map(Number));
      } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    return 0;
  }

  function modePhotoCap(settings = {}) {
    if (settings.tokenMode === "cheap") return 4;
    if (settings.tokenMode === "quality") return 8;
    // V8.23.21 cost policy: Balanced keeps broad visual coverage without paying
    // for every gallery image. Strict label facts still have local OCR plus one
    // bounded high-detail recovery pass when evidence is genuinely needed.
    return 6;
  }

  function score(image = {}, index = 0, total = 1) {
    const group = category(image, index);
    const base = {
      care_material_tag: 145,
      brand_size_tag: 140,
      measurement: 120,
      front_overview: 115,
      back_overview: 105,
      condition_detail: 90,
      detail: 60
    }[group] || 0;
    const kind = String(image.kind || "").toLowerCase();
    const kindScore = kind === "ebay" ? 15 : kind === "upload" ? 10 : kind === "screenshot" ? -30 : 0;
    const resolution = resolutionHint(image);
    const resolutionScore = resolution >= 1200 ? 12 : resolution >= 800 ? 8 : resolution >= 400 ? 3 : 0;
    const lateEvidenceScore = total >= 4 && index >= Math.max(2, total - 3) && group === "detail" ? 28 : 0;
    return base + kindScore + resolutionScore + lateEvidenceScore - Math.min(index, 40) * 0.01;
  }

  function annotated(image, originalIndex, requestIndex, selection = {}) {
    const group = category(image, originalIndex);
    const role = String(image.role || "").trim() || `${group.replace(/_/g, " ")} candidate`;
    const evidenceCandidate = selection.evidenceCandidate === true || ["brand_size_tag", "care_material_tag", "measurement"].includes(group);
    const result = {
      ...image,
      role,
      photoCategory: group,
      originalIndex,
      requestPhotoNumber: requestIndex + 1,
      photoId: stablePhotoId(image),
      canonicalUrl: canonicalPhotoUrl(image),
      selectionReason: String(selection.reason || "ranked_evidence_coverage"),
      selectionScore: Number(selection.rank || 0),
      evidenceCandidate
    };
    if (image.forceHighDetail === true || evidenceCandidate || selection.forceHighDetail === true) result.forceHighDetail = true;
    return result;
  }

  function selectPhotos(photos, settings = {}) {
    const requested = Math.max(1, Math.min(Number(settings.maxPhotosPerRequest || settings.photoLimit || modePhotoCap(settings)), 10));
    const limit = Math.min(requested, modePhotoCap(settings));
    const filtered = filterPhotos(photos).map((image, originalIndex, all) => ({
      image,
      originalIndex,
      group: category(image, originalIndex),
      rank: score(image, originalIndex, all.length)
    }));
    if (settings.smartPhotoSelection === false) {
      return filtered.slice(0, limit).map((entry, index) => annotated(entry.image, entry.originalIndex, index, { reason: "manual_order", rank: entry.rank }));
    }
    if (!filtered.length) return [];

    const selected = [];
    const selectedKeys = new Set();
    const add = (entry, reason, options = {}) => {
      if (!entry || selected.length >= limit) return false;
      const id = photoKey(entry.image);
      if (!id || selectedKeys.has(id)) return false;
      selected.push({ ...entry, reason, ...options });
      selectedKeys.add(id);
      return true;
    };
    const bestOf = group => filtered.filter(entry => entry.group === group).sort((a, b) => b.rank - a.rank || a.originalIndex - b.originalIndex)[0];
    const at = index => filtered[Math.max(0, Math.min(filtered.length - 1, index))];

    // 1) Whole-item coverage. When no explicit metadata exists, eBay order is
    // the safest bounded signal: first is normally front and second is normally back.
    add(bestOf("front_overview") || at(0), "front_overview");
    if (limit > 1) add(bestOf("back_overview") || at(1), "back_overview");

    // 2) Explicit label/measurement evidence always outranks positional guesses.
    add(bestOf("brand_size_tag"), "explicit_brand_size_tag", { evidenceCandidate: true, forceHighDetail: true });
    add(bestOf("care_material_tag"), "explicit_care_material_tag", { evidenceCandidate: true, forceHighDetail: true });
    add(bestOf("measurement"), "explicit_measurement", { evidenceCandidate: true, forceHighDetail: true });

    // 3) Generic eBay photos often have no useful alt text. In that case, the
    // final photos are commonly label, care, sole, serial, or measurement evidence.
    // Treat them as candidates only; never as proof.
    if (selected.length < limit && filtered.length > 2) add(at(filtered.length - 1), "late_sequence_evidence_candidate");
    if (selected.length < limit && filtered.length > 3) add(at(filtered.length - 2), "late_sequence_evidence_candidate");

    // 4) Generic galleries often carry no semantic metadata. Spread the remaining
    // evidence coverage across the sequence instead of betting only on the middle.
    // This makes a tag at photo 4/6/8 much less likely to disappear from a 10-photo
    // request while still keeping the front/back and late evidence candidates.
    for (const fraction of [0.25, 0.5, 0.75]) {
      if (selected.length >= limit || filtered.length <= 2) break;
      add(at(Math.round((filtered.length - 1) * fraction)), `sequence_${Math.round(fraction * 100)}pct_candidate`);
    }

    // 5) Quality/Balanced mode can retain extra distinct evidence categories; remaining
    // slots are filled by score without another page scan.
    add(bestOf("condition_detail"), "explicit_condition_detail");
    for (const entry of [...filtered].sort((a, b) => b.rank - a.rank || a.originalIndex - b.originalIndex)) {
      if (selected.length >= limit) break;
      add(entry, "ranked_evidence_coverage");
    }

    return selected.slice(0, limit).map((entry, index) => annotated(entry.image, entry.originalIndex, index, entry));
  }

  function selectionSummary(images = []) {
    const list = Array.isArray(images) ? images : [];
    return {
      selectedCount: list.length,
      highDetailCount: list.filter(image => image?.forceHighDetail === true).length,
      evidenceCandidateCount: list.filter(image => image?.evidenceCandidate === true).length,
      originalIndexes: list.map(image => Number(image?.originalIndex ?? -1)).filter(index => index >= 0),
      reasons: list.map(image => String(image?.selectionReason || "")).filter(Boolean)
    };
  }

  // roleMap is optional and runtime only. When present it carries the model's
  // own statement about what each photo turned out to be, so it outranks the
  // ordering heuristics below, which are only guesses about photo order.
  function selectRepairPhotos(photos, questions = [], limit = 3, roleMap = null) {
    const max = Math.max(1, Math.min(Number(limit || 3), 5));
    const roleMapApi = global.EbayAiPhotoRoleMapV843 || null;
    const filtered = filterPhotos(photos).map((image, originalIndex) => ({ image, originalIndex, group: category(image, originalIndex) }));
    const questionText = (Array.isArray(questions) ? questions : []).join(" ").toLowerCase();
    const wantsLabel = /brand|size|material|garment care|country|model|product line/.test(questionText);
    const wantsMeasurement = /measure|length|width|height|waist|inseam|chest|sleeve|dimension/.test(questionText);
    const mappedRole = image => {
      if (!roleMap || !roleMapApi || typeof roleMapApi.roleForImage !== "function") return "";
      try { return roleMapApi.roleForImage(image, roleMap); } catch (_) { return ""; }
    };
    const relevantRole = role => {
      if (!role) return false;
      if (role === "measurement") return wantsMeasurement || !wantsLabel;
      return wantsLabel;
    };
    const preferred = filtered
      .map(entry => {
        const text = descriptor(entry.image);
        let rank = score(entry.image, entry.originalIndex);
        const role = mappedRole(entry.image);
        // A confirmed role is a fact, so it must beat every heuristic bonus.
        if (relevantRole(role)) rank += 1000;
        if (wantsLabel && /tag|label|brand|size|care|material|composition|made in|country/.test(text)) rank += 300;
        if (wantsLabel && ["brand_size_tag", "care_material_tag"].includes(entry.group)) rank += 250;
        // eBay thumbnails usually place overview photos first and labels/details later.
        if (wantsLabel && entry.originalIndex >= 2) rank += 60;
        if (wantsLabel && entry.originalIndex <= 1) rank -= 80;
        return { ...entry, rank, mappedRole: role };
      })
      .sort((a, b) => b.rank - a.rank || a.originalIndex - b.originalIndex);
    const selected = preferred.slice(0, max);
    return selected.map((entry, index) => {
      const image = annotated(entry.image, entry.originalIndex, index);
      // Technical signal only. It never replaces role and is never rendered
      // into the request text, so the model is not told its own prior answer.
      if (entry.mappedRole) image.forceHighDetail = true;
      return image;
    });
  }

  global.EbayAiPhotoSelectorV790 = Object.freeze({ source, identitySource, isSupportedPhoto, photoKey, stablePhotoId, canonicalPhotoUrl, filterPhotos, category, resolutionHint, modePhotoCap, score, selectPhotos, selectionSummary, selectRepairPhotos });
})(globalThis);

/* ===== EBAY FIELD SNAPSHOT ===== */
/* Exact lightweight reader for the real eBay Item Specifics DOM.
   One container, one row snapshot, one top-to-bottom route. */
(function initEbayPageFields(global) {
  "use strict";

  const ROOT_SELECTOR = ".smry.summary__attributes";
  const ROW_SELECTOR = "[data-testid='attribute']";
  const CACHE = { draftId: "", builtAt: 0, root: null, signature: "", map: null };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

  async function waitUntil(check, timeoutMs = 650, intervalMs = 25) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs || 0));
    while (true) {
      try { if (await check()) return true; } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
      if (Date.now() >= deadline) return false;
      await sleep(intervalMs);
    }
  }

  function clean(value, limit = 500) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function key(value) {
    return clean(value, 140).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function escapeSelector(value) {
    try { return CSS.escape(String(value || "")); }
    catch (_) { return String(value || "").replace(/(["\\.#:[\]()])/g, "\\$1"); }
  }

  function isVisible(element) {
    if (!element || element.isConnected === false) return false;
    try {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    } catch (_) { return false; }
  }

  function isBlockedLabel(label) {
    return Boolean(
      global.EbayAiSafetyV790?.isBlockedField?.(label)
      || global.EbayAiItemSpecificsV7100?.shouldAlwaysSkip?.(label)
    );
  }

  function draftIdFromUrl(url = location.href) {
    try {
      const parsed = new URL(url);
      for (const [name, value] of parsed.searchParams.entries()) {
        if (name.toLowerCase().replace(/[^a-z0-9]/g, "") === "draftid") return clean(value, 160);
      }
    } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    return clean(String(url).match(/[?&](?:draftId|draft_id)=([^&#]+)/i)?.[1] || "", 160);
  }

  function itemSpecificRoot() {
    return document.querySelector(ROOT_SELECTOR);
  }

  function labelFromControlName(control) {
    const raw = clean(control?.getAttribute?.("name") || "", 180);
    if (!raw) return "";
    if (/^attributes\./i.test(raw)) return clean(raw.replace(/^attributes\./i, "").replace(/[_-]+/g, " "), 100);
    if (/^itemOrigin\./i.test(raw)) return "Country of Origin";
    return "";
  }

  function fieldLabelFromRow(row) {
    if (!row) return "";
    const labelRoot = row.querySelector(".summary__attributes--label");
    const candidates = [
      labelRoot?.querySelector("button"),
      labelRoot?.querySelector("label"),
      labelRoot?.querySelector(".field__label"),
      row.querySelector("label.field__label")
    ];
    for (const node of candidates) {
      const text = clean(node?.textContent || node?.getAttribute?.("aria-label") || "", 100).replace(/\s*\*\s*$/, "");
      if (text && !/item-specific-dropdown-label/i.test(text) && !isBlockedLabel(text)) return text;
    }
    const control = row.querySelector("button[name^='attributes.'],input[name^='attributes.'],textarea[name^='attributes.'],select[name^='attributes.'],button[name^='itemOrigin.'],input[name^='itemOrigin.']");
    const fromName = labelFromControlName(control);
    return fromName && !isBlockedLabel(fromName) ? fromName : "";
  }

  function choiceText(element) {
    if (!element) return "";
    const direct = clean(element.getAttribute?.("aria-label") || element.value || element.getAttribute?.("title") || "", 100);
    if (direct) return direct;
    const input = element.querySelector?.("input[type='radio'],input[type='checkbox']");
    const nested = clean(input?.getAttribute?.("aria-label") || input?.value || "", 100);
    return nested || clean(element.textContent || "", 100);
  }

  function choiceButtons(row) {
    return Array.from(row?.querySelectorAll?.(".summary__attributes--value button[aria-pressed],.summary__attributes--value [role='radio'],.summary__attributes--value input[type='radio']") || [])
      .filter(element => choiceText(element));
  }

  // eBay has rendered binary Item Specifics as radios, toggle buttons and labels in
  // different builds. Detect Yes/No strictly inside the exact Item Specific row.
  function yesNoChoices(row) {
    if (!row) return [];
    const scope = row.querySelector(".summary__attributes--value") || row;
    const candidates = Array.from(scope.querySelectorAll([
      "button", "[role='radio']", "[role='button']", "input[type='radio']",
      "label", "[aria-checked]", "[aria-pressed]", "[data-state]", "[data-selected]"
    ].join(",")));
    const byValue = new Map();
    for (const element of candidates) {
      const normalized = key(choiceText(element));
      if (normalized !== "yes" && normalized !== "no") continue;
      let target = element;
      if (!isVisible(target)) {
        const label = element.closest?.("label");
        const button = element.closest?.("button,[role='button'],[role='radio']");
        target = [label, button, element].find(isVisible) || element;
      }
      const existing = byValue.get(normalized);
      if (!existing || (!isVisible(existing) && isVisible(target))) byValue.set(normalized, target);
    }
    return byValue.has("yes") && byValue.has("no") ? [byValue.get("yes"), byValue.get("no")] : [];
  }

  function choicesFor(row, type) {
    return type === "yesno" ? yesNoChoices(row) : choiceButtons(row);
  }

  function mainControlFromRow(row) {
    if (!row) return null;
    // Binary rows have changed markup several times on eBay. Prefer the exact
    // row-local Yes/No pair before generic named controls so the scanner and
    // writer agree on the same control type.
    const binary = yesNoChoices(row);
    if (binary.length === 2) return binary[0];
    const named = row.querySelector([
      "button[name^='attributes.']",
      "input[name^='attributes.']:not([type='hidden']):not([type='file'])",
      "textarea[name^='attributes.']",
      "select[name^='attributes.']",
      "button[name^='itemOrigin.']",
      "input[name^='itemOrigin.']:not([type='hidden']):not([type='file'])",
      "textarea[name^='itemOrigin.']",
      "select[name^='itemOrigin.']"
    ].join(","));
    if (named) return named;
    const choices = choiceButtons(row);
    if (choices.length >= 2) return choices[0];
    return row.querySelector(".summary__attributes--value input:not([type='hidden']):not([type='file']),.summary__attributes--value textarea,.summary__attributes--value select") || null;
  }

  function nativeSetter(element) {
    let proto = element;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor?.set) return descriptor.set;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function writeNative(element, value, options = {}) {
    const text = options.allowEmpty ? String(value ?? "").replace(/\u00a0/g, " ").replace(/\r/g, "") : clean(value, 500);
    if (!element || (!text && !options.allowEmpty)) return false;
    if (options.scroll !== false) {
      try { element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    try { element.focus({ preventScroll: true }); } catch (error) {
      globalThis.EbayLogger?.debug?.("Focus without preventScroll fallback", { message: error?.message || String(error) });
      try { element.focus(); } catch (fallbackError) { globalThis.EbayLogger?.debug?.("Element focus skipped", { message: fallbackError?.message || String(fallbackError) }); }
    }
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "select") {
      const exact = Array.from(element.options || []).find(option => key(option.textContent) === key(text) || key(option.value) === key(text));
      if (!exact) return false;
      element.value = exact.value;
    } else if (tag === "input" || tag === "textarea") {
      const setter = nativeSetter(element);
      if (setter) setter.call(element, text); else element.value = text;
    } else if (element.isContentEditable || element.getAttribute?.("role") === "textbox") {
      element.textContent = text;
    } else {
      return false;
    }
    for (const eventName of ["input", "change"]) {
      try { element.dispatchEvent(new Event(eventName, { bubbles: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    if (!options.keepFocus) {
      try { element.dispatchEvent(new Event("blur", { bubbles: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
      try { element.blur(); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    return true;
  }

  function dispatchInput(element, data, inputType = "insertText") {
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: data == null ? null : String(data),
        inputType
      }));
    } catch (_) {
      try { element.dispatchEvent(new Event("input", { bubbles: true, composed: true })); }
      catch (error) { globalThis.EbayLogger?.debug?.("Synthetic input dispatch skipped", { message: error?.message || String(error) }); }
    }
  }

  function setTrackedInputValue(element, nextValue, data, inputType = "insertText") {
    if (!element) return false;
    const previous = String(element.value ?? "");
    try {
      element.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: data == null ? null : String(data),
        inputType
      }));
    } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    const setter = nativeSetter(element);
    try {
      if (setter) setter.call(element, String(nextValue ?? ""));
      else element.value = String(nextValue ?? "");
    } catch (_) { return false; }
    try { element._valueTracker?.setValue?.(previous); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    dispatchInput(element, data, inputType);
    return String(element.value ?? "") === String(nextValue ?? "");
  }

  function writeSearchValue(element, value, options = {}) {
    const text = String(value ?? "").replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
    if (!element) return false;
    try { element.focus({ preventScroll: true }); } catch (error) {
      globalThis.EbayLogger?.debug?.("Focus without preventScroll fallback", { message: error?.message || String(error) });
      try { element.focus(); } catch (fallbackError) { globalThis.EbayLogger?.debug?.("Element focus skipped", { message: fallbackError?.message || String(fallbackError) }); }
    }
    try { element.setSelectionRange?.(0, String(element.value || "").length); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    setTrackedInputValue(element, "", null, "deleteContentBackward");
    if (!text) {
      try { element.dispatchEvent(new Event("change", { bubbles: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
      return String(element.value || "") === "";
    }
    if (options.characterEvents) {
      let current = "";
      for (const char of text) {
        try { element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
        current += char;
        setTrackedInputValue(element, current, char, "insertText");
        try { element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true, cancelable: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
      }
    } else {
      setTrackedInputValue(element, text, text, "insertText");
    }
    try { element.setSelectionRange?.(text.length, text.length); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    try { element.dispatchEvent(new Event("change", { bubbles: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    return key(element.value) === key(text);
  }

  function safeClick(element, options = {}) {
    if (!element || !isVisible(element)) return false;
    const text = key(`${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`);
    if (/\b(publish|list it|list item|submit|pay|delete|remove listing|finish update)\b/.test(text)) return false;
    if (options.scroll !== false) {
      try { element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    try { element.click(); return true; }
    catch (_) {
      try { return element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window })); }
      catch (__) { return false; }
    }
  }

  function selected(element) {
    if (!element) return false;
    if (element.checked === true) return true;
    const nested = element.querySelector?.("input[type='radio'],input[type='checkbox']");
    if (nested?.checked === true) return true;
    const nodes = [element, element.closest?.("[aria-selected],[aria-checked],[aria-pressed],[data-state],[data-selected]")].filter(Boolean);
    for (const node of nodes) {
      if (["aria-selected", "aria-checked", "aria-pressed", "data-selected"].some(name => String(node.getAttribute?.(name) || "").toLowerCase() === "true")) return true;
      if (/^(?:on|checked|selected|active)$/i.test(String(node.getAttribute?.("data-state") || ""))) return true;
      if (/(^|\s)(selected|checked|is-selected|is-checked|active)(\s|$)/i.test(String(node.className || ""))) return true;
    }
    return false;
  }

  function menuForControl(row, control) {
    const id = clean(control?.getAttribute?.("aria-controls") || "", 240);
    if (id) {
      const owned = document.getElementById(id);
      if (owned && row?.contains?.(owned)) return owned;
    }
    return row?.querySelector?.(".fake-menu-button__menu,.se-filter-menu-button__menu-container,.se-toggle-group-menu,[role='listbox']") || null;
  }

  function menuIsOpen(row, control) {
    const menu = menuForControl(row, control);
    if (!menu) return false;
    if (String(control?.getAttribute?.("aria-expanded") || "").toLowerCase() === "false") return false;
    return isVisible(menu);
  }

  async function waitForOpenMenu(record, timeoutMs = 650) {
    let openedMenu = null;
    const opened = await waitUntil(() => {
      record.refresh();
      const menu = menuForControl(record.row, record.control);
      if (menu && menuIsOpen(record.row, record.control)) {
        openedMenu = menu;
        return true;
      }
      return false;
    }, timeoutMs, 25);
    return opened ? openedMenu : null;
  }

  function textWithoutHiddenNoise(element) {
    if (!element) return "";
    const aria = clean(element.getAttribute?.("aria-label") || "", 160);
    if (aria) return aria;
    try {
      const clone = element.cloneNode(true);
      clone.querySelectorAll("svg,.clipped,[aria-hidden='true'],.filter-menu__checkbox").forEach(node => node.remove());
      return clean(clone.textContent || "", 160);
    } catch (_) {
      return clean(element.textContent || "", 160);
    }
  }

  function optionText(element) {
    const titled = element?.querySelector?.(".toggle-button__title,.filter-menu__text");
    return clean(element?.getAttribute?.("aria-label") || textWithoutHiddenNoise(titled || element), 160);
  }

  function isPlaceholderValue(value) {
    const normalized = key(value);
    if (!normalized) return true;
    return /^(?:select|select option|select an option|choose|choose option|choose an option|search|search or enter your own|enter your own|add custom value|not selected|none selected|all options)$/.test(normalized);
  }

  function displayedControlValue(row, control, label = "") {
    if (!control) return "";
    const labelKey = key(label);
    const candidates = [
      control.querySelector?.(".se-expand-button__button-text")?.textContent,
      control.querySelector?.(".fake-menu-button__button-text")?.textContent,
      control.querySelector?.(".filter-menu-button__button-text")?.textContent,
      control.querySelector?.("[data-testid*='selected' i],[data-testid*='value' i]")?.textContent,
      control.getAttribute?.("aria-valuetext"),
      control.getAttribute?.("data-value"),
      control.textContent
    ];
    for (const candidate of candidates) {
      let value = clean(candidate, 240);
      if (!value) continue;
      if (labelKey && key(value) === labelKey) continue;
      // Some eBay buttons include the field label before the selected value.
      if (label && key(value).startsWith(`${labelKey} `)) value = clean(value.slice(label.length), 200);
      if (!value || isPlaceholderValue(value) || key(value) === labelKey) continue;
      if (/^(?:open|close|clear|search results|no results found)$/i.test(value)) continue;
      return value;
    }
    // Last resort: use only non-interactive visible-summary text from the value
    // column. Never concatenate hidden menu options, Clear buttons or search UI: that
    // made a cleared dropdown look like it still contained "Black Blue ...".
    const valueScope = row?.querySelector?.(".summary__attributes--value");
    if (valueScope) {
      try {
        const clone = valueScope.cloneNode(true);
        clone.querySelectorAll([
          "button", "input", "textarea", "select", "svg", ".clipped",
          "[hidden]", "[aria-hidden='true']", "[role='listbox']", "[role='menu']",
          "[role='option']", "[role='menuitem']", "[role='menuitemradio']", "[role='menuitemcheckbox']"
        ].join(",")).forEach(node => node.remove());
        const scoped = clean(clone.textContent || "", 240);
        if (scoped && key(scoped) !== labelKey && !isPlaceholderValue(scoped)) return scoped;
      } catch (error) {
        console.warn("[Page Fields] value-summary fallback failed", label || "field", error?.message || error);
      }
    }
    return "";
  }

  function exactOptions(row) {
    if (!row) return [];
    const selector = [
      "[role='menuitemradio']",
      "[role='menuitemcheckbox']",
      "[role='option']",
      "button.toggle-button[aria-label]"
    ].join(",");
    return Array.from(row.querySelectorAll(selector));
  }

  function exactOption(row, value) {
    const wanted = key(value);
    if (!wanted) return null;
    return exactOptions(row).filter(isVisible).find(option => key(optionText(option)) === wanted) || null;
  }

  function searchInput(row, control) {
    const menu = menuForControl(row, control);
    if (!menu) return null;
    return menu.querySelector("input[name^='search-box-attributes'],input[placeholder*='search' i],input[aria-label*='search' i]");
  }

  function allowsCustomValue(row, control) {
    const search = searchInput(row, control);
    if (!search) return false;
    const hint = clean(`${search.getAttribute?.("placeholder") || ""} ${search.getAttribute?.("aria-label") || ""}`, 300);
    return /enter your own|add custom|custom value/i.test(hint);
  }

  function menuSignature(row, control) {
    const menu = menuForControl(row, control);
    if (!menu) return "";
    const live = Array.from(menu.querySelectorAll("[aria-live],.se-filter-menu-button__list-menu > span p"))
      .map(node => clean(node.textContent || "", 180)).filter(Boolean).slice(0, 4);
    const options = exactOptions(row).filter(isVisible).map(optionText).filter(Boolean).slice(0, 24);
    return key([...live, ...options].join(" | "));
  }

  function customValueTextMatches(rawValue, markerValue, value) {
    const raw = clean(rawValue, 240);
    const marker = key(markerValue);
    const normalized = key(raw);
    const wanted = key(value);
    if (!raw || !wanted) return false;
    const mentionsWanted = normalized === wanted || normalized.endsWith(` ${wanted}`) || normalized.includes(` ${wanted} `);
    const customCue = /^\s*\+/.test(raw)
      || /\b(add|create|use)\b.*\b(custom|value|option)?\b/i.test(raw)
      || /\b(custom|create|new value|add option)\b/.test(marker);
    return mentionsWanted && customCue;
  }

  function customValueOption(row, control, value) {
    const menu = menuForControl(row, control);
    const wanted = key(value);
    if (!menu || !wanted) return null;
    const typedValue = key(searchInput(row, control)?.value || "");
    const candidates = Array.from(menu.querySelectorAll("button,[role='menuitem'],[role='menuitemradio'],[role='option'],[data-testid*='custom' i]")).filter(isVisible);
    for (const candidate of candidates) {
      const raw = clean(candidate.getAttribute?.("aria-label") || textWithoutHiddenNoise(candidate), 240);
      const marker = `${candidate.className || ""} ${candidate.getAttribute?.("data-testid") || ""} ${candidate.getAttribute?.("name") || ""}`;
      if (customValueTextMatches(raw, marker, value)) return candidate;
      if (typedValue === wanted && /add custom value|create custom value|use custom value/i.test(raw)) return candidate;
    }
    return null;
  }

  function noResultSignal(row, control) {
    const menu = menuForControl(row, control);
    const text = clean(menu?.textContent || "", 1800);
    return /rendered\s+0\s+out of|no results|no options|nothing found/i.test(text);
  }

  function selectedValuesFromRow(row) {
    const values = [];
    const add = value => {
      const text = clean(value, 160);
      if (text && !values.some(existing => key(existing) === key(text))) values.push(text);
    };
    for (const option of Array.from(row?.querySelectorAll?.("[role='menuitemcheckbox'][aria-checked='true'],[role='menuitemradio'][aria-checked='true'],[role='option'][aria-selected='true'],button.toggle-button[aria-pressed='true']") || [])) add(optionText(option));
    return values;
  }

  function detectType(row, control) {
    if (yesNoChoices(row).length === 2) return "yesno";
    if (choiceButtons(row).length >= 2) return "choice";
    const tag = String(control?.tagName || "").toLowerCase();
    const role = String(control?.getAttribute?.("role") || "").toLowerCase();
    const inputType = String(control?.type || "").toLowerCase();
    if (tag === "textarea" || (tag === "input" && !["radio", "checkbox"].includes(inputType) && role !== "combobox" && !control?.hasAttribute?.("aria-haspopup"))) return "text";
    if (tag === "select" && control?.multiple) return "multi";
    if (row?.querySelector?.("[role='menuitemcheckbox'],.filter-menu__item[role='menuitemcheckbox']")) return "multi";
    return "dropdown";
  }

  function recordLocator(row, control, label, order) {
    const identity = global.EbayIdentityV3;
    const name = clean(control?.getAttribute?.("name") || "", 220);
    const id = clean(control?.id || "", 240);
    const domKey = name || id || `label:${key(label)}`;
    const marketplaceId = identity?.marketplaceId ? identity.marketplaceId() : "EBAY_US";
    const categoryId = identity?.categoryIdFromDocument ? identity.categoryIdFromDocument() : "unknown";
    const fieldId = identity?.fieldId ? identity.fieldId({ marketplace: marketplaceId, categoryId, domKey, label }) : `aspect:v3:${key(domKey)}`;
    return { label, order, name, id, domKey, marketplaceId, categoryId, fieldId, rowIndex: order };
  }

  function resolveRow(locator) {
    const root = itemSpecificRoot();
    if (!root) return null;
    if (locator.name) {
      try {
        const control = root.querySelector(`[name="${escapeSelector(locator.name)}"]`);
        const row = control?.closest?.(ROW_SELECTOR);
        if (row && key(fieldLabelFromRow(row)) === key(locator.label)) return row;
      } catch (error) {
        console.warn("[Page Fields] exact control-name lookup failed", locator.label, error?.message || error);
      }
    }
    // Never fall back to the old row index. React can reorder Item Specific rows;
    // an index fallback can silently write the answer into a different field.
    return Array.from(root.querySelectorAll(ROW_SELECTOR))
      .find(row => key(fieldLabelFromRow(row)) === key(locator.label)) || null;
  }

  function rowIsRequired(row, control = null, label = "") {
    if (!row) return false;
    if (control?.required === true || String(control?.getAttribute?.("aria-required") || "").toLowerCase() === "true") return true;
    if (row.querySelector?.(".summary__attributes--label.required-field,[aria-required='true'],[data-required='true']")) return true;
    const labelNode = row.querySelector?.(".summary__attributes--label,label,legend,[data-testid*='label' i]");
    const rawLabelText = clean(`${labelNode?.textContent || ""} ${labelNode?.getAttribute?.("aria-label") || ""}`, 220);
    if (/\*\s*$/.test(rawLabelText) || /\brequired\b/i.test(rawLabelText)) return true;
    return /\brequired\b/i.test(clean(label, 140));
  }

  function makeRecord(row, order) {
    const label = fieldLabelFromRow(row);
    const control = mainControlFromRow(row);
    const locator = recordLocator(row, control, label, order);
    const record = {
      name: label,
      label,
      key: key(label),
      fieldId: locator.fieldId,
      domKey: locator.domKey,
      fieldKeySource: locator.name ? "dom_control_name" : locator.id ? "dom_control_id" : "label_fallback",
      marketplaceId: locator.marketplaceId,
      categoryId: locator.categoryId,
      type: detectType(row, control),
      row,
      control,
      required: rowIsRequired(row, control, label),
      order,
      locator,
      lastSelectionResult: null,
      refresh() {
        const freshRow = resolveRow(this.locator);
        if (!freshRow) {
          this.row = null;
          this.control = null;
          return null;
        }
        this.row = freshRow;
        this.control = mainControlFromRow(freshRow);
        this.type = detectType(freshRow, this.control);
        this.required = rowIsRequired(freshRow, this.control, this.label);
        return this.control;
      },
      async centerForFill() {
        this.refresh();
        const target = this.row || this.control;
        if (!target || !this.control) return false;
        if (menuIsOpen(this.row, this.control)) return true;
        try {
          const rect = target.getBoundingClientRect();
          const viewportHeight = Math.max(1, Number(window.innerHeight || document.documentElement?.clientHeight || 0));
          const currentCenter = rect.top + rect.height / 2;
          const targetCenter = viewportHeight * 0.42;
          const delta = currentCenter - targetCenter;
          const comfortableTop = viewportHeight * 0.30;
          const comfortableBottom = viewportHeight * 0.54;
          if (currentCenter < comfortableTop || currentCenter > comfortableBottom) {
            window.scrollBy({ top: delta, left: 0, behavior: "auto" });
            await nextFrame();
            this.refresh();
          }
        } catch (_) {
          try {
            target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
            await nextFrame();
            this.refresh();
          } catch (error) { globalThis.EbayLogger?.debug?.("DOM fallback skipped", { message: error?.message || String(error) }); }
        }
        return Boolean(this.control);
      },
      scrollIntoView() {
        return this.centerForFill();
      },
      read() {
        this.refresh();
        if (!this.control) return "";
        if (this.type === "choice" || this.type === "yesno") {
          const active = choicesFor(this.row, this.type).find(selected);
          return active ? clean(choiceText(active), 80) : "";
        }
        const tag = String(this.control.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return clean(this.control.value, 300);
        if (tag === "select") return Array.from(this.control.selectedOptions || []).map(option => clean(option.textContent || option.value, 120)).filter(Boolean).join(", ");
        const selectedValues = selectedValuesFromRow(this.row);
        if (this.type === "multi" && selectedValues.length) return selectedValues.join(", ");
        const displayed = displayedControlValue(this.row, this.control, this.label);
        if (displayed) return displayed;
        const singleSelected = selectedValues[0];
        return singleSelected || "";
      },
      readValues() {
        this.refresh();
        if (this.type === "multi") return selectedValuesFromRow(this.row);
        const current = this.read();
        return current ? [current] : [];
      },
      options() {
        this.refresh();
        const values = [];
        const choiceType = this.type === "choice" || this.type === "yesno";
        const candidates = choiceType ? choicesFor(this.row, this.type) : exactOptions(this.row);
        for (const option of candidates) {
          const text = choiceType ? clean(choiceText(option), 160) : optionText(option);
          if (text && !values.some(existing => key(existing) === key(text))) values.push(text);
        }
        return values;
      },
      optionTotal(knownOptions = null) {
        this.refresh();
        if (this.type === "choice" || this.type === "yesno") return choicesFor(this.row, this.type).length;
        const text = clean(this.row?.textContent || "", 4000);
        const match = text.match(/All options\s*\(total\s*(\d+)\s*options\)/i)
          || text.match(/Rendered\s*\d+\s*out of\s*(\d+)\s*options\s*in All options/i);
        const total = Number(match?.[1] || 0);
        return Number.isFinite(total) && total > 0 ? total : (Array.isArray(knownOptions) ? knownOptions.length : this.options().length);
      },
      write(value) {
        this.refresh();
        return writeNative(this.control, value, { scroll: false });
      },
      async open() {
        this.refresh();
        if (!this.control) return false;
        if (this.type === "text" || String(this.control.tagName || "").toLowerCase() === "select" || this.type === "choice" || this.type === "yesno") return true;
        if (menuIsOpen(this.row, this.control)) return true;
        if (!safeClick(this.control, { scroll: false })) return false;
        return Boolean(await waitForOpenMenu(this, 650));
      },
      isSelected(value) {
        const wanted = key(value);
        if (!wanted) return false;
        this.refresh();
        if (!this.control) return false;
        if (this.type === "choice" || this.type === "yesno") return choicesFor(this.row, this.type).some(button => key(choiceText(button)) === wanted && selected(button));
        const tag = String(this.control.tagName || "").toLowerCase();
        if (tag === "select") return Array.from(this.control.selectedOptions || []).some(option => key(option.textContent) === wanted || key(option.value) === wanted);
        if (selectedValuesFromRow(this.row).some(item => key(item) === wanted)) return true;
        return key(this.read()) === wanted;
      },
      allowsCustomValue() {
        this.refresh();
        return allowsCustomValue(this.row, this.control);
      },
      selectionOutcome() {
        return this.lastSelectionResult || null;
      },
      async selectExact(value) {
        const wanted = clean(value, 160);
        const finish = (ok, code, retryable, kind = "") => {
          this.lastSelectionResult = { ok: Boolean(ok), code, retryable: Boolean(retryable), kind, value: wanted };
          return Boolean(ok);
        };
        this.lastSelectionResult = null;
        if (!wanted) return finish(false, "empty_value", false);
        this.refresh();
        if (!this.control) return finish(false, "control_missing", false);
        if (this.isSelected(wanted)) return finish(true, "already_selected", false, "selected");

        if (this.type === "choice" || this.type === "yesno") {
          if (this.type === "yesno" && !["yes", "no"].includes(key(wanted))) return finish(false, "invalid_yesno_value", false);
          const target = choicesFor(this.row, this.type).find(button => key(choiceText(button)) === key(wanted));
          if (!target) return finish(false, this.type === "yesno" ? "exact_yesno_unavailable" : "exact_choice_unavailable", false);
          if (!safeClick(target, { scroll: false })) return finish(false, this.type === "yesno" ? "yesno_click_failed" : "choice_click_failed", true);
          const confirmed = await waitUntil(() => this.isSelected(wanted), 650, 25);
          return finish(confirmed, confirmed ? (this.type === "yesno" ? "yesno_selected" : "exact_choice_selected") : (this.type === "yesno" ? "yesno_not_confirmed" : "choice_not_confirmed"), !confirmed, "exact");
        }

        const tag = String(this.control.tagName || "").toLowerCase();
        if (tag === "select") {
          const option = Array.from(this.control.options || []).find(item => key(item.textContent) === key(wanted) || key(item.value) === key(wanted));
          if (!option) return finish(false, "exact_select_option_unavailable", false);
          if (this.control.multiple) option.selected = true; else this.control.value = option.value;
          this.control.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
          this.control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
          const confirmed = await waitUntil(() => this.isSelected(wanted), 500, 25);
          return finish(confirmed, confirmed ? "exact_select_option_selected" : "select_option_not_confirmed", !confirmed, "exact");
        }

        if (!await this.open()) return finish(false, "menu_open_failed", true);
        this.refresh();
        let option = exactOption(this.row, wanted);
        let custom = null;
        if (!option) {
          const search = searchInput(this.row, this.control);
          if (!search) return finish(false, "search_input_missing", false);
          const before = menuSignature(this.row, this.control);
          writeSearchValue(search, wanted);
          await waitUntil(() => {
            this.refresh();
            option = exactOption(this.row, wanted);
            custom = customValueOption(this.row, this.control, wanted);
            return Boolean(option || custom);
          }, 500, 25);
          if (!option && !custom) {
            writeSearchValue(search, wanted, { characterEvents: true });
            await waitUntil(() => {
              this.refresh();
              option = exactOption(this.row, wanted);
              custom = customValueOption(this.row, this.control, wanted);
              return Boolean(option || custom);
            }, 800, 25);
          }
          if (!option && !custom) {
            const changed = before !== menuSignature(this.row, this.control);
            const customAllowed = allowsCustomValue(this.row, this.control);
            if (!customAllowed && (changed || noResultSignal(this.row, this.control))) {
              return finish(false, "exact_option_unavailable", false);
            }
            return finish(false, customAllowed ? "custom_value_not_rendered" : "search_not_accepted", true, customAllowed ? "custom" : "");
          }
        }
        const target = option || custom;
        const kind = option ? "exact" : "custom";
        if (!target || !safeClick(target, { scroll: false })) return finish(false, `${kind}_option_click_failed`, true, kind);
        const confirmed = await waitUntil(() => this.isSelected(wanted), 800, 25);
        return finish(confirmed, confirmed ? `${kind}_value_selected` : `${kind}_value_not_confirmed`, !confirmed, kind);
      },
      async clear() {
        this.refresh();
        if (!this.control) return { ok: false, changed: false, reason: "control_missing" };
        const before = clean(this.read(), 500);
        if (!before) return { ok: true, changed: false, reason: "already_empty" };
        const isEmptyState = () => {
          this.refresh();
          if (!this.control) return true;
          const liveTag = String(this.control.tagName || "").toLowerCase();
          if (this.type === "choice" || this.type === "yesno") return !choicesFor(this.row, this.type).some(selected);
          if (this.type === "multi") return selectedValuesFromRow(this.row).length === 0;
          if (liveTag === "input" || liveTag === "textarea") return !clean(this.control.value, 500);
          if (liveTag === "select") {
            if (this.control.multiple) return Array.from(this.control.selectedOptions || []).length === 0;
            return !clean(this.control.value, 160);
          }
          const current = clean(this.read(), 500);
          return !current || /^(?:select|choose|add)(?:\s+(?:an?\s+)?(?:option|value))?$/i.test(current);
        };
        const confirmEmpty = async (timeoutMs = 800) => Boolean(await waitUntil(isEmptyState, timeoutMs, 25));
        const dispatchChanged = element => {
          try { element.dispatchEvent(new Event("input", { bubbles: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
          try { element.dispatchEvent(new Event("change", { bubbles: true, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
          try { element.dispatchEvent(new Event("blur", { bubbles: false, composed: true })); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
        };
        const clearButtons = () => Array.from(this.row?.querySelectorAll?.("button,[role='button']") || []).filter(button => {
          if (!isVisible(button) || button === this.control) return false;
          const text = clean(button.getAttribute?.("aria-label") || button.getAttribute?.("title") || button.textContent || "", 180);
          return /^(?:clear|reset)(?:\s+(?:selection|selected|value|field))?$/i.test(text)
            || /^(?:remove|clear)\s+(?:selected\s+)?(?:option|value|selection)\b/i.test(text)
            || /\bclear\s+(?:this\s+)?(?:field|selection|value)\b/i.test(text);
        });

        if (this.type === "text") {
          writeNative(this.control, "", { scroll: false });
          const ok = await confirmEmpty(700);
          return { ok, changed: ok, reason: ok ? "text_cleared" : "text_not_cleared" };
        }

        const tag = String(this.control.tagName || "").toLowerCase();
        if (tag === "select") {
          const options = Array.from(this.control.options || []);
          if (this.control.multiple) {
            let changed = false;
            for (const option of options) {
              if (option.selected) { option.selected = false; changed = true; }
            }
            if (changed) dispatchChanged(this.control);
          } else {
            const blank = options.find(option => !clean(option.value) || /^(?:select|choose|none|--+)$/i.test(clean(option.textContent || "", 80)));
            if (!blank) return { ok: false, changed: false, reason: "no_blank_select_option" };
            this.control.value = blank.value;
            dispatchChanged(this.control);
          }
          const ok = await confirmEmpty(700);
          return { ok, changed: ok, reason: ok ? "select_cleared" : "select_not_cleared" };
        }

        if (this.type === "multi") {
          if (!await this.open()) return { ok: false, changed: false, reason: "menu_open_failed" };
          this.refresh();
          const selectedNow = selectedValuesFromRow(this.row);
          let changed = false;
          for (const value of selectedNow) {
            this.refresh();
            const option = exactOption(this.row, value);
            if (!option || !selected(option)) continue;
            if (safeClick(option, { scroll: false })) {
              const off = await waitUntil(() => !this.isSelected(value), 650, 25);
              changed = changed || Boolean(off);
            }
          }
          await this.close?.();
          const ok = await confirmEmpty(800);
          return { ok, changed: ok && changed, reason: ok ? "multi_cleared" : "multi_not_cleared" };
        }

        // Prefer eBay's own row-local clear/remove control for single dropdowns and Yes/No.
        for (const button of clearButtons()) {
          if (!safeClick(button, { scroll: false })) continue;
          if (await confirmEmpty(800)) return { ok: true, changed: true, reason: "row_clear_control" };
        }

        // Closed eBay single dropdowns often render their Clear control only after
        // the menu opens. Open once, then prefer eBay's own row-local Clear/Reset.
        if (this.type === "dropdown") {
          const opened = await this.open();
          if (opened) {
            this.refresh();
            for (const button of clearButtons()) {
              if (!safeClick(button, { scroll: false })) continue;
              if (await confirmEmpty(900)) {
                await this.close?.();
                return { ok: true, changed: true, reason: "open_menu_clear_control" };
              }
            }
            const blankOption = exactOptions(this.row).filter(isVisible).find(option => {
              const value = optionText(option);
              return isPlaceholderValue(value) || /^(?:none|clear selection|remove selection)$/i.test(value);
            });
            if (blankOption && safeClick(blankOption, { scroll: false }) && await confirmEmpty(900)) {
              await this.close?.();
              return { ok: true, changed: true, reason: "blank_dropdown_option" };
            }
            await this.close?.();
          }
        }

        // Combobox inputs can usually be cleared with the same tracked native setter used by Fill.
        if (tag === "input" || tag === "textarea") {
          writeNative(this.control, "", { scroll: false });
          if (await confirmEmpty(800)) return { ok: true, changed: true, reason: "input_cleared" };
        }

        if (this.type === "choice" || this.type === "yesno") {
          const active = choicesFor(this.row, this.type).filter(selected);
          for (const choice of active) {
            const input = String(choice.tagName || "").toLowerCase() === "input" ? choice : choice.querySelector?.("input[type='radio'],input[type='checkbox']");
            const inputType = String(input?.type || "").toLowerCase();
            if (inputType === "checkbox" || String(choice.getAttribute?.("aria-pressed") || "").toLowerCase() === "true") {
              safeClick(choice, { scroll: false });
            } else if (input && inputType === "radio") {
              // A radio group normally cannot be cleared by directly mutating
              // `checked`: React/eBay can immediately restore its internal state.
              // If eBay exposes no row-local Clear/Reset control, leave this field
              // for Review rather than creating a UI/state mismatch.
              return { ok: false, changed: false, reason: "radio_clear_requires_ebay_control" };
            }
          }
          if (await confirmEmpty(800)) return { ok: true, changed: true, reason: "choice_cleared" };
        }

        return { ok: false, changed: false, reason: "clear_not_supported_or_not_confirmed" };
      },
      snapshot() {
        this.refresh();
        if (!this.control) return { currentValue: "", options: [], optionTotal: 0, customValueAllowed: false };
        const choiceType = this.type === "choice" || this.type === "yesno";
        const optionNodes = choiceType ? choicesFor(this.row, this.type) : exactOptions(this.row);
        const options = [];
        for (const option of optionNodes) {
          const text = choiceType ? clean(choiceText(option), 160) : optionText(option);
          if (text && !options.some(existing => key(existing) === key(text))) options.push(text);
        }
        let optionTotal = options.length;
        if (!choiceType) {
          const rowText = clean(this.row?.textContent || "", 4000);
          const match = rowText.match(/All options\s*\(total\s*(\d+)\s*options\)/i)
            || rowText.match(/Rendered\s*\d+\s*out of\s*(\d+)\s*options\s*in All options/i);
          const parsed = Number(match?.[1] || 0);
          if (Number.isFinite(parsed) && parsed > 0) optionTotal = parsed;
        }
        let currentValue = "";
        if (choiceType) {
          const active = choicesFor(this.row, this.type).find(selected);
          currentValue = active ? clean(choiceText(active), 80) : "";
        } else {
          const tag = String(this.control.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea") currentValue = clean(this.control.value, 300);
          else if (tag === "select") currentValue = Array.from(this.control.selectedOptions || []).map(option => clean(option.textContent || option.value, 120)).filter(Boolean).join(", ");
          else {
            const selectedValues = selectedValuesFromRow(this.row);
            if (this.type === "multi" && selectedValues.length) currentValue = selectedValues.join(", ");
            else currentValue = displayedControlValue(this.row, this.control, this.label) || clean(selectedValues[0] || "", 200);
          }
        }
        return { currentValue, options, optionTotal, customValueAllowed: allowsCustomValue(this.row, this.control) };
      },
      async close() {
        this.refresh();
        if (!this.control || String(this.control.getAttribute?.("aria-expanded") || "").toLowerCase() !== "true") return true;
        try {
          this.control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
          this.control.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
        await waitUntil(() => {
          this.refresh();
          return !menuIsOpen(this.row, this.control);
        }, 300, 25);
        return true;
      }
    };
    return record;
  }

  function fieldDomSignature(root = itemSpecificRoot()) {
    if (!root) return "";
    const rows = Array.from(root.querySelectorAll(ROW_SELECTOR));
    return `${rows.length}#${rows.map((row, index) => {
      const control = mainControlFromRow(row);
      const label = fieldLabelFromRow(row) || labelFromControlName(control) || `row-${index}`;
      return `${index}:${key(label)}:${clean(control?.getAttribute?.("name") || control?.id || "", 100)}`;
    }).join("|")}`;
  }

  // A value-only signature is intentionally separate from fieldDomSignature.
  // eBay can keep the same controls while hydrating or normalizing values later.
  // Autosave completion uses this to wait for a bounded quiet window before it
  // reports success; it does not rescan or mutate the form.
  function currentValueFromRow(row, control, label = "") {
    if (!control) return "";
    const tag = String(control.tagName || "").toLowerCase();
    const type = detectType(row, control);
    if (type === "choice" || type === "yesno") {
      return choicesFor(row, type).filter(selected).map(choice => clean(choiceText(choice), 120)).filter(Boolean).join(", ");
    }
    if (tag === "input" || tag === "textarea") return clean(control.value, 500);
    if (tag === "select") return Array.from(control.selectedOptions || []).map(option => clean(option.textContent || option.value, 120)).filter(Boolean).join(", ");
    const selectedValues = selectedValuesFromRow(row);
    return selectedValues.length ? selectedValues.join(", ") : displayedControlValue(row, control, label);
  }

  function fieldValueMap(root = itemSpecificRoot()) {
    const values = {};
    if (!root) return values;
    const rows = Array.from(root.querySelectorAll(ROW_SELECTOR));
    rows.forEach((row, index) => {
      const control = mainControlFromRow(row);
      const label = fieldLabelFromRow(row) || labelFromControlName(control) || "";
      if (!label || !control) return;
      values[label] = currentValueFromRow(row, control, label);
    });
    return values;
  }

  function fieldValueSignature(root = itemSpecificRoot()) {
    if (!root) return "";
    const rows = Array.from(root.querySelectorAll(ROW_SELECTOR));
    return `${rows.length}#${rows.map((row, index) => {
      const control = mainControlFromRow(row);
      const label = fieldLabelFromRow(row) || labelFromControlName(control) || `row-${index}`;
      const value = currentValueFromRow(row, control, label);
      return `${index}:${key(label)}=${key(value)}`;
    }).join("|")}`;
  }

  function itemSpecificsToggleTextMatches(element, wantedText) {
    const wanted = key(wantedText);
    if (!element || !wanted) return false;
    const sources = [
      element.getAttribute?.("aria-label"),
      element.innerText,
      element.textContent,
      element.getAttribute?.("title")
    ].map(value => key(value || "")).filter(Boolean);
    if (sources.some(value => value === wanted)) return true;
    // eBay sometimes exposes the visible label as "Show more" while the
    // accessibility label is "Show more item specifics" (and likewise for
    // Show less). Accept that scoped variant without opening unrelated controls.
    if (wanted === "show more" || wanted === "show less") {
      return sources.some(value => value.startsWith(`${wanted} `) && /\bitem specifics?\b/.test(value));
    }
    return false;
  }

  function itemSpecificsToggle(wantedText) {
    const wanted = key(wantedText);
    const root = itemSpecificRoot();
    if (!root || !wanted) return null;
    const rootRect = (() => { try { return root.getBoundingClientRect(); } catch (_) { return null; } })();
    const section = root.closest?.("section,fieldset,[data-testid*='attribute' i]") || root.parentElement || root;
    const candidates = Array.from(section.querySelectorAll?.("button,[role='button'],a") || []);
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const element of candidates) {
      if (!isVisible(element) || !itemSpecificsToggleTextMatches(element, wanted)) continue;
      let rect;
      try { rect = element.getBoundingClientRect(); } catch (_) { continue; }
      if (rootRect && rect.top < rootRect.top - 80) continue;
      const distance = rootRect ? Math.abs(rect.top - rootRect.bottom) : 0;
      if (distance < bestDistance && distance < 900) { best = element; bestDistance = distance; }
    }
    return best;
  }

  async function ensureItemSpecificsReady(options = {}) {
    const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs || 7000), 12000));
    // Do not declare the section stable immediately after the first rows render.
    // On real eBay drafts the collapsed Show more control may hydrate slightly
    // later. This is a bounded readiness window, not an artificial per-field delay.
    const hydrationGraceMs = Math.max(400, Math.min(Number(options.hydrationGraceMs || 900), 1800));
    const deadline = Date.now() + timeoutMs;
    let root = itemSpecificRoot();
    while (!root && Date.now() < deadline) {
      await sleep(50);
      root = itemSpecificRoot();
    }
    if (!root) return { ok: false, signature: "", rowCount: 0, expanded: false, collapsed: false, clickAttempts: 0 };

    const rootReadyAt = Date.now();
    let lastSignature = "";
    let lastToggleState = "";
    let stableSamples = 0;
    let clickAttempts = 0;
    let successfulClicks = 0;
    let lastClickAt = 0;
    let expansionBaselineCount = 0;
    let expansionConfirmed = Boolean(itemSpecificsToggle("Show less"));

    while (Date.now() < deadline) {
      root = itemSpecificRoot() || root;
      const now = Date.now();
      let showMore = itemSpecificsToggle("Show more");
      const showLess = itemSpecificsToggle("Show less");
      const rowCount = root.querySelectorAll(ROW_SELECTOR).length;

      if (showLess) expansionConfirmed = true;

      // Re-check Show more during the whole hydration window. V8.23.2 only
      // checked once before the loop, so a control painted later was missed and
      // hidden Item Specifics never reached the AI snapshot.
      if (showMore && clickAttempts < 2 && (clickAttempts === 0 || now - lastClickAt >= 650)) {
        clickAttempts += 1;
        lastClickAt = now;
        expansionBaselineCount = rowCount;
        if (safeClick(showMore)) {
          successfulClicks += 1;
          invalidate();
        }
        // A click can trigger a React redraw. Give the new DOM one polling turn
        // before evaluating stability or attempting the single bounded retry.
        stableSamples = 0;
        lastSignature = "";
        lastToggleState = "";
        await sleep(60);
        continue;
      }

      showMore = itemSpecificsToggle("Show more");
      const currentShowLess = itemSpecificsToggle("Show less");
      const currentRowCount = root.querySelectorAll(ROW_SELECTOR).length;
      if (currentShowLess || (successfulClicks > 0 && (!showMore || currentRowCount > expansionBaselineCount))) {
        expansionConfirmed = true;
      }

      const signature = fieldDomSignature(root);
      const toggleState = `${showMore ? "more" : ""}|${currentShowLess ? "less" : ""}|${currentRowCount}`;
      if (signature && signature === lastSignature && toggleState === lastToggleState) stableSamples += 1;
      else {
        lastSignature = signature;
        lastToggleState = toggleState;
        stableSamples = 0;
      }

      const stillCollapsed = Boolean(showMore);
      const hydrationWindowComplete = now - rootReadyAt >= hydrationGraceMs;
      const expansionReady = currentShowLess
        ? true
        : successfulClicks > 0
          ? (expansionConfirmed && !stillCollapsed)
          : (!stillCollapsed && hydrationWindowComplete);

      // Require a short quiet window after the final expanded DOM state. This
      // prevents AI from seeing only the initially visible subset of fields.
      if (signature && stableSamples >= 4 && expansionReady) {
        return {
          ok: true,
          signature,
          rowCount: currentRowCount,
          expanded: expansionConfirmed,
          collapsed: false,
          clickAttempts,
          successfulClicks
        };
      }
      await sleep(60);
    }

    root = itemSpecificRoot() || root;
    const signature = fieldDomSignature(root);
    const stillCollapsed = Boolean(itemSpecificsToggle("Show more"));
    return {
      ok: Boolean(signature) && !stillCollapsed,
      signature,
      rowCount: root.querySelectorAll(ROW_SELECTOR).length,
      expanded: expansionConfirmed,
      collapsed: stillCollapsed,
      clickAttempts,
      successfulClicks
    };
  }

  async function collectFieldMap(options = {}) {
    const draftId = draftIdFromUrl();
    let root = itemSpecificRoot();
    if (!root) throw new Error("Item Specifics container was not found.");
    // Expand-aware callers must enter the same readiness gate even when Show more
    // has not been painted yet; otherwise they can reproduce the late-hydration race.
    if (options.expand === true) {
      const readiness = await ensureItemSpecificsReady({ timeoutMs: options.timeoutMs || 5000 });
      if (!readiness.ok) throw new Error("Item Specifics stayed collapsed or unstable; Fill was not started with an incomplete field map.");
      root = itemSpecificRoot() || root;
    }
    const signature = fieldDomSignature(root);
    if (!options.force && CACHE.map instanceof Map && CACHE.draftId === draftId && CACHE.root === root && CACHE.signature === signature && Date.now() - CACHE.builtAt < 300000) {
      const live = Array.from(CACHE.map.values()).every(record => record.row?.isConnected !== false);
      if (live) return CACHE.map;
    }

    const map = new Map();
    const rows = Array.from(root.querySelectorAll(ROW_SELECTOR));
    rows.forEach((row, order) => {
      const label = fieldLabelFromRow(row);
      if (!label || isBlockedLabel(label)) return;
      const record = makeRecord(row, order);
      if (!record.control || !record.key || map.has(record.key)) return;
      map.set(record.key, record);
    });

    CACHE.draftId = draftId;
    CACHE.builtAt = Date.now();
    CACHE.root = root;
    CACHE.signature = signature;
    CACHE.map = map;
    return map;
  }

  function invalidate() {
    CACHE.draftId = "";
    CACHE.builtAt = 0;
    CACHE.root = null;
    CACHE.signature = "";
    CACHE.map = null;
  }

  const SUPPORTED_IMAGE_PATH_RE = /\.(?:jpeg|jpg|png|webp|gif)$/i;

  function supportedEbayPhotoUrl(source) {
    const raw = clean(source, 4000);
    if (!raw) return "";
    try {
      const url = new URL(raw, location.href);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:") return "";
      if (!(host === "i.ebayimg.com" || host.endsWith(".ebayimg.com"))) return "";
      if (!/^\/(?:images\/g\/[^/]+\/|00\/s\/)/i.test(url.pathname)) return "";
      if (!SUPPORTED_IMAGE_PATH_RE.test(url.pathname)) return "";
      url.pathname = url.pathname.replace(/\/s-l\d+([./])/i, "/s-l1600$1");
      return global.EbayIdentityV3?.canonicalPhotoUrl ? global.EbayIdentityV3.canonicalPhotoUrl(url.href) : url.href;
    } catch (_) { return ""; }
  }

  function photoHeading() {
    const matches = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading'],legend")).filter(node => {
      const text = key(node?.textContent || "");
      return text === "photos video" || text.startsWith("photos video ");
    });
    return matches.find(isVisible) || matches[0] || null;
  }

  function photoSectionScope() {
    const heading = photoHeading();
    if (!heading) return null;
    let best = heading.closest?.("section,fieldset") || heading.parentElement;
    let node = heading.parentElement;
    for (let depth = 0; depth < 8 && node && node !== document.body && node !== document.documentElement; depth += 1, node = node.parentElement) {
      const text = clean(node.textContent || "", 2200);
      const hasCounter = /\b\d{1,3}\s*(?:\/|of|out of)\s*\d{1,3}\b/i.test(text);
      const hasPhotoCopy = /add up to \d+ photos|photos video/.test(key(text));
      if (hasCounter && hasPhotoCopy) return node;
      if (hasPhotoCopy) best = node;
    }
    return best || heading.parentElement || null;
  }

  function srcsetUrls(value) {
    return String(value || "").split(",").map(part => part.trim().split(/\s+/)[0]).filter(Boolean);
  }

  function cssPhotoUrls(value) {
    const out = [];
    const re = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = re.exec(String(value || "")))) if (match[2]) out.push(match[2]);
    return out;
  }

  function decodePhotoSource(value) {
    let raw = String(value || "").trim();
    if (!raw) return "";
    raw = raw.replace(/\\\//g, "/").replace(/&amp;/gi, "&").replace(/&#x2f;/gi, "/").replace(/&#47;/gi, "/");
    try { raw = decodeURIComponent(raw); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    return raw;
  }

  function photoCandidatesFromNode(node) {
    if (!node) return [];
    const out = [];
    const add = value => {
      const raw = decodePhotoSource(value);
      if (raw && !out.includes(raw)) out.push(raw);
    };
    try { add(node.currentSrc); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    try { add(node.src); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    try { add(node.href); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    for (const attr of ["src", "href", "data-src", "data-original", "data-url", "data-image-url", "data-img-url", "data-zoom-src", "poster"]) {
      try { add(node.getAttribute?.(attr)); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    }
    try { for (const value of srcsetUrls(node.getAttribute?.("srcset") || "").reverse()) add(value); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    try { for (const value of cssPhotoUrls(node.getAttribute?.("style") || "")) add(value); } catch (error) { globalThis.EbayLogger?.debug?.("Non-critical operation skipped", { message: error?.message || String(error) }); }
    return out;
  }

  function photoUrlsFromSectionHtml(scope) {
    const html = String(scope?.outerHTML || "").split("\\/").join("/").replace(/&amp;/gi, "&");
    if (!html) return [];
    const out = [];
    const re = /https?:\/\/(?:i\.)?ebayimg\.com\/[^"'<>\s]+/gi;
    let match;
    while ((match = re.exec(html))) {
      const raw = decodePhotoSource(match[0]);
      if (raw && !out.includes(raw)) out.push(raw);
    }
    return out;
  }

  function photoId(url) {
    const identity = global.EbayIdentityV3;
    if (identity?.photoId) return identity.photoId({ url });
    const value = String(url || "");
    const gallery = value.match(/\/images\/g\/([^/]+)\//i);
    if (gallery) return `photo:g:${gallery[1].toLowerCase()}`;
    return `photo:${value.replace(/\?.*$/, "").toLowerCase()}`;
  }

  function parseUploadedPhotoCount(value) {
    const text = String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    const match = text.match(/\b(\d{1,3})\s*(?:\/|of|out of)\s*(\d{1,3})\b/i);
    const count = Number(match?.[1] || 0);
    const total = Number(match?.[2] || 0);
    if (!Number.isFinite(count) || !Number.isFinite(total) || count <= 0 || total <= 0 || count > total || total > 100) return 0;
    return count;
  }

  function uploadedPhotoCount(scope) {
    // Stay local to the PHOTOS & VIDEO section, but inspect a few ancestors because
    // some eBay builds render the 9/25 counter beside the gallery instead of inside it.
    let node = scope;
    for (let depth = 0; depth < 4 && node && node !== document.body && node !== document.documentElement; depth += 1, node = node.parentElement) {
      for (const value of [node.textContent, node.getAttribute?.("aria-label"), node.getAttribute?.("title")]) {
        const count = parseUploadedPhotoCount(value);
        if (count) return count;
      }
      for (const child of Array.from(node.querySelectorAll?.("[aria-label],[title]") || []).slice(0, 120)) {
        const count = parseUploadedPhotoCount(`${child.getAttribute?.("aria-label") || ""} ${child.getAttribute?.("title") || ""}`);
        if (count) return count;
      }
    }
    return 0;
  }

  function collectPhotos(limit = 10) {
    // V8.23.21: Photo/Queue and cross-marketplace Drag share one robust eBay
    // gallery collector. This fixes the case where the editor exposes only the
    // main image in <img> while the remaining thumbnails live in CSS/resources.
    const sharedCollector = global.EbayPhotoCollectorV8220;
    if (sharedCollector?.collectAllPhotos) {
      const photos = sharedCollector.collectAllPhotos(Math.max(1, Math.min(Number(limit || 10), 25)));
      collectPhotos.lastDebug = { ...(sharedCollector.collectAllPhotos.lastDebug || {}) };
      return photos.map((photo, index) => ({
        ...photo,
        kind: "ebay",
        marketplaceSource: "ebay",
        trustedMarketplacePhoto: true,
        name: photo.name || `ebay-photo-${index + 1}.jpg`,
        role: photo.role || (index === 0 ? "Main product photo" : `Product photo ${index + 1}`),
        photoId: photo.photoId || photoId(photo.url || photo.src || ""),
        canonicalUrl: photo.canonicalUrl || (global.EbayIdentityV3?.canonicalPhotoUrl ? global.EbayIdentityV3.canonicalPhotoUrl(photo.url || photo.src || "") : photo.url || photo.src || "")
      }));
    }

    const scope = photoSectionScope();
    if (!scope) {
      collectPhotos.lastDebug = { scopeFound: false, uploadedCount: 0, targetCount: 0, domCandidates: 0, htmlCandidates: 0, accepted: 0, complete: false };
      return [];
    }
    const out = [];
    const seen = new Set();
    const uploadedCount = uploadedPhotoCount(scope);
    const expectedCountKnown = uploadedCount > 0;
    const hardLimit = Math.max(1, Math.min(Number(limit || 10), 25));
    const scanLimit = expectedCountKnown ? Math.min(hardLimit, uploadedCount) : hardLimit;
    let domCandidates = 0;
    let htmlCandidates = 0;

    const add = (source, node = null) => {
      if (out.length >= scanLimit) return false;
      const url = supportedEbayPhotoUrl(decodePhotoSource(source));
      if (!url) return false;
      const id = photoId(url);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      const index = out.length;
      out.push({
        kind: "ebay",
        url,
        src: url,
        name: `ebay-photo-${index + 1}.jpg`,
        role: index === 0 ? "Main product photo" : `Product photo ${index + 1}`,
        alt: clean(node?.alt || node?.title || node?.getAttribute?.("aria-label") || "", 160),
        photoId: id,
        canonicalUrl: global.EbayIdentityV3?.canonicalPhotoUrl ? global.EbayIdentityV3.canonicalPhotoUrl(url) : url
      });
      return true;
    };

    // Read only inside the exact PHOTOS & VIDEO section. Hidden/lazy thumbnails are
    // intentionally included because eBay may render only the main image as visible.
    const nodes = [scope, ...Array.from(scope.querySelectorAll?.("img,source,picture,[src],[srcset],[data-src],[data-original],[data-url],[data-image-url],[data-img-url],[data-zoom-src],[style]") || [])];
    for (const node of nodes) {
      for (const candidate of photoCandidatesFromNode(node)) {
        domCandidates += 1;
        add(candidate, node);
        if (out.length >= scanLimit) break;
      }
      if (out.length >= scanLimit) break;
    }

    // Some eBay React builds keep lazy photo URLs only in section-local serialized HTML.
    if (out.length < scanLimit) {
      for (const candidate of photoUrlsFromSectionHtml(scope)) {
        htmlCandidates += 1;
        add(candidate, null);
        if (out.length >= scanLimit) break;
      }
    }

    const targetCount = expectedCountKnown ? scanLimit : out.length;
    collectPhotos.lastDebug = {
      scopeFound: true,
      uploadedCount,
      expectedCountKnown,
      scanLimit,
      targetCount,
      domCandidates,
      htmlCandidates,
      accepted: out.length,
      complete: expectedCountKnown ? out.length >= targetCount : out.length > 0
    };
    return out;
  }

  function currentTitle() {
    const control = document.querySelector("input[name='title'],textarea[name='title'],input[aria-label*='title' i],textarea[aria-label*='title' i]");
    return clean(control?.value || document.title, 500);
  }

  function currentCategory() {
    // Keep category lookup local. Reading document.body.innerText forces a large page-wide
    // text snapshot and is unnecessary for the normal Item Specifics path.
    const direct = document.querySelector([
      "input[name*='category' i]", "textarea[name*='category' i]",
      "button[name*='category' i]", "[data-testid*='category' i] [role='button']",
      "[aria-label*='item category' i]"
    ].join(","));
    const directValue = clean(direct?.value || direct?.getAttribute?.("aria-label") || direct?.textContent || "", 500);
    if (directValue && key(directValue) !== "item category" && key(directValue) !== "category") return directValue;

    const labels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading'],legend,label"));
    const label = labels.find(node => ["item category", "category"].includes(key(node?.textContent || "")));
    if (!label) return "";
    const scope = label.closest("section,fieldset,[data-testid*='category' i]") || label.parentElement;
    const text = clean(scope?.textContent || "", 800);
    return clean(text.replace(new RegExp(`^\\s*${clean(label.textContent || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").replace(/\b(?:edit|change)\b/ig, " "), 500);
  }

  async function waitForStablePhotos(limit = 10, timeoutMs = 2200) {
    const deadline = Date.now() + Math.max(300, Math.min(Number(timeoutMs || 2200), 4000));
    let best = [];
    let lastSignature = "";
    let stableSamples = 0;
    while (Date.now() < deadline) {
      const current = collectPhotos(limit);
      if (current.length >= best.length) best = current;
      const debug = collectPhotos.lastDebug || {};
      const signature = current.map(photo => photo.photoId || photoId(photo.url || photo.src || "")).join("|");
      if (debug.expectedCountKnown && current.length >= Number(debug.targetCount || 0) && current.length > 0) return { photos: current, debug: { ...debug }, stable: true };
      if (signature && signature === lastSignature) stableSamples += 1;
      else { lastSignature = signature; stableSamples = 0; }
      if (!debug.expectedCountKnown && current.length > 0 && stableSamples >= 4) return { photos: current, debug: { ...debug }, stable: true };
      await sleep(60);
    }
    return { photos: best, debug: { ...(collectPhotos.lastDebug || {}) }, stable: best.length > 0 };
  }

  async function collectListing(options = {}) {
    const expectedDraftId = clean(options.expectedDraftId || "", 160);
    const actualDraftId = draftIdFromUrl();
    if (expectedDraftId && actualDraftId && expectedDraftId !== actualDraftId) {
      return { ok: false, message: `Draft safety check failed: expected ${expectedDraftId}, open page is ${actualDraftId}.`, photos: [], routeQuestions: [] };
    }
    const readiness = await ensureItemSpecificsReady({ timeoutMs: options.readinessTimeoutMs || 7000 });
    if (!readiness.ok) return { ok: false, ready: false, message: "Item Specifics did not become stable before the read timeout.", photos: [], routeQuestions: [] };
    const map = await collectFieldMap({ force: true });
    const fields = Array.from(map.values()).map(record => {
      const snapshot = record.snapshot();
      const allOptions = snapshot.options;
      const optionTotal = snapshot.optionTotal;
      const completeCompactOptions = allOptions.length > 0
        && allOptions.length <= 80
        && optionTotal <= 80
        && allOptions.length >= optionTotal;
      return {
        fieldId: record.fieldId,
        name: record.label,
        label: record.label,
        domKey: record.domKey,
        fieldKeySource: record.fieldKeySource,
        marketplaceId: record.marketplaceId,
        categoryId: record.categoryId,
        type: record.type,
        currentValue: snapshot.currentValue,
        required: record.required,
        customValueAllowed: snapshot.customValueAllowed,
        optionTotal,
        optionsComplete: completeCompactOptions,
        // Never send a partial virtualized option list as if it were complete.
        // Consumers may defer exact verification to the live Fill Engine when
        // optionsComplete=false; they must never treat an omitted list as complete.
        options: completeCompactOptions ? allOptions : []
      };
    });
    const requestedPhotoLimit = Number(options.photoLimit ?? 10);
    const effectivePhotoLimit = Math.max(0, Math.min(requestedPhotoLimit, 25));
    const stablePhotos = effectivePhotoLimit > 0
      ? await waitForStablePhotos(effectivePhotoLimit, options.photoReadinessTimeoutMs || 2200)
      : { photos: [], debug: {}, stable: true };
    const photos = stablePhotos.photos;
    const photoDebug = stablePhotos.debug || {};
    const photoComplete = effectivePhotoLimit === 0 || stablePhotos.stable === true;
    const fieldSummary = Object.fromEntries(fields.map(field => [field.name, field.currentValue || ""]));
    const fieldCatalog = fields.map(field => ({ ...field }));
    const photoCatalog = photos.map((photo, index) => ({
      photoId: photo.photoId || photoId(photo.url || photo.src || ""),
      displayNumber: index + 1,
      roleHint: global.EbayAiPhotoSelectorV790?.category ? global.EbayAiPhotoSelectorV790.category(photo, index) : "detail",
      canonicalUrl: photo.canonicalUrl || (global.EbayIdentityV3?.canonicalPhotoUrl ? global.EbayIdentityV3.canonicalPhotoUrl(photo.url || photo.src || "") : photo.url || photo.src || "")
    }));
    return {
      ok: fields.length > 0,
      ready: fields.length > 0 && (options.requirePhotos === false || (photos.length > 0 && photoComplete)),
      draftId: actualDraftId,
      actualDraftId,
      photos,
      count: photos.length,
      uploadedPhotoCount: Number(photoDebug.uploadedCount || 0),
      photoComplete,
      debug: { ...photoDebug, itemSpecifics: readiness },
      routeFieldCount: fields.length,
      routeQuestions: fields.map(field => field.name),
      fields,
      fieldCatalog,
      photoCatalog,
      pageTitle: document.title,
      url: location.href,
      pageContext: { url: location.href, pageTitle: document.title, currentTitle: currentTitle(), category: currentCategory(), fieldSummary, fields, fieldCatalog, photoCatalog },
      hint: photoComplete
        ? (photoDebug.uploadedCount > effectivePhotoLimit
          ? `Read ${photos.length} unique current-draft photos from ${photoDebug.uploadedCount} total; BLOCK 04 will select the best bounded AI subset.`
          : photoDebug.expectedCountKnown
            ? "All unique current-draft photos were read."
            : `Read ${photos.length} unique current-draft photos; the eBay gallery counter was not exposed.`)
        : `Photo reader found ${photos.length}/${photoDebug.targetCount || photoDebug.uploadedCount || "?"} current-draft photos.`,
      message: `${photos.length} photo(s), ${fields.length} Item Specific field(s).`
    };
  }

  global.EbayPageFieldsV810 = Object.freeze({
    ROOT_SELECTOR,
    ROW_SELECTOR,
    clean,
    key,
    draftIdFromUrl,
    itemSpecificRoot,
    fieldLabelFromRow,
    collectFieldMap,
    collectListing,
    ensureItemSpecificsReady,
    fieldDomSignature,
    fieldValueMap,
    fieldValueSignature,
    collectPhotos,
    supportedEbayPhotoUrl,
    invalidate,
    test: Object.freeze({ customValueTextMatches, yesNoChoices, selected, currentCategory })
  });
})(globalThis);

/* ===== PAGE MESSAGE GATEWAY ===== */
/* One browser-message gateway for reading and writing the current eBay draft. */
(function initEbayCoreEbayClient(global) {
  "use strict";

  // V8.23.21: current Manual/Autopilot/Queue routes use the same Core gateway.
  // Manual/Autopilot/Queue all use the same Core gateway; progress/status messages are handled separately by the page runtime.
  const ROUTES = Object.freeze({
    readListing: "CORE_EBAY_READ_LISTING",
    readContext: "CORE_EBAY_READ_CONTEXT",
    fillAll: "CORE_EBAY_FILL_ALL",
    waitAutosave: "CORE_EBAY_WAIT_AUTOSAVE",
    stop: "CORE_EBAY_STOP"
  });

  function sendTabMessage(tabId, type, payload = {}, timeoutMs = 30000) {
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, message: "eBay page response timed out." });
      }, Math.max(1000, Number(timeoutMs || 30000)));
      try {
        chrome.tabs.sendMessage(tabId, { type, payload }, response => {
          const runtimeError = chrome.runtime.lastError;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (runtimeError) resolve({ ok: false, message: runtimeError.message });
          else resolve(response || { ok: false, message: "No response from eBay page." });
        });
      } catch (error) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ ok: false, message: error?.message || String(error) });
        }
      }
    });
  }

  function readListing(tabId, payload = {}, timeoutMs = 30000) {
    return sendTabMessage(tabId, ROUTES.readListing, payload, timeoutMs);
  }

  function readContext(tabId, payload = {}, timeoutMs = 30000) {
    return sendTabMessage(tabId, ROUTES.readContext, payload, timeoutMs);
  }

  function fillAll(tabId, payload = {}, timeoutMs = 90000) {
    return sendTabMessage(tabId, ROUTES.fillAll, payload, timeoutMs);
  }

  function waitAutosave(tabId, payload = {}, timeoutMs = 18000) {
    return sendTabMessage(tabId, ROUTES.waitAutosave, payload, timeoutMs);
  }

  function stop(tabId, payload = {}, timeoutMs = 5000) {
    return sendTabMessage(tabId, ROUTES.stop, payload, timeoutMs);
  }

  global.EbayCoreEbayV800 = Object.freeze({ ROUTES, sendTabMessage, readListing, readContext, fillAll, waitAutosave, stop });
  global.EbayCore = global.EbayCore || {};
  global.EbayCore.ebay = global.EbayCoreEbayV800;
})(globalThis);
