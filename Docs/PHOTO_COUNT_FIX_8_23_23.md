# 8.23.23 — eBay gallery count fix

Fixed photo collection stopping at a header containing the gallery counter, while sibling thumbnails were omitted. Counter detection now handles long help text. Photo IDs retain case. The source button refreshes automatically after gallery changes. Dragging an incomplete known gallery is blocked, with a count explaining what is missing. Resource history from other listings is excluded. ChatGPT transfer support from 8.23.22 is retained.

Install: copy the contents of this archive’s Extension directory into your existing installed Extension directory. Reload the extension at chrome://extensions, then refresh eBay and destination tabs.

Validation: dependency-free simulated DOM regression reproduces 1 of 7 with the previous collector; updated collector returns 7 photos and a seven-URL drag payload. Tests also cover long help text, unrelated photos outside the gallery, case-sensitive photo IDs, incomplete drag blocking, stale resources, automatic label refresh, and two selected photos. ChatGPT controls and existing photo-transfer static regression checks pass. JavaScript syntax checks pass.

Limits: these are local fixtures, not the actual page DOM from the screenshots. No authenticated live eBay/ChatGPT browser verification was performed.
