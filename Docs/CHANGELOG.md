# Changelog

## V8.23.21 — eBay → Vinted Photo Transfer

- Added Vinted (`vinted.com`) as a photo-transfer destination without enabling the Depop/Poshmark Smart Fill route on Vinted.
- Added an isolated Vinted destination runtime that loads only the shared marketplace detector and photo-transfer bridge.
- Added Vinted listing-uploader discovery using the listing route/form context plus image file-input signals instead of a single brittle CSS selector.
- Added the official Vinted 20-photo listing limit to transfer slot calculation and the drop overlay.
- eBay drag copy now names Depop, Poshmark, and Vinted as supported destinations.
- Added Chromium integration coverage for a 7-photo Vinted transfer, one native file-input change event, DOM preview verification, and the 20-photo cap.
- Existing eBay, Depop, and Poshmark behavior, protected-field policy, and manual publish boundary are unchanged.

## V8.23.20 — Direct Label Accuracy + Hidden-Action Guard

- Fixed cashmere/acrylic/acetate/modal/leather/suede label context so standalone physical size tokens such as `M` are not discarded.
- Preserved block-level macOS Vision roles when OCR results are normalized, preventing a `brand label` signal from degrading to a generic photo role.
- Strong physical-tag OCR for Brand, Size, Material, Garment Care, origin and direct shoe fields may cross an explicitly incomplete/virtualized eBay option snapshot; the shared Fill Engine still requires an exact live option and post-fill verification.
- Added numeric clothing Size tokens (`00`, `0`, normal 1–2 digit sizes, narrow P/W/T suffix forms) without treating arbitrary identifiers as sizes.
- Added `100% X` Material specificity only when the percentage is directly read and confirmed from the physical label; plain `Cashmere`/`Wool` never fabricates 100%.
- Added identical-analysis single-flight deduplication before the paid Primary request. Different drafts remain independent and failure cleanup allows a later explicit retry.
- Added hidden-action regression coverage confirming no backend OpenAI retry loop, no automatic Test API action, no live caller of the legacy paid route, and no >2 normal-Fill OpenAI attempts.
- Kept GPT model, OCR confidence thresholds, protected fields, live verification, paid image caps, and the ~$0.07 operational target unchanged.

## V8.23.19 — Hard Request Budget + Adaptive Vision Detail

- Enforced one Primary + at most one targeted Repair OpenAI upstream attempt in normal Fill; compatibility probing is explicit Test API only.
- Strong local OCR label evidence stays LOW detail in Primary; weak/conflicting evidence and Repair remain HIGH detail.
- Added per-item request/cost telemetry and the operational $0.07 target without allowing a third rescue request.

## V8.23.18 — Local Evidence Engine + Explainable Micro-Repair

- Added reason-gated cross-photo Local Evidence verification for deterministic physical facts while keeping Model/Product Line same-photo-only.
- Suppressed speculative no-evidence Repair and reduced Repair input to unresolved fields/evidence only.
- Added per-field Repair reasons, photos, HIGH-detail count, tokens and cost diagnostics.

## V8.23.17 — Regional Size Labels + High-Resolution OCR Diagnostics

- Added deterministic regional physical-label parsing for US/USA, UK, EU/EUR and related headers. Generic eBay `Size` uses only an explicitly printed US/USA row; no cross-region conversion is performed.
- Added row/geometry and confidence/consensus guards for split OCR blocks and blocked conflicting duplicate US values.
- Preserved the one-request path when a strong local regional Size is available before repair, while keeping exact live-dropdown verification mandatory.
- Added regional size words to local macOS Vision OCR hints.
- Improved the agent's own debug export with validated canonical high-resolution eBay image URLs for reproducible OCR diagnostics; local data URLs and secrets remain excluded.
- Added regression tests for regional size tables, weak/conflicting evidence, no-US tables, one-GPT recovery, and high-resolution diagnostic URL handling.

## V8.23.16 — Exact Live Size Recovery Without Speculative GPT Repair

- Real V8.23.15 testing on a UNIQLO U sweater reproduced two API requests while required `Size` remained blank even though the physical label clearly showed `XS`.
- Confirmed root cause: eBay's virtualized Size menu caused the compact snapshot to expose `options=[]` with `optionsComplete=false`; local OCR could derive `XS`, but both the OCR recovery gate and deterministic matcher rejected Size when the compact option catalog was intentionally omitted.
- Added `Size` to the narrow live-exact OCR recovery boundary. A strong local physical-label Size fact may survive an explicitly incomplete snapshot and defer final validation to the shared live Fill Engine.
- The matcher allows this bypass only when `localOcrRecovery=true`, evidence type is `physical_tag`, status is `confirmed_by_tag`, and the snapshot explicitly marks the options incomplete. Ordinary GPT Size candidates remain blocked when the catalog is unavailable.
- The Fill Engine still has to open the real eBay Size control, select the exact live option, and verify the result. Unknown/ambiguous/non-exact sizes remain Review.
- Added regressions covering `XS` local recovery with an incomplete Size catalog, ordinary GPT Size rejection under the same conditions, and exact live Size selection.
- OCR confidence thresholds, GPT model, paid photo caps, protected fields, Queue behavior, care-symbol safety and manual publish boundary are unchanged.

## V8.23.15 — Adaptive Local OCR/CV Accuracy

- Fast on-device OCR discovery can inspect up to 12 eBay gallery photos, while paid GPT primary photo limits remain Cheap 4 / Balanced 6 / Quality 8.
- Generic mid-gallery photos can become Accurate-OCR candidates from actual label text or a macOS Vision rectangle focus hint; eBay photo role metadata is no longer the only discovery signal.
- Accurate OCR remains bounded to at most 3 difficult photos and now tests the strongest crop/upscale with local Core Image high-contrast/grayscale and sharpened renditions.
- OCR pass votes and preprocessing-variant votes survive the backend merge; the extension merges Fast + Accurate blocks by evidence quality instead of preferring whichever pass returned more blocks.
- Snapshot fields now expose `optionTotal` and `optionsComplete`. Direct shoe/origin OCR facts may cross an intentionally incomplete virtualized option snapshot, but the shared Fill Engine must still find and confirm the live option.
- Added deterministic live Shoe Width alias resolution (`2E` ↔ `EE`, `3E` ↔ `EEE`, etc.) only when the live menu yields one unique match; ambiguous matches remain Review.
- Care-symbol handling remains evidence/routing-only unless readable text proves the instruction; pictogram shapes are not guessed.
- Added `ocr_cv_pipeline.test.js` and `ocr_cv_architecture.py` regressions plus release-gate checks for the new local-only path.
- GPT model, 4/6/8 paid photo policy, one-primary-request target, protected fields, shared Fill Engine, Queue behavior and manual publish boundary remain unchanged.

## V8.23.14 — Direct OCR Recovery for Observable Label Facts

- Real V8.23.13 browser testing confirmed the cost target improved to one GPT request on the tested shoe, but exposed a completeness regression: the physical label visibly contained `9 2E`, `LEATHER UPPER`, `SYNTHETIC LINING`, `MAN MADE SOLE`, and `MADE IN CHINA` while several corresponding eBay fields stayed blank.
- Root cause: the OCR validator understood generic Size/Material/Origin facts but did not model shoe-specific fields as separate deterministic facts, and normal Fill would not create a missing answer from strong OCR evidence.
- Added field-specific OCR parsing for `US Shoe Size`, `Shoe Width`, `Upper Material`, `Lining Material`, and `Outsole Material`, including split-block OCR such as separate `9` and `2E` observations.
- `LEATHER UPPER`, `SYNTHETIC LINING`, and `MAN MADE SOLE` are scoped to their exact shoe components; component text is no longer promoted to generic whole-item `Material`.
- Normal Fill may recover a missing direct OCR fact only after the primary GPT pass, only for allowlisted direct-label fields, only with conservative OCR confidence/consensus, and only when every recovered value exactly matches the current eBay option list. Unknown options, weak OCR, ambiguous values and ordinary visual text remain blank.
- A bare numeric pair such as `9 2E` is accepted only in clear shoe-label context; the same text on an ordinary product photo is rejected.
- OCR never silently overwrites a GPT answer. A GPT↔OCR conflict still triggers the bounded independent second GPT read; disagreement between the two reads remains unfilled for manual review.
- The V8.23.13 one-primary-request policy, 4/6/8 primary photo caps, LOW/HIGH detail routing, bounded repair, protected-field policy and manual publish boundary remain unchanged.
- Added a dedicated shoe-label regression plus updated OCR pipeline coverage for strong local recovery, weak-confidence rejection, exact-option rejection and conflict preservation.


## V8.23.12 — AI/API Cost Optimization

- Reversed the V8.23.11 ten-photo Balanced/Quality expansion that caused unnecessarily large Vision inputs. Balanced now caps normal analysis at 6 selected photos, Quality at 8, Cheap at 4.
- Ordinary Balanced visual photos now use LOW image detail. HIGH detail is reserved for explicit label/measurement evidence, local-OCR-detected label evidence, and the bounded strict verification pass.
- Local macOS Vision OCR now runs before the paid primary GPT request in normal Fill so it can promote only photos that actually contain strong text evidence to HIGH detail. OCR still does not invent normal-Fill answers.
- Strict GPT verification is limited to up to 3 targeted HIGH-detail photos instead of up to 5 in the normal automatic path.
- Existing V8.23.11 photo-policy settings migrate automatically to the new policy while preserving smaller user-selected limits.
- Added a dedicated AI cost regression guard covering photo caps, LOW/HIGH detail routing, migration, and repair-photo limits.
- GPT model, protected-field rules, deterministic matching, Fill Engine, Queue behavior, and publishing safety remain unchanged.

## V8.23.11 — Dead Code and Legacy Path Cleanup

- Removed production functions, constants and state that were proven unreachable after the UI/container refactors.
- Removed senderless legacy message routes and the obsolete Queue/Fill/full-page-capture compatibility paths they kept reachable.
- Removed unreachable legacy clusters from the historical eBay Helper while preserving its active message/runtime entrypoints.
- Replaced tests that required obsolete implementation symbols with checks of the active behavioral contracts.
- Added a dead-code regression gate that rejects removed legacy routes and conservatively detects obvious unreferenced named production declarations.
- No active AI/OCR reasoning policy, shared Fill Engine behavior, protected-field policy, Queue per-item semantics, photo-transfer upload mechanics or publishing boundary was intentionally changed.

## V8.23.10 — Strict UI Container Ownership

- Completed the V8.23.9 UI split by moving application state, storage/browser workflows, Queue control logic, diagnostics, connections, settings actions, Review workflow and marketplace photo workflows outside `Extension/ui/`.
- UI containers now own visible rendering/user-input surfaces only; `core/` and `shared/` have no `EbayUI` dependency.
- Split Seller Hub Queue into UI view, page controller and eBay DOM adapter; removed duplicate Progress ownership and delegated Control/Assistant/Photo Transfer visible DOM to UI containers.
- Moved legacy Fill Preview markup/styles/events into the Assistant UI owner and moved its width persistence into `shared/panel_preferences.js`.
- Added strict static ownership checks plus Chromium UI regression coverage.
- No AI reasoning policy, Fill matching, protected-field policy, Queue item processing, photo-transfer upload mechanics or publishing behavior was intentionally changed.

## V8.23.9 — UI Container Structure

- Reorganized `Extension/ui/` into one-responsibility visual containers: popup, progress, photo selection, queue panel, assistant panel, status, settings and notifications.
- Moved the mixed historical Helper runtime out of `ui/` to `platforms/ebay_helper.js`; normal automatic Fill remains owned by the single shared `core/fill.js` writer.
- Extracted toast notifications, Queue progress rendering and Assistant panel styles from the mixed Helper runtime into dedicated UI containers.
- Popup status, theme, photo-source counter and photo-checklist rendering now delegate to their dedicated UI containers.
- Updated Manifest, in-page Control Panel iframe path and on-demand Helper/Queue injection paths to the new structure.
- Added static and Chromium DOM coverage for UI container ownership and rendering.
- No AI reasoning, OCR policy, Fill matching, Queue processing, protected-field policy, photo-transfer behavior or publishing boundary was intentionally changed.

## V8.23.8 — Smart Local OCR Verification

- Normal Photo/Autopilot/Queue now starts bounded local macOS Vision OCR in parallel with the primary GPT analysis when local OCR is available.
- OCR is verification-only in normal Fill: it may confirm an existing GPT answer only for direct label facts (Brand, Size, Material, Country of Origin/Manufacture, Garment Care, Model and Product Line).
- High-confidence confirmation requires the existing deterministic evidence validator, conservative confidence/consensus thresholds, direct physical-label support from GPT, and the same cited photo; Color, Style, Vintage and other visual/ambiguous fields are excluded.
- OCR never creates a missing answer and never overwrites GPT. Strong conflicts are preserved and sent to the normal independent GPT strict-verification pass; weak OCR changes nothing.
- Strict fields independently confirmed by OCR are removed from the paid second GPT request, reducing repeat image/token cost without weakening the remaining verification policy.
- The V8.23.7 per-request cost ledger remains unchanged and continues to account for Primary, Strict Verification, retries, tests and Claude without double counting item summaries.
- Added regression coverage for the OCR allowlist, high-confidence confirmation, conflict handling, low-confidence rejection and the no-invention rule.
- Fill Engine, Queue transitions, Show More, Photo Transfer, protected fields and manual publishing behavior are unchanged.

## V8.23.7 — Reliable API Cost Accounting

- Added one shared per-request usage ledger for Primary, Strict Verification, retries, connection tests, and Claude requests.
- Uses provider-reported cached-input, cache-write, ordinary-input, output and reasoning-token details when available; reasoning remains an output breakdown and is not double charged.
- GPT-5.6 Sol/Terra/Luna short- and long-context standard pricing is calculated centrally; old per-item summaries no longer double-count new request records.
- Every OpenAI request receives a client request ID and retains the provider request ID when returned.
- Unknown transport outcomes reserve the request estimate conservatively; explicit rejected 4xx responses count zero unless provider usage is reported; uncertain 5xx outcomes remain reserved.
- Queue hard budgets now use the request ledger instead of completed-item summaries.
- No AI model, reasoning policy, strict field selection, Fill, Queue transition, Show More, Photo Transfer, or publishing behavior was changed.

## V8.23.6 — Fast Strict Verification

- Balanced/Cheap strict-verification GPT recovery now uses LOW reasoning instead of MEDIUM.
- Quality strict verification remains HIGH reasoning.
- Strict field policy, photo selection/HIGH detail, retry count, timeout, and output-token headroom are unchanged.
- This patch changes one latency variable only so real eBay tests can measure the quality/speed tradeoff cleanly.

## V8.23.5 — Smart Strict Verification
- Keeps independent GPT verification for high-impact strict facts: Brand/Size/Model/Product Line and shoe-size context fields, Material, Garment Care, Country of Origin, exact measurements, and explicit Yes/No claims.
- Lower-impact strict fields can stay single-pass only when the primary result already passed strict support validation with a direct supporting photo and evidence text. Weak, seller-context-only, or unsupported evidence still goes to the verifier.
- Strict verification photo selection now prioritizes the exact primary supporting photos and normally sends up to 3 photos; when a requested strict field has no primary supporting photo it may expand to 4, while the hard cap remains 5.
- Recovery images remain HIGH detail and Balanced recovery reasoning remains MEDIUM; the verifier still never sees the primary candidate value.
- Queue/Control status now reports strict verification field count, photo count, timing, and how many lower-impact strict fields safely stayed single-pass.
- Added unit/regression coverage for smart field selection, weak-evidence fallback, hidden-technical visual rejection, and bounded support-photo selection.
- Fill Engine, Queue transition, Show More readiness, Photo Transfer, Text/Review, marketplace adapters, protected fields, and manual publication behavior are unchanged.

## V8.23.4 — AI Repair Efficiency
- Kept the existing strict-field verification policy unchanged: the same `strictVerificationQuestions(...)` selection, 40-field cap, up-to-5 recovery evidence photos, HIGH recovery image detail, and Balanced MEDIUM repair reasoning remain in place.
- Replaced the normal Fill repair request's duplicated full Fill prompt with a dedicated compact strict-verification prompt containing only the requested strict fields, exact platform options, compact policy codes, and the reason each field is being rechecked.
- Added compact recovery-specific system instructions; the normal primary Fill prompt and Review/Claude reviewer prompt remain unchanged.
- Regression coverage measures the representative combined recovery instructions dropping from 17,900 to 7,958 characters (about 56% smaller) while preserving strict evidence guards.
- Queue/Control Panel status now reports Primary GPT time, strict-verification time, strict field count, and total AI time separately instead of calling the second pass only a “missing evidence” repair.
- Queue transition, Show More readiness, Fill Engine, photo transfer, marketplace adapters, protected fields, and publish/delete/payment safety are unchanged.

## V8.23.3 — Queue Show More Readiness
- Fixed a confirmed race where `core/snapshot.js` checked `Show more` only once before the Item Specifics stabilization loop. If eBay hydrated the control later, hidden Item Specifics were omitted from the AI snapshot and could not be filled.
- The readiness loop now re-checks `Show more` while the section hydrates, opens it as soon as it appears, and waits for the expanded field set to stabilize before Photo/Queue analysis continues.
- Added scoped support for eBay accessibility labels such as `Show more item specifics` / `Show less item specifics` without broad page-wide matching.
- Added one bounded local retry when the first Show more click is ignored; a still-collapsed section is no longer reported as ready.
- Added Chromium regression coverage for delayed Show more hydration, the accessibility-label variant, hidden-field inclusion, and the single retry.
- Queue transition behavior from V8.23.2, Fill Engine, AI/policy, photo transfer, marketplace adapters, protected fields, and publish/delete/payment safety are unchanged.

## V8.23.2 — Queue Transition Stability

- Fixed the race where a late `onUpdated`/fallback wake-up from draft A could fire after Queue had already navigated to draft B and prevent B from starting its AI analysis.
- Queue wake-ups now carry an exact `runId + draftId` ticket instead of a tab-only pending flag.
- Duplicate wake-ups for the same draft are ignored; stale wake-ups from the previous draft or an older Queue run are rejected.
- Each next draft is explicitly scheduled immediately after navigation and waits on real readiness instead of an arbitrary 5-second start delay.
- Readiness requires both the tab URL Draft ID and the content bridge document Draft ID to match the expected draft, preventing the old page script from being mistaken for the new page during navigation.
- Added regression coverage for three sequential drafts, duplicate `onUpdated + fallback` signals, stale previous-draft events, old-run isolation, and content-bridge readiness.
- Shared Fill Engine, AI analysis/evidence behavior, photo transfer, Text/Review, marketplace adapters, protected fields and publish/delete/payment protections were not changed.

## V8.23.1 — Queue Stability

- Queue-wide blockers such as daily/monthly API budget, API authentication/rate limits, and local-backend availability now stop the Queue once instead of turning every remaining draft into a separate error.
- The blocked draft and remaining drafts stay pending; pressing Start after fixing Settings resumes the unchanged queue from the blocked draft.
- Per-draft errors now retain and display their exact reason in both the Control Panel and in-page Queue panel.
- Non-throwing Fill/Save failures preserve the specific failure message instead of showing only a generic count summary.
- No Publish/List/Delete/Price/Title/Description/Condition/Shipping behavior was added or changed.

## V8.23.0 — Stable Native Photo Transfer
- Replaced the unstable synthetic platform drop + 4-file batch/fallback chain with one native multiple-file input upload per transfer.
- Poshmark now detects only the exact visible `Select a Covershot` modal, clicks its exact enabled `Apply` button, waits for that modal to settle, then verifies the real listing photo grid before showing success.
- `photo_drop_early.js` is now the single destination `dragover/drop` owner; the later transfer module only shows status UI and consumes the captured transfer session.
- Removed private React/Vue hydration probing and broad whole-document upload observers; waits now use the actual photo input/zone and bounded scoped observers.
- Removed the duplicate URL-signature transfer gate that could incorrectly block the same photos on a new listing.
- Retry policy is safer: one retry only after zero visible progress; partial uploads stop instead of automatically resending already accepted files.
- Fixed two literal control/backspace bytes in the eBay native-selection regex (`\b...\b`).
- Destination verification now counts actual photo nodes rather than unique URLs, so two intentionally identical photos still count as two uploads.
- Full regression/release audit confirms one Fill Engine/router, protected-field policy, Native Messaging/Keychain security, and no publish/delete/payment path changes.

## V8.22.2 — Live selected-photo counter sync
- Fixed the eBay `Drag N selected photos` pill so its count updates immediately when the native eBay photo selection changes.
- Added a short-lived MutationObserver scoped to the Photos area and selection toolbar; it disconnects as soon as eBay exposes the new selection state.
- Kept the existing click/drag selection identity, Depop/Poshmark upload flow, Fill Engine, Queue, AI and protected listing fields unchanged.

# V8.22.1 — Reliable Selected Photo Transfer

- Fixed live eBay native selection where eBay showed `N selected` but the Drag badge still used all photos.
- Added stable hit-testing under eBay's native checkmark overlay so selected photo identity does not depend on generated eBay CSS classes.
- Destination upload now waits for the real marketplace uploader readiness, not merely the presence of a server-rendered file input.
- Added platform-specific upload order: Poshmark drop-zone first with input fallback; Depop input first with drop-zone fallback.
- File input assignment uses the native `HTMLInputElement.files` setter when available.
- Destination verification counts unique real photo/background sources and retries only the unconfirmed tail.
- Replaced raw `Extension context invalidated` errors with a clear one-refresh instruction after extension updates.
- Shared Fill Engine, Queue, Text, Review, protected fields, Keychain/Native Messaging and manual publication remain unchanged.

# V8.22.0 — Selected Photo Transfer + Universal Photo Reader

- Reuses eBay's own native Select state: no selection transfers all detected photos; an active eBay selection transfers only those selected photos in gallery order.
- The floating badge updates to `Drag N selected photos` and blocks unsafe partial selection identification instead of transferring the wrong images.
- Added one shared robust eBay gallery collector used by both Drag and the Photo/Queue snapshot reader, fixing the live mismatch where eBay showed 11 photos but the AI panel could show only 1.
- Fixed compact gallery counters such as `VIDEO11/25` and added bounded lazy/data/CSS/resource recovery when the visible count proves photos are missing.
- Added a short-lived photo-transfer session in `chrome.storage.session` and a Depop/Poshmark `document_start` drop receiver, so a user Drop is preserved while the destination listing form is still rendering.
- Added a large destination Drop overlay, bounded wait for the real file input, ordered batch uploads, actual thumbnail verification, and one bounded retry only for the unconfirmed tail.
- Partial transfer progress is remembered so a retry does not intentionally resend already-confirmed photos.
- Control Panel `Read Photos + Listing Fields` now works on eBay, Depop and Poshmark.
- Added Chromium regression coverage for delayed destination readiness, native selected-photo order, and full 11-photo gallery recovery.
- Shared Fill Engine, Text/Queue/Review behavior, eBay protected fields, Keychain/Native Messaging and manual final publication remain unchanged.

# V8.21.0 — Mouse Photo Transfer

- Added one compact **Drag N photos** handle on eBay draft pages for mouse transfer to Depop/Poshmark.
- The drag payload preserves photo order and contains only validated eBay listing-image URLs; photo bytes are fetched only after the user drops the handle on the destination Photos area.
- Background fetch is restricted to `https://i.ebayimg.com/*`, image MIME types, and a bounded per-file size; credentials and Chrome Downloads are not used.
- Depop/Poshmark receive real ordered `File` objects through their existing multiple-file inputs, then destination thumbnails are verified before success is shown.
- Depop transfer respects its 8-photo limit; Poshmark respects 16; existing destination photos reduce available slots.
- Added duplicate-transfer guard and clear error/review status when the destination does not confirm all requested thumbnails.
- Added Chromium integration tests for eBay drag payload creation, DataTransfer/FileList assignment, upload change events, order, and DOM verification.
- Shared Fill Engine, eBay Photo/Queue/Review, marketplace Fill All, protected fields, Keychain/Native Messaging, and manual final publication remain unchanged.

# V8.19.3 — Root-Cause Accuracy Guards

- Replaces item-specific symptom fixes with behavior-based field classes for strict identity/label facts, exact measurements/widths, hidden technical properties, binary claims, strong-support subjective fields, and ordinary visual fields.
- Exact measurements and manufacturer width/fit classifications now require a readable ruler/tape measurement or explicit physical label; perspective alone cannot prove values such as platform height, bag dimensions, calf width, or shoe width.
- Binary Item Specifics are strict: visible evidence may prove an obvious Yes, but absence never proves No. Signed/Vintage/Handmade/Personalize and equivalent Yes/No controls stay unchanged without explicit support.
- Normal Fast Fill uses at most one additional strict-only GPT evidence audit. The audit re-reads strict accepted facts without seeing the primary candidate/current value and removes conflicting or unconfirmed strict answers before Fill.
- Manual corrections now participate in the analysis-cache fingerprint, so a stale cached AI answer cannot silently overwrite a corrected current Item Specific.
- Cache namespace/schema advanced to V8.19.3; old evidence-policy results are ignored.
- Final Save no longer treats a transient Saved label as sufficient. It waits for a bounded 1.8s stable Item Specific value window and flags unrequested field changes before Queue may continue.
- Repair photo selection remains bounded and may use up to five high-resolution evidence photos; primary Balanced/Quality coverage remains up to ten.
- Added generic regression tests for measurement evidence, negative binary evidence, strict-verifier conflicts, cache invalidation, and final-state stability. Tests are behavior-based rather than tied to a specific brand/listing.
- Shared Fill Engine, exact option matching, Text mode, Queue navigation, UPC/MPN exclusion, and protected listing fields remain unchanged except version labels.

# V8.19.2 — Evidence Accuracy

- Rechecks every safe Item Specific in Photo/Queue, including already-filled fields, so a stale/wrong eBay value cannot be silently trusted; matching verified values remain idempotent/already-set in the shared Fill Engine.
- Fast Fill no longer exposes `CURRENT` eBay field values to GPT, preventing self-anchoring on a wrong Brand/Size/etc.; Review may still see CURRENT for comparison. Seller-context support is accepted only when the selected value is actually present in seller title/note context.
- Requires physical size-tag evidence for US/UK/EU/AU Shoe Size and scopes component material evidence so Body/Outer cannot prove Lining or Handle/Strap.
- Unified automatic evidence policy: hidden technical properties (Fabric Weight, Performance/Activity, Cushioning Level, Midsole Type, Pronation and similar) are evidence-only; Fit/Occasion/Theme/Season may safely remain blank.
- Allows ordinary safe free-form Item Specific text fields while keeping California Prop 65 Warning and Personalization Instructions blocked.
- Raises Balanced/Quality photo coverage to 10 photos, keeps Cheap at 4, spreads generic gallery selection across the sequence, and upgrades legacy eBay `$_1/$_2/...` thumbnails to `$_12` for label readability.
- OpenAI/Claude/OCR request builders now prefer the canonical high-resolution eBay image URL.
- Adds at most one bounded GPT repair for important missing Brand/Size/shoe-size/Material/Country/Garment Care evidence; it never re-runs the whole listing.
- Invalidates old Fast Fill caches after the evidence-policy change.
- Fixes the false `GPT finished: 0 candidate answer(s)` message by distinguishing intermediate request completion from final analysis completion.
- Keeps the shared Fill Engine, Text parser route, Queue draft navigation, autosave flow and protected listing fields unchanged in behavior.

# V8.19.1 — Single Control Panel Route

- Removed the Chrome `default_popup` path that created a second UI viewport with its own sizing behavior.
- Clicking the extension toolbar icon now calls the same `open-control-window` route as `Ctrl+Shift+O`.
- `popup.html` is iframe-only and fills 100% of the outer in-page Control Panel.
- Auto / Compact / Medium / Large / Custom now all control the one real panel visible on eBay.
- Fill, AI, Queue, Review, Item Specifics and protected listing fields were not changed.

# V8.19.0 — Adaptive Control Panel Size

- Added viewport-aware Auto sizing for the in-page Control Panel: larger eBay windows get a larger panel, smaller windows cap it safely inside the visible page.
- Added Settings → Work Settings → Control Panel Size with Auto, Compact (340×520), Medium (420×640), Large (500×760), and Custom (320–700 × 420–900).
- Custom/preset sizes are always capped to the current page viewport and recalculate immediately when the browser window changes size.
- Panel size changes persist in Chrome storage and the existing local Application Support setup profile; no secrets are involved.
- Added windowed popup viewport fill so an extension page opened in its own Chrome window no longer leaves a narrow 340px UI with a large blank area on the right.
- Added regression coverage for Auto growth, small-window caps, custom sizes, persistent profile storage, CSP, and protected behavior.
- AI, Fill Engine, Queue processing, Item Specifics, Yes/No, UPC/MPN protection and publishing protections were not changed.

# V8.18.0 — Native Messaging + Keychain

- Replaced Extension pairing/bootstrap transport with Chrome Native Messaging.
- Removed localhost host permission from the Extension and added `nativeMessaging`.
- START installs a user-level Chrome Native Messaging host restricted to the fixed Extension ID.
- Extension no longer receives or stores a pairing secret.
- Internal native-host → Backend credential moved to the macOS data-protection Keychain with device-only After First Unlock accessibility.
- Existing legacy pairing file is migrated once and deleted.
- Added strict native-host route/origin allowlists, message bounds and timeout handling.
- Existing Application Support settings and GPT/Claude/eBay Keychain secrets are reused without re-entry.
- Fill, AI policy, Yes/No, multi-select, Queue and protected-field behavior were not intentionally changed.

# Changelog

## V8.23.9 — UI Container Structure

- Reorganized `Extension/ui/` into one-responsibility visual containers: popup, progress, photo selection, queue panel, assistant panel, status, settings and notifications.
- Moved the mixed historical Helper runtime out of `ui/` to `platforms/ebay_helper.js`; normal automatic Fill remains owned by the single shared `core/fill.js` writer.
- Extracted toast notifications, Queue progress rendering and Assistant panel styles from the mixed Helper runtime into dedicated UI containers.
- Popup status, theme, photo-source counter and photo-checklist rendering now delegate to their dedicated UI containers.
- Updated Manifest, in-page Control Panel iframe path and on-demand Helper/Queue injection paths to the new structure.
- Added static and Chromium DOM coverage for UI container ownership and rendering.
- No AI reasoning, OCR policy, Fill matching, Queue processing, protected-field policy, photo-transfer behavior or publishing boundary was intentionally changed.

## V8.23.8 — Smart Local OCR Verification

- Normal Photo/Autopilot/Queue now starts bounded local macOS Vision OCR in parallel with the primary GPT analysis when local OCR is available.
- OCR is verification-only in normal Fill: it may confirm an existing GPT answer only for direct label facts (Brand, Size, Material, Country of Origin/Manufacture, Garment Care, Model and Product Line).
- High-confidence confirmation requires the existing deterministic evidence validator, conservative confidence/consensus thresholds, direct physical-label support from GPT, and the same cited photo; Color, Style, Vintage and other visual/ambiguous fields are excluded.
- OCR never creates a missing answer and never overwrites GPT. Strong conflicts are preserved and sent to the normal independent GPT strict-verification pass; weak OCR changes nothing.
- Strict fields independently confirmed by OCR are removed from the paid second GPT request, reducing repeat image/token cost without weakening the remaining verification policy.
- The V8.23.7 per-request cost ledger remains unchanged and continues to account for Primary, Strict Verification, retries, tests and Claude without double counting item summaries.
- Added regression coverage for the OCR allowlist, high-confidence confirmation, conflict handling, low-confidence rejection and the no-invention rule.
- Fill Engine, Queue transitions, Show More, Photo Transfer, protected fields and manual publishing behavior are unchanged.

## V8.17.1
- PATCH over V8.17.0. Existing `.setup-complete`, Application Support settings and macOS Keychain secrets are reused; this update does not ask for GPT/Claude/eBay secrets again.
- Fixed START → Extension pairing: the background service worker now imports `hub-bootstrap.json` automatically when Chrome storage has no pairing value, then stores the pairing locally for later requests.
- Removed the manual pairing-code field, old Hub text, clipboard pairing path and `Save Both APIs Securely` controls from the normal Settings UI.
- Settings now shows simple Local Connections status; pairing stays internal and is never displayed to the user.
- Added regression coverage that executes the exact production pairing importer with empty storage, confirms one bootstrap read, confirms storage persistence, and confirms the second request does not re-read the bootstrap.
- AI analysis, Fill Engine, Yes/No, multi-select, Queue, Control Panel and protected-field behavior are functionally unchanged from V8.17.0.

## V8.16.0
- Removed `Beta` from the current version label.
- Consolidated production Extension structure into seven core files, four mode files, six UI files and four shared files; removed production `blocks/`, `flow/`, `runtime/` and nested core generations.
- Control Panel no longer opens a separate Chrome window. It is an in-page eBay overlay that uses the same responsive 340px/viewport sizing model as AI Queue.
- Removed the obsolete standalone window mode and the MV3 CSP-invalid inline bootstrap path.
- `START.command` is now the main first-run/start entry point. It installs Setup.app and automatically opens it only while `.setup-complete` is absent.
- First setup stores non-secret settings in Application Support and supplied GPT/Claude/eBay secrets only in macOS Keychain. Later START runs reuse them without asking for keys again.
- Setup.app creates its GUI before any Python/Backend/Keychain check; Backend checks are bounded so the app cannot look permanently stuck before showing a window.
- Preserved the proven single Fill Engine, exact Yes/No, multi-select, stale-DOM safety, Queue state persistence and protected-field policy.
- Added regression coverage for the simple tree, one router/writer, in-page Control Panel sizing, CSP, first-run START behavior, Setup persistence, DOM Fill and Keychain boundary.

## Historical releases
V8.15.0 Beta 100 — Native Setup + Compact Control Window
- Replaced the KEY=VALUE Setup dialog with a native field-based macOS Setup.app.
- Added separate GPT/Claude/eBay fields, secure secret controls, saved-status loading, Save Everything and Check Backend.
- Added a safe --setup-status-json Backend maintenance route that never prints secret values.
- Blank secret inputs preserve existing Keychain values; supplied secrets still flow to Backend only through stdin.
- Control Window reduced to 340–360 px wide and 500–580 px high; normal toolbar popup reduced to 340 px.
- Added regression tests for the native Setup structure, Keychain-only persistence and compact Chromium layout.
- AI, Fill, Queue processing, Yes/No and protected listing behavior are unchanged in logic.

V8.14.0 Beta 98 — Mac Setup App + Responsive UI
- Added a dedicated local eBay AI Agent Setup.app for one-time new-Mac setup.
- Setup.app writes non-secret Agent settings to Application Support and sends GPT/Claude/eBay secrets directly to the Backend CLI via stdin for Keychain storage; secrets are never written to setup files.
- Hub installs Setup.app into ~/Applications and opens it once for this setup generation.
- Control Window is responsive to the source Chrome window instead of fixed 520x860.
- Browser popup width reduced and standalone layout now fills its window without the large blank right side.
- AI Queue panel reduced to 340px with height-responsive compaction for laptop screens.
- AI/Fill/Queue/Yes-No/Item Specifics behavior is otherwise unchanged from Beta 97.

V8.13.1 Beta 97 — New Mac Setup & Keychain Status
- Hub detects usable Python 3.9+ on Apple Silicon/Homebrew and avoids repeatedly invoking the unready /usr/bin developer-tools stub.
- Backend compile failures show the real Python diagnostic instead of always reporting a syntax error.
- Settings now has a visible Save GPT Settings & Key button and separate Settings / Backend / GPT Key status indicators.
- A missing GPT key on a new Mac no longer disables the GPT API configuration automatically.
- Test GPT API now tests the exact settings returned by the save step.
- Cross-Mac messaging is explicit: non-secret profile settings can be imported, while Keychain secrets are entered once per Mac and are never included in ZIP/profile exports.

V8.13.0 Beta 96 — Single Runtime Stability

- Replaced the competing lightweight/full page message owners with one `Extension/content.js` router. Queue and Helper are delegated modules and do not register Chrome page message listeners.
- Moved the old full Helper runtime to `ui/helper/helper_runtime.js`; it loads on demand and cannot override the common Fill writer.
- Rebuilt automatic Fill All around one core writer, one verification pass plus one missing-value retry, and one page-level operation lock. Removed legacy A58 from the automatic fallback route.
- Fixed stale React/eBay field safety: no rowIndex fallback, detached fields are invalidated, exact labels are required, and closed-dropdown current values exclude hidden menu options.
- Strengthened required-marker, Show more, photo/field stability and Yes/No clear behavior.
- Removed semantic matcher substitutions such as Loose→Relaxed and Work→Workwear from the automatic resolver. Known complete-option mismatches no longer open dropdowns unnecessarily.
- Added Fast Fill schema V3: ordinary visual fields remain compact/high-coverage, while strict fields include compact support metadata that is validated before Fill. Obsolete V2 strict answers cannot bypass the current policy.
- Centralized runtime defaults/messages and migrated Autopilot in-progress state to storage-backed MV3 state with worker-session recovery.
- Added real Chromium DOM integration tests plus regression tests for the single router, operation lock, exact matcher, strict policy, Clear All, stale rows and service-worker state.
- Protected listing fields and Publish/List/Delete/Pay remain untouched.

V8.12.2 Beta 94 — High Coverage + Clear Reliability
- Restored best-probable Fill for ordinary Yes/No and visual fields; strict evidence-only policy is now narrow.
- Brand/Size/Model/Product Line may use readable product evidence or explicit seller draft/title context, never appearance-only guessing.
- Free-form text, UPC/MPN, Prop 65 text, and Personalization Instructions remain untouched automatically.
- Fixed closed eBay dropdown value reading used by snapshot/preservation and Clear All.
- Clear All now opens single dropdowns once to use eBay row-local Clear/Reset when needed.
- Removed duplicate legacy Escape listener; lightweight bridge owns X/F/Esc.
- Stale extension contexts no longer throw an uncaught hotkey error; the page asks for one refresh after extension reload.

V8.12.1 Beta 93 — Mac Hotkey Layout Fix
- Fixed page-local Control+Shift+X and Control+Shift+F on Mac when a non-Latin keyboard layout is active.
- Local hotkeys now use KeyboardEvent.code (KeyX/KeyF) with event.key only as a fallback.
- Local hotkey requests keep the sender eBay tab instead of re-discovering a possibly different active tab.
- No Fill, AI, field-policy, protected-field, or publishing behavior was changed.

V8.11.0 Beta 91 — Balanced Field Policy
- Added one central automatic Item Specific policy for Photo, Autopilot and Queue.
- Automatic modes never write free-form text Item Specifics; Text/import remains an explicit user-controlled route.
- UPC and MPN remain always skipped. California Prop 65 Warning and Personalization Instructions are blocked from automatic Fill.
- Optional Unit Quantity and Unit Type are skipped unless eBay marks them required.
- Brand, Size, Material-family facts, Garment Care, Country of Origin, Model, Product Line, Vintage, Handmade, Personalize, Customized, year/authenticity/certification and Character fields are evidence-only.
- Evidence-only fields may return blank when photos do not directly support the fact; absence of evidence never becomes a guessed No.
- Ordinary visual fields such as Type, Color, Style, Theme, Occasion, Season, Features, Accents, Fit, Fabric Weight, Performance/Activity, Sleeve and Pattern remain best-probable high-coverage answers.
- Character/Character Family may use an unmistakable visible character or franchise graphic as direct product evidence.
- Match eBay rechecks the policy before automatic Fill so leaked blocked AI answers cannot be written.
- Evidence-only blanks are tracked as intentional untouched fields, not false Fill errors; Review explicitly bypasses the automatic filter and can inspect all non-excluded fields.
- Beta 90 stable snapshot, AI cache, exact Yes/No, fast multi-select, Queue lease/resume and protected-field behavior are preserved.

V8.10.0 Beta 90 — Fast Stable Pipeline + Yes/No
- Added a lightweight automatic eBay page bridge; the large legacy content runtime now loads only on demand for Helper/manual compatibility.
- Default eBay content-script payload reduced from 31 files / 948,664 bytes to 17 files / about 157 KB.
- Replaced repeated 350 ms full-draft reads with one stable Item Specific/photo readiness phase and one final snapshot.
- Added Show more handling, field-signature cache invalidation and stable photo-set detection before GPT starts.
- Added a normal-mode question planner: already-filled single/text/Yes-No fields are preserved and omitted from GPT; multi-select fields remain eligible for additions.
- Added exact shared GPT-result cache for unchanged draft/photo/question/model/prompt inputs and a learned token-parameter compatibility cache.
- Missing provider usage telemetry no longer rejects an otherwise confirmed valid AI response.
- Added native shared Fill support for Yes/No fields with row-local detection, exact Yes/No selection and state verification.
- Moved multi-select hot path to the shared core engine: one menu open per pass, existing values preserved, one retry of missing values; legacy A58 remains pass-2 fallback only.
- Added safe Material canonicalization against actual eBay options (for example 99% Polyester -> Polyester).
- Added persistent Queue processing lease and fresh-service-worker resume, plus per-stage timing persistence.
- Centralized UPC/MPN skip policy and removed dead popup mapping shims from the production popup.
- Added one current Beta 90 release test gate with dynamic Yes/No/multi/material tests; older/stale tests are archived.
- Protected listing fields and List/Publish/Delete/Pay actions remain untouched.

V8.9.0 Beta 89 - Shared Block Pipeline
- Reorganized per-item work into 00-08 shared blocks plus ONE_ITEM_PROCESS.
- Manual, Autopilot and Queue now reuse the same photo/field/AI/match/fill/save containers.
- Queue uses one dedicated processing tab and runs the same ONE_ITEM_PROCESS as Autopilot for each draft.
- Normal Fast Fill uses one GPT request and best-answer coverage; OCR/Claude/confidence/evidence verification is isolated to Review Mode.
- Removed old automatic question exclusions except central UPC/MPN; Fabric Weight and Unit fields are eligible Item Specifics.
- Unified current and compatibility Fill routes on shared_auto so Queue/Autopilot do not use a weaker writer path.
- Added real browser-side AI abort/deadline propagation and shared Fill stop on timeout/Safe Stop.
- Increased draft photo snapshot to 25 and smart GPT selection to 4/5/7 photos by mode.
- Added HOW_IT_WORKS block map and numbered runtime status stages.

V8.8.3 Beta 88 — Safe Stop Synthetic Escape Fix
- Fixed the reproduced Fill All failure from the August 7 screen recording.
- Internal synthetic Escape events used to close eBay dropdowns no longer trigger Safe Stop.
- Safe Stop now accepts only a real trusted user Escape key press while an extension action is active.
- Existing Fill All, shared Fill Engine, Photo, Queue, Text, Item Specifics and protected-field logic were not rewritten.
- No List/Publish/Delete/Pay action or protected listing-field write was added.

V8.8.2 Beta 87 — Hotkey Autopilot Fill Route Fix
- Fixed the reproduced Autopilot failure where GPT/Claude analysis finished but the Fill stage did not start.
- Removed the second independent AI-to-Fill orchestration from the hotkey execution path.
- Control+Shift+A runs the current draft through the proven one-item Queue execution route and the shared Fill Engine.
- The temporary Autopilot runner restores the user's previous saved Queue runner state after completion.
- Autopilot progress keeps the Autopilot label while using Queue execution.
- Fill Engine, Text, Photo, Queue modules, Item Specifics, Yes/No, protected fields and publish protections were not rewritten.

V8.8.1 Beta 86 — macOS Hotkey Manifest Fix
- Fixed Chrome load failure caused by invalid macOS Command+Option extension command combinations.
- macOS defaults are now Control+Shift+A (Autopilot), Control+Shift+Q (Queue Start/Stop), Control+Shift+R (Review), and Control+Shift+O (Control Window).
- Kept the Autopilot/Queue/Review/control-window routing unchanged.
- Fill Engine, Photo, Text, Queue execution, OCR/AI analysis, Review storage, protected fields, and publish protections were not changed.

V8.8.0 Beta 85 — Hotkey Autopilot / Persistent Setup
- Added runtime hub-bootstrap.json pairing so the Extension no longer depends on manual paste or clipboard timing.
- Added agent-setup-profile.json for persistent non-secret AI, Claude, mode, limits and UI settings.
- Added paired local setup status/save routes and automatic Extension synchronization.
- Automatically applies the OpenAI preset and enables GPT when a saved Keychain key exists and old settings are blank/off placeholders.
- Automatically restores Claude targeted review when a saved Claude key exists during first profile migration.
- Reuses the existing eBay profile, OAuth refresh token and Review Folder without reconnecting after updates.
- API keys and OAuth secrets remain only in macOS Keychain; no secret is included in the setup profile, bootstrap file or ZIP.
- Fill Engine and protected listing behavior are unchanged.

V8.7.2 Beta 83 — Keychain Startup Fix
- Fixed the frozen macOS Keychain window caused by launchd backend startup and a second pairing-code Python process requesting access at the same time.
- Localhost pairing is now stored in a mode-0600 Application Support file and is prepared before launchd starts; API keys and OAuth credentials remain in macOS Keychain.
- Automatic launchd startup defers eBay Keychain reads until an explicit eBay action.
- Install/Update stops stale installed backend Python processes, starts one service instance, and verifies port 8790 instead of immediately restarting the new service.
- Added “Authorize Saved API Keys” to pause the service and verify eBay/OpenAI/Claude Keychain entries sequentially without printing their values.
- START.command received the same serialized startup behavior as a fallback.
- Fill, Photo, Queue, Review, OCR analysis, Resolver and Item Specifics execution logic were not changed.

V8.7.0 Beta 81
- Added Smart Tag OCR preprocessing for at most two weak evidence photos: Fast OCR now retries low-confidence, tiny or incomplete label text, not only completely empty photos.
- Fast OCR bounding boxes create a bounded focus region. The backend uses macOS sips to crop and enlarge that region; without a usable region it may enlarge the full likely-label photo.
- Accurate OCR now merges two recognition passes instead of accepting the first non-empty result, including multilingual label recognition for common English, French, Spanish, German, Italian and Portuguese text.
- Merges original and preprocessed OCR blocks, keeps the strongest confidence, and maps focused-crop coordinates back to the original photo.
- Review records preserve OCR text, photo number, confidence and normalized evidence region; Current Item Review shows the readable OCR excerpt for confirmed tag fields.
- Per-item cost warnings now ignore negligible overages below both the practical $0.005 floor and the 5% tolerance; daily and monthly hard budgets are unchanged.
- Added focused OCR/preprocessing diagnostics while retaining smart photo caps, 31/31 Review coverage and the protected shared Fill Engine.
- Invalidated earlier AI/OCR cache entries with the Beta 80 namespace and OCR helper version.

V8.6.4 Beta 78
- Added a universal OCR label-fact parser that works from generic label prefixes, photo-role/layout hints and field patterns rather than hardcoded brand names.
- Recovers arbitrary readable Brand values when the field accepts custom text, plus Size, Material, Garment Care and explicit Country of Origin facts.
- Added tolerant OCR normalization for common label errors and multilingual material/origin wording while keeping ambiguous results in Review.
- Explicit tag contradictions block automatic Fill; absent/unreadable OCR text does not erase GPT/Claude answers.
- Added field-level OCR fact diagnostics, including linked label-fact count.
- Added Henley Style guidance and removed generic Workwear/Summer/Relaxed guesses for ordinary tops without stronger evidence.
- Replaced the misleading maximum-cost label with a conservative primary-plus-Claude budget using a 1.75 safety factor.
- Kept 31/31 Review coverage and the protected shared Fill Engine unchanged.

V8.6.3 Beta 77
- Reworked the macOS Vision OCR helper to read files through URL/Data handlers, use robust Vision result conversion, retry once with broader text settings, and return per-photo diagnostics.
- Treated a zero-text OCR run as unhealthy instead of falsely reporting a successful evidence check; GPT/Claude candidates were preserved when OCR produced no text.
- Added OCR text-block count, photos containing text, helper warnings and zero-text failures to analysis status.
- Kept 31/31 Review coverage and the protected shared Fill Engine unchanged.

V8.6.2 Beta 76
- Recovers readable Size, Material, Garment Care and Country of Origin facts directly from local OCR when GPT/Claude omitted them.
- Corrects a final AI country conflict only when one unambiguous physical-tag country is readable, for example China -> Indonesia.
- Blocks OCR-unconfirmed high-risk tag values from automatic Fill while preserving them in Review.
- Adds visible 31/31 processing, OCR and Claude recovery diagnostics.
- Invalidates earlier AI cache entries so Beta 75 results are not reused after the validator update.
- Keeps the shared Fill Engine and protected eBay modules unchanged.

V8.6.1 Beta 75
- OCR not-found became a soft Review warning and no longer deleted an otherwise usable GPT/Claude candidate.
- Explicit OCR conflicts continued to block Fill.
- Complete Coverage preserved usable candidates while Review recorded OCR uncertainty.

V8.6.0 Beta 74
- Added local on-device macOS Vision OCR for readable text on product labels and tags.
- Added deterministic Evidence Validator: matching text confirms, contradiction blocks Fill, and missing required tag text remains Review.
- Added targeted Claude routing after OCR validation so only weak/conflicting fields are rechecked.
- Added a universal field-aware Resolver for all Item Specifics, including exact aliases, multi-select values and composite Size groups.
- Added OCR/Resolver details to Review records and preserved complete Review coverage for every selected field.
- Added protocol 6.9.0 OCR status/analyze routes with paired localhost security, eBay-host/data-URL validation, bounded temporary files and safe fallback.
- Added unit, pipeline, backend, package, protected-hash and safety tests.
- Kept the shared Fill Engine and protected eBay modules byte-identical to the Beta 73 source package.

V8.5.1 Beta 73
- Complete Coverage is now the default fill policy.
- Every valid candidate returned for the selected Item Specifics is sent to Fill.
- Weak/conflicting answers remain flagged in Review.
- Added Large/Medium/Small word-to-eBay-size normalization.

V8.5.0 Beta 72

- Added one primary OpenAI analysis followed by at most one optional targeted Claude Sonnet 5 review.
- Reused the existing recovery slot; Claude receives only weak fields and at most three relevant photos.
- Added Review JSON schema V3 with separate AI/review schema versions, file revisions and V2 backup migration.
- Added stable field IDs from marketplace/category/DOM key and stable photo IDs from canonical image URLs.
- Added raw value, evidence scope, model status, validation issues and per-model results.
- Added field-specific confidence/evidence policies and strict high-risk fields in Safe and Review Assisted modes.
- Added supported_by_two_models and conflict resolution without treating model agreement as proof.
- Added Claude Keychain routes and a fixed Anthropic Messages proxy; keys never enter Chrome storage or Review files.
- Updated Review Assistant to display OpenAI, Claude, final status, evidence and correction history.
- Added V3 contract generation/synchronization tests, identifier stability tests, Resolver tests, Claude fallback tests and backend migration/security tests.
- Kept Fill Engine, UPC/MPN exclusion and protected-field modules byte-identical to Beta 71.

V8.4.3 Beta 70

- Added temporary Photo Roles for overview, brand/size labels, material/care labels, measurements and detail images.
- Protected important label/measurement photos from low-detail processing.
- Added a per-analysis runtime photo-role map and role-aware recovery photo selection.
- Preserved the Beta 69 photo-selection fallback when role metadata is unavailable.

V8.4.2 Beta 69

- Replaced the duplicated facts/answers/review schema with one compact per-question results array.
- Every requested Item Specific receives confirmed or needs_review status.
- Only confirmed direct-evidence values reach Fill Engine; review proposals stay in the listing JSON file.
- Added extraction of parsed structured output plus explicit incomplete, max-token and refusal diagnostics.
- Increased bounded output headroom for large field sets while keeping compact output and low reasoning in Balanced mode.
- Light theme is now the default; saved user theme choices remain respected.
- Keeps one JSON Review file per listing and all protected eBay fields unchanged.

V8.2.1 Beta 65

- Added conservative standard suggestions for low-risk fields such as Department, Size Type, Season, Occasion, Theme, lightweight Features/Fabric Weight, and evidence-supported Fit.
- Standard suggestions require exact current eBay options and never create custom values.
- Repair is limited to critical label fields and uses at most three selected detail/tag photos.
- Balanced mode now uses low reasoning, up to eight photos, and a 3200-token ceiling; Quality keeps medium reasoning.
- Added stricter Scoop Neck/V-Neck and Puff Sleeve validation.
- Cost estimates and recorded OpenAI costs use current model-specific rates for GPT-5.6 Terra, Sol and Luna.
- Fill Engine, Text, Helper, Yes/No and protected listing fields were not functionally changed.

V8.2.0 Beta 64
- Adds evidence-first two-stage reasoning inside each GPT response: atomic photo facts first, exact eBay answers second.
- Adds field-specific definitions and evidence policies for Brand, Size, Material, Fabric Type, Sleeve Length, Sleeve Type, Neckline, Features and other Item Specifics.
- Requires fact_ids, numbered PHOTO sources and field-specific confidence/evidence checks for official OpenAI automatic answers.
- Adds deterministic normalizers for combined sizes, material percentages, country labels and Multicolor.
- Rejects cross-field mistakes such as Sleeve Type copied from Sleeve Length and Fabric Type copied from Material.
- Adds one targeted repair request for rejected or missing fields only; accepted answers are preserved.
- Diversifies the 10-photo request across overview, label, measurement and detail roles when photo metadata permits.
- Adds actionable missing-photo requests for Brand/Size, Material/Country, Garment Care, measurements, Sleeve Type and Neckline.
- Raises the bounded output ceiling to 6000 for Balanced/Quality and 1600 for Cheap.
- Uses high reasoning for Quality primary analysis and targeted repair; Balanced remains medium and Cheap remains low.
- Adds current category context to Photo/Queue analysis.
- Keeps the shared Fill Engine logic and protected listing fields unchanged.

V8.1.16 Beta 63
- Fixed Test GPT API 400 error caused by JSON mode with a non-JSON test instruction.
- Respected the exact saved endpoint; Chat Completions was no longer silently switched to Responses.
- Added strict source-grounded JSON for official OpenAI Item Specific analysis.
- Labeled request images PHOTO 1..N and required direct photo evidence for automatic answers.
- Standardized Material to exact eBay options and blocked automatic custom taxonomy values.

V8.1.15 Beta 62
- Helper opens only for exact Item Specific rows returned by collectFieldMap().
- Photo editor, photo buttons, title and other non-Item-Specific controls are ignored.
- Back/Next stays inside the same exact Item Specific route.

V8.1.14 Beta 61
- Resolves combined kids Size labels such as XXL (18) to exact eBay options.
- Priority: exact numeric size, containing numeric range, then alpha equivalent.
- Restricts this fallback to Size only.

V8.1.13 Beta 60
- Resolves multiple AI values safely for one-value eBay fields.
- Multiple colors use Multicolor only when that exact option exists.
- Other one-value fields use the first exact allowed AI value; otherwise Review.

V8.1.12 Beta 59
- Treats 10 photos as a maximum request cap, not a required gallery count.
- Keeps all unique photos found when the eBay counter is unavailable.
- Preserves compact Item Specific field types/options for Photo AI.
- Keeps the shared two-pass Fill Engine and protected-field safety unchanged.

V8.7.0 Beta 81 — Agent Hub
- Added a standalone macOS eBay AI Agent Hub.app.
- Added one-click backend/OCR install or update.
- Added a stable Extension folder under macOS Application Support.
- Added automatic backend startup through LaunchAgent.
- Added status, pairing-code, restart, extension-folder and log controls.
- Existing API secrets remain in Keychain; no secrets are exported.
- Fill, Photo, Queue, Review and Item Specifics logic were not changed.

V8.12.0 Beta 92 — Complete Mac Hotkeys
- Added local ⌃⇧X Clear All Item Specifics with verified per-field clearing; UPC/MPN stay untouched.
- Added local ⌃⇧F Fill All from already prepared answers with zero new AI requests.
- Esc Safe Stop now works in the lightweight automatic runtime as well as the full legacy Helper runtime.
- Existing ⌃⇧A/Q/R/O commands preserved.
