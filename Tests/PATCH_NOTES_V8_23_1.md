# PATCH NOTES — V8.23.1

## Type
PATCH — Queue Stability.

## Root cause
Queue-level blockers were handled like ordinary per-draft failures. In particular, a daily/monthly API budget rejection was thrown before the AI request, caught by the generic item-error path, marked as an error for the current draft, and then `queueAdvanceRunnerV710()` opened the next draft. The same global blocker therefore repeated for every remaining item. Per-draft failure messages were retained in runner storage, but the normal Queue UI mostly showed only `Error` plus the final error count.

## Fix
- Added structured Queue failure classification for queue-wide vs per-item failures.
- Daily/monthly API budget blockers now stop the Queue once before the AI request.
- API auth, rate-limit/quota, API configuration, and local-backend availability failures are treated as queue-wide blockers instead of repeated draft errors.
- A blocked current draft stays `pending`; remaining drafts stay pending too.
- Added a distinct `blocked` runner state with an exact reason and safe resume instructions.
- Pressing Start after fixing Settings resumes the same unchanged Queue from the blocked draft, preserving already completed items.
- Ordinary per-draft errors still advance safely to the next draft.
- Non-throwing Fill/Save failures now preserve the most specific Fill/Save failure message.
- Control Panel and in-page Queue now show the exact per-draft error/block reason instead of only a generic `Error` label.
- Added Queue Stability regression coverage.

## Not changed in behavior
- Shared `core/fill.js` Fill Engine.
- Photo transfer.
- Photo/AI evidence policy and cache schema.
- Text, Review and marketplace adapters.
- eBay protected fields and UPC/MPN policy.
- No Publish/List/Delete/Pay behavior was added.
