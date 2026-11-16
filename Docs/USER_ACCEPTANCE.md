# Manual acceptance before distributing a build

Record the commit SHA, macOS version/architecture, Chrome version and displayed extension/backend version. Automated fixtures do not replace these checks. Use a dedicated test draft and your own authorized accounts. Keep secrets and private listing data out of reports.

- On a second Mac or clean macOS user, install using only the root README. Verify missing-Python instructions if Python is absent.
- Confirm the installed Application Support extension is the one loaded in Chrome and the backend/native connection works.
- Complete setup, quit/restart Chrome, and log out/in. Confirm settings remain and the local service reconnects.
- Analyze one draft; review facts against photos; fill allowed fields and verify the live page values. Confirm protected fields and publishing remain under user control.
- Try absent/invalid API credentials, network loss, missing photos and an unsupported live option. Expect a clear error or Review, not invented success.
- Exercise stop/cancel and explicit retry. Check provider usage separately; verify the ledger does not claim a guaranteed per-item price.
- Update an installed older version. Rerun START, reload Chrome's installed extension, refresh the draft and check both versions agree. Confirm saved settings/keys remain.
- Remove the service and extension using the README; verify the backend stops and Chrome no longer invokes it. Confirm the documented retention of settings/keys.

For Depop/Poshmark/Vinted workflows, record separate results per destination and photo count; do not infer support from an eBay-only run. Resolve any failure before representing that workflow as validated for users.
