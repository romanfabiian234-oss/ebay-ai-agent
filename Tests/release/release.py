from pathlib import Path
import json,re,subprocess,hashlib,sys
ROOT=Path(__file__).resolve().parents[2]
EXT=ROOT/'Extension'; BACK=ROOT/'Backend'

def req(c,m):
    if not c: raise AssertionError(m)
def txt(p): return p.read_text(errors='replace')

manifest=json.loads(txt(EXT/'manifest.json'))
req(manifest['manifest_version']==3,'manifest must be MV3')
req(manifest['version']=='8.23.21' and manifest.get('version_name')=='8.23.21','manifest version mismatch')
req('Beta' not in manifest['name'] and 'Beta' not in manifest.get('version_name',''),'current version must not use Beta')
req('default_popup' not in manifest.get('action',{}),'browser action must not own a second popup viewport')
for entry in manifest.get('content_scripts',[]):
    for rel in entry.get('js',[])+entry.get('css',[]): req((EXT/rel).is_file(),f'manifest path missing: {rel}')

# Marketplace scope is explicit: supported hosts only, never <all_urls>.
for host in ['https://i.ebayimg.com/*','https://depop.com/*','https://*.depop.com/*','https://poshmark.com/*','https://*.poshmark.com/*','https://vinted.com/*','https://*.vinted.com/*']:
    req(host in manifest.get('host_permissions',[]),f'missing marketplace host permission: {host}')
req('<all_urls>' not in manifest.get('host_permissions',[]),'broad <all_urls> permission is forbidden')
req('downloads' not in manifest.get('permissions',[]),'photo drag transfer must not add downloads permission')
main_content=next(entry for entry in manifest['content_scripts'] if 'content.js' in entry.get('js',[]))
early_content=next(entry for entry in manifest['content_scripts'] if 'platforms/photo_drop_early.js' in entry.get('js',[]))
vinted_content=next(entry for entry in manifest['content_scripts'] if 'platforms/photo_transfer.js' in entry.get('js',[]) and 'content.js' not in entry.get('js',[]) and any('vinted.com' in host for host in entry.get('matches',[])))
photo_transfer=txt(EXT/'platforms/photo_transfer.js'); photo_transfer_ui=txt(EXT/'ui/photo-transfer/photo-transfer.js'); ebay_photos=txt(EXT/'platforms/ebay_photos.js'); early_drop=txt(EXT/'platforms/photo_drop_early.js')
req(early_content.get('run_at')=='document_start','early photo drop receiver must load at document_start')
req(vinted_content.get('run_at')=='document_idle' and 'content.js' not in vinted_content.get('js',[]),'Vinted must use isolated photo-only destination runtime')
req('platforms/common.js' in vinted_content.get('js',[]) and 'platforms/photo_transfer.js' in vinted_content.get('js',[]),'Vinted destination runtime missing')
req('platforms/ebay_photos.js' in main_content['js'] and 'platforms/photo_transfer.js' in main_content['js'],'photo collector/transfer module missing from content load order')
req(main_content['js'].index('platforms/ebay_photos.js') < main_content['js'].index('core/snapshot.js') < main_content['js'].index('platforms/photo_transfer.js') < main_content['js'].index('content.js'),'photo collector/transfer load order mismatch')
req('node.draggable = true' in photo_transfer_ui and 'sourceSelection()' in photo_transfer and 'destinationReadyState' in photo_transfer and 'setInputFiles' in photo_transfer and 'createPoshmarkCovershotGuard' in photo_transfer and 'vinted: 20' in photo_transfer and 'vintedPhotoInput' in photo_transfer and 'HTMLInputElement.prototype' in photo_transfer,'reliable selected-photo mouse transfer implementation missing')
req('global.EbayUI?.photoTransfer?.source?.' in photo_transfer and 'document.createElement("div")' not in photo_transfer,'photo transfer platform must delegate visible UI to its UI container')
req('dispatchDropFiles' not in photo_transfer and 'UPLOAD_BATCH_SIZE' not in photo_transfer and 'hasFrameworkAttachment' not in photo_transfer,'obsolete/racy photo upload machinery remains')
req(photo_transfer.count('document.addEventListener(\"drop\"')==0 and early_drop.count('document.addEventListener(\"drop\"')==1,'document_start receiver must be the single destination drop owner')
req('photoKeyAtPoint' in ebay_photos and 'elementsFromPoint' in ebay_photos,'native eBay selection hit-test missing')
req('Extension was updated. Refresh this marketplace page once' in photo_transfer and 'Extension was updated. Refresh this marketplace page once' in early_drop,'friendly invalidated-context refresh instruction missing')

# Predictable simple current structure; no old application/setup layer.
for d in ['Backend','Docs','Extension','Tests','Tools']: req((ROOT/d).is_dir(),f'missing root {d}')
req(not (ROOT/'Apps').exists(),'Apps/ must not ship: START.command is the one setup/start entry point')
for d in ['core','modes','platforms','ui','shared','icons']: req((EXT/d).is_dir(),f'missing Extension/{d}')
for d in ['blocks','flow','runtime','core/ai','core/ebay','core/fill_engine','core/validation','core/resolver','core/ocr']:
    req(not (EXT/d).exists(),f'old production layer remains: {d}')
core={p.name for p in (EXT/'core').glob('*.js')}; req(core=={'snapshot.js','ai.js','policy.js','match.js','fill.js','verify.js','save.js','text_parser.js','review_model.js'},f'core mismatch: {core}')
modes={p.name for p in (EXT/'modes').glob('*.js')}; req(modes=={'photo.js','text.js','queue.js','review.js','manual_analysis.js','queue_page.js','photo_selection.js','queue_controls.js','fill_actions.js','settings.js','review_workspace.js','diagnostics.js','popup_sync.js','connections.js','text_workspace.js','popup_controller.js'},f'modes mismatch: {modes}')
platforms={p.name for p in (EXT/'platforms').glob('*.js')}; req(platforms=={'common.js','ebay_photos.js','ebay_helper.js','ebay_queue_dom.js','depop.js','poshmark.js','photo_transfer.js','photo_drop_early.js'},f'platforms mismatch: {platforms}')
shared={p.name for p in (EXT/'shared').glob('*.js')}; req(shared=={'config.js','messages.js','storage.js','logger.js','usage.js','settings_policy.js','connections.js','diagnostics.js','photo_state.js','question_preferences.js','draft_state.js','events.js','panel_preferences.js','text_utils.js','app_state.js'},f'shared mismatch: {shared}')
ui_dirs={p.name for p in (EXT/'ui').iterdir() if p.is_dir()}
req(ui_dirs=={'registry','popup','progress','photo-selection','queue-panel','queue-controls','assistant-panel','status','settings','notifications','diagnostics','fill-actions','review','theme','text-import','connections','control-panel','photo-transfer'},f'UI containers mismatch: {ui_dirs}')
req(not [p for p in (EXT/'ui').iterdir() if p.is_file()],'UI root must contain containers only')
ui_all='\n'.join(txt(p) for p in EXT.rglob('*.js'))
req(not re.search(r'Ebay[A-Za-z]+UIV\d+',ui_all),'patch-versioned UI global remains')
req('ebay-ai-fast-progress-v8100' not in ui_all and 'ebay-ai-queue-progress-v802' not in ui_all,'duplicate/legacy Progress UI remains')
req('ebay-ai-progress' in txt(EXT/'ui/progress/progress.js'),'single Progress UI owner missing')
queue_view=txt(EXT/'ui/queue-panel/queue-panel.js'); queue_dom=txt(EXT/'platforms/ebay_queue_dom.js'); queue_page=txt(EXT/'modes/queue_page.js')
for token in ['chrome.storage','MutationObserver','document.querySelectorAll','chrome.runtime.sendMessage']:
    req(token not in queue_view,f'Queue view owns non-visual behavior: {token}')
for token in ['chrome.storage','chrome.runtime.sendMessage','MutationObserver']:
    req(token not in queue_dom,f'Queue DOM adapter owns non-DOM behavior: {token}')
req('globalThis.EbayQueuePage' in queue_page and 'document.createElement' not in queue_page,'Queue page controller ownership mismatch')

# One page router / one background router / one automatic writer.
req(txt(EXT/'content.js').count('chrome.runtime.onMessage.addListener')==1,'content must own exactly one message router')
req(txt(EXT/'background.js').count('chrome.runtime.onMessage.addListener')==1,'background must own exactly one message router')
fill=txt(EXT/'core/fill.js')
req('fillAllRecordManualRouteA58' not in fill,'legacy A58 automatic Fill route remains')
req('withOperation' in fill,'shared page writer lock missing')

# CSP and Control Panel: embedded in eBay page; no separate Chrome window sizing path.
popup_html=txt(EXT/'ui/popup/popup.html'); popup_js=txt(EXT/'ui/popup/popup.js'); popup_state=txt(EXT/'ui/popup/state.js'); connections=txt(EXT/'ui/connections/connections.js'); shared_connections=txt(EXT/'shared/connections.js'); control_js=txt(EXT/'ui/control-panel/control-panel.js'); bg=txt(EXT/'background.js'); content=txt(EXT/'content.js'); queue_css=txt(EXT/'ui/queue-panel/queue-panel.css'); control_css=txt(EXT/'ui/control-panel/control-panel.css'); start=txt(ROOT/'START.command')
req('MARKETPLACE_PHOTO_FETCH_V8210' in bg and 'host !== "i.ebayimg.com"' in bg,'validated eBay photo fetch bridge missing')
req('MARKETPLACE_PHOTO_SESSION_SET_V8220' in bg and 'chrome.storage.session.set' in bg,'durable in-session photo transfer bridge missing')
req('EBAY_PHOTO_SELECTION_CHANGED_V8220' in ebay_photos and 'nativeSelectedCount' in ebay_photos,'native eBay photo selection reader missing')
req('MARKETPLACE_PHOTO_EARLY_DROP_V8220' in early_drop and 'vinted.com' in early_drop,'early drop handoff/Vinted destination missing')
req(bg.count('chrome.runtime.onMessage.addListener')==1,'photo transfer must reuse the one background message router')
req(not re.search(r'<script(?![^>]*\bsrc=)[^>]*>',popup_html,re.I),'inline popup script violates MV3 CSP')
req('params.get("embedded") === "1"' in popup_state and 'params.get("standalone")' not in popup_state,'popup must use embedded mode only')
req('PANEL_ID="ebay-ai-control-panel"' in control_js and 'document.createElement("iframe")' in control_js and 'clipboard-read; clipboard-write' in control_js,'in-page Control Panel missing')
req('document.createElement' not in content and 'global.EbayUI?.controlPanel?.toggle' in content,'content router must delegate Control Panel UI')
req('#ebay-ai-control-panel' in control_css and 'var(--ebaic-panel-width, clamp(380px, 36vw, 520px))' in control_css and 'var(--ebaic-panel-height, clamp(520px, 86vh, 780px))' in control_css,'responsive control sizing missing')
req('#ebay-ai-control-panel' not in queue_css and '#ebay-ai-queue-v700' not in control_css,'Control and Queue CSS ownership must stay separated')
control_fn=re.search(r'async function hotkeyOpenControlWindowV880\([^)]*\)\s*\{([\s\S]*?)\n\}',bg)
req(control_fn and 'CONTROL_PANEL_TOGGLE' in control_fn.group(1) and 'chrome.windows.create' not in control_fn.group(1),'Control hotkey must toggle in-page panel')
req('chrome.action?.onClicked?.addListener' in bg and 'hotkeyHandleCommandV880(\"open-control-window\", { sourceTab: tab })' in bg,'toolbar icon must reuse the same in-page Control Panel route')
req('html.windowed' not in txt(EXT/'ui/popup/popup.css'),'obsolete standalone/windowed popup sizing path remains')

# Native Messaging: exact fixed Extension ID; no pairing secret in Chrome or release files.
req('nativeMessaging' in manifest.get('permissions',[]),'nativeMessaging permission missing')
req(all('127.0.0.1:8790' not in value for value in manifest.get('host_permissions',[])),'extension must not have localhost host permission')
req('chrome.runtime.connectNative(NATIVE_BACKEND_V8180.hostName)' in bg,'background Native Messaging bridge missing')
req('com.fabiian.ebay_ai_agent' in bg,'native host name mismatch')
req('LOCAL_NATIVE_BACKEND_STATUS_V8180' in bg and 'LOCAL_NATIVE_BACKEND_STATUS_V8180' in shared_connections,'native backend status route missing')
req('hub-bootstrap.json' not in bg,'background still reads legacy pairing bootstrap')
req('chrome.runtime.getURL("hub-bootstrap.json")' not in bg,'legacy bootstrap fetch remains')
req('pairingStorageKey' not in bg,'pairing secret storage remains in background')
req('NativeMessagingHosts' in start and 'allowed_origins' in start,'START native host manifest install missing')
req('jemamkjcijdmmmgknhejdmceachdildh' in start,'fixed extension ID missing from native host installer')
req('--ensure-native-credential' in start and '--show-pairing-code' not in start,'START must prepare Keychain credential without printing it')
req('rm -f "$EXTENSION_DIR/hub-bootstrap.json"' in start,'START must remove legacy bootstrap')
req(not (EXT/'hub-bootstrap.json').exists(),'release ZIP must not contain pairing bootstrap')
keychain=txt(BACK/'keychain.py'); native_host=txt(BACK/'native_host.py')
req('SecItemCopyMatching' in keychain and 'SecItemAdd' in keychain and 'SecItemUpdate' in keychain,'modern SecItem Keychain helper missing')
req('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly' in keychain,'device-only Keychain accessibility missing')
req('kSecUseDataProtectionKeychain' in keychain,'data-protection Keychain missing')
req('EXPECTED_EXTENSION_ORIGIN = "chrome-extension://jemamkjcijdmmmgknhejdmceachdildh/"' in native_host,'native host caller-origin guard missing')
req('GET_PATHS = frozenset' in native_host and 'POST_PATHS = frozenset' in native_host,'native host route allowlist missing')
req('Pairing code' not in popup_html and 'pairing code' not in popup_html,'manual pairing wording remains in popup')

# Single source settings/storage.
config=txt(EXT/'shared/config.js')
req('const STORAGE_KEYS = Object.freeze' in config and 'DEFAULT_SETTINGS = Object.freeze' in config and 'const PANEL_SIZE = Object.freeze' in config,'shared config source missing')
usage=txt(EXT/'shared/usage.js')
req('EbayUsageV8237' in usage and 'cache_write_tokens' in usage and 'recordBudgetCost' in usage and 'countsTowardBudget' in usage,'reliable per-request usage ledger missing')
req('\"shared/usage.js\"' in bg,'background must load usage ledger before AI transport')
req('../../shared/usage.js' in popup_html,'Control Panel must load usage ledger before AI transport')
req('X-Client-Request-Id' in txt(BACK/'server.py') and 'endpoint_host == \"api.openai.com\"' in txt(BACK/'server.py'),'OpenAI request tracing must be scoped to api.openai.com')
req('panelSizeMode: "auto"' in config and 'panelCustomWidth: "460"' in config and 'panelCustomHeight: "680"' in config,'panel size defaults missing from shared config')
req('function calculate(' in control_js and 'function applySize(' in control_js and 'addEventListener?.("resize",scheduleResize' in control_js,'live Control Panel resizing missing')
req('id="panelSizeMode"' in popup_html and 'id="savePanelSizeBtn"' in popup_html and 'id="resetPanelSizeBtn"' in popup_html,'Control Panel size Settings UI missing')
req('QUEUE_STORAGE_KEY_V710 = globalThis.EbayAiConstantsV790.STORAGE_KEYS.QUEUE' in bg,'background queue storage is duplicated')
app_state=txt(EXT/'shared/app_state.js')
req('const STORAGE_KEYS = globalThis.EbayAiConstantsV790?.STORAGE_KEYS' in app_state and 'STORAGE_KEYS' not in popup_state,'application storage mapping must live outside UI popup state')

# Primary production path must not silently swallow errors. Isolated legacy helper is excluded.
for p in list(EXT.glob('*.js'))+list((EXT/'core').glob('*.js'))+list((EXT/'modes').glob('*.js'))+[p for p in (EXT/'platforms').glob('*.js') if p.name != 'ebay_helper.js']+list((EXT/'shared').glob('*.js'))+list((EXT/'ui').glob('*/*.js')):
    req(not re.search(r'catch\s*(?:\([^)]*\))?\s*\{\s*\}',txt(p),re.S),f'empty catch remains in primary path: {p.relative_to(ROOT)}')

# Protected fields and no active listings route.
policy=txt(EXT/'core/policy.js')
for key in ['"title"','"description"','"condition"','"price"','"quantity"','"shipping"','"category"','"upc"','"mpn"','"publish"','"delete"','"pay"']:
    req(key in policy.lower(),f'protected field policy missing {key}')
for p in [EXT/'content.js',EXT/'core/fill.js',EXT/'modes/photo.js',EXT/'modes/queue.js']:
    req('/sh/lst/active' not in txt(p).lower(),f'active listings route present in {p.name}')

# Terminal-first setup: START owns orchestration; Backend owns hidden secret input + Keychain writes.
server=txt(BACK/'server.py'); settings_cmd=txt(ROOT/'Tools/settings.command')
for token in [
    '"$PYTHON_BIN" "$BACKEND_DIR/server.py" --setup-terminal',
    'Saved setup found ✓',
    'OLD_SETUP_APP="$HOME/Applications/eBay AI Agent Setup.app"',
]: req(token in start,f'START setup invariant missing: {token}')
req('/usr/bin/open "$SETUP_APP"' not in start and 'SETUP_SOURCE=' not in start,'old Setup.app launch path remains')
req('read -s' not in start,'START must not read secrets itself')
req('! -f "$SETUP_COMPLETE_PATH"' in start and 'V817_SETUP_MARKER' not in start,'existing .setup-complete must survive patch updates without re-prompt')
req('def configure_agent_terminal()' in server and 'getpass.getpass' in server,'Backend hidden Terminal setup missing')
req('_write_setup_complete_marker()' in server,'setup completion marker helper missing')
req('exec "$PACKAGE_DIR/START.command" --setup' in settings_cmd,'settings.command must reuse START --setup')
for forbidden in ['GPT_API_KEY=','OPENAI_API_KEY=','CLAUDE_API_KEY=','CLIENT_SECRET=','sk-proj-','sk-ant-']:
    req(forbidden not in start,f'START contains secret-like configuration: {forbidden}')

# Backend current version has no Beta identity.
req('APP_VERSION = "8.23.21"' in server and 'APP_DISPLAY_VERSION = f"V{APP_VERSION}"' in server,'backend display version mismatch')
req('"panelSizeMode": "auto"' in server and '"panelCustomWidth": "460"' in server and '"panelCustomHeight": "680"' in server,'Backend persistent profile does not preserve panel size settings')
req('APP_BETA' not in server and '-beta.' not in server,'Beta designation remains in current backend identity')

# V8.23.21 local OCR/CV: broaden free local discovery without broadening paid GPT Vision.
ocr=txt(BACK/'ocr.js'); preprocess=txt(BACK/'image_preprocess.js'); ai=txt(EXT/'core/ai.js'); snapshot=txt(EXT/'core/snapshot.js'); fill=txt(EXT/'core/fill.js'); policy=txt(EXT/'core/policy.js'); diagnostics=txt(EXT/'modes/diagnostics.js')
req('OCR_MAX_IMAGES = 12' in server,'local OCR gallery bound mismatch')
req('VNDetectRectanglesRequest' in ocr and 'labelBox' in ocr and 'rectangleConfidence' in ocr,'machine-vision label geometry missing')
req("CIColorControls" in preprocess and "CISharpenLuminance" in preprocess,'Core Image contrast/sharpen preprocessing missing')
req('const MAX_PHOTOS = 12' in ai and 'slice(0, 12)' in ai,'bounded full-gallery local OCR discovery missing')
req('variantVotes' in server and 'passVotes' in server,'OCR consensus metadata is not preserved')
req('optionsComplete: completeCompactOptions' in snapshot and 'optionTotal' in snapshot,'virtualized eBay option completeness metadata missing')
req('resolveShoeWidth' in fill and '"2e": ["ee", "2e"]' in fill,'deterministic shoe-width live option resolution missing')
req('regionalSizeForMarket' in policy and 'regionalSizeRows' in policy and 'SIZE_REGION_ALIASES' in policy,'regional physical-label size parser missing')
req('UNITED STATES' in ocr and 'EUROPE' in ocr and 'AUSTRALIA' in ocr,'regional size OCR custom words missing')
req('highResolutionDiagnosticPhotoUrlV82317' in diagnostics and 'diagnosticHighResPhotoCount' in diagnostics and 'v8-23-18-debug-' in diagnostics,'high-resolution diagnostic photo manifest missing')

# V8.23.21 cost/accuracy follow-up: explain every repair, prefer strong local evidence, and keep paid repair microscopic.
usage=txt(EXT/'shared/usage.js'); diagnostics_ui=txt(EXT/'ui/diagnostics/diagnostics.js'); photo_mode=txt(EXT/'modes/photo.js')
req('CROSS_PHOTO_LOCAL_EVIDENCE_FIELDS' in ai and 'localEvidenceSupportsIndependentSkip' in ai and 'buildLocalEvidenceRepairPlan' in ai,'Local Evidence Engine missing')
req('LARGE LIVE CATALOG' in ai and 'microRepair: true' in ai and 'const repairFields = fields.filter' in ai,'targeted micro-repair prompt/field scope missing')
req('questionNames:' in usage and 'repairReasons:' in usage and 'highDetailPhotoCount:' in usage,'per-request repair telemetry metadata missing')
req('LATEST ANALYSIS RUNS' in diagnostics_ui and 'Repair reasons:' in diagnostics_ui and 'HIGH detail' in diagnostics_ui,'per-run/per-field API diagnostics missing')
req('repairFields:' in photo_mode and 'repairReasons:' in photo_mode and 'requestCosts:' in photo_mode,'Photo-stage repair diagnostics missing')

# V8.23.21 hard request/cost invariant: no hidden third OpenAI attempt and no duplicate HIGH-detail read for strong local OCR.
req('maxOpenAiRequests: reviewMode ? 1 : 2' in ai and 'ANALYSIS_REQUEST_BUDGET_EXHAUSTED' in ai,'normal Fill hard two-request OpenAI budget missing')
req('allowCompatibilityRetry: false' in ai and 'allowCompatibilityRetry: true' in ai,'analysis/setup compatibility retry separation missing')
req('localOcrStrongEvidenceCandidate' in ai and 'localOcrNeedsHighDetail' in ai,'adaptive local-OCR Vision-detail routing missing')
req('itemCostTarget = 0.07' in ai and 'openAiRequestsAttempted' in ai,'per-item cost/request telemetry missing')
req('OpenAI ${Number(response.openAiRequestsAttempted' in txt(EXT/'modes/manual_analysis.js'),'Fast Fill status does not expose request budget')

# V8.23.21 direct-label completeness + hidden-action audit.
match=txt(EXT/'core/match.js')
req('cashmere|acrylic|acetate|modal|leather|suede' in policy,'Cashmere/material tag context coverage missing')
req('block?.role || ""' in policy and 'photo?.role || ""' in policy,'per-block OCR role preservation missing')
req('"brand", "size", "material", "garment care"' in ai,'direct local OCR live-option allowlist missing')
req('localOcrSpecificityUpgrade' in ai and '100\\s*%' in ai,'physical 100% material specificity upgrade missing')
req('ACTIVE_ANALYSES = new Map()' in ai and 'Duplicate analysis joined existing in-flight request' in ai,'analysis single-flight duplicate guard missing')
req('allowLiveExactCandidate' in match and 'LIVE_LOCAL_OCR_FIELDS' in match,'general direct-label live verification gate missing')
req('const numeric = compactRaw.match' in match and 'RN 0' not in match,'numeric clothing Size token support missing or unsafe fixture leaked into production')

# Syntax checks.
js_files=list(EXT.rglob('*.js'))+[BACK/'ocr.js',BACK/'image_preprocess.js']
for p in js_files:
    r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True); req(r.returncode==0,f'JS syntax: {p}: {r.stderr}')

for py in [BACK/'server.py', BACK/'native_host.py', BACK/'keychain.py']:
    r=subprocess.run([sys.executable,'-m','py_compile',str(py)],capture_output=True,text=True); req(r.returncode==0,f'Backend Python syntax: {py}: {r.stderr}')
for p in [ROOT/'START.command',*sorted((ROOT/'Tools').glob('*.command'))]:
    r=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True); req(r.returncode==0,f'Shell syntax: {p}: {r.stderr}')

# Secret literal scan. Test fixtures may use TEST_ONLY values; production may not contain credential-looking literals.
secret_rx=re.compile(r'(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|sk-ant-[A-Za-z0-9_-]{20,})')
for base in [EXT,BACK,ROOT/'Docs',ROOT/'Tools']:
    for p in base.rglob('*'):
        if p.is_file() and p.suffix.lower() in {'.js','.py','.json','.html','.css','.md','.txt','.command',''}:
            req(not secret_rx.search(txt(p)),f'credential-looking literal in {p.relative_to(ROOT)}')

print(f'PASS V8.23.21 release gate: {len(js_files)} JS syntax checks, Native Messaging, device-only Keychain credential, terminal setup, protected fields, and secret scan')
