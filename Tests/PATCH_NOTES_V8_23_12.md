# PATCH NOTES — V8.23.12

## Problem 2.5 — AI/API cost optimization

### Confirmed root causes
- V8.23.11 migrated Balanced/Quality normal analysis to as many as 10 photos per primary GPT request.
- Generic gallery heuristics marked many ordinary detail photos as `forceHighDetail`, so Balanced frequently paid HIGH-detail Vision cost without direct evidence that the photo contained small text.
- Normal strict verification could send as many as 5 HIGH-detail photos in a second GPT request.

### Changes
- Balanced primary cap: 10 → 6 photos.
- Quality primary cap: 10 → 8 photos. Cheap remains 4.
- Generic Balanced visual photos are LOW detail by default.
- Explicit label/measurement photos remain HIGH detail.
- Local macOS Vision OCR runs before the paid primary request and may promote a selected photo to HIGH detail only when strong OCR text/consensus indicates real label evidence.
- OCR remains evidence-only in normal Fill; it does not invent missing visual answers or replace GPT.
- Normal strict verification photo cap: up to 5 → up to 3 targeted HIGH-detail photos.
- Photo policy migrated to version 3 so old V8.23.11 ten-photo settings are reduced automatically.
- Cost estimator updated to match the reduced photo policy.

### Accuracy safeguards retained
- Same GPT model and field policy.
- Strict fields still receive independent verification when local OCR cannot strongly confirm them.
- OCR conflicts still go to GPT verification.
- Recovery images remain HIGH detail.
- Existing exact matcher, allowlist/protected fields, Fill Engine verification, Queue state machine and publish/delete/payment protections are unchanged.

### New regression guard
`Tests/unit/ai_cost_optimization.test.js` prevents regressions back to ten-photo Balanced analysis, generic HIGH-detail routing, or >3 normal repair photos.
