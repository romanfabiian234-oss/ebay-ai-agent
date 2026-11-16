# V8.23.0 Full Stability Audit

## Scope

Full static/regression audit of the V8.22.2 production tree before building V8.23.0:

- Extension manifest, service worker and message routers.
- Shared Fill Engine, snapshot, policy, AI, verification and save modules.
- Photo, Queue, Text and Review modes.
- eBay, Depop and Poshmark platform adapters.
- eBay gallery collector and selected-photo tracking.
- eBay -> Depop/Poshmark photo-transfer path from drag source to destination verification.
- Control/Helper/Queue UI for regressions and long-lived observers/timers.
- Backend, Native Messaging, Keychain boundary, START/setup path and OCR helper.
- Unit, regression, Chromium integration and release/security tests.

Production source scanned: 30 JS/Python source files, about 34.9k lines. The very large legacy Helper was audited statically/regression-tested, but was not broadly refactored because it is a protected working subsystem and it was not the root cause of the photo-transfer failures.

## Critical root causes found and fixed

### 1. Poshmark Covershot commit was missing from the success definition

V8.22.2 could see temporary/pre-commit preview images and continue while Poshmark still had the `Select a Covershot` modal open. The next upload operation could collide with that modal, producing live failures such as 4/6 or 0/3 confirmed photos.

V8.23.0:

- detects only the visible semantic Covershot modal;
- clicks only the exact enabled `Apply` button;
- keeps the guard alive long enough for a delayed first-upload Covershot modal;
- excludes modal/crop-preview images from listing-photo verification;
- verifies the actual listing photo grid after the modal settles.

### 2. Four-file batches created a Poshmark race

V8.22.2 uploaded in batches of four. A six-photo transfer could therefore do `4 -> Covershot modal -> 2`, while the first batch had not actually committed.

Removed `UPLOAD_BATCH_SIZE` and `uploadFilesInBatches`. A normal transfer now assigns all currently transferable files to the real multiple-file input once.

### 3. Synthetic internal DragEvents were redundant and unstable

The old destination path tried synthetic `dragenter/dragover/drop` and then a file-input fallback. Both Depop and Poshmark already expose real `multiple` file inputs, so the synthetic path added a second state machine without adding a reliable source of truth.

Removed:

- `dispatchDropFiles`;
- `uploadMethodsFor`;
- drop-zone/input fallback chaining.

The physical user drag is still used between windows, but after the destination receives it the platform upload uses the real file input only.

### 4. Two destination drop owners could compete

The document-start receiver and the late transfer module both owned destination drag/drop events. V8.23.0 keeps one owner only: `photo_drop_early.js`. The late module only displays UI and consumes the captured session.

Static invariant after patch:

- early destination drop listener: 1;
- late destination drop listener: 0;
- early destination dragover listener: 1;
- late destination dragover listener: 0.

### 5. Private React/Vue hydration probing was brittle

The old code inspected private runtime properties such as React/Vue internals. Those are implementation details and can change independently of the visible uploader.

Removed `hasFrameworkAttachment`. Readiness now waits for the actual connected/usable marketplace file input; actual success is decided only by real photo-grid verification. A zero-progress failure receives one bounded retry.

### 6. Upload verification watched too much DOM

Old upload observers could watch the whole document and included classes in their trigger set. That creates unnecessary work on dynamic marketplace pages.

V8.23.0 scopes photo verification to the actual Photos zone and observes only relevant child changes plus `src`/`style`. All observers/timeouts disconnect/clear when their operation completes.

### 7. Duplicate URL de-duplication could undercount real photo slots

Two intentionally identical photos are two listing slots even if their image URL is the same. Verification now counts actual photo DOM nodes, not a Set of unique URLs.

### 8. Cross-listing duplicate signature could reject a legitimate new listing

Removed the `marketplaceAiLastPhotoTransfer`/signature gate. Transfer identity and bounded per-transfer progress are now the source of truth.

### 9. eBay selected-photo regex contained literal control bytes

Two ASCII backspace bytes were present where regex word boundaries were intended. This could make selection-root detection unpredictable.

Fixed to a real `/\b\d{1,2}\s+selected\b/i` expression. A full text-source scan now finds zero unexpected control characters.

## Reliability policy after patch

- One physical user drag.
- One early destination drop owner.
- One transfer session.
- Concurrent bounded preparation of selected eBay files while preserving source order.
- One native multiple-file input change per normal destination transfer.
- Depop: verify actual Photos grid.
- Poshmark: verify Covershot commit, then actual listing Photos grid.
- One automatic retry only if zero photos were visibly accepted.
- Partial progress is never automatically re-sent because that could create duplicates.
- Partial verified progress remains resumable on the next user drop.
- Success is never shown from a click/event alone; it requires DOM read-back.

## Full-extension audit findings

### Confirmed healthy / preserved

- One shared Fill Engine remains the automatic writer.
- One content message router and one background message router remain.
- eBay protected fields and UPC/MPN policy remain regression-covered.
- Queue, Text, Review, Yes/No and exact dropdown/multi-select behavior pass their existing tests.
- Native Messaging and Keychain secret boundary pass release checks.
- No Downloads permission was introduced.
- No new Publish/List/Pay/Delete/active-listing action path was added.
- Manifest paths/imports pass the release gate.
- 27 production JavaScript syntax checks pass.
- Python/shell/setup/native-host checks pass.

### Technical debt found but intentionally not removed in this release

`Extension/platforms/ebay_helper.js` is still very large and contains historical compatibility helpers, best-effort catches and preview-only timer/observer code. Static heuristics also find functions that appear unused inside that file. They are not on the failing photo-transfer path, and Helper is a protected working subsystem. Removing dozens of legacy Helper functions together with this transfer repair would create much more regression risk than runtime benefit.

The same principle was applied to a few low-confidence dead-function candidates in Popup/Background: if a function is not executing on the failing path and its removal cannot be proven behavior-neutral, it remains for a separate cleanup release.

The runtime-interfering redundant photo functions *were* removed because their competing behavior was directly tied to the failure.

## Production diff containment

Compared with V8.22.2, protected production modules such as Fill, AI, Queue, Text, Review, Helper, Popup, Backend and service-worker logic changed only in release/version labels. Substantive production logic changes are limited to:

- `Extension/platforms/photo_transfer.js`
- `Extension/platforms/ebay_photos.js`

Documentation and photo-transfer/release tests were updated accordingly.

## Verification

All non-browser unit/regression checks pass as a group (21 checks).

Critical browser/release checks pass as a separate clean group:

- Chromium photo-transfer integration;
- Chromium real DOM Fill integration;
- release/security gate.

The photo integration explicitly reproduces a delayed Poshmark Covershot modal whose Apply button is initially disabled, plus the eBay delayed-selection UI race.

The container can intermittently stall when two Playwright suites are chained behind the entire long test sequence in a single parent process; running the same browser/release checks in a clean group succeeds. This is a test-environment process-lifecycle issue, not a failed extension assertion. The packaged release is based on the individually passing release-critical checks listed above.
