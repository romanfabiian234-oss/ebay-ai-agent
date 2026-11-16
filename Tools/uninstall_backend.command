#!/bin/bash
set -euo pipefail
LABEL="com.fabiian.ebay-listing-filler.backend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BACKEND_DIR="$HOME/Library/Application Support/eBay AI Listing Filler/backend"
NATIVE_HOST_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.fabiian.ebay_ai_agent.json"
launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID" "$PLIST" >/dev/null 2>&1 || true
/usr/bin/pkill -f "$BACKEND_DIR/server.py" >/dev/null 2>&1 || true
rm -f "$PLIST" "$NATIVE_HOST_MANIFEST"
rm -rf "$BACKEND_DIR"
echo "V8.23.7 background service removed."
echo "Your saved settings and Keychain secrets were preserved for future versions."
