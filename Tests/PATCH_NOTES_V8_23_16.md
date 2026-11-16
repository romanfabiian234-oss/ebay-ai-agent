# PATCH NOTES — V8.23.16

Problem 2.5 real Size/OCR cost regression. The V8.23.15 UNIQLO U browser test showed a required `Size` left blank even though the label visibly read `XS`, while OpenAI usage increased by two requests. Code + diagnostic review confirmed that the compact eBay snapshot intentionally omitted the virtualized Size option catalog; local OCR could derive the direct Size fact, but two safety gates discarded it before Fill. That forced a paid GPT repair which still did not solve the field.

Main changes:
- `Size` is now allowed through the same narrow incomplete-catalog boundary used for other strong direct OCR facts, but only after the existing high-confidence/consensus physical-label evidence gate.
- Deterministic matching still blocks ordinary GPT Size candidates when options are unavailable. Only a local `confirmed_by_tag` OCR recovery may defer exact Size validation to the live page.
- The shared Fill Engine remains the final authority: it must open the real eBay Size dropdown, find the exact option (for example `XS`), select it, and verify the installed value.
- No title-based Size trust was added; no OCR confidence floor was lowered; no semantic/fuzzy size guess was added.
- Missing/weak/conflicting Size evidence can still use the existing bounded repair path; GPT↔OCR conflicts remain Review-safe.
- GPT model, Cheap/Balanced/Quality paid photo caps, OCR/CV preprocessing, protected fields, Queue behavior and publishing safety are unchanged.

Regression coverage:
- strong `XS` OCR + `optionsComplete=false` → local recovery, one GPT request, no repair;
- same incomplete Size catalog + ordinary GPT candidate → blocked;
- recovered `XS` reaches Fill only through exact live option verification;
- all existing AI/OCR/cost/Queue/marketplace/Chromium tests remain green.
