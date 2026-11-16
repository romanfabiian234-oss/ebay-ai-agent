# PATCH NOTES — V8.23.2

## Type
PATCH — Queue Transition Stability.

## Confirmed root cause
V8.23.1 used a tab-only in-memory pending flag for Queue wake-ups. While draft A was processing, a second `onUpdated`/fallback signal for the same tab could set that flag. After A finished, Queue advanced and navigated the reused tab to draft B, but the stale pending flag could immediately wake the worker again without any identity tying the wake-up to A. That created a race during B navigation: processing could begin before B's new content script/page runtime was ready, so the next item's AI analysis might never start correctly.

The previous first-item fallback also used a fixed 5-second delay, while later transitions depended mainly on tab events rather than one explicit exact-draft readiness gate.

## Fix
- Replaced the tab-only pending Set with run/draft-aware active and pending tickets.
- Every Queue wake-up now carries `runId + draftId`.
- Duplicate wake-ups for the same active draft are ignored instead of becoming pending work.
- A wake-up from the previous draft or a previous Queue run is rejected as stale.
- A legitimate next-draft wake-up may wait behind the still-finishing previous worker, then starts after that lock is released.
- `queueAdvanceRunnerV710()` explicitly schedules the next draft immediately after navigation; it no longer relies on a blind 5-second fallback.
- Initial Start, blocked-Queue resume, Retry Current, service-worker resume, `tabs.onUpdated`, and Helper-ready signals all route through the same exact-draft ticket gate.
- If the service worker restarts while the reused processing tab is still on the previous draft, Queue safely reopens the persisted current draft before resuming.
- Added a bounded readiness check that proceeds as soon as the real state is ready:
  1. tab URL contains the expected Draft ID;
  2. the content bridge responds;
  3. the content bridge reports the same document Draft ID;
  4. the shared Fill Engine is ready.
- The content bridge ping now reports its actual document Draft ID, preventing an old page script from being mistaken for the newly navigated draft.
- Added Queue transition regression coverage for three sequential drafts, duplicate signals, stale prior-draft events, old-run isolation, and readiness invariants.

## Not changed in behavior
- Shared `core/fill.js` Fill Engine.
- GPT prompt/evidence/matching policy.
- Photo transfer.
- Text and Review modes.
- Depop/Poshmark adapters.
- API budget behavior from V8.23.1.
- eBay protected fields / UPC / MPN policy.
- No Publish/List/Delete/Pay behavior was added.

## Manual live test still required
The race is covered statically and by deterministic transition regression tests, but this environment cannot reproduce a real logged-in eBay Queue. Test V8.23.2 with at least 2–3 real drafts and confirm that each next item visibly enters Reading/Analyzing after navigation.
