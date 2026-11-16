from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; EXT=ROOT/'Extension'
bg=(EXT/'background.js').read_text(); popup_state=(EXT/'ui/popup/state.js').read_text(); app_state=(EXT/'shared/app_state.js').read_text(); config=(EXT/'shared/config.js').read_text(); snap=(EXT/'core/snapshot.js').read_text(); helper=(EXT/'platforms/ebay_helper.js').read_text(); content=(EXT/'content.js').read_text()
assert 'ebayAiAutopilotRuntimeV8130' in bg and 'chrome.storage.session' in bg and 'chrome.storage.local' in bg
assert 'EbayAiConstantsV790?.DEFAULT_SETTINGS' in bg and 'EbayAiConstantsV790?.DEFAULT_SETTINGS' in app_state and 'DEFAULT_SETTINGS' not in popup_state
assert '/v1/responses' in config and 'gpt-5.6' in config
assert 'rows[locator.rowIndex]' not in snap and 'radio_clear_requires_ebay_control' in snap and 'stableSamples >= 4' in snap
assert content.count('document.addEventListener("keydown"')==1 and 'document.addEventListener("keydown"' not in helper
assert 'code === "KeyX"' in content and 'code === "KeyF"' in content and 'event?.isTrusted' in content
print('PASS V8.23.21 persistent state, stale DOM, exact hotkey owner, and centralized defaults')
