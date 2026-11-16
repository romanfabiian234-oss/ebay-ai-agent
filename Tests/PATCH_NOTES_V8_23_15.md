# PATCH NOTES — V8.23.15

Problem 2.5 local OCR/CV accuracy cycle. The V8.23.14 real recordings showed that one-request cost control was working, but a direct shoe label could still be missed or underused when eBay exposed it as a generic mid-gallery photo and when a virtualized option menu was intentionally omitted from the compact snapshot. V8.23.15 fixes those root causes without widening paid GPT Vision.

Main changes:
- Fast local OCR discovery is bounded at 12 gallery photos; paid GPT remains Cheap 4 / Balanced 6 / Quality 8.
- Machine vision may supply a likely label rectangle/focus region when text is weak; geometry never becomes a product fact.
- At most 3 difficult label photos receive Accurate OCR. The strongest crop/upscale also gets local Core Image contrast/grayscale and sharpen variants.
- Fast/Accurate and pass/variant consensus are merged instead of losing repeat evidence or selecting a result only by block count.
- Snapshot now distinguishes complete compact option lists from omitted/virtualized lists. Narrow direct shoe/origin OCR facts may defer exact option validation to the live shared Fill Engine; unknown completeness remains blocked.
- Shoe Width has deterministic live alias resolution such as 2E → EE only when exactly one live option matches.
- Weak OCR, ambiguous options, GPT↔OCR conflicts, visual/style inference and unsupported care-symbol semantics remain blocked/reviewed.
- Care-symbol-like OCR tokens can help route a likely care label for closer inspection, but this release does not invent care instructions from pictogram geometry alone.
