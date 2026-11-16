#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AI = (ROOT / 'Extension/core/ai.js').read_text()
POLICY = (ROOT / 'Extension/core/policy.js').read_text()
SNAPSHOT = (ROOT / 'Extension/core/snapshot.js').read_text()
PHOTO = (ROOT / 'Extension/modes/photo.js').read_text()
BACKGROUND = (ROOT / 'Extension/background.js').read_text()
CONTENT = (ROOT / 'Extension/content.js').read_text()
CONFIG = (ROOT / 'Extension/shared/config.js').read_text()

# Root-cause policy is behavior-based, not product-specific.
for field in [
    'fabric weight', 'performance activity', 'cushioning level', 'midsole type',
    'pronation', 'heel to toe drop', 'insulation weight', 'fill power', 'waterproof rating'
]:
    assert f'"{field}"' in POLICY, f'missing strict technical field: {field}'
for field in ['bag height', 'bag width', 'bag depth', 'platform height', 'heel height', 'calf width', 'shoe width']:
    assert f'"{field}"' in POLICY, f'missing measurement-only field: {field}'
assert 'MEASUREMENT_ONLY_FIELDS' in POLICY
assert 'EXPLICIT_BINARY_FIELDS' in POLICY
assert 'requiresStrictSupport' in POLICY and 'requiresIndependentVerification' in POLICY
assert 'absence is never evidence of No' in AI or 'absence is never evidence of No'.lower() in AI.lower()
assert 'CURRENT (existing eBay value; context only, NEVER evidence)' in AI
assert 'sellerContextSupportsCandidate' in AI
assert 'shoe sizes require readable product/size-tag evidence' in AI

# Image evidence coverage: high-resolution current photos and bounded strict repair set.
assert 'return 6;' in SNAPSHOT and 'return 8;' in SNAPSHOT, 'Balanced/Quality photo caps must be 6/8'
assert '$_12.' in SNAPSHOT, 'legacy eBay thumbnails must be upgraded for label readability'
assert 'Math.min(Number(limit || 3), 5)' in SNAPSHOT, 'repair selector keeps a hard safety ceiling while normal strict recovery is capped lower by the AI pipeline'
assert 'analysisPhotoPolicyVersion: "3"' in CONFIG
assert 'ebayAiSharedAnalysisCacheV8193' in PHOTO, 'analysis cache namespace must remain isolated from older releases'
assert 'root-accuracy-v8.23.0' in PHOTO
assert 'currentState' in PHOTO, 'cache identity must include current field state so manual corrections invalidate stale answers'

# One primary request plus at most one evidence-gated strict verification/recovery request.
assert 'smartStrictVerificationPlan' in AI
assert 'mergeStrictVerification' in AI
assert 'Independent strict verification' in AI
assert 'requests = 2; fastRepairUsed = true' in AI
assert 'verificationLimit = 8' in AI
assert 'settings.tokenMode === "quality" ? 3 : 2' in AI
assert 'fastRepairSkippedNoEvidence' in AI, 'pure missing strict fields without direct evidence must not trigger speculative paid repair'
assert 'answered && hasStrongDirectPrimarySupport(question)' in AI, 'validated direct primary support must be allowed to stay single-pass'

# Completion waits for value stability, not a transient Saved label.
assert 'fieldValueSignature' in SNAPSHOT
assert 'fieldValueMap' in SNAPSHOT
assert 'stableWindowMs = 1800' in CONTENT
assert 'unexpectedChanges' in CONTENT
assert 'unrequested Item Specific field(s)' in CONTENT

# Final status must never turn an intermediate request-complete event into "0 answers".
assert 'event.final === true' in BACKGROUND
assert 'event.final === true) live.answered' in BACKGROUND
assert 'final: true' in PHOTO
assert 'Primary GPT request finished; validating accepted answers' in BACKGROUND

# Schema V3 remains the Fill contract.
assert 'fill_response_schema_version: { type: "integer", enum: [3] }' in AI
assert 'aiResponseSchemaVersion: 3' in AI

print('PASS V8.23.21 root-cause evidence accuracy: generic strict policy, evidence-gated verification, cache safety, photo evidence, and final-state stability')
