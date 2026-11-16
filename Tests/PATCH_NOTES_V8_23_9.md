# PATCH NOTES — V8.23.9

## Problem 1 — UI container structure

### Root cause

The visual layer was stored as a few large files. `ui/helper.js` mixed visible Helper/Review UI with historical eBay DOM, Fill, Queue and navigation runtime. `ui/popup.js` and `ui/queue.js` also mixed multiple visual responsibilities. This made ownership unclear and contradicted the project rule that one container should have one responsibility.

### Change

`Extension/ui/` is now a container-only visual tree:

```text
ui/
├── popup/
├── progress/
├── photo-selection/
├── queue-panel/
├── assistant-panel/
├── status/
├── settings/
└── notifications/
```

- `popup/` owns the Control Panel document/controller/styles.
- `progress/` owns Queue/operation progress rendering and timers.
- `photo-selection/` owns photo count/source/checklist rendering.
- `queue-panel/` owns the Seller Hub queue selection panel UI.
- `assistant-panel/` owns Helper/Review panel visual styles.
- `status/` owns status text/tone rendering.
- `settings/` owns visual theme application.
- `notifications/` owns transient toast notifications.

The old mixed Helper runtime was moved from `ui/helper.js` to `platforms/ebay_helper.js`. It now delegates toast notifications, Queue progress and Assistant styles to the dedicated UI containers. Its historical Fill/navigation fallbacks were intentionally not removed in this patch; dead-code/duplicate cleanup is a separate problem so UI restructuring can be tested independently.

The Control Panel iframe, Manifest paths, on-demand Helper injection and Queue panel injection were updated to the new paths.

### Unchanged behavior

- `core/fill.js` remains the single normal automatic Fill writer.
- AI reasoning, OCR verification policy and API cost accounting are unchanged.
- Queue processing logic is unchanged.
- Photo transfer behavior is unchanged.
- Protected eBay fields remain protected.
- No publish/list/delete/pay behavior was added.

### Verification

- 35 standard unit/regression/integration/release steps pass.
- New Chromium UI-container test passes for notification, progress, Assistant styles, status, theme and photo-selection rendering.
- Real Chromium Fill and Show More tests pass.
- Photo-transfer integration assertions pass; its pre-existing Playwright teardown can still keep the outer runner alive, so the assertions were also executed with forced process exit only after all assertions passed.
- Release gate passes 34 JavaScript syntax checks plus Native Messaging, Keychain, protected-field and secret scans.
