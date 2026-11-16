# PATCH NOTES — V8.23.18

Problem 2.5 cost/accuracy follow-up from the real V8.23.17 browser test. One normal item still used a bounded second GPT request (`Independently verifying 2 strict fields with GPT…`) and the OpenAI dashboard later showed +2 requests / about +$0.07 for that run.

Confirmed code-level causes addressed in this patch:
- The local OCR verifier required the primary GPT citation and OCR evidence to point to the same photo before it could suppress paid verification, even for deterministic observable facts where another gallery label independently showed the exact same value.
- Repair decisions were not persisted per field, so a second request could be seen but not explained from the local Usage UI.
- Strict repair could still carry large eBay option catalogs even though the live Fill Engine already performs final exact-option validation.

Main changes:
- Added a Local Evidence Engine. High-confidence field-specific OCR may independently confirm Brand, Size, whole-item Material, Garment Care, Country of Origin and exact shoe-component facts across gallery photos after the existing deterministic evidence validator passes.
- Model and Product Line remain same-photo-only; weak OCR, conflicts, ambiguous size/material scope and unsupported fields do not gain the cross-photo shortcut.
- Every potential repair field now receives an explicit reason code. Pure missing fields with no direct evidence signal are skipped instead of triggering speculative paid repair.
- Strict repair is a micro-repair: only unresolved fields and their matching field contracts are sent; seller title/current values remain excluded; large/virtualized option catalogs are summarized rather than copied into the prompt; evidence photos remain bounded to 2 HIGH-detail images in Cheap/Balanced or 3 in Quality.
- Kept the existing safe GPT output-token headroom. The patch reduces unnecessary calls and input context rather than risking reasoning/output truncation.
- Added request telemetry for question names, repair reason codes, evidence photo IDs and HIGH-detail photo count. Usage History groups Primary/Repair records by `analysisRunId` and shows per-run requests, tokens and cost when provider usage is known.
- Photo-stage diagnostics now include repair fields/reasons and per-stage token/cost records.

Measured deterministic prompt regression:
- Synthetic 2-field repair with 244 Country options + 52 Material options: strict user prompt 2,432 chars in V8.23.17 → 949 chars in V8.23.18 (~61% smaller text context), while the output/evidence safety contract remains intact.

Unchanged safety/accuracy boundaries:
- GPT model unchanged.
- OCR confidence thresholds unchanged.
- Paid primary image caps unchanged: Cheap 4 / Balanced 6 / Quality 8.
- One bounded repair request maximum in normal Fill.
- GPT↔OCR conflicts still require independent handling; local OCR never overwrites a conflicting GPT answer.
- Fill Engine remains the only final live option writer/verifier.
- Protected fields, Queue semantics and manual publishing boundary unchanged.
