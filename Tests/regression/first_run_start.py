from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[2]
start=(ROOT/'START.command').read_text()
settings=(ROOT/'Tools/settings.command').read_text()

for token in [
    'SETUP_COMPLETE_PATH="$APP_ROOT/.setup-complete"',
    'if [[ "$FORCE_SETUP" -eq 1 || ! -f "$SETUP_COMPLETE_PATH" ]]',
    '"$PYTHON_BIN" "$BACKEND_DIR/server.py" --setup-terminal',
    'Saved setup found ✓',
    'Settings: Application Support',
    'Secrets:  macOS Keychain',
]:
    assert token in start, token

# One first-run/forced setup invocation only; later starts skip the prompt.
assert start.count('"$PYTHON_BIN" "$BACKEND_DIR/server.py" --setup-terminal') == 1
assert 'exec "$PACKAGE_DIR/START.command" --setup' in settings

# START does not own secret values.
for forbidden in ['read -s', 'GPT_API_KEY=', 'OPENAI_API_KEY=', 'CLAUDE_API_KEY=', 'CLIENT_SECRET=', 'apiKey":', 'ebayClientSecret']:
    assert forbidden not in start, forbidden

for script in [ROOT/'START.command', ROOT/'Tools/settings.command']:
    r=subprocess.run(['bash','-n',str(script)],capture_output=True,text=True)
    assert r.returncode==0, r.stderr
print('PASS V8.23.21 START asks once through Backend Terminal setup, later reuses saved state, and settings.command safely reopens setup')
