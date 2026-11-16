# PATCH NOTES — V8.23.11

## Problem

After the V8.23.10 UI/container refactor, production still contained old functions, state, message handlers and mutually-referencing legacy clusters that no active entrypoint could reach. These paths increased maintenance cost and made it harder to prove which Fill/Queue/Helper implementation was authoritative.

## Root cause

Earlier refactors replaced working paths incrementally but intentionally left compatibility/fallback implementations behind. Some senderless message handlers kept otherwise unreachable subsystems connected in the static call graph, and several tests still asserted the existence of obsolete implementation symbols instead of the active behavior contract.

## Fix

- Removed functions and simple state declarations proven unused by conservative production-reference analysis.
- Removed senderless legacy message routes and their handlers/constants.
- Removed unreachable function clusters from the historical eBay Helper after proving they had no path from active runtime/message entrypoints.
- Removed stale comments/state left behind by deleted Queue/Fill/Preview paths.
- Updated obsolete tests to validate the active behavior/ownership contract instead of requiring dead symbols.
- Added `Tests/regression/dead_code_cleanup.py` to reject removed legacy routes and obvious unreferenced named production declarations.

## Intentionally unchanged

AI/OCR reasoning policy, shared Fill Engine behavior, protected fields, Queue per-item semantics, Show More readiness, API cost accounting, marketplace photo-upload mechanics and the manual publishing boundary.
