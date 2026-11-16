# Security — V8.23.14

## Secrets

GPT/Claude API keys, eBay Client Secret and OAuth refresh tokens remain in macOS Keychain. They are not stored in the release ZIP, Chrome storage, normal configuration JSON, logs, or marketplace pages.

## Native Messaging boundary

The Extension declares Chrome's `nativeMessaging` permission and connects to `com.fabiian.ebay_ai_agent` from its service worker. START.command installs a user-level Native Messaging host manifest whose `allowed_origins` contains only the fixed Extension ID. No wildcard origin is used.

The Extension never receives the internal loopback credential. The native host retrieves a separate random credential from the macOS data-protection Keychain and uses it only for native-host → 127.0.0.1 Backend authentication.

The internal credential uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so it is available to the background process after the user unlocks the Mac and is not migrated to another device.

A legacy mode-0600 `.local-pairing-secret` is migrated once into Keychain and then removed.

## Native host restrictions

- exact caller origin check;
- explicit GET/POST route allowlists;
- no arbitrary URL proxying;
- bounded request/response sizes and timeouts;
- stdout is reserved only for the Native Messaging protocol;
- secrets are never returned to the Extension.

## API usage ledger and tracing

The local usage ledger stores request metadata, model/stage, token counts, calculated cost, status, and non-secret request IDs. It never stores API keys, request prompts, image payloads, cookies, or marketplace credentials. `X-Client-Request-Id` is forwarded only to `api.openai.com`; arbitrary custom providers do not receive this OpenAI-specific tracing header.

## Marketplace host permissions

V8.23.14 continues to use only the required eBay/Depop/Poshmark HTTPS host patterns and does not request `<all_urls>`.

## Local OCR verification boundary

In normal Photo/Autopilot/Queue mode, local macOS Vision OCR is limited to a small direct-label allowlist. It may confirm an existing GPT answer, or recover a missing direct label fact after the primary pass only when deterministic parsing succeeds, OCR confidence/consensus is strong, and the value exactly matches the current eBay options. It cannot overwrite a conflicting GPT answer and is never authority for visual/ambiguous fields such as Color, Style or Vintage. A conflict remains eligible for independent GPT verification; broader OCR correction remains Review Mode.

## Listing safety

### eBay
Automatic code remains limited to safe Item Specifics. Title, Description, Condition, Category, Price, Quantity, Shipping, UPC and MPN remain protected. Publish/List/Delete/Pay are blocked.

### Depop / Poshmark
The new crosslisting workflow may fill Category and Condition because the user explicitly requested destination-platform question filling. It may also fill safe platform fields such as Brand/Size/Color and platform-specific tags/options when supported by product evidence.

It does not automatically modify Title, Description, Price, Quantity, Shipping, Availability, payment/offer controls, Boost/Promote settings, UPC/MPN, or any publish/list/post/submit/delete/remove action.

Photo transfer is user-initiated by a physical drag gesture. At drag start, the extension may keep a short-lived bounded transfer session in `chrome.storage.session` so the user's chosen eBay photo set is not lost while a Depop/Poshmark page finishes rendering. The session contains only validated photo metadata/URLs and no credentials or API secrets. The Background may fetch only validated `https://i.ebayimg.com/...` image URLs, with a per-file size cap. The destination bridge waits only for the supported marketplace file input, assigns the ordered image files to that native multiple-file input in one normal operation, and verifies the destination photo area. Poshmark additionally confirms only its exact visible Covershot Apply modal before success. It never uses Chrome Downloads and never starts a transfer without the user's drag gesture.

## DOM safety

Platform adapters scope selection to the intended field and use exact option matching plus read-back verification. They do not use global button text searches for destructive actions. Bounded waits observe the state needed for the current field and are disconnected when complete.
