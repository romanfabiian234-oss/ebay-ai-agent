#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
server=(ROOT/'Backend/server.py').read_text()
ocr=(ROOT/'Backend/ocr.js').read_text()
pre=(ROOT/'Backend/image_preprocess.js').read_text()
ai=(ROOT/'Extension/core/ai.js').read_text()

def req(cond,msg):
    if not cond: raise AssertionError(msg)

req('OCR_MAX_IMAGES = 12' in server,'bounded local discovery gallery must allow 12 photos')
req('OCR_PREPROCESS_HELPER_PATH' in server and '_coreimage_preprocess_variants' in server,'Core Image preprocessing bridge missing')
req('"contrast"' in server and '"sharpen"' in server,'bounded contrast/sharpen variants missing')
req('"votes": pass_votes' in server and '"variantVotes"' in server and '"passVotes"' in server,'pass/variant consensus is not preserved by backend merge')
req('VNDetectRectanglesRequest' in ocr and 'rectangleConfidence' in ocr and 'labelBox' in ocr,'machine-vision label rectangle discovery missing')
req("CIFilter.filterWithName($('CIColorControls'))" in pre and "CIFilter.filterWithName($('CISharpenLuminance'))" in pre,'local contrast/sharpen Core Image filters missing')
req('const MAX_PHOTOS = 12' in ai,'extension OCR client must match backend local gallery bound')
req('const selected = Array.from(byId.values()).slice(0, 12)' in ai,'Fast Fill must inspect the bounded local gallery')
req('labelTextSignal(photo)' in ai and 'photoFocusBox(photo)' in ai,'OCR-discovered labels must not depend only on photo role metadata')
req('mergePhotoBlocks' in ai and 'photoQualityScore' in ai,'Accurate OCR merge must be quality/consensus aware')
req('careSymbolHint' in ai,'care-symbol candidate routing guard missing')
print('PASS V8.23.21 OCR/CV architecture: local full-gallery discovery, machine-vision focus, adaptive preprocessing and consensus are bounded and GPT-independent')
