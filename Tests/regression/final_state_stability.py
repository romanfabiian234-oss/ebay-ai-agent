#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
CONTENT = (ROOT / "Extension/content.js").read_text()
SNAPSHOT = (ROOT / "Extension/core/snapshot.js").read_text()

assert "function fieldValueSignature" in SNAPSHOT
assert "fieldValueSignature," in SNAPSHOT
assert "stableWindowMs = 1800" in CONTENT
assert "pageFields?.fieldValueSignature?.()" in CONTENT
assert "valueChangesObserved" in CONTENT
assert "Item Specifics remained stable" in CONTENT
assert 'if (last.positive) return { ok: true' not in CONTENT, "Saved text alone must not end the final verification immediately"
assert "did not remain stable long enough" in CONTENT
print("PASS V8.23.21 final-state guard: completion requires a bounded stable Item Specifics state, not only a Saved label")
