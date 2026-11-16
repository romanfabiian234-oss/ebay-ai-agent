# PATCH NOTES — V8.23.17

Problem 2.5 regional Size/OCR follow-up from the real Adrianna Papell browser test. Required `Size` stayed blank although the physical label contained a regional size table. The generic parser intentionally rejected multiple numeric candidates because it could not safely distinguish US from UK/EU rows.

Main changes:
- Added a deterministic regional physical-label parser with explicit region aliases and row pairing.
- Generic eBay `Size` uses only an explicitly printed US/USA row. No UK/EU/AU → US conversion is performed.
- Split OCR blocks must satisfy geometry/table-context checks; weak blocks cannot inherit confidence from a stronger partner.
- Conflicting duplicate US values remain blocked.
- A strong locally confirmed US Size can keep the one-GPT path and defer exact validation to the live eBay dropdown when the compact option list is explicitly incomplete.
- Added regional size headers to local macOS Vision OCR custom words.
- The agent's own debug export now records validated canonical high-resolution eBay image URLs so OCR misses can be reproduced without thumbnail-only evidence. Local data URLs, non-eBay URLs and secrets are not promoted.
- The separate external `5.0.0-diagnostic` collector is not part of this repository and is unchanged.

Safety/cost boundaries unchanged:
- GPT model and Cheap/Balanced/Quality paid-photo caps unchanged.
- OCR confidence requirements are not globally lowered.
- GPT↔OCR conflicts remain Review/repair-safe.
- Fill Engine remains the only final live option setter/verifier.
- protected fields, Queue and manual publishing boundary unchanged.
