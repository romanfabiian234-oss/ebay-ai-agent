# PATCH NOTES — V8.23.5

## Smart Strict Verification

**Type:** PATCH  
**Base:** V8.23.4

### Why
Real V8.23.4 Queue runs showed that strict verification still consumed about 12–14 seconds and rechecked 14–19 strict fields per item. The compact V8.23.4 prompt reduced duplicated instructions, but the second request still carried more fields and photos than necessary.

### What changed
- Added `smartStrictVerificationPlan(...)` for normal Fast Fill.
- High-impact strict facts still receive independent GPT verification:
  - Brand / Size / Model / Product Line and shoe-size context fields;
  - Material fields;
  - Garment Care;
  - Country of Origin;
  - exact measurement-only fields;
  - explicit Yes/No fields.
- Important missing Brand/Size/shoe-size/Material/Country/Garment Care evidence still enters the one bounded recovery request.
- Lower-impact strict fields may stay single-pass only when the primary result already contains validated direct photo evidence, a supporting photo number, evidence text and the required evidence type.
- Visual-only support may skip the second pass only for Character / Character Family; hidden technical facts still require tag/measurement support.
- Added evidence-aware strict-repair photo selection:
  - exact primary supporting photos are prioritized;
  - fully supported verification normally uses up to 3 photos;
  - if requested strict evidence is missing, the picker may expand to 4 photos;
  - hard maximum remains 5;
  - all strict verification images remain HIGH detail.
- Balanced strict verification reasoning remains MEDIUM.
- The verifier still never receives the primary candidate value/current eBay value.
- Queue/Control status reports strict field count, repair photo count, repair timing and the count of lower-impact strict fields kept from validated primary evidence.

### Intentionally unchanged
- Shared Fill Engine.
- Queue transition logic from V8.23.2.
- Show More readiness from V8.23.3.
- Compact strict-verification prompt from V8.23.4.
- Photo transfer.
- Text / Review / Claude behavior.
- Depop / Poshmark adapters.
- Protected eBay listing fields and manual publication policy.

### New regression coverage
`Tests/unit/smart_strict_verification.test.js` checks:
- high-impact strict fields remain independently verified;
- lower-impact strict fields can stay single-pass only with validated direct evidence;
- weak evidence returns the field to strict verification;
- hidden technical facts cannot use visual-only support to skip verification;
- exact supporting photos are retained;
- normal photo count is reduced without lowering HIGH detail;
- missing-evidence verification remains bounded.
