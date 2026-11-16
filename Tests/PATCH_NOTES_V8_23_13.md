# PATCH NOTES — V8.23.13

## Problem 2.5 — Evidence-gated single-pass AI Fill

### Confirmed root cause

Normal Photo/Queue could schedule a second paid GPT strict-verification request even when the primary response already contained strict support that passed the direct-evidence contract. Missing high-impact fields could also be retried without a concrete signal that another photo/request could recover the fact.

### Changes

- Local macOS Vision OCR runs before the primary GPT request in normal Fill.
- High-confidence OCR observations are used only as compact untrusted hints tied to supplied photos; GPT must verify the value against the referenced photo.
- Validated direct primary support can stay single-pass, including strict fields such as Brand, Size and Material when the strict evidence validator accepts the source/evidence/photo contract.
- OCR conflicts still require a bounded independent GPT re-read.
- Rejected strict primary candidates still require a bounded independent GPT re-read.
- A missing strict field is retried only when local OCR/evidence indicates that the fact is actually recoverable from available photos.
- Missing strict fields with no direct-evidence signal stay blank instead of causing a speculative paid request.
- Normal repair is capped at 8 fields.
- Repair images are capped at 2 HIGH-detail photos in Cheap/Balanced and 3 in Quality. When an exact primary/OCR support photo is known, repair no longer pads the request with an unrelated second HIGH-detail photo.
- Primary Fill instructions were compacted to remove duplicated rules already enforced by the structured system/policy contract.
- Existing V8.23.12 primary photo caps remain: Cheap 4 / Balanced 6 / Quality 8.
- GPT model, strict evidence validator, protected-field allowlist, deterministic matching, shared Fill Engine, Queue safety and manual publishing boundary were not weakened.

### Expected real-world effect

A normal item whose strict primary answers have valid direct support and no OCR conflict should complete with one GPT request. A second request remains available for genuine rejected/conflicting/recoverable strict evidence.

Actual billed cost reduction is not claimed until a real eBay/OpenAI run is measured.
