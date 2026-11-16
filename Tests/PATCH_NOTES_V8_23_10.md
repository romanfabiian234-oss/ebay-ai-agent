# PATCH NOTES — V8.23.10

## Problem

V8.23.9 created UI folders but several containers still owned non-visual work: Storage/browser APIs, Queue page state, diagnostics, connection workflows, application state, marketplace photo workflows, and duplicate/legacy visual renderers. Folder structure alone did not satisfy the project container rule.

## Root cause

Responsibilities were moved by filename before ownership boundaries were fully enforced. Large legacy files still mixed rendering with page/workflow/persistence behavior.

## Fix

- Enforced one visual responsibility per UI container through a stable `EbayUI` registry.
- Moved application state to `shared/app_state.js` and persistence/services to shared containers.
- Moved workflows/controllers to `modes/`.
- Split Queue into `ui/queue-panel`, `modes/queue_page`, and `platforms/ebay_queue_dom`.
- Made Progress, Control Panel, Assistant/Review/Fill helper surfaces and Photo Transfer overlays single-owner UI functions.
- Moved legacy Fill Preview markup/styles/events into `ui/assistant-panel`; platform code supplies only plan/state/callbacks.
- Removed direct `chrome.*`, Storage, local/session persistence and network APIs from UI.
- Added strict ownership tests so these boundaries cannot silently regress.

## Intentionally unchanged

AI/OCR reasoning policy, common Fill Engine matching, protected fields, Queue per-item processing, Show More readiness, marketplace photo upload mechanics and manual publish boundary.
