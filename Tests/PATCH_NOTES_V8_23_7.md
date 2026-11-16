# PATCH NOTES — V8.23.7

## Reliable API Cost Accounting

### Root cause
V8.23.6 budget history was primarily item-level. A completed item could save one aggregate cost estimate, while individual Primary / Strict Verification / retry requests were not independently persisted. The local price calculation also collapsed all input into one rate instead of preserving GPT-5.6 cached-input and cache-write categories. As a result, the local daily figure could materially diverge from OpenAI Dashboard spend and failed/uncertain requests were hard to trace.

### Changes
- Added `Extension/shared/usage.js` as the single per-request usage/cost ledger.
- Every OpenAI and Claude request is opened in the ledger before transport and finalized after the upstream outcome.
- Records stage, model, photo/question counts, client request ID, provider request ID, token breakdown, cost status, and request status. No prompt/image contents or secrets are stored.
- Uses provider-reported usage when available, including cached input, cache writes, output and reasoning-token breakdowns.
- GPT-5.6 Sol/Terra/Luna standard short/long-context rates are centralized. Reasoning tokens are a breakdown of output tokens and are not charged twice.
- Unknown transport outcomes conservatively keep the preflight estimate reserved. Explicit rejected 4xx requests count zero unless provider usage is reported. Upstream 5xx without usage remain uncertain/reserved.
- New item summaries are diagnostic only (`countsTowardBudget: false`) to prevent request + item double counting.
- Queue daily/monthly hard limits now read the shared request ledger.
- OpenAI requests receive `X-Client-Request-Id`; provider `x-request-id` is retained when returned. The extra header is scoped only to `api.openai.com`.
- Usage UI now shows request count, calculated cost vs uncertain estimate, stage, token breakdown, and request IDs.

### Intentionally unchanged
- GPT model selection (`gpt-5.6`) and reasoning policy.
- Strict verification field/photo policy.
- Fill Engine, Queue transition, Show More readiness, photo transfer, Text/Review behavior.
- Protected listing fields and manual-only publish/delete/payment behavior.

### Important interpretation
The V8.23.7 ledger is a calculated local operational guard based on provider-reported token usage and the configured/current standard pricing table. OpenAI Dashboard remains the authoritative billed total. Regional processing, non-standard service tiers, external usage on the same project/key, or later provider pricing changes can make the dashboard differ from the local calculation.
