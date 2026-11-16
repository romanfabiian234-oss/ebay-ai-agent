from __future__ import annotations
import builtins, contextlib, importlib.util, io, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BACK=ROOT/'Backend/server.py'
spec=importlib.util.spec_from_file_location('backend817',BACK)
mod=importlib.util.module_from_spec(spec); assert spec and spec.loader; spec.loader.exec_module(mod)

class FakeKeychain:
    def __init__(self): self.data={}
    def get(self,s,a): return self.data.get((s,a),'')
    def set(self,s,a,v): self.data[(s,a)]=str(v)
    def delete(self,s,a): self.data.pop((s,a),None)

class FakeTTY(io.StringIO):
    def isatty(self): return True

def run_setup(inputs, secrets):
    input_iter=iter(inputs); secret_iter=iter(secrets)
    old_input=builtins.input; old_getpass=mod.getpass.getpass; old_stdin=mod.sys.stdin
    builtins.input=lambda prompt='': next(input_iter)
    mod.getpass.getpass=lambda prompt='': next(secret_iter)
    mod.sys.stdin=FakeTTY()
    out=io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            rc=mod.configure_agent_terminal()
    finally:
        builtins.input=old_input; mod.getpass.getpass=old_getpass; mod.sys.stdin=old_stdin
    return rc,out.getvalue()

with tempfile.TemporaryDirectory() as td:
    app=Path(td)/'app'
    mod.APP_SUPPORT_DIR=app
    mod.PROFILE_PATH=app/'ebay-api-profile.json'
    mod.SETUP_PROFILE_PATH=app/'agent-setup-profile.json'
    mod.SETUP_COMPLETE_PATH=app/'.setup-complete'
    mod.PAIRING_FALLBACK_PATH=app/'.local-pairing-secret'
    fake=FakeKeychain(); mod.PERSISTENCE=mod.PersistentEbayProfile(keychain=fake, pairing_keychain=FakeKeychain())

    # Keep all defaults, disable optional Claude/eBay configuration, and save a GPT key.
    rc,out=run_setup(['','','','','','','n','n'], ['TEST_ONLY_GPT_SECRET_12345678901234567890'])
    assert rc==0
    assert mod.SETUP_COMPLETE_PATH.is_file()
    assert mod.SETUP_PROFILE_PATH.is_file()
    saved=mod.SETUP_PROFILE_PATH.read_text()
    assert 'TEST_ONLY_GPT_SECRET' not in saved
    assert fake.get(mod.AI_KEYCHAIN_SERVICE,mod.AI_KEYCHAIN_ACCOUNT).startswith('TEST_ONLY_GPT_SECRET')
    assert 'Setup complete' in out

    # Repeat setup: blank secret input must preserve the existing Keychain value.
    rc2,out2=run_setup(['','','','','','','n','n'], [''])
    assert rc2==0
    assert fake.get(mod.AI_KEYCHAIN_SERVICE,mod.AI_KEYCHAIN_ACCOUNT).startswith('TEST_ONLY_GPT_SECRET')
    assert 'Setup complete' in out2

print('PASS V8.23.21 interactive Terminal setup stores secrets only through Keychain and blank repeat input preserves saved secrets')
