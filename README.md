# eBay AI Agent

A Chrome extension with a local **macOS** backend for reviewing photos and filling listing details. It assists a seller; review every result and publish manually. Windows/Linux installation is not supported.

## Requirements

- A Mac with Python **3.9+** and Google Chrome. Install Python from [python.org](https://www.python.org/downloads/macos/) if it is missing.
- A key for your selected AI API provider and that provider's API billing. A chat subscription alone does not supply an API key. Optional eBay API/OAuth features require your own eBay developer credentials.
- Internet access for marketplace pages and cloud analysis. API costs depend on your provider and usage; the per-item budget target is not a price guarantee.

## Install from source

1. Select **Code → Download ZIP** on this repository and unzip into a folder you can keep for updates. Use source from the branch/version you intend to test. The old archive in `releases/` is a historical snapshot, not the current source distribution.
2. Open Terminal in the unzipped folder and run `bash START.command`.
3. The first run asks for configuration in Terminal. Secret input is hidden; it is normal that typing a key shows no characters. Keys stay in your Mac's Keychain. Do not paste them into an issue or screenshot.
4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, press **Cmd+Shift+G**, then enter exactly:

   ```text
   ~/Library/Application Support/eBay AI Listing Filler/Extension
   ```

   Load this **installed** folder, not the `Extension` folder in the downloaded ZIP. There should be only one active copy of this extension.
5. Open or refresh an eBay draft, click the extension toolbar icon to open its Control Panel, and check the local connection/settings before starting analysis.
6. Start with one draft. Review the extracted facts, run the intended fill action, and compare the filled values with the photos and listing. Publish manually only after your review.

`START.command` copies the backend and extension to Application Support, registers a Chrome Native Messaging host, and starts a per-user background service through a LaunchAgent. It does not require administrator installation. Runtime API keys are not sent through Chrome storage. AI analysis sends the selected evidence to the configured provider.

## Daily use and updates

- The installed backend runs as a per-user service. Run `bash START.command` to install/start again if needed.
- To change provider settings or keys: `bash START.command --setup` or `bash Tools/settings.command`.
- Before replacing the source folder, finish or stop the current operation. Download the updated source and run its `START.command` again. Then press **Reload** for the installed extension in `chrome://extensions` and refresh marketplace tabs.
- Existing settings and Keychain secrets are preserved. The version in `Extension/manifest.json` is the source of truth for both the backend and installer.

## Troubleshooting

| Symptom | Action |
|---|---|
| Python is missing | Install Python 3.9+; reopen Terminal and rerun START. The script prints the failing prerequisite. |
| Native host / backend unavailable | Run START again; confirm you loaded the installed folder above and only one copy is enabled. Check logs in `~/Library/Logs/eBay AI Listing Filler`. Remove secrets and private listing information before sharing logs. |
| Port 8790 is busy | Stop the previous backend or the identified conflicting application; START reports this instead of silently choosing a different port. |
| Extension updated / context invalidated | Reload the extension, then refresh each marketplace tab. |
| AI authentication or billing error | Check your selected endpoint, model, key and provider API billing. Use any connection test explicitly; it may contact the provider. |
| A field stays blank / Review | Evidence or an exact live option could not be confirmed. Correct it manually rather than treating a refusal as a successful fill. |

## Supported scope and removal

eBay Item Specifics is the primary fill workflow. Depop/Poshmark adapters also support selected listing workflows; Vinted is a photo destination, not a complete Smart Fill integration. Marketplace page changes can require adapter updates. The extension never auto-publishes or pays. Important eBay fields such as price, shipping, title and description remain protected.

To remove the service, run `bash Tools/uninstall_backend.command`, then remove the extension in `chrome://extensions`. Settings and Keychain secrets are preserved by that command. For complete removal, delete the application folder and logs in Finder after removing the extension, and remove this application's saved credentials using Keychain Access. Keep anything you need for reinstalling before deleting it.

## Checks and source distributions

Node.js 24 and Python 3.12 are used in CI. No API key or live seller account is needed for the checks:

```sh
python3 -B Tests/run_tests.py
```

For browser tests, use a virtual environment, install the pinned dependencies and browser, then run the full suite:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
npm ci
.venv/bin/python -m playwright install chromium
.venv/bin/python -B Tests/run_tests.py --browser
```

On Linux, Playwright may require system packages: use `python -m playwright install --with-deps chromium` in your test environment. Tests use local fixtures and mocked services; they do not establish live AI accuracy or marketplace compatibility.

After checks pass, `python3 Tools/build_release.py --source-sha COMMIT_SHA` produces a ZIP and SHA-256 file in `dist/`. Use a full 40-character source commit. `BUILD.json` records the source SHA and hashes of packaged files. GitHub Actions produces the same artifacts after its offline and browser jobs pass. See [manual acceptance checks](Docs/USER_ACCEPTANCE.md) before calling a build ready for users.

## License

[MIT](LICENSE), copyright romanfabiian234-oss. Marketplace and AI services have their own terms and billing.
