#!/bin/bash
set -euo pipefail
LABEL="com.fabiian.ebay-listing-filler.backend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [[ ! -f "$PLIST" ]]; then echo "V8.23.7 background service is not installed."; exit 1; fi
launchctl bootstrap "gui/$UID" "$PLIST" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/$UID/$LABEL"
echo "V8.23.7 backend started."
