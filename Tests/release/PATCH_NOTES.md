# PATCH NOTES — V8.23.21

## Requested change

Add Vinted as a destination for the existing mouse photo transfer from eBay, matching the current Depop/Poshmark workflow.

## Confirmed implementation

- `vinted.com` / `*.vinted.com` added to the explicit extension host allowlist.
- The document-start drop receiver now accepts Vinted destinations.
- Vinted gets a separate photo-only content-script runtime; `content.js` and marketplace Smart Fill are not loaded there.
- Shared platform detection now recognizes Vinted.
- Photo transfer detects the Vinted listing image file input from listing/form context and image-upload signals, then uses the existing native file-input upload path.
- Vinted transfer capacity is capped at 20 photos per listing.
- eBay drag labels and destination overlays include Vinted.
- Existing protected fields and publish boundaries are unchanged.

## Verification added

- Regression checks for manifest scope, isolated Vinted runtime, early drop ownership, 20-photo limit, and uploader discovery.
- Chromium integration: 7 eBay photo files are prepared, assigned to the Vinted file input in one change event, rendered as 7 preview nodes, and verified.
- Existing Depop, Poshmark, eBay-selection, security, syntax, and release gates remain enabled.

## Real-browser boundary

The automated Chromium test reproduces the Vinted listing uploader contract, but this environment is not signed into a real Vinted account. A live Vinted `/items/new` test is still required to confirm the current production DOM selector against Vinted's deployed frontend.
