# Architecture — V8.23.21

The normal cost-aware path is:

```text
Collector
→ local OCR/CV
→ adaptive Vision-detail routing
→ Primary GPT
→ Local Evidence Engine
→ optional targeted Repair GPT
→ Answer Normalizer
→ Fill Engine
→ live Verification
```

### Hard request invariant

Normal Fill owns a per-analysis OpenAI request budget of **2 upstream attempts maximum**: one Primary and at most one Repair. The budget is consumed before transport. Product-analysis requests explicitly disable token-parameter compatibility retry, so a logical Primary/Repair stage cannot hide another OpenAI attempt. Compatibility probing is setup-only through the explicit API connection test. If future code tries to exceed the analysis budget, it fails closed and leaves unresolved fields for review.

### Adaptive Vision detail

Local OCR/CV runs before paid Vision. A label with a strong, stable local read is marked as locally strong and remains LOW detail during Primary GPT. The deterministic Local Evidence Engine is responsible for verifying/recovering those direct facts. If local OCR is weak, ambiguous or conflicting, the label is sent HIGH detail. Repair is always HIGH detail and only for the unresolved evidence photos. This is intentionally asymmetric: cheap local evidence handles easy text; expensive Vision is reserved for hard text.

### Direct physical-label evidence and live catalogs

The compact eBay snapshot is not treated as authoritative when it explicitly reports an incomplete/virtualized option catalog. A strong local `physical_tag` fact may continue only for a narrow direct-field allowlist (Brand, Size, Material, Garment Care, origin and direct shoe facts). Complete-catalog mismatches are still rejected. The shared Fill Engine opens the real field, resolves the exact live option (including numeric sizes and safe aliases such as `XXS → 2XS` / `2E → EE`) and verifies the selected state before success.

Physical material percentages are evidence, not inference: `100% Cashmere` is preferred only when local OCR actually reads the percentage and the field-specific validator confirms it. A plain fiber name remains plain.

### Analysis single-flight guard

An identical concurrent analysis is keyed by mode/draft/title/category/questions/photos/field-shape/model settings and joins the existing in-flight Promise before a paid Primary request can start. Different drafts or materially different inputs do not share work. The in-flight entry is removed in `finally`, so failure cannot permanently block a later explicit retry. This complements, rather than replaces, the hard one-Primary + one-Repair OpenAI request budget.

### Cost target and accuracy boundary

The normal operational target is **≤ $0.07 per item**. The target does not authorize weaker evidence or a third request. Provider-reported request cost is aggregated per analysis run; if a difficult item remains unresolved after the bounded Repair, the safe outcome is REVIEW/blank rather than speculative filling. GPT model/output headroom and OCR confidence thresholds remain unchanged.

Local Evidence rules from V8.23.18 remain active: only deterministic observable facts may cross photos; Model/Product Line remain same-photo-only; GPT↔OCR conflicts never auto-resolve in favor of OCR; live platform option verification remains final authority.

## UI container boundary

V8.23.21 preserves the project rule **one visual responsibility → one UI container**. `Extension/ui/` contains visual containers only. UI does not call Chrome browser/storage/scripting APIs directly, does not own marketplace DOM discovery, and does not persist application state.

```text
ui/
├── registry/         # stable UI registry/API
├── popup/            # Control Panel document shell + DOM bindings
├── control-panel/    # in-page Control Panel iframe shell
├── progress/         # one shared operation/Queue progress surface
├── notifications/    # transient toasts
├── status/           # status text/tone rendering
├── theme/            # visual theme application
├── photo-selection/  # photo cards/source/checklist rendering
├── photo-transfer/   # drag/drop visual overlays and badges
├── queue-panel/      # Seller Hub queue-selection view
├── queue-controls/   # Control Panel Queue view
├── assistant-panel/  # Helper/Review/Fill helper panel renderer
├── settings/         # Settings form rendering/state
├── connections/      # connection status/input surface
├── diagnostics/      # diagnostics display surface
├── fill-actions/     # Fill action controls
├── review/           # Review workspace rendering
└── text-import/      # Text/Item Specific input rendering
```

Non-visual owners are separate: `modes/` owns workflows/controllers, `platforms/` owns marketplace DOM/adapters, `shared/` owns persistence/services/application state, and `core/` owns deterministic analysis/fill/verification logic. The historical `platforms/ebay_helper.js` may reference UI APIs but no longer creates visible extension DOM or owns Assistant/Progress/Control rendering.

### Vinted photo-transfer boundary

Vinted is intentionally a **photo-transfer-only destination** in V8.23.21. The manifest loads the early drop receiver plus a minimal destination runtime (`ui/registry`, `ui/photo-transfer`, `platforms/common`, `platforms/photo_transfer`) on `vinted.com`; it does not load `content.js`, the AI route, or the Depop/Poshmark field adapters there. The transfer uses the same validated eBay image fetch bridge, native file-input assignment, bounded retry, and DOM verification as the existing destinations, with a 20-photo destination cap.

## API accounting path

request prepared
→ create local client request ID + reserve estimate
→ secure Backend sends upstream request
→ OpenAI receives `X-Client-Request-Id` only on `api.openai.com`
→ retain provider `x-request-id` when returned
→ parse provider `usage` details
→ price uncached input / cached input / cache writes / output separately
→ replace the reservation with calculated request cost
→ hard daily/monthly budget reads the request ledger

If a transport outcome is unknown, the estimate remains reserved to avoid silent under-counting. Explicit rejected 4xx requests do not consume the estimate unless provider usage is actually reported. Upstream 5xx without usage remain conservatively uncertain. The OpenAI dashboard remains the authoritative billed total; the local ledger is a calculated operational guard.

## eBay analysis/fill path

Photo / Queue
→ one draft/photo/field snapshot
→ shared `EbayPhotoCollectorV8220`
→ cost-aware evidence photo selection (Cheap 4 / Balanced 6 / Quality 8)
→ bounded local Fast macOS Vision OCR may inspect up to 12 gallery photos, independent of the smaller paid-photo limit
→ weak/generic label candidates can be discovered from readable label wording or a Vision rectangle focus hint
→ at most 3 difficult local label candidates receive Accurate OCR; only their strongest crop/upscale gets extra Core Image contrast + sharpen renditions
→ OCR pass consensus and preprocessing-variant consensus are preserved into evidence scoring
→ compact OCR evidence hints for relevant requested fields; hints are untrusted and must be verified by GPT against the referenced supplied photo
→ one primary GPT analysis
→ strict evidence validator accepts only supported direct evidence
→ validated direct primary support stays single-pass
→ Local Evidence Engine may independently confirm an exact observable strict fact from another gallery label only after field-specific OCR confidence/consensus validation; Model/Product Line remain same-photo-only
→ if GPT omitted an allowlisted direct label fact, strong local OCR may recover it; compact complete option lists are checked immediately, while explicitly incomplete/virtualized lists may defer exact verification to the live Fill Engine for narrow shoe/origin fields
→ deterministic live aliases such as printed shoe width `2E` → eBay `EE` are accepted only when the opened menu yields one unique match
→ OCR never replaces a conflicting GPT value; every repair candidate receives an explicit reason code, and fields with no direct evidence signal are skipped rather than retried speculatively
→ genuine strict repair receives only unresolved fields, compresses large live option catalogs, and uses one bounded request (max 8 fields; 2 HIGH-detail photos in Cheap/Balanced, 3 in Quality; exact known evidence is targeted without unrelated photo padding)
→ pure missing fields with weak/ambiguous/no direct evidence stay blank instead of triggering speculative paid repair
→ deterministic option matching
→ shared Fill Engine
→ verification
→ eBay autosave check

Text
→ Field - Value parser
→ deterministic option matching
→ same Fill Engine / verification / save path (no GPT)

Review
→ same snapshot + analysis path
→ review policy
→ same Fill Engine only when the user chooses to fill

## Selected photo-transfer path

On eBay:

native eBay Select state (optional)
→ `EbayPhotoCollectorV8220.selection()`
→ if selected: chosen photos only; otherwise all detected listing photos
→ floating `Drag N photos` / `Drag N selected photos`
→ user starts physical drag
→ bounded transfer metadata is stored in `chrome.storage.session`
→ drag DataTransfer also carries the validated transfer marker/payload

On Depop / Poshmark:

`photo_drop_early.js` runs at `document_start` and is the single destination `dragover/drop` owner
→ captures the user drop even before the dynamic listing photo input exists
→ `photo_transfer.js` consumes the pending/session payload
→ a bounded observer waits only for the real destination multiple-file input
→ background fetches only validated `i.ebayimg.com` images
→ ordered real `File` objects are created
→ all currently transferable files are assigned to the native marketplace file input once
→ Depop: scoped photo-zone verification
→ Poshmark: exact `Select a Covershot` modal → exact enabled `Apply` → modal settles → scoped photo-grid verification
→ one bounded retry only after zero visible progress; partial uploads are not automatically resent
→ verified partial progress remains resumable
→ stop; no publish action

Depop limit: 8 photos. Poshmark limit: 16 photos. Existing destination photos reduce free capacity.

## Shared photo-reader path

Control Panel `Read Photos + Listing Fields`
→ detect active marketplace
→ eBay: existing manual Photo gateway, which now uses `EbayPhotoCollectorV8220`
→ Depop/Poshmark: `CORE_MARKETPLACE_READ_LISTING_V8200`
→ platform adapter collects current photos + safe listing fields/options
→ one marketplace-neutral cache/preview in the Control Panel

Thus the eBay Drag badge and eBay AI photo reader use the same gallery collector.

## Depop / Poshmark Fill All path

Fill All Current Listing
→ Platform Detector
→ platform adapter collects current photos, safe fields, options and current values
→ if Category is blank: bounded Category-only AI pass
→ shared Fill Engine fills/verifies Category
→ one dependent-field structure refresh
→ bounded main AI pass for remaining safe fields
→ same shared Fill Engine
→ read-back verification
→ user reviews and publishes manually

## Platform boundary

`Extension/platforms/`

- `common.js` — platform detection, bounded DOM helpers, photo collection, adapter registry.
- `ebay_photos.js` — shared robust eBay gallery collector + native eBay selection reader.
- `depop.js` — Depop field adapter.
- `poshmark.js` — Poshmark field adapter.
- `photo_drop_early.js` — early destination drop capture at `document_start`.
- `photo_transfer.js` — drag source, transfer session consumer, destination wait/upload/verification.

The Fill Engine never needs to know how those DOMs are built.

## Selector policy

Depop generated CSS-module class names are not stable contracts. Prefer label/for, id, aria-controls, aria-labelledby, role and data-testid relationships.

Poshmark prefers semantic listing sections plus stable `data-test`, `data-et-name`, `data-et-on-name`, ARIA and input attributes.

## Safety invariants

- one automatic Fill writer;
- one shared Fill Engine;
- Fill never calls AI;
- local OCR never overwrites a GPT answer; it may create a missing normal-Fill answer only for allowlisted observable label facts after conservative evidence checks and exact live-option validation;
- Text never calls GPT;
- platform adapters never publish/delete/pay;
- UPC/MPN never enter automatic Fill;
- eBay protected listing fields stay protected;
- photo transfer starts only from the user's drag gesture;
- eBay photo fetch is allowlisted to `i.ebayimg.com` and bounded by image type/size;
- no Chrome Downloads permission;
- destination waits/observers are bounded and disconnected;
- success appears only after read-back/thumbnail verification;
- no secrets in transfer sessions, marketplace pages, logs or ZIP.
