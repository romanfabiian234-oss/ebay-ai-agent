# Marketplace AI Listing Filler V8.23.20

V8.23.20 continues Problem 2.5 after real V8.23.19 testing reached roughly the $0.07/item target but still missed obvious physical-label facts. The current focus is **accuracy without buying extra GPT work**: direct Brand/Size/Material/Care/Origin facts may cross an incomplete virtualized eBay option snapshot only when they are strongly confirmed by local physical-label OCR; the shared Fill Engine must still open the live control, find the exact option and verify the result.

Key direct-label fixes include cashmere/acrylic/etc. as label context, numeric clothing sizes such as `00`/`0`/`2`, preservation of OCR block roles such as `brand label`, and safe `100% Cashmere` / `100% Wool` specificity only when the percentage is physically read. Complete option-catalog mismatches remain blocked and GPT↔OCR conflicts are not silently resolved.

The hidden-action audit also added an **analysis single-flight guard**: two identical concurrent starts for the same draft/questions/photos now join one in-flight analysis instead of potentially buying duplicate Primary requests. Different drafts remain independent, and the guard is always released after success or failure. Normal Fill still has a hard maximum of one Primary + one targeted Repair OpenAI request; Test API compatibility probing remains explicit/manual only.

The normal per-item cost target remains **$0.07 or less**, but accuracy/safety wins over filling every field. If direct evidence cannot be verified after the bounded flow, the field stays Review/blank rather than creating a third request or guessing.

## Fast crosslisting workflow

1. Open the source eBay draft and the Depop or Poshmark create-listing page side by side.
2. **Normally:** leave eBay photos unselected and drag the floating **Drag N photos** handle. All detected listing photos are used.
3. **To send only some photos:** use eBay's own **Select** tool, click the photos you want, then drag the same handle. Its label changes live to **Drag N selected photos**.
4. Drop anywhere on the supported destination create-listing page while the extension drag overlay is visible.
5. If the destination listing UI is still loading, the `document_start` receiver preserves the drop until the real multiple-file input exists.
6. The selected files are delivered to the marketplace input in one ordered operation. Depop is verified directly. Poshmark automatically confirms only its exact **Select a Covershot → Apply** photo modal, then verifies the real listing photo grid. A retry is allowed only after zero visible progress; partial uploads are never automatically resent because that could create duplicates. Depop receives at most 8; Poshmark at most 16.
7. Open the Control Panel and press **Read Photos + Listing Fields** if you want to inspect the current marketplace snapshot, or press **Fill All Current Listing** to run the marketplace fill workflow.
8. Review the listing and publish manually.

The extension never auto-publishes, auto-deletes or pays.

## Shared photo reader

The Control Panel **Read Photos + Listing Fields** button now works on:

- **eBay:** one shared gallery collector is used by Drag and the Photo/Queue snapshot path. It reads ordinary/lazy/CSS-backed eBay gallery images and uses the visible gallery count as a completeness check.
- **Depop:** reads current destination photos and the fields/options exposed by the Depop adapter.
- **Poshmark:** reads current destination photos and the fields/options exposed by the Poshmark adapter.

This removes the previous inconsistency where the Drag badge could see many eBay photos while the AI panel saw only the main image.

## Platform design

- **Shared Fill Engine:** one deterministic fill/verify core for eBay, Depop and Poshmark.
- **eBay:** existing verified Item Specifics workflow remains the production path.
- **Depop:** adapter uses labels, ids, ARIA relationships, roles and data-testid rather than generated CSS-module class names.
- **Poshmark:** adapter uses semantic listing sections plus stable `data-test` / `data-et-*` hooks.
- **Vinted:** V8.23.21 enables the eBay photo-drop destination only; Smart Fill is intentionally not loaded on Vinted yet.
- **Photo transfer:** marketplace-specific upload mechanics are isolated from the Fill Engine. eBay photos can be dropped into Depop, Poshmark, or Vinted listing uploaders.

When a blank Category controls later questions, Depop/Poshmark Fill All uses a bounded staged flow: Category first, then one dependent-field refresh, then the remaining fields.

## Safety

On eBay, protected fields remain unchanged: Title, Description, Condition, Category, Price, Quantity, Shipping, UPC and MPN.

On Depop/Poshmark, Category and Condition may be filled because they are explicit destination classification questions. The extension still does not automatically change Title, Description, Price, Quantity, Shipping, Availability, payment/offer controls, Boost/Promote settings, UPC/MPN, or any Publish/List/Post/Delete action.

Photo transfer is user-initiated. The background fetch route accepts only validated `https://i.ebayimg.com/...` images with type/size limits and does not use Chrome Downloads.

## Secure local connection

V8.23.21 uses Chrome Native Messaging for the secure Extension ↔ Mac connection. API keys remain in macOS Keychain and existing saved settings are reused without re-entry.

## Start

`START.command` is the main local install/start/setup entry point.

On a new Mac, START asks for normal settings and hidden secrets once in Terminal. On later starts it reuses Application Support settings and macOS Keychain secrets automatically.

To change settings later: `START.command --setup` or `Tools/settings.command`.

## Main folders

- `Extension/core/` — shared analysis policy, matching, Fill and verification core.
- `Extension/platforms/` — platform adapters, shared eBay gallery collector and photo-transfer bridge.
- `Extension/modes/` — Photo/Text/Queue/Review orchestration.
- `Extension/ui/` — visual containers only; workflows, persistence, browser APIs and marketplace DOM live outside UI.
- `Backend/` — secure local service and OCR helper.
- `Tests/` — unit, regression, integration and release checks.
- `Docs/` — architecture/security/changelog.
- `Tools/` — backend/settings maintenance commands.

See `ARCHITECTURE.md` for the production path.
