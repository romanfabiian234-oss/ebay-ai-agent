# PATCH NOTES — V8.23.19

Problem 2.5 cost/stability follow-up after the real V8.23.18 test showed one item could appear as +3 OpenAI dashboard requests and roughly +$0.11.

## Confirmed code defects / risks addressed

- The shared `callApi()` transport still contained a token-parameter compatibility retry. Product analysis called that transport without disabling the retry, so a single logical Primary or Repair stage could make a second upstream attempt after a compatibility 400. The stage-level comment claiming “exactly one upstream request” was therefore not an enforced invariant.
- Strong local OCR evidence was still promoted to HIGH-detail GPT Vision simply because the photo looked like a label. That duplicated paid reading of text the local Evidence Engine could already verify/recover.
- Per-item cost/request budget was visible in Usage history but not surfaced directly in the normal Fast Fill result.

## Changes

- Normal Fill now owns a hard `maxOpenAiRequests = 2` analysis budget: Primary + at most one targeted Repair. The guard is consumed before transport and fails closed if a future path attempts request 3.
- Item-Specific Primary/Repair calls set `allowCompatibilityRetry: false`. The explicit API connection test alone may perform the one token-parameter compatibility probe and cache the working parameter.
- Added adaptive Vision detail routing:
  - strong local direct-label OCR → Primary LOW detail;
  - weak/ambiguous label OCR → Primary HIGH detail;
  - Repair evidence → always HIGH detail.
- Existing Local Evidence validation/conflict rules are unchanged. LOW detail does not turn OCR into truth; only validated field-specific evidence can recover/confirm a strict value.
- Fast Fill results now expose `openAiRequestsAttempted`, the hard request limit, provider-reported per-item cost when known, and whether the $0.07 operational target was met.
- Photo-stage diagnostics include the same request-budget/cost fields.

## New regressions

- `analysis_request_budget.test.js`: normal product analysis gets one upstream attempt per stage; compatibility probing is connection-test-only; hard 2-request invariant is present.
- `adaptive_vision_detail.test.js`: strong OCR label evidence stays LOW during Primary, weak evidence stays HIGH, and Repair always re-reads HIGH.
- Existing OCR conflict, rejected-candidate, virtualized Size, shoe-label, regional-size, Fill Engine, Queue and marketplace regressions remain mandatory.

## Unchanged accuracy/safety boundaries

- GPT model unchanged.
- OCR confidence thresholds unchanged.
- Primary photo caps unchanged: Cheap 4 / Balanced 6 / Quality 8.
- At most one Repair in normal Fill.
- No third GPT request is bought to rescue unresolved fields; they stay REVIEW/blank.
- Fill Engine remains final live option verifier.
- Protected fields and manual Publish boundary unchanged.
