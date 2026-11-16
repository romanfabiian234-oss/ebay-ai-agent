#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'Extension'
JS = sorted(EXT.rglob('*.js'))
texts = {p: p.read_text(errors='ignore') for p in JS}
production = '\n'.join(texts.values())

# Regression guard for the proven legacy entry points removed in V8.23.21.
forbidden = [
    'FULL_FILL_ONE_CLICK_V5',
    'CLOSE_FILL_PREVIEW_V5',
    'REFRESH_HOVER_ASSISTANT_V5',
    'EXPORT_EBAY_DOM_SNAPSHOT_V5',
    'READ_EBAY_PHOTOS_V5',
    'READ_ITEM_SPECIFICS_CONTEXT_V670',
    'PREPARE_FULL_PAGE_CAPTURE_V639',
    'SCROLL_FULL_PAGE_CAPTURE_V639',
    'RESTORE_FULL_PAGE_CAPTURE_V639',
    'CONTENT_BRIDGE_LIGHT_STATUS_V8100',
    'AI_QUEUE_READ_CURRENT_V710',
    'AI_QUEUE_FILL_CURRENT_V710',
    'AI_QUEUE_WAIT_AUTOSAVE_V710',
    'AI_QUEUE_RUNNER_RETRY_V710',
    'AI_QUEUE_RUNNER_CONTINUE_V710',
    'AI_QUEUE_RUNNER_OPEN_TAB_V710',
    'AI_QUEUE_SHOW_V701',
    'AI_QUEUE_CHECK_V701',
    'sharedFillAllCurrentV7100',
    'queueFillCurrentV710',
    'fillAllRecordManualRouteA58',
    'fillDropdownA582',
    'showFillPreviewPanel',
    'estimateUsageForRequest',
    'parseListingText',
]
for token in forbidden:
    assert token not in production, f'legacy/dead production token returned: {token}'

# Conservative static signal: a normal named function whose identifier appears
# only in its own declaration has no production reference. Named IIFEs are exempt
# because their function name is diagnostic only and the expression executes directly.
identifiers = re.findall(r'(?<![\w$])([A-Za-z_$][\w$]*)(?![\w$])', production)
counts = {}
for name in identifiers:
    counts[name] = counts.get(name, 0) + 1
single_use_functions = []
for path, text in texts.items():
    for match in re.finditer(r'\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', text):
        name = match.group(1)
        if counts.get(name, 0) != 1:
            continue
        before = text[:match.start()].rstrip()
        if before.endswith('('):  # named IIFE
            continue
        single_use_functions.append(f'{path.relative_to(ROOT)}:{text.count(chr(10), 0, match.start()) + 1}:{name}')
assert not single_use_functions, 'unreferenced named functions found:\n' + '\n'.join(single_use_functions)

# Same conservative check for simple named state/constants. This intentionally
# ignores destructuring and loop bindings; it only catches obvious leftover state.
single_use_values = []
for path, text in texts.items():
    for match in re.finditer(r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?==|;|,)', text):
        name = match.group(1)
        if counts.get(name, 0) == 1:
            single_use_values.append(f'{path.relative_to(ROOT)}:{text.count(chr(10), 0, match.start()) + 1}:{name}')
assert not single_use_values, 'unreferenced simple declarations found:\n' + '\n'.join(single_use_values)

background = (EXT / 'background.js').read_text()
assert 'function reviewKeyV830(' not in background and 'function reviewStatusFromEvidenceV830(' not in background, 'dead Review-model duplicates returned to background.js'

helper = (EXT / 'platforms/ebay_helper.js').read_text()
assert 'globalThis.EbayHelperRuntimeV8130' in helper
assert 'handleHelperMessageV8130' in helper
assert 'ENABLE_HOVER_ASSISTANT_V5' in helper and 'ENABLE_REVIEW_ASSISTANT_V830' in helper
assert 'EXPORT_EBAY_DEBUG_BUNDLE_V5' in helper and 'CLEAR_EBAY_ACTION_LOG_V5' in helper

print('PASS V8.23.21 dead-code gate: legacy Fill/Queue/capture paths are absent and no obvious unreferenced named production declarations remain')
