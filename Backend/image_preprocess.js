#!/usr/bin/osascript -l JavaScript
/*
 * Local Core Image preprocessing helper for OCR.
 * It only creates alternate visual renditions of an already-local image.
 * It does not infer product facts and never communicates with a network service.
 */
ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.import('CoreImage');

const HELPER_VERSION = '8.23.21';

function safeString(value) {
  try {
    const unwrapped = ObjC.unwrap(value);
    return String(unwrapped == null ? '' : unwrapped);
  } catch (_) {
    return String(value == null ? '' : value);
  }
}

function ciImageFromPath(path) {
  try {
    const url = $.NSURL.fileURLWithPath($(path));
    return $.CIImage.imageWithContentsOfURL(url);
  } catch (_) {
    return null;
  }
}

function setNumber(filter, key, value) {
  try { filter.setValueForKey($.NSNumber.numberWithDouble(Number(value)), $(key)); return true; }
  catch (_) { return false; }
}

function filteredImage(image, kind) {
  if (!image) return null;
  try {
    if (kind === 'contrast') {
      const filter = $.CIFilter.filterWithName($('CIColorControls'));
      if (!filter) return null;
      filter.setDefaults;
      filter.setValueForKey(image, $('inputImage'));
      setNumber(filter, 'inputSaturation', 0.0);
      setNumber(filter, 'inputBrightness', 0.02);
      setNumber(filter, 'inputContrast', 1.38);
      return filter.valueForKey($('outputImage'));
    }
    if (kind === 'sharpen') {
      const base = $.CIFilter.filterWithName($('CIColorControls'));
      if (!base) return null;
      base.setDefaults;
      base.setValueForKey(image, $('inputImage'));
      setNumber(base, 'inputSaturation', 0.35);
      setNumber(base, 'inputBrightness', 0.0);
      setNumber(base, 'inputContrast', 1.16);
      const adjusted = base.valueForKey($('outputImage'));
      const sharpen = $.CIFilter.filterWithName($('CISharpenLuminance'));
      if (!sharpen || !adjusted) return adjusted;
      sharpen.setDefaults;
      sharpen.setValueForKey(adjusted, $('inputImage'));
      setNumber(sharpen, 'inputSharpness', 0.72);
      return sharpen.valueForKey($('outputImage'));
    }
  } catch (_) {}
  return null;
}

function writePng(image, outputPath) {
  if (!image || !outputPath) return false;
  try {
    const context = $.CIContext.contextWithOptions($({}));
    if (!context) return false;
    const cgImage = context.createCGImageFromRect(image, image.extent);
    if (!cgImage) return false;
    const rep = $.NSBitmapImageRep.alloc.initWithCGImage(cgImage);
    if (!rep) return false;
    const data = rep.representationUsingTypeProperties($.NSPNGFileType, $({}));
    if (!data) return false;
    return Boolean(data.writeToFileAtomically($(outputPath), true));
  } catch (_) {
    return false;
  }
}

function run(argv) {
  const args = Array.isArray(argv) ? argv.map(String).filter(Boolean) : [];
  const inputPath = args[0] || '';
  const outputDir = args[1] || '';
  const stem = (args[2] || 'ocr').replace(/[^A-Za-z0-9._-]+/g, '-');
  if (!inputPath || !outputDir) return JSON.stringify({ ok: false, helperVersion: HELPER_VERSION, variants: [], message: 'Missing input/output path.' });
  const image = ciImageFromPath(inputPath);
  if (!image) return JSON.stringify({ ok: false, helperVersion: HELPER_VERSION, variants: [], message: 'Unable to load Core Image source.' });
  const variants = [];
  ['contrast', 'sharpen'].forEach(kind => {
    const outputPath = `${outputDir}/${stem}-${kind}.png`;
    const transformed = filteredImage(image, kind);
    if (transformed && writePng(transformed, outputPath)) variants.push({ kind, path: outputPath });
  });
  return JSON.stringify({ ok: true, helperVersion: HELPER_VERSION, variants });
}
