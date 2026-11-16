# PATCH NOTES — V8.23.4

## AI Repair Efficiency

### Problem
Normal Photo/Queue analysis used one primary GPT request plus one independent strict verification request when strict fields were present. The verification request correctly protected sensitive fields, but its prompt repeated most of the full primary Fill instructions. On real runs this made the second request unnecessarily large and harder to measure.

### Root cause
`buildItemSpecificsRecoveryPrompt()` reused `buildItemSpecificsPrompt()` for normal Fill recovery. The result repeated ordinary visual-field guidance, examples and general Fill rules even though the second request was allowed to verify only strict fields.

### Fix
- Added a dedicated compact strict-verification user prompt.
- Added dedicated compact strict-verification system instructions.
- The verification request now contains only:
  - the exact strict fields being checked;
  - field type/cardinality;
  - exact platform options;
  - a compact policy code;
  - the reason each field is being rechecked;
  - strict evidence/safety rules.
- Existing seller title/current form values remain excluded from independent strict verification to avoid anchoring.
- Queue/Control Panel progress now reports Primary GPT, strict-verification, and total AI timing separately.

### Accuracy/safety intentionally unchanged
- Same `strictVerificationQuestions(...)` field selection.
- Same 40-field verification cap.
- Same one bounded second GPT request.
- Same up-to-5 recovery evidence photos.
- Same HIGH image detail for recovery.
- Balanced recovery reasoning remains MEDIUM.
- Same strict merge/conflict behavior: a disagreement on a strict fact is not auto-filled.
- Same protected-field and no-publish safety rules.

### Measured prompt reduction
Representative 18-field strict verification regression fixture:
- previous combined recovery instructions: 17,900 characters;
- V8.23.4 combined recovery instructions: 7,958 characters;
- reduction: about 55.5%.

This is an instruction-size reduction, not a claim that live GPT latency will improve by the same percentage. Real API timing must be measured on eBay after installation.

### Not changed
- Fill Engine.
- Queue transition logic from V8.23.2.
- Show More readiness from V8.23.3.
- Photo transfer.
- Text / Review behavior.
- Depop / Poshmark adapters.
- Backend API behavior other than the version label.
