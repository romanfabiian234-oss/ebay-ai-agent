#!/bin/bash
set -euo pipefail
LABEL="com.fabiian.ebay-listing-filler.backend"
if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 && /usr/sbin/lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "V8.23.7 background backend is running on port 8790."
elif launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
  echo "V8.23.7 service is loaded, but port 8790 is not listening. Open backend logs."
else
  echo "V8.23.7 background backend is not loaded."
fi
printf '\nPress Return to close...'
read -r _
