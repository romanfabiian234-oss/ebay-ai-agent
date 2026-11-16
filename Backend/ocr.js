#!/usr/bin/osascript -l JavaScript
/*
 * Local macOS Vision OCR helper.
 * Extracts visible text only; it never infers product facts or writes to eBay.
 */
ObjC.import('Vision');
ObjC.import('Foundation');
ObjC.import('AppKit');

const HELPER_VERSION = '8.23.21';
const CUSTOM_WORDS = [
  'SIZE', 'BRAND', 'MARCA', 'MARQUE', 'MADE IN', 'COTTON', 'POLYESTER', 'SPANDEX', 'ELASTANE',
  'NYLON', 'RAYON', 'VISCOSE', 'LINEN', 'WOOL', 'SILK', 'MACHINE WASH',
  'HAND WASH', 'DRY CLEAN', 'COUNTRY OF ORIGIN', 'FABRIQUE EN', 'HECHO EN',
  'TUMBLE DRY', 'DO NOT BLEACH', 'IRON LOW', 'DO NOT IRON', 'WASH WITH LIKE COLORS',
  'ACRYLIC', 'ACETATE', 'MODAL', 'CASHMERE', 'POLYAMIDE', 'LINING', 'SHELL',
  'STYLE', 'STYLE NO', 'MODEL', 'RN', 'CA', 'UPPER', 'OUTSOLE', 'SOLE', '2E', '3E', '4E', 'EE', 'EEE',
  '30', '40', '60', 'P', 'F', 'W', 'US', 'USA', 'UNITED STATES', 'UK', 'GB', 'EU', 'EUR', 'EUROPE',
  'AU', 'AUS', 'AUSTRALIA', 'FR', 'FRANCE', 'DE', 'GERMANY', 'IT', 'ITALY'
];

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeString(value) {
  try {
    const unwrapped = ObjC.unwrap(value);
    return String(unwrapped == null ? '' : unwrapped);
  } catch (_) {
    return String(value == null ? '' : value);
  }
}

function arrayFromNSArray(value) {
  if (!value) return [];
  try {
    const unwrapped = ObjC.unwrap(value);
    if (Array.isArray(unwrapped)) return unwrapped;
    if (unwrapped && typeof unwrapped.length === 'number') return Array.prototype.slice.call(unwrapped);
  } catch (_) {}
  try {
    const jsValue = value.js;
    if (Array.isArray(jsValue)) return jsValue;
  } catch (_) {}
  const out = [];
  try {
    const count = safeNumber(value.count);
    for (let index = 0; index < count; index += 1) out.push(value.objectAtIndex(index));
  } catch (_) {}
  return out;
}

function makeHandler(path) {
  const url = $.NSURL.fileURLWithPath($(path));
  try {
    const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
    if (handler) return { handler, source: 'url' };
  } catch (_) {}

  const data = $.NSData.dataWithContentsOfURL(url);
  if (data) {
    try {
      const handler = $.VNImageRequestHandler.alloc.initWithDataOptions(data, $({}));
      if (handler) return { handler, source: 'data' };
    } catch (_) {}
  }

  const image = $.NSImage.alloc.initWithContentsOfURL(url);
  if (!image) return { handler: null, source: 'none' };
  const nil = $();
  const cgImage = image.CGImageForProposedRectContextHints(nil, nil, nil);
  if (!cgImage) return { handler: null, source: 'none' };
  return {
    handler: $.VNImageRequestHandler.alloc.initWithCGImageOptions(cgImage, $({})),
    source: 'cgimage'
  };
}


function detectLabelRectangle(path) {
  const created = makeHandler(path);
  if (!created.handler) return null;
  let request;
  try {
    request = $.VNDetectRectanglesRequest.alloc.init;
    try { request.maximumObservations = 4; } catch (_) {}
    try { request.minimumConfidence = 0.55; } catch (_) {}
    try { request.minimumAspectRatio = 0.15; } catch (_) {}
    try { request.maximumAspectRatio = 1.0; } catch (_) {}
    try { request.minimumSize = 0.07; } catch (_) {}
    try { request.quadratureTolerance = 28.0; } catch (_) {}
    const errorRef = typeof Ref === 'function' ? Ref() : $();
    const ok = Boolean(created.handler.performRequestsError($([request]), errorRef));
    if (!ok) return null;
  } catch (_) {
    return null;
  }
  const candidates = arrayFromNSArray(request.results).map(observation => {
    const box = observationBox(observation);
    if (!box) return null;
    const area = safeNumber(box.width) * safeNumber(box.height);
    const confidence = safeNumber(observation.confidence);
    const shortSide = Math.min(safeNumber(box.width), safeNumber(box.height));
    const longSide = Math.max(safeNumber(box.width), safeNumber(box.height));
    const shape = longSide > 0 ? shortSide / longSide : 0;
    if (area < 0.025 || area > 0.82 || shape < 0.12 || confidence < 0.50) return null;
    const borderPenalty = area > 0.68 ? 0.20 : 0;
    return { box, confidence, area, score: confidence + Math.min(area, 0.35) * 0.28 + Math.min(shape, 0.65) * 0.08 - borderPenalty };
  }).filter(Boolean).sort((a, b) => safeNumber(b.score) - safeNumber(a.score));
  return candidates[0] || null;
}

function configureRequest(config) {
  const request = $.VNRecognizeTextRequest.alloc.init;
  try { request.recognitionLevel = config.accurate === false ? $.VNRequestTextRecognitionLevelFast : $.VNRequestTextRecognitionLevelAccurate; } catch (_) {}
  try { request.usesLanguageCorrection = config.languageCorrection === true; } catch (_) {}
  try { request.recognitionLanguages = $(config.languages || ['en-US']); } catch (_) {
    try { request.setRecognitionLanguages($(config.languages || ['en-US'])); } catch (_) {}
  }
  try { request.minimumTextHeight = safeNumber(config.minimumTextHeight); } catch (_) {}
  try { request.customWords = $(CUSTOM_WORDS); } catch (_) {
    try { request.setCustomWords($(CUSTOM_WORDS)); } catch (_) {}
  }
  return request;
}

function observationBox(observation) {
  try {
    const box = observation.boundingBox;
    return {
      x: safeNumber(box.origin.x),
      y: safeNumber(box.origin.y),
      width: safeNumber(box.size.width),
      height: safeNumber(box.size.height)
    };
  } catch (_) {
    return null;
  }
}

function performPass(path, config) {
  const created = makeHandler(path);
  if (!created.handler) {
    return { ok: false, path, blocks: [], message: 'Unable to create a Vision image request handler.', handlerSource: created.source };
  }
  const request = configureRequest(config);
  let success = false;
  let errorText = '';
  try {
    const errorRef = typeof Ref === 'function' ? Ref() : $();
    success = Boolean(created.handler.performRequestsError($([request]), errorRef));
    if (!success) {
      try {
        const errorValue = typeof Ref === 'function' ? errorRef[0] : errorRef;
        errorText = safeString(errorValue && errorValue.localizedDescription ? errorValue.localizedDescription : errorValue);
      } catch (_) {}
    }
  } catch (error) {
    errorText = safeString(error && error.message ? error.message : error);
  }
  if (!success) {
    return {
      ok: false,
      path,
      blocks: [],
      message: errorText || 'Vision OCR request failed.',
      handlerSource: created.source
    };
  }

  const observations = arrayFromNSArray(request.results);
  const blocks = [];
  observations.forEach(observation => {
    const candidates = arrayFromNSArray(observation.topCandidates(1));
    if (!candidates.length) return;
    const candidate = candidates[0];
    const text = safeString(candidate.string).replace(/\s+/g, ' ').trim();
    if (!text) return;
    const block = {
      text,
      confidence: safeNumber(candidate.confidence)
    };
    const box = observationBox(observation);
    if (box) block.box = box;
    blocks.push(block);
  });
  return {
    ok: true,
    path,
    blocks,
    fullText: blocks.map(block => block.text).join('\n'),
    observationCount: observations.length,
    handlerSource: created.source,
    minimumTextHeight: safeNumber(config.minimumTextHeight),
    languageCorrection: config.languageCorrection === true
  };
}

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function boxDistance(a, b) {
  if (!a || !b) return 1;
  const ax = safeNumber(a.x) + safeNumber(a.width) / 2;
  const ay = safeNumber(a.y) + safeNumber(a.height) / 2;
  const bx = safeNumber(b.x) + safeNumber(b.width) / 2;
  const by = safeNumber(b.y) + safeNumber(b.height) / 2;
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function mergePassResults(results) {
  const merged = [];
  const messages = [];
  let ok = false;
  let observations = 0;
  let handlerSource = '';
  results.forEach((result, passIndex) => {
    if (!result) return;
    ok = ok || result.ok === true;
    observations += safeNumber(result.observationCount);
    if (!handlerSource && result.handlerSource) handlerSource = result.handlerSource;
    if (result.message) messages.push(String(result.message));
    (Array.isArray(result.blocks) ? result.blocks : []).forEach(block => {
      const textKey = normalizedText(block.text);
      if (!textKey) return;
      const existing = merged.find(item => item.textKey === textKey && boxDistance(item.box, block.box) <= 0.10);
      const candidate = { ...block, textKey, pass: passIndex + 1, votes: 1 };
      if (!existing) {
        merged.push(candidate);
        return;
      }
      existing.votes += 1;
      if (safeNumber(candidate.confidence) > safeNumber(existing.confidence)) {
        existing.text = candidate.text;
        existing.confidence = candidate.confidence;
        existing.box = candidate.box;
        existing.pass = candidate.pass;
      }
    });
  });
  merged.sort((a, b) => safeNumber(b.votes) - safeNumber(a.votes) || safeNumber(b.confidence) - safeNumber(a.confidence));
  return {
    ok,
    blocks: merged.map(({ textKey, ...block }) => block),
    fullText: merged.map(block => block.text).join('\n'),
    observationCount: observations,
    handlerSource,
    message: Array.from(new Set(messages)).join('; '),
    passCount: results.length,
    consensusBlockCount: merged.filter(block => safeNumber(block.votes) > 1).length
  };
}

function recognizeFile(path, options) {
  const accurate = options.accurate !== false;
  const passes = accurate ? [
    { languages: ['en-US'], minimumTextHeight: 0.003, languageCorrection: false, accurate: true },
    { languages: ['en-US', 'fr-FR', 'es-ES', 'de-DE', 'it-IT', 'pt-BR'], minimumTextHeight: 0.0015, languageCorrection: true, accurate: true }
  ] : [
    { languages: ['en-US'], minimumTextHeight: 0.004, languageCorrection: false, accurate: false }
  ];
  const results = passes.map((config, index) => {
    const result = performPass(path, config);
    result.pass = index + 1;
    return result;
  });
  const merged = mergePassResults(results);
  const confidences = (Array.isArray(merged.blocks) ? merged.blocks : []).map(block => safeNumber(block.confidence));
  const maxConfidence = confidences.length ? Math.max(...confidences) : 0;
  const shouldDetectGeometry = options.detectGeometry === true && (!merged.blocks.length || merged.blocks.length < 3 || maxConfidence < 0.86);
  const rectangle = shouldDetectGeometry ? detectLabelRectangle(path) : null;
  return {
    ...merged,
    path,
    minimumTextHeight: Math.min(...passes.map(pass => safeNumber(pass.minimumTextHeight))),
    languageCorrection: passes.some(pass => pass.languageCorrection === true),
    labelBox: rectangle ? rectangle.box : null,
    rectangleConfidence: rectangle ? safeNumber(rectangle.confidence) : 0,
    rectangleDetected: !!rectangle
  };
}

function run(argv) {
  const args = Array.isArray(argv) ? argv.map(String).filter(Boolean) : [];
  const accurate = !args.includes('--fast');
  const detectGeometry = args.includes('--detect-geometry');
  const paths = args.filter(value => !['--fast', '--accurate', '--detect-geometry'].includes(value)).slice(0, 12);
  const results = paths.map(path => recognizeFile(path, { accurate, detectGeometry }));
  return JSON.stringify({
    ok: true,
    engine: 'macos_vision',
    helperVersion: HELPER_VERSION,
    mode: accurate ? 'accurate' : 'fast',
    resultCount: results.length,
    textBlockCount: results.reduce((sum, item) => sum + (Array.isArray(item.blocks) ? item.blocks.length : 0), 0),
    results
  });
}
