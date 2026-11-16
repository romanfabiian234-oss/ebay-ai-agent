from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'Extension'
UI = EXT / 'ui'

EXPECTED_CONTAINERS = {
    'registry', 'popup', 'progress', 'photo-selection', 'queue-panel', 'queue-controls',
    'assistant-panel', 'status', 'settings', 'notifications', 'diagnostics', 'fill-actions',
    'review', 'theme', 'text-import', 'connections', 'control-panel', 'photo-transfer'
}
actual = {p.name for p in UI.iterdir() if p.is_dir()}
assert actual == EXPECTED_CONTAINERS, (actual, EXPECTED_CONTAINERS)
assert not [p for p in UI.iterdir() if p.is_file()], 'UI root must contain containers only'

required = {
    'registry': {'registry.js'},
    'popup': {'popup.html', 'popup.css', 'popup.js', 'state.js'},
    'progress': {'progress.js'},
    'photo-selection': {'photo-selection.js', 'view.js'},
    'queue-panel': {'queue-panel.js', 'queue-panel.css'},
    'queue-controls': {'queue-controls.js'},
    'assistant-panel': {'assistant-panel.js'},
    'status': {'status.js'},
    'settings': {'settings.js'},
    'notifications': {'notifications.js'},
    'diagnostics': {'diagnostics.js'},
    'fill-actions': {'fill-actions.js'},
    'review': {'review.js'},
    'theme': {'theme.js'},
    'text-import': {'text-import.js'},
    'connections': {'connections.js'},
    'control-panel': {'control-panel.js', 'control-panel.css'},
    'photo-transfer': {'photo-transfer.js'},
}
for folder, names in required.items():
    present = {p.name for p in (UI / folder).iterdir() if p.is_file()}
    assert names.issubset(present), (folder, present, names)

manifest = json.loads((EXT / 'manifest.json').read_text())
main = next(x for x in manifest['content_scripts'] if 'content.js' in x.get('js', []))
early = next(x for x in manifest['content_scripts'] if 'platforms/photo_drop_early.js' in x.get('js', []))
main_js = main['js']
assert main_js.index('ui/registry/registry.js') < main_js.index('ui/progress/progress.js') < main_js.index('content.js')
assert main_js.index('platforms/ebay_queue_dom.js') < main_js.index('ui/queue-panel/queue-panel.js') < main_js.index('modes/queue_page.js')
assert early['js'][:2] == ['ui/registry/registry.js', 'ui/photo-transfer/photo-transfer.js']
assert 'ui/queue-panel/queue-panel.css' in main['css']
assert 'ui/control-panel/control-panel.css' in main['css']
assert any('ui/popup/popup.html' in block.get('resources', []) for block in manifest['web_accessible_resources'])

# Stable UI namespace: component APIs must not be tied to a patch version.
extension_text = '\n'.join(p.read_text(errors='ignore') for p in EXT.rglob('*.js'))
assert not re.search(r'Ebay[A-Za-z]+UIV\d+', extension_text), 'patch-versioned UI global remains'
registry = (UI / 'registry/registry.js').read_text()
assert 'globalThis.EbayUI' in registry and 'register' in registry

# One progress owner. The former duplicate progress implementations must be gone.
progress = (UI / 'progress/progress.js').read_text()
content = (EXT / 'content.js').read_text()
assert 'ebay-ai-progress' in progress
assert 'ebay-ai-fast-progress-v8100' not in extension_text
assert 'ebay-ai-queue-progress-v802' not in extension_text
assert 'document.createElement' not in content, 'content router must delegate visible UI creation'
assert 'global.EbayUI?.progress?.show' in content

# Control-panel DOM belongs to its UI container; content only delegates commands.
control = (UI / 'control-panel/control-panel.js').read_text()
assert 'document.createElement("iframe")' in control
assert 'clipboard-read; clipboard-write' in control
assert 'ui/popup/popup.html' in control
assert 'document.createElement("iframe")' not in content
queue_css = (UI / 'queue-panel/queue-panel.css').read_text()
control_css = (UI / 'control-panel/control-panel.css').read_text()
assert '#ebay-ai-control-panel' not in queue_css, 'Control Panel CSS leaked into Queue container'
assert '#ebay-ai-control-panel' in control_css and '#ebay-ai-queue-v700' not in control_css, 'Control Panel CSS ownership mismatch'

# Assistant/Helper and early-drop runtime may not create visible DOM directly.
helper = (EXT / 'platforms/ebay_helper.js').read_text()
early_js = (EXT / 'platforms/photo_drop_early.js').read_text()
assert 'document.createElement' not in helper
assert 'EbayUI?.assistantPanel' in helper
assistant_ui = (UI / 'assistant-panel/assistant-panel.js').read_text()
for token in ['renderSuggestion', 'renderReview', 'ensureFillAll', 'setMessage', 'setChip', 'placeNear']:
    assert token in assistant_ui, f'Assistant UI owner missing: {token}'
for token in ['fa-drag-handle', 'rv-grid', 'hf-row hf-row-main', 'fp-counts', 'fp-row', 'fp-resize-left']:
    assert token not in helper, f'Assistant/preview markup leaked back into eBay platform runtime: {token}'
assert 'document.createElement' not in early_js
assert 'EbayUI?.photoTransfer?.notice' in early_js

# Platform photo transfer may create only off-screen canvas data, never visible div/button UI.
transfer = (EXT / 'platforms/photo_transfer.js').read_text()
creates = re.findall(r'document\.createElement\(["\']([^"\']+)["\']\)', transfer)
assert creates and set(creates) == {'canvas'}, creates
assert 'EbayUI?.photoTransfer' in transfer

# Queue ownership: view has render/events only; DOM adapter has eBay DOM only; mode owns state/messages.
queue_ui = (UI / 'queue-panel/queue-panel.js').read_text()
for forbidden in ['chrome.storage', 'MutationObserver', 'document.querySelectorAll', 'chrome.runtime.sendMessage']:
    assert forbidden not in queue_ui, f'Queue Panel UI contains non-visual responsibility: {forbidden}'
queue_dom = (EXT / 'platforms/ebay_queue_dom.js').read_text()
for forbidden in ['chrome.storage', 'chrome.runtime.sendMessage', 'MutationObserver', 'ebay-ai-queue-v700']:
    assert forbidden not in queue_dom, f'Queue DOM adapter contains non-DOM responsibility: {forbidden}'
queue_mode = (EXT / 'modes/queue_page.js').read_text()
assert 'globalThis.EbayQueuePage' in queue_mode
assert 'EbayQueuePanelV8130' not in queue_mode
assert 'document.createElement' not in queue_mode
assert 'MutationObserver' in queue_mode and 'storage.get' in queue_mode and 'chrome.runtime.sendMessage' in queue_mode

# Popup startup is a compact shell; major controllers are separate owners.
popup = (UI / 'popup/popup.js').read_text()
assert len(popup.splitlines()) <= 220, len(popup.splitlines())
for forbidden in ['function parseValidatedAiResponse', 'async function readCurrentMarketplacePhotosV8220', 'function queuePopupMessage']:
    assert forbidden not in popup, f'popup startup reclaimed another container responsibility: {forbidden}'
assert 'readCurrentMarketplacePhotosV8220' in (EXT / 'modes/photo_selection.js').read_text()
assert 'startQueueRunnerV710' in (EXT / 'modes/queue_controls.js').read_text()
assert 'oneButtonFillEbay' in (EXT / 'modes/fill_actions.js').read_text()
assert 'runCurrentReviewAnalysisV890' in (EXT / 'modes/review_workspace.js').read_text()
assert 'saveSettings' in (EXT / 'modes/settings.js').read_text()
diagnostics_shared = (EXT / 'shared/diagnostics.js').read_text()
photo_mode = (EXT / 'modes/photo.js').read_text()
assert 'estimateUsageForRequest' not in diagnostics_shared, 'legacy duplicate request estimator returned'
assert 'checkBudgetBeforeAnalyze' in diagnostics_shared and 'function estimate(' in photo_mode, 'active Analysis estimate/budget contract missing'
assert 'sendRuntimeMessage' in (EXT / 'shared/connections.js').read_text()
text_parser = (EXT / 'core/text_parser.js').read_text()
text_mode = (EXT / 'modes/text.js').read_text()
assert 'parseListingText' not in text_parser, 'legacy general listing parser returned'
assert 'parseKeyValueLines' in text_parser and 'global.EbayBlocksV890.textInput' in text_mode, 'active deterministic Text parser contract missing'

# UI containers are visual-only: browser/storage/platform execution stays in shared/modes/platforms.
for file in UI.rglob('*.js'):
    text = file.read_text(errors='ignore')
    assert not re.search(r'\bchrome\.', text), f'UI browser API leak: {file.relative_to(EXT)}'
    assert not re.search(r'\b(?:localStorage|sessionStorage|indexedDB)\b', text), f'UI persistence API leak: {file.relative_to(EXT)}'
    assert 'EbayAiStorageV790' not in text, f'UI storage implementation leak: {file.relative_to(EXT)}'
    for forbidden in ['sendRuntimeMessage', 'refreshItemSpecificContextV670', 'persistPopupDraftV82310', 'saveQuestionPreferencesV680', 'collectDiagnosticsV82310', 'getUsageHistory()', 'executeEbayOauthV82310', 'persistEbayProfileV82310']:
        assert forbidden not in text, f'UI workflow/service leak {forbidden}: {file.relative_to(EXT)}'
for rel, forbidden in {
    'ui/photo-selection/photo-selection.js': ['CORE_MARKETPLACE_READ_LISTING_V8200', 'chrome.tabs', 'chrome.scripting'],
    'ui/queue-controls/queue-controls.js': ['AI_QUEUE_RUNNER_START_V710', 'chrome.storage', 'chrome.tabs'],
    'ui/fill-actions/fill-actions.js': ['CORE_MARKETPLACE_SMART_FILL_ALL_V8200', 'chrome.tabs'],
    'ui/review/review.js': ['EbayReviewModeV890.analyze', 'REVIEW_SAVE_ITEM_V830'],
    'ui/diagnostics/diagnostics.js': ['chrome.storage', 'getAiCache', 'setAiCache'],
}.items():
    text=(EXT/rel).read_text()
    for token in forbidden:
        assert token not in text, f'UI ownership leak {token}: {rel}'


assert len((UI / 'popup/state.js').read_text().splitlines()) <= 12, 'popup/state.js must remain visual-only'
assert 'ebayPhotoCache' in (EXT / 'shared/app_state.js').read_text() and 'ebayPhotoCache' not in (UI / 'popup/state.js').read_text(), 'application photo state leaked into UI'
assert 'currentItemSpecificQuestionsV670' in (EXT / 'modes/text_workspace.js').read_text(), 'Item Specific model owner missing'
assert 'loadPopupDataV780' in (EXT / 'modes/popup_controller.js').read_text(), 'popup startup workflow owner missing'
assert 'loadEbayProfileV636' in (EXT / 'modes/connections.js').read_text(), 'connection workflow owner missing'

# Shared containers are lower-level and must not call visual UI directly.
for file in (EXT / 'shared').glob('*.js'):
    text = file.read_text(errors='ignore')
    assert 'EbayUI' not in text, f'Shared-to-UI dependency leak: {file.relative_to(EXT)}'
assert 'confirm(' not in (EXT / 'shared/diagnostics.js').read_text(), 'Shared diagnostics must request approval through a callback, not own UI confirmation'
assert 'EbayPopupSyncV82310' in (EXT / 'modes/popup_sync.js').read_text()
assert 'EbayPanelPreferencesV82310' in (EXT / 'shared/panel_preferences.js').read_text()

# Visible DOM creation is owned by ui/. Outside UI only data canvases are allowed.
outside = []
for file in EXT.rglob('*.js'):
    if UI in file.parents:
        continue
    text = file.read_text(errors='ignore')
    for match in re.finditer(r'document\.createElement\(["\']([^"\']+)["\']\)', text):
        outside.append((file.relative_to(EXT).as_posix(), match.group(1)))
assert sorted(outside) == sorted([('modes/manual_analysis.js', 'canvas'), ('platforms/photo_transfer.js', 'canvas')]), outside

print('PASS V8.23.21 strict UI ownership: one visual owner per function, stable registry, one progress UI, delegated Control/Assistant/Photo UI, and separated Queue view/DOM/controller')
