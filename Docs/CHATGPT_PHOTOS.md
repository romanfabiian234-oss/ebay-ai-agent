# eBay → ChatGPT photos (8.23.22)

1. Replace your installed extension folder with this archive’s Extension folder, then reload it at chrome://extensions. Keep the same extension identity; do not remove it first.
2. Refresh both eBay and ChatGPT tabs after reloading. Allow the new ChatGPT site permission if Chrome requests it.
3. Open an eBay listing editor and a ChatGPT conversation in Chrome (two side-by-side windows are convenient).
4. Select photos on eBay. Drag the extension’s “Drag … photos” handle onto ChatGPT, as for Depop/Poshmark/Vinted.
5. Check the attachments in the composer before sending your message yourself.

The extension transfers at most 10 photos per pass as a conservative local batch size, not a claim about ChatGPT account limits. Select smaller batches if your account rejects uploads. No API key or backend changes are required. Text and Send are untouched. Only chatgpt.com and chat.openai.com are enabled; desktop/mobile apps are not supported.

ChatGPT uses either its image file input or a file paste into #prompt-textarea. Confirmation counts composer previews, not images in previous messages. Automatic retry is disabled for ChatGPT to avoid duplicates on slow uploads. If confirmation fails, inspect the composer before retrying. UI changes, account upload limits, or a missing active composer may prevent transfer.

Validation: syntax and local regression checks were run. Browser fixtures for file-input and paste paths are included, but could not run here because Chromium is unavailable and its download timed out. A signed-in live ChatGPT session was not tested.
