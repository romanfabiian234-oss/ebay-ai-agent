#!/usr/bin/env python3
from pathlib import Path
import importlib.util, json, sys
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
EXT=ROOT/'Extension'; BACK=ROOT/'Backend'
manifest=json.loads((EXT/'manifest.json').read_text())
bg=(EXT/'background.js').read_text()
start=(ROOT/'START.command').read_text()
server=(BACK/'server.py').read_text()
keychain=(BACK/'keychain.py').read_text()

assert 'nativeMessaging' in manifest.get('permissions',[])
assert all('127.0.0.1:8790' not in p for p in manifest.get('host_permissions',[]))
assert 'chrome.runtime.connectNative(NATIVE_BACKEND_V8180.hostName)' in bg
assert 'com.fabiian.ebay_ai_agent' in bg
assert 'hub-bootstrap.json' not in bg
assert 'ebayFillerV638BackendPairingCode' not in bg or 'remove?.(["ebayFillerV638BackendPairingCode"' in bg
assert 'LOCAL_NATIVE_BACKEND_STATUS_V8180' in bg
assert 'NativeMessagingHosts' in start and 'allowed_origins' in start
assert 'jemamkjcijdmmmgknhejdmceachdildh' in start
assert '--ensure-native-credential' in start
assert '--show-pairing-code' not in start
assert 'hub-bootstrap.json' in start and 'rm -f "$EXTENSION_DIR/hub-bootstrap.json"' in start
assert 'self.pairing_keychain.get' in server and 'self.pairing_keychain.set' in server
assert 'PAIRING_FALLBACK_PATH.unlink()' in server
assert 'SecItemCopyMatching' in keychain and 'SecItemAdd' in keychain and 'SecItemUpdate' in keychain
assert 'kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly' in keychain
assert 'kSecUseDataProtectionKeychain' in keychain

spec=importlib.util.spec_from_file_location('native_host', BACK/'native_host.py')
host=importlib.util.module_from_spec(spec); spec.loader.exec_module(host)
assert host.EXPECTED_EXTENSION_ORIGIN == 'chrome-extension://jemamkjcijdmmmgknhejdmceachdildh/'

class FakeResponse:
    status=200
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self,n=-1): return b'{"ok":true,"keyStored":true}'

captured={}
def fake_open(req, timeout=None):
    captured['url']=req.full_url
    captured['headers']=dict(req.header_items())
    captured['timeout']=timeout
    return FakeResponse()

with mock.patch.object(host, '_load_internal_pairing', return_value='INTERNAL_TEST_ONLY'), \
     mock.patch.object(host.urllib.request, 'urlopen', side_effect=fake_open):
    result=host._backend_request({'type':'backend_request','method':'GET','path':'/v1/ai/status','payload':{},'timeoutMs':5000,'maximumChars':10000})
assert result['ok'] is True and result['data']['keyStored'] is True
assert captured['url']=='http://127.0.0.1:8790/v1/ai/status'
assert captured['headers'].get('X-listing-filler-pairing')=='INTERNAL_TEST_ONLY'
try:
    host._validate_request({'type':'backend_request','method':'POST','path':'/danger','payload':{}})
    raise AssertionError('invalid route accepted')
except RuntimeError:
    pass
print('PASS V8.23.21 Native Messaging: exact extension origin, allowlisted host, no Chrome pairing secret, modern device-only Keychain boundary')
