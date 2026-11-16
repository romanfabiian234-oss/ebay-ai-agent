# PATCH NOTES — V8.23.8

## Smart Local OCR Verification

### Root cause

Normal Photo/Autopilot/Queue kept local OCR disabled, so a direct label fact that was already read correctly by the primary GPT analysis could still be sent through the paid independent strict-verification GPT pass. Replacing GPT with OCR would reduce cost but would also create a new accuracy risk because OCR can misread labels and cannot reliably determine visual fields.

### Change

- Start bounded macOS Vision OCR in parallel with the primary GPT analysis when local OCR is available.
- Use OCR only as an **independent verifier** for a small direct-label allowlist: Brand, Size, Material, Country of Origin / Country-Region of Manufacture, Garment Care, Model and Product Line.
- Require the existing deterministic evidence validator plus conservative confidence/consensus thresholds, direct physical-label support from the primary GPT result, and overlap with the same cited photo before OCR may confirm a field.
- A confirmed field must already have a primary GPT answer; OCR never creates a missing normal-Fill answer.
- Color, Style, Vintage and other visual/ambiguous fields are never accepted by this fast OCR verifier.
- If OCR strongly conflicts with the primary answer, it does not overwrite it; that field remains in the independent GPT strict-verification request.
- Weak/uncertain OCR changes nothing.
- Only OCR-confirmed strict fields are removed from the paid second GPT request.
- Local OCR runs concurrently with the primary GPT request so the cost optimization does not add a full serial OCR wait in the normal path.

### Cost accounting

The V8.23.7 per-request ledger remains the single API accounting path. Primary, Strict Verification, compatibility retry, connection test and Claude requests continue to receive individual ledger records and request IDs. V8.23.8 changes which strict fields may safely avoid the second request; it does not create a second cost counter or item-summary charge.

### Safety / unchanged areas

- Shared Fill Engine unchanged in responsibility.
- No automatic Title, Description, Condition, Category, Price, Quantity, Shipping, UPC or MPN changes on eBay.
- No publish/list/delete/pay behavior added.
- Queue transition, Show More readiness and photo-transfer architecture are not changed by this patch.
- Full OCR recovery/correction and Claude verification remain Review Mode behavior.

### Verification

See `TEST_RESULTS_V8_23_8.txt` for the executed test set and any environment-only limitations. Dedicated tests cover both the pure OCR evidence gate and end-to-end Fast Fill request routing (skip when confirmed; keep GPT recovery on conflict).
