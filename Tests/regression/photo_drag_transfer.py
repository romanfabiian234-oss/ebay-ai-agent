#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[2]
EXT=ROOT/'Extension'

def req(cond,msg):
    if not cond: raise AssertionError(msg)

manifest=json.loads((EXT/'manifest.json').read_text())
req(manifest['version'] == manifest.get('version_name') and bool(re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,3}', manifest['version'])),'manifest version')
req('https://i.ebayimg.com/*' in manifest.get('host_permissions',[]),'exact eBay image host permission missing')
for host in ['https://vinted.com/*','https://*.vinted.com/*']:
    req(host in manifest.get('host_permissions',[]),f'Vinted host permission missing: {host}')
req('downloads' not in manifest.get('permissions',[]),'photo transfer must not require downloads permission')
main=next(entry for entry in manifest['content_scripts'] if 'content.js' in entry.get('js',[]))
early=next(entry for entry in manifest['content_scripts'] if 'platforms/photo_drop_early.js' in entry.get('js',[]))
js=main['js']
req(early.get('run_at')=='document_start','early destination receiver must load at document_start')
req(early['js'][:2]==['ui/registry/registry.js','ui/photo-transfer/photo-transfer.js'],'early drop UI must load before the early destination receiver')
vinted=next(entry for entry in manifest['content_scripts'] if 'platforms/photo_transfer.js' in entry.get('js',[]) and 'content.js' not in entry.get('js',[]) and any('vinted.com' in host for host in entry.get('matches',[])))
req(vinted.get('run_at')=='document_idle','Vinted destination bridge must load at document_idle')
req('content.js' not in vinted.get('js',[]),'Vinted photo-only bridge must not enable marketplace Smart Fill')
req('platforms/common.js' in vinted.get('js',[]) and 'platforms/photo_transfer.js' in vinted.get('js',[]),'Vinted photo-only bridge load order missing')
req('platforms/ebay_photos.js' in js,'shared eBay photo collector missing')
req('platforms/photo_transfer.js' in js,'photo transfer module not loaded')
req(js.index('platforms/ebay_photos.js') < js.index('core/snapshot.js') < js.index('platforms/photo_transfer.js') < js.index('content.js'),'shared photo collector/transfer load order mismatch')

collector=(EXT/'platforms/ebay_photos.js').read_text()
transfer=(EXT/'platforms/photo_transfer.js').read_text()
early_js=(EXT/'platforms/photo_drop_early.js').read_text()
snapshot=(EXT/'core/snapshot.js').read_text()
background=(EXT/'background.js').read_text()
popup=(EXT/'ui/popup/popup.js').read_text()
photo_ui=(EXT/'ui/photo-transfer/photo-transfer.js').read_text()
photo_selection=(EXT/'modes/photo_selection.js').read_text()
popup_html=(EXT/'ui/popup/popup.html').read_text()

for token in [
    'nativeSelectedCount', 'nativeSelectedKeys', 'selectedKeysFromClicks',
    'EBAY_PHOTO_SELECTION_CHANGED_V8220', 'performance.getEntriesByType("resource")',
    'expectedPhotoCount', 'collectAllPhotos', 'photoKeyAtPoint', 'elementsFromPoint', 'deselect',
    'watchNativeSelectionChange', 'selectionMutationRoot', 'attributeFilter', 'characterData: true'
]: req(token in collector,f'shared eBay photo collector invariant missing: {token}')
req('\x08' not in collector,'literal control/backspace character remains in eBay selection regex')
req(r'\b\d{1,2}\s+selected\b' in collector,'native selected-count word-boundary regex missing')
req('EbayPhotoCollectorV8220' in snapshot and 'sharedCollector?.collectAllPhotos' in snapshot,'Photo/Queue snapshot must reuse shared eBay collector')

for token in [
    'sourceSelection()', 'selection.mode === "selected"',
    'MARKETPLACE_PHOTO_SESSION_SET_V8220', 'MARKETPLACE_PHOTO_SESSION_GET_V8220',
    'waitForDestinationControls', 'destinationReadyState', 'setInputFiles',
    'createPoshmarkCovershotGuard', 'select a covershot', 'exactButton(root, "Apply")',
    'uploadFilesVerified', 'Automatic retry stopped to avoid duplicates',
    'showDropOverlay', 'depop: 8', 'poshmark: 16', 'vinted: 20', 'vintedPhotoInput', 'vintedPhotoZone', 'HTMLInputElement.prototype',
    'global.EbayUI?.photoTransfer?.source?.'
]: req(token in transfer,f'V8.23.21 photo transfer invariant missing: {token}')

for token in [
    'node.draggable = true', 'role", "button', 'right:18px', 'bottom:18px',
    'z-index:2147483645', 'inset:16px', 'bottom:22px', 'ui.register("photoTransfer"'
]: req(token in photo_ui,f'photo-transfer UI ownership invariant missing: {token}')
req('document.createElement("div")' not in transfer,'platform transfer must delegate visible DOM creation to UI container')

# Removed instability sources: no synthetic platform DnD, no 4-file batches, no
# private React/Vue hydration probing, no duplicate signature gate, no late drop owner.
for forbidden in [
    'dispatchDropFiles', 'uploadMethodsFor', 'uploadFilesInBatches', 'UPLOAD_BATCH_SIZE',
    'hasFrameworkAttachment', 'marketplaceAiLastPhotoTransfer', 'signatureKey',
    'document.addEventListener("drop"', 'document.addEventListener("dragover"'
]: req(forbidden not in transfer,f'obsolete/racy photo transfer path remains: {forbidden}')

req('observer.observe(document.body || document.documentElement, { childList: true, subtree: true })' in transfer,'bounded uploader wait observer missing')
req('observer.observe(zone, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style"] })' in transfer,'photo verification observer must be scoped to photo zone')
req('setInterval(' not in transfer,'photo transfer must not use permanent polling')
req('chrome.downloads' not in transfer and 'downloads.download' not in transfer,'photo transfer must not use Downloads')
req('List This Item' not in transfer and 'Post listing' not in transfer and 'publishButton' not in transfer,'photo transfer must not target publish actions')

for token in ['MARKETPLACE_PHOTO_EARLY_DROP_V8220','MARKETPLACE_PHOTO_SESSION_GET_V8220','event.preventDefault()','Extension was updated. Refresh this marketplace page once','vinted.com']:
    req(token in early_js,f'early drop receiver missing: {token}')
req(early_js.count('document.addEventListener("drop"')==1,'document_start receiver must be the single destination drop owner')

for token in [
    'PHOTO_TRANSFER_SESSION_KEY_V8220', 'chrome.storage.session.set', 'chrome.storage.session.get',
    'MARKETPLACE_PHOTO_SESSION_SET_V8220', 'MARKETPLACE_PHOTO_SESSION_GET_V8220', 'MARKETPLACE_PHOTO_SESSION_CLEAR_V8220',
    'MARKETPLACE_PHOTO_FETCH_V8210', 'host !== "i.ebayimg.com"', 'credentials: "omit"'
]: req(token in background,f'background transfer/session guard missing: {token}')
req(background.count('chrome.runtime.onMessage.addListener')==1,'photo feature must reuse single background router')

req('readCurrentMarketplacePhotosV8220' in popup and 'bindClickV780("readEbayPhotosBtn", readCurrentMarketplacePhotosV8220)' in popup,'popup startup must bind the shared Read Photos action')
req('async function readCurrentMarketplacePhotosV8220' in photo_selection and 'CORE_MARKETPLACE_READ_LISTING_V8200' in photo_selection,'photo workflow owner must support Depop/Poshmark through platform adapters')
req('Read Photos + Listing Fields' in popup_html,'photo reader UI must be marketplace-neutral')
print('PASS V8.23.21 stable photo-transfer architecture: eBay to Depop/Poshmark/Vinted, single early drop owner, native file input, Poshmark Covershot commit, scoped verification, and selected-photo sync')
