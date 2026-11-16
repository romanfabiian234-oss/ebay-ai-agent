# PATCH NOTES — V8.23.3

## Type
PATCH — Queue Show More Readiness.

## Confirmed root cause
On real eBay Queue runs, the Item Specifics container and its initially visible rows could render before the collapsed `Show more` control. V8.23.2 checked for `Show more` only once before entering the field-stability loop. If the button hydrated afterward, the loop could decide the visible subset was stable and start AI analysis without the hidden Item Specifics.

A second compatibility issue made this easier to miss: the core toggle matcher used `aria-label OR textContent` as one value and required an exact match. A control with visible text `Show more` but accessibility label `Show more item specifics` therefore did not match.

## Fix
- `core/snapshot.js` now re-checks for the scoped Item Specifics `Show more` control throughout the bounded hydration/readiness window.
- When the control appears, it is opened immediately and the snapshot waits for the expanded field set to stabilize before AI analysis continues.
- `Show more` / `Show less` matching accepts the scoped accessibility-label variant `... item specifics` while remaining restricted to the Item Specifics section.
- One bounded local retry is allowed if the first click is ignored.
- A still-visible `Show more` is no longer treated as a ready expanded snapshot.
- `collectFieldMap({ expand: true })` enters the same readiness gate even when the button has not appeared yet; if the section stays collapsed/unstable, Fill is stopped instead of silently using only the visible subset.
- Added Chromium regression coverage for delayed hydration, accessibility-label variation, expanded hidden-field capture, one bounded retry, direct expand-aware field-map calls, and refusal to return a partial map when expansion fails.

## Not changed in behavior
- Queue run/draft transition gate from V8.23.2.
- Queue budget/blocker handling from V8.23.1.
- Shared Fill Engine and deterministic matching.
- GPT prompt/evidence/cache behavior.
- Photo transfer.
- Text and Review modes.
- Depop/Poshmark adapters.
- eBay protected fields, UPC/MPN policy, and no Publish/List/Delete/Pay behavior.

## Manual live test still required
Run Queue on 2–3 real eBay drafts that visibly have `Show more`. Confirm that `Show more` automatically becomes expanded before the item enters AI analysis and that the newly revealed fields are included/fillable. This environment cannot reproduce the logged-in production eBay DOM exactly.
