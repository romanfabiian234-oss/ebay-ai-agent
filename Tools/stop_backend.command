#!/bin/bash
set -euo pipefail
LABEL="com.fabiian.ebay-listing-filler.backend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID" "$PLIST" >/dev/null 2>&1 || true
/usr/bin/pkill -f "$HOME/Library/Application Support/eBay AI Listing Filler/backend/server.py" >/dev/null 2>&1 || true
echo "V8.23.7 backend stopped. It can be started again with start_backend.command."
