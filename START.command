#!/bin/bash
set -euo pipefail

LABEL="com.fabiian.ebay-listing-filler.backend"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_SOURCE="$PACKAGE_DIR/Backend/server.py"
OCR_HELPER_SOURCE="$PACKAGE_DIR/Backend/ocr.js"
NATIVE_HOST_SOURCE="$PACKAGE_DIR/Backend/native_host.py"
KEYCHAIN_SOURCE="$PACKAGE_DIR/Backend/keychain.py"
EXTENSION_SOURCE="$PACKAGE_DIR/Extension"
APP_ROOT="$HOME/Library/Application Support/eBay AI Listing Filler"
BACKEND_DIR="$APP_ROOT/backend"
EXTENSION_DIR="$APP_ROOT/Extension"
SETUP_COMPLETE_PATH="$APP_ROOT/.setup-complete"
OLD_SETUP_APP="$HOME/Applications/eBay AI Agent Setup.app"
LOG_DIR="$HOME/Library/Logs/eBay AI Listing Filler"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
NATIVE_HOST_NAME="com.fabiian.ebay_ai_agent"
EXTENSION_ID="jemamkjcijdmmmgknhejdmceachdildh"
NATIVE_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
NATIVE_MANIFEST_PATH="$NATIVE_MANIFEST_DIR/$NATIVE_HOST_NAME.json"
NATIVE_WRAPPER_PATH="$BACKEND_DIR/native_host.command"
FORCE_SETUP=0

case "${1:-}" in
  "") ;;
  --setup) FORCE_SETUP=1 ;;
  --help|-h)
    echo "Usage: START.command [--setup]"
    echo "  no option  Install/update and start with saved settings."
    echo "  --setup    Reopen the secure Terminal settings flow."
    exit 0
    ;;
  *)
    echo "Unknown option: ${1:-}"
    echo "Use: START.command --help"
    exit 2
    ;;
esac

find_python3() {
  local candidate current
  local -a candidates=(
    "/opt/homebrew/bin/python3"
    "/usr/local/bin/python3"
    "/Library/Frameworks/Python.framework/Versions/Current/bin/python3"
  )
  current="$(command -v python3 2>/dev/null || true)"
  [[ -n "$current" ]] && candidates+=("$current")
  candidates+=("/usr/bin/python3")
  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    if [[ "$candidate" == "/usr/bin/python3" ]] && ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
      continue
    fi
    if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only."
  exit 1
fi

PYTHON_BIN="$(find_python3 || true)"
if [[ -z "$PYTHON_BIN" || ! -x "$PYTHON_BIN" ]]; then
  if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
    echo "Python 3 is not ready on this Mac."
    echo "If macOS is downloading Apple Command Line Tools, wait for it to finish and run START.command again."
  else
    echo "A usable Python 3.9+ was not found. Install Python 3, then run START.command again."
  fi
  exit 1
fi

for required in "$BACKEND_SOURCE" "$OCR_HELPER_SOURCE" "$NATIVE_HOST_SOURCE" "$KEYCHAIN_SOURCE" "$EXTENSION_SOURCE/manifest.json"; do
  if [[ ! -e "$required" ]]; then
    echo "Required project file is missing: $required"
    exit 1
  fi
done
if [[ ! -x "/usr/bin/osascript" ]]; then
  echo "macOS osascript is unavailable, so local Vision OCR cannot be installed."
  exit 1
fi

echo "eBay AI Agent V8.23.7"
echo "START.command is the only installer/start/setup entry point."
echo

mkdir -p "$BACKEND_DIR" "$EXTENSION_DIR" "$LOG_DIR" "$PLIST_DIR" "$NATIVE_MANIFEST_DIR"
chmod 700 "$APP_ROOT" "$BACKEND_DIR" "$LOG_DIR" "$NATIVE_MANIFEST_DIR"

# Remove the old GUI Setup app from V8.16 and earlier. It is no longer needed
# and must not remain running in the background.
/usr/bin/pkill -f "$OLD_SETUP_APP/Contents/MacOS/eBay AI Agent Setup" >/dev/null 2>&1 || true
if [[ -d "$OLD_SETUP_APP" ]]; then
  /bin/rm -rf "$OLD_SETUP_APP"
fi

# Stop the old launchd service before replacing Backend/Extension files.
launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID" "$PLIST_PATH" >/dev/null 2>&1 || true
/usr/bin/pkill -f "$BACKEND_DIR/server.py" >/dev/null 2>&1 || true

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if ! /usr/sbin/lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then break; fi
  sleep 0.25
done
if /usr/sbin/lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8790 is still in use. Stop the older backend and run START.command again."
  exit 1
fi

/usr/bin/rsync -a --delete "$EXTENSION_SOURCE/" "$EXTENSION_DIR/"
cp "$BACKEND_SOURCE" "$BACKEND_DIR/server.py"
cp "$OCR_HELPER_SOURCE" "$BACKEND_DIR/ocr.js"
cp "$NATIVE_HOST_SOURCE" "$BACKEND_DIR/native_host.py"
cp "$KEYCHAIN_SOURCE" "$BACKEND_DIR/keychain.py"
chmod 600 "$BACKEND_DIR/server.py" "$BACKEND_DIR/keychain.py"
chmod 700 "$BACKEND_DIR/ocr.js" "$BACKEND_DIR/native_host.py"
rm -f "$EXTENSION_DIR/hub-bootstrap.json"

# Validate the exact Backend that is about to be installed.
COMPILE_OUTPUT="$("$PYTHON_BIN" -m py_compile "$BACKEND_DIR/server.py" 2>&1)" || {
  echo "Backend Python check failed using: $PYTHON_BIN"
  printf '%s\n' "$COMPILE_OUTPUT" | /usr/bin/tail -n 12
  exit 1
}

# Setup is persistent across patch/minor updates. Existing .setup-complete means
# normal settings already live in Application Support and secrets remain in
# macOS Keychain. --setup is the only way to force the secure Terminal flow.
if [[ "$FORCE_SETUP" -eq 1 || ! -f "$SETUP_COMPLETE_PATH" ]]; then
  echo "FIRST SETUP — values are entered in Terminal."
  echo "Secret input is hidden. Secrets are saved only in macOS Keychain."
  echo "Press Enter on an already-saved secret to keep it."
  echo
  if ! "$PYTHON_BIN" "$BACKEND_DIR/server.py" --setup-terminal; then
    echo
    echo "Setup did not complete. No Backend service was started."
    exit 1
  fi
  if [[ ! -f "$SETUP_COMPLETE_PATH" ]]; then
    echo "Setup did not create the secure completion marker."
    exit 1
  fi
else
  echo "Saved setup found ✓"
  echo "Settings: Application Support"
  echo "Secrets:  macOS Keychain"
fi

# V8.23.7 secure local bridge. The internal Backend credential stays only in
# macOS Keychain. Chrome never receives or stores it.
if ! "$PYTHON_BIN" "$BACKEND_DIR/server.py" --ensure-native-credential >/dev/null; then
  echo "The secure Native Backend credential could not be prepared in macOS Keychain."
  exit 1
fi

# Install one user-level Chrome Native Messaging host. Chrome permits only the
# fixed Extension ID from manifest.json; wildcards are not used.
"$PYTHON_BIN" - "$NATIVE_WRAPPER_PATH" "$NATIVE_MANIFEST_PATH" "$PYTHON_BIN" "$BACKEND_DIR/native_host.py" "$NATIVE_HOST_NAME" "$EXTENSION_ID" <<'NATIVE_INSTALL_PY'
import json, os, pathlib, shlex, sys
wrapper = pathlib.Path(sys.argv[1])
manifest = pathlib.Path(sys.argv[2])
python_bin = sys.argv[3]
host_py = sys.argv[4]
host_name = sys.argv[5]
extension_id = sys.argv[6]
wrapper.parent.mkdir(parents=True, exist_ok=True)
manifest.parent.mkdir(parents=True, exist_ok=True)
wrapper_text = "#!/bin/bash\nexec " + shlex.quote(python_bin) + " " + shlex.quote(host_py) + " \"$@\"\n"
wrapper.write_text(wrapper_text, encoding="utf-8")
os.chmod(wrapper, 0o700)
payload = {
    "name": host_name,
    "description": "eBay AI Agent secure local Native Messaging bridge",
    "path": str(wrapper),
    "type": "stdio",
    "allowed_origins": [f"chrome-extension://{extension_id}/"],
}
temporary = manifest.with_suffix(".tmp")
with open(temporary, "w", encoding="utf-8") as handle:
    os.chmod(temporary, 0o600)
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
    handle.flush()
    os.fsync(handle.fileno())
os.replace(temporary, manifest)
os.chmod(manifest, 0o600)
NATIVE_INSTALL_PY

# launchd starts Backend after login and restarts it only after a failure.
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$PYTHON_BIN</string><string>$BACKEND_DIR/server.py</string><string>--service</string></array>
  <key>WorkingDirectory</key><string>$BACKEND_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/backend.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/backend-error.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST
chmod 600 "$PLIST_PATH"
/usr/bin/plutil -lint "$PLIST_PATH" >/dev/null

launchctl bootstrap "gui/$UID" "$PLIST_PATH"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40; do
  if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 &&
     /usr/sbin/lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 ||
   ! /usr/sbin/lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Backend did not start on port 8790. Open Tools/open_backend_logs.command."
  exit 1
fi

if ! /usr/bin/grep -q 'PROTOCOL_VERSION = "6.9.0"' "$BACKEND_DIR/server.py"; then
  echo "Installed Backend is not compatible with protocol 6.9.0."
  exit 1
fi

echo
echo "Backend      ✓ Running"
echo "Configuration ✓ Saved"
echo "Extension     ✓ Installed"
echo "Native Host   ✓ Installed"
echo
echo "Chrome extension folder:"
echo "$EXTENSION_DIR"
/usr/bin/open "$EXTENSION_DIR" >/dev/null 2>&1 || true
/usr/bin/open "chrome://extensions" >/dev/null 2>&1 || true
echo
echo "First Chrome install only: Load unpacked → choose the opened Extension folder."
echo "Later updates: press Reload. START.command reuses the saved configuration automatically."
echo "To change settings later: run START.command --setup or Tools/settings.command."
printf '\nPress Return to close...'
read -r _
