# V8.18.0 migration

V8.18.0 replaces the old Extension pairing/bootstrap path with Chrome Native Messaging.

If V8.17.x is already configured:
1. Run the new START.command once.
2. Do not re-enter GPT/Claude settings or API keys; the existing Application Support profile and Keychain secrets are reused.
3. START migrates the old internal `.local-pairing-secret` into the macOS data-protection Keychain and removes the file.
4. START installs the Chrome Native Messaging host for the fixed extension ID.
5. In chrome://extensions press Reload for the installed Extension.

The Extension no longer stores or imports a pairing code and no longer needs localhost host permission.
