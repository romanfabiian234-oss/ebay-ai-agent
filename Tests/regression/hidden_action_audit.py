#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
ai=(ROOT/'Extension/core/ai.js').read_text()
bg=(ROOT/'Extension/background.js').read_text()
manual=(ROOT/'Extension/modes/manual_analysis.js').read_text()
server=(ROOT/'Backend/server.py').read_text()
all_js='\n'.join(p.read_text(errors='ignore') for p in (ROOT/'Extension').rglob('*.js'))

# Backend OpenAI proxy is a single upstream call; Anthropic has its own separate function.
proxy=server.split('def proxy_ai_request(payload: dict) -> dict:',1)[1].split('\ndef proxy_claude_request',1)[0]
assert proxy.count('read_ai_upstream(')==1, 'OpenAI proxy must perform exactly one upstream call per proxy invocation'
assert not re.search(r'\bfor\b|\bwhile\b', '\n'.join(line for line in proxy.splitlines() if 'read_ai_upstream' in line or 'retry' in line), re.I), 'OpenAI proxy must not hide a retry loop'

# Normal product analysis cannot invoke transport compatibility probing.
assert 'allowCompatibilityRetry: false' in ai
assert 'allowCompatibilityRetry: true' in ai
assert ai.count('allowCompatibilityRetry: true')==1, 'compatibility retry must exist only in explicit connection test'
assert 'maxOpenAiRequests: reviewMode ? 1 : 2' in ai
assert 'ANALYSIS_REQUEST_BUDGET_EXHAUSTED' in ai

# Connection test is user-triggered from manual settings, not startup/queue/photo automation.
assert 'AI_TEST_CONNECTION' in manual
other_test_callers=[]
for p in (ROOT/'Extension').rglob('*.js'):
    if p.name in {'background.js'} or p.as_posix().endswith('modes/manual_analysis.js'): continue
    text=p.read_text(errors='ignore')
    if 'AI_TEST_CONNECTION' in text: other_test_callers.append(str(p.relative_to(ROOT)))
assert not other_test_callers, f'Unexpected automatic API connection-test callers: {other_test_callers}'

# New Photo/Queue path is Core AI. Legacy AI_ANALYZE_PHOTOS remains compatibility-only and has no production caller outside core wrapper/background/shared constants.
legacy_callers=[]
for p in (ROOT/'Extension').rglob('*.js'):
    rel=p.relative_to(ROOT).as_posix()
    if rel in {'Extension/core/ai.js','Extension/background.js','Extension/shared/messages.js'}: continue
    if 'AI_ANALYZE_PHOTOS' in p.read_text(errors='ignore'): legacy_callers.append(rel)
assert not legacy_callers, f'Unexpected legacy AI_ANALYZE_PHOTOS production caller: {legacy_callers}'

# Duplicate identical concurrent analyses must be guarded before paid Primary.
assert 'ACTIVE_ANALYSES = new Map()' in ai
assert 'Duplicate analysis joined existing in-flight request' in ai
assert 'analyzeListingOnce(payload)' in ai

# Local OCR routes are separate from AI proxy; they should not route through OpenAI helpers.
ocr_section=ai.split('/* ===== OCR CLIENT ===== */',1)[1]
assert 'AI_ANALYZE_PHOTOS' not in ocr_section.split('/* =====',1)[0], 'OCR client must not use paid AI compatibility route'

print('PASS V8.23.21 hidden-action audit: no backend retry loop, no automatic Test API, no legacy paid caller, <=2 normal OpenAI attempts, and identical concurrent analyses are single-flight')
