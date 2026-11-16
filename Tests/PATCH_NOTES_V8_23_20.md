# PATCH NOTES — V8.23.20

Problem 2.5 accuracy/stability follow-up after real V8.23.19 tests reached the ~$0.07 request target but still missed obvious physical-label facts (`M`, numeric `0`, partial-catalog Brand, and `100% Cashmere`).

## Confirmed root causes fixed

- `tagContext()` recognized common fibers such as cotton/wool/silk but omitted cashmere/acrylic/acetate/modal/leather/suede, so a standalone size token such as `M` on a cashmere label could be discarded before live eBay verification.
- OCR block-level role metadata was dropped when macOS Vision results were normalized; a specific `brand label` signal could degrade to a generic photo role.
- Strong local OCR candidates were rejected when eBay exposed only a partial virtualized option catalog. This affected Brand and direct label fields even though the shared Fill Engine can inspect the live dropdown safely.
- `sizeToken()` did not recognize direct numeric clothing sizes such as `00`, `0`, `2`, etc.
- Material parsing preserved the fiber but not safe physical `100%` specificity in the final answer.
- There was no shared single-flight guard around an identical concurrent analysis. Two near-simultaneous starts could theoretically both pass cache checks and buy duplicate Primary requests.

## Changes

- Expanded physical-label context anchors and Brand noise filtering for cashmere/acrylic/acetate/modal/leather/suede.
- Preserve both photo-level and OCR-block-level role evidence.
- Strong local `physical_tag` OCR may cross only an explicitly incomplete virtualized catalog for a narrow direct-field allowlist (Brand, Size, Material, Garment Care, origin and shoe direct facts). The shared Fill Engine still must find/verify the exact live eBay option.
- Added deterministic numeric Size tokens (`00`, `0`, 1–2 digit direct sizes, plus narrow `P/W/T` suffix forms). Arbitrary strings such as RN identifiers are not normalized into Size.
- Added safe material specificity upgrade (`Cashmere` → `100% Cashmere`, `Wool` → `100% Wool`) only when local physical OCR actually reads `100%` and evidence validation confirms it.
- Added analysis single-flight deduplication: identical concurrent analysis calls join the same in-flight Promise; different drafts remain independent; the guard is released on success/failure.
- Existing hard normal-Fill OpenAI budget remains: one Primary + at most one targeted Repair.

## Hidden-action audit

Confirmed absent after audit/tests:
- no backend OpenAI retry loop;
- no automatic startup/Queue `Test API` request;
- no production caller of the legacy `AI_ANALYZE_PHOTOS` route outside its compatibility wrapper;
- no third normal-Fill OpenAI attempt;
- local OCR/CV does not route through the paid AI proxy.

Risk fixed:
- duplicate identical concurrent analyses now single-flight before the paid Primary request.

## Accuracy boundaries unchanged

- GPT model unchanged.
- OCR confidence thresholds unchanged.
- GPT↔OCR conflicts still require the one targeted Repair or remain Review.
- Complete option-catalog mismatch remains blocked.
- Live eBay exact option verification remains final authority.
- Protected fields and manual Publish boundary unchanged.
