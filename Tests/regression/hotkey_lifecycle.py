#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
content=(ROOT/'Extension/content.js').read_text()
helper=(ROOT/'Extension/platforms/ebay_helper.js').read_text()
assert content.count('document.addEventListener("keydown"')==1
assert 'document.addEventListener("keydown"' not in helper, 'on-demand Helper must not create a second global keyboard owner'
assert 'code === "KeyX"' in content and 'code === "KeyF"' in content
assert 'runtimeContextAlive()' in content and 'global.chrome?.runtime?.id' in content
assert 'Extension was reloaded. Refresh this eBay tab once.' in content
assert 'chrome.runtime.lastError' in content
assert 'event?.isTrusted' in content, 'Safe Stop must ignore synthetic Escape events'
print('PASS V8.23.21 hotkey layout, trusted Escape and stale extension-context guards')
