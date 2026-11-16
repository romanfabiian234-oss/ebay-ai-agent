# PATCH NOTES — V8.23.0

Type: MINOR
Name: Stable Native Photo Transfer

## Main change

Rebuilt the unstable destination half of eBay -> Depop/Poshmark mouse photo transfer around one native file-input operation and verified platform-specific commit state.

## Fixed

- Poshmark `Select a Covershot` modal is now part of the transfer completion state.
- Exact enabled `Apply` is clicked automatically and the listing grid is re-verified after the modal settles.
- Covershot guard remains active for delayed first-upload modal rendering.
- Removed 4-photo batching that caused 4/6 and 0/3 races.
- Removed synthetic destination DragEvents and fallback chain.
- Removed late duplicate destination drop/dragover ownership.
- Removed private React/Vue hydration probing.
- Scoped upload observers to the marketplace Photos area.
- Verification counts real photo slots rather than unique URLs.
- Removed cross-listing duplicate-signature gate.
- Retry only on zero visible progress; partial uploads are not automatically duplicated.
- Fixed literal control/backspace bytes in eBay selected-photo regex.
- Expanded integration regression to delayed Covershot + delayed Apply readiness.

## Preserved

- eBay native photo selection UI.
- `Drag N selected photos` workflow.
- Shared eBay gallery reader.
- Depop/Poshmark limits.
- One shared Fill Engine.
- Queue, Text, Review and Helper behavior.
- Protected eBay fields, UPC/MPN exclusions and no-publish safety.
- Keychain/Native Messaging security boundary.
