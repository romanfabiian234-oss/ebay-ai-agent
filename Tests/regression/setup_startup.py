from pathlib import Path
import re, subprocess
ROOT=Path(__file__).resolve().parents[2]
BACK=ROOT/'Backend/server.py'
START=ROOT/'START.command'
server=BACK.read_text()
start=START.read_text()

# V8.23.21 has no packaged GUI setup application. START delegates secret input
# to the foreground Backend CLI; Backend uses hidden getpass input.
assert not (ROOT/'Apps').exists(), 'Apps layer must not ship in V8.23.21'
assert '--setup-terminal' in server
assert 'def configure_agent_terminal()' in server
assert 'getpass.getpass' in server
assert '_write_setup_complete_marker()' in server
assert 'save_agent_setup_profile' in server
assert 'save_ai_api_key_payload' in server
assert 'save_claude_api_key_payload' in server
assert 'save_client_secret_payload' in server
assert 'sys.stdin.isatty()' in server

# START never reads a secret itself and never opens Setup.app.
assert '"$BACKEND_DIR/server.py" --setup-terminal' in start
assert '/usr/bin/open "$SETUP_APP"' not in start
assert 'SETUP_SOURCE=' not in start
assert 'read -s' not in start
for forbidden in ['GPT_API_KEY=', 'OPENAI_API_KEY=', 'CLAUDE_API_KEY=', 'CLIENT_SECRET=', 'sk-proj-', 'sk-ant-']:
    assert forbidden not in start, forbidden

# Old GUI is explicitly cleaned up so it cannot keep consuming CPU.
assert 'OLD_SETUP_APP="$HOME/Applications/eBay AI Agent Setup.app"' in start
assert '/usr/bin/pkill -f "$OLD_SETUP_APP/Contents/MacOS/eBay AI Agent Setup"' in start
assert '/bin/rm -rf "$OLD_SETUP_APP"' in start

r=subprocess.run(['bash','-n',str(START)],capture_output=True,text=True)
assert r.returncode==0, r.stderr
r=subprocess.run(['python3','-m','py_compile',str(BACK)],capture_output=True,text=True)
assert r.returncode==0, r.stderr
print('PASS V8.23.21 Terminal setup replaces persistent Setup.app and keeps secret collection inside foreground Backend getpass')
