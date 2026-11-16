# 8.23.25 — installation and reproducibility

- Backend and START read the manifest version, including after installation.
- Install the Core Image preprocessing helper used by local OCR.
- Use one documented installed Chrome extension path for setup and updates.
- Discover all autonomous tests, isolate both Keychain dependencies, and use Playwright-managed Chromium across test platforms.
- Add full CI, deterministic source ZIPs, file hashes and source commit receipts.
- Add MIT license and user installation, troubleshooting and acceptance instructions.

Existing settings and Keychain secrets are retained by the installer. Rerun START from the new source, reload the installed extension in Chrome, and refresh marketplace tabs. These checks do not certify live AI accuracy or all marketplace layouts.
