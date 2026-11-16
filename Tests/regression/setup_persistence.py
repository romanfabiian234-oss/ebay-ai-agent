from __future__ import annotations
import contextlib,importlib.util,io,json,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; BACK=ROOT/'Backend/server.py'
spec=importlib.util.spec_from_file_location('backend816',BACK); mod=importlib.util.module_from_spec(spec); assert spec and spec.loader; spec.loader.exec_module(mod)
class FakeKeychain:
    def __init__(self): self.data={}
    def get(self,s,a): return self.data.get((s,a),'')
    def set(self,s,a,v): self.data[(s,a)]=str(v)
    def delete(self,s,a): self.data.pop((s,a),None)
with tempfile.TemporaryDirectory() as td:
    app=Path(td)/'app'; mod.APP_SUPPORT_DIR=app; mod.PROFILE_PATH=app/'ebay-api-profile.json'; mod.SETUP_PROFILE_PATH=app/'agent-setup-profile.json'; mod.SETUP_COMPLETE_PATH=app/'.setup-complete'; mod.PAIRING_FALLBACK_PATH=app/'.local-pairing-secret'; fake=FakeKeychain(); mod.PERSISTENCE=mod.PersistentEbayProfile(keychain=fake)
    payload={'settings':{'workflowMode':'hybrid','apiPreset':'custom','apiEnabled':True,'apiMode':'openai-compatible','apiBaseUrl':'https://api.openai.com','apiPath':'/v1/responses','apiModel':'gpt-5.6','authHeader':'Authorization','authPrefix':'Bearer','customHeaders':'','saveApiKey':True,'claudeReviewEnabled':False,'claudeModel':'claude-sonnet-5','panelSizeMode':'custom','panelCustomWidth':'510','panelCustomHeight':'730','tokenMode':'balanced','maxPhotosPerRequest':'5'},'apiKey':'TEST_ONLY_GPT_SECRET_1234567890','claudeApiKey':'TEST_ONLY_CLAUDE_SECRET_1234567890','ebay':{'environment':'production','clientId':'test-client','runame':'test-runame'},'ebayClientSecret':'TEST_ONLY_EBAY_SECRET_1234567890'}
    old=sys.stdin; sys.stdin=io.StringIO(json.dumps(payload)); out=io.StringIO()
    try:
        with contextlib.redirect_stdout(out): rc=mod.configure_agent_from_stdin()
    finally: sys.stdin=old
    assert rc==0; status=json.loads(out.getvalue().strip().splitlines()[-1]); assert status['profileConfigured'] and status['aiKeyStored'] and status['ebaySecretStored']
    saved=mod.SETUP_PROFILE_PATH.read_text(); saved_json=json.loads(saved)
    assert saved_json['settings']['panelSizeMode']=='custom' and saved_json['settings']['panelCustomWidth']=='510' and saved_json['settings']['panelCustomHeight']=='730'
    for secret in ['TEST_ONLY_GPT_SECRET','TEST_ONLY_CLAUDE_SECRET','TEST_ONLY_EBAY_SECRET']: assert secret not in saved
print('PASS V8.23.21 Setup keeps secrets out of profile JSON and stores them through Keychain boundary')
