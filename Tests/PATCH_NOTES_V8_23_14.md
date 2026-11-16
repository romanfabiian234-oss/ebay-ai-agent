# PATCH NOTES — V8.23.14

## Problem 2.5 — cost without losing direct-label accuracy

The real V8.23.13 shoe run confirmed the main cost optimization worked: the ordinary path reached one GPT request, but several facts printed directly on the shoe label remained blank. V8.23.14 fixes that completeness loss without returning to a routine second GPT request.

### Root cause

- OCR recognized generic label concepts but did not model eBay shoe fields separately.
- `LEATHER UPPER`, `SYNTHETIC LINING`, and `MAN MADE SOLE` were not deterministic component facts.
- `9 2E` was not safely mapped to `US Shoe Size` + `Shoe Width`.
- Normal Fill treated OCR as verification-only, so a strong missing direct fact still could not become an answer locally.

### Fix

- Added deterministic shoe-label facts for US Shoe Size, Shoe Width, Upper Material, Lining Material, Outsole Material, and origin.
- Added split-block support for OCR that reads `9` and `2E` separately.
- Added component scoping so upper/lining/sole material text cannot leak into generic whole-item Material.
- Added post-primary local recovery for allowlisted direct-label fields only.
- Local recovery requires strong OCR evidence and exact current eBay option matches; weak/unknown/ambiguous values remain blank.
- OCR never overwrites GPT. A conflict keeps the bounded independent GPT repair path; disagreement remains review-only.

### Cost policy preserved

- Cheap / Balanced / Quality primary caps remain 4 / 6 / 8 photos.
- Ordinary Balanced visual photos remain LOW detail.
- HIGH detail remains targeted to label/measurement evidence and bounded repair.
- Normal Fill still aims for one GPT request; second GPT is exceptional.
- GPT model and protected-field policy are unchanged.

### Regression

Added `Tests/unit/shoe_ocr_direct_facts.test.js` and updated the local OCR pipeline regression. All constituent current tests and release checks pass; real V8.23.14 eBay/API billing validation is the remaining confirmation step.
