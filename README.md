# eBay AI Agent — v8.23.24

Chrome extension and local macOS backend for preparing and filling eBay listing details, with optional photo transfer workflows for Poshmark and Depop.

## Download and install

Download the release archive from [releases/ebay-ai-agent-v8.23.24-AI-Queue-Hidden.zip](releases/ebay-ai-agent-v8.23.24-AI-Queue-Hidden.zip), unzip it, then open `START.command` on macOS. See `START_HERE.txt` and `Docs/README.md` inside the archive for setup.

The Chrome extension is located in `Extension/`; use **chrome://extensions → Developer mode → Load unpacked** to load that directory. The native backend and messaging host are set up by `START.command`.

## Notes

- Version: **8.23.24** (AI Queue hidden by default).
- Secrets are meant to stay in the user's macOS Keychain, not this repository.
- Review all AI-filled listing details before publishing. The tool does not remove the need for human verification.
- This release archive also includes backend, tests, and documentation.
