#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
EXT=ROOT/'Extension'
FIX=ROOT/'Tests'/'fixtures'
def req(cond,msg):
    if not cond: raise AssertionError(msg)
manifest=json.loads((EXT/'manifest.json').read_text())
req(manifest['version']=='8.23.21','manifest version')
main=next(entry for entry in manifest['content_scripts'] if 'content.js' in entry.get('js',[]))
for host in ['https://depop.com/*','https://*.depop.com/*','https://poshmark.com/*','https://*.poshmark.com/*']:
    req(host in manifest['host_permissions'],f'missing host permission {host}')
    req(host in main['matches'],f'missing content match {host}')
js=main['js']
common=(EXT/'platforms/common.js').read_text()
req('VINTED: \"vinted\"' in common and 'vinted.com' in common,'Vinted platform detection missing')
for file in ['platforms/common.js','platforms/depop.js','platforms/poshmark.js']:
    req(file in js,f'{file} not loaded')
req(js.index('platforms/common.js') < js.index('platforms/depop.js') < js.index('core/policy.js'),'platform load order')

depop=(FIX/'depop_marketplace_contract.html').read_text()
for marker in [
    'form aria-label="List an item"', 'id="upload-input__input"',
    'for="group-input">Category</label>', 'id="group-input" role="combobox" aria-controls="group-menu"',
    'for="brand-input">Brand</label>', 'for="condition-input">Condition</label>',
    'for="colour-input">Color</label>', 'for="source-input">Source</label>',
    'for="age-input">Age</label>', 'for="style-input">Style</label>'
]: req(marker in depop,f'Depop stable contract missing: {marker}')
req('id="shippingMethods-input" role="combobox"' in depop,'Depop negative shipping fixture missing')
req('Post listing' in depop,'Depop negative publish fixture missing')

posh=(FIX/'poshmark_marketplace_contract.html').read_text()
for marker in [
    'id="img-file-input"', 'listing-editor__category-container', 'listing-editor__subcategory-container',
    'data-test="size"', 'data-et-name="listingEditorBrandSection"', 'listing-editor__tile--color',
    'data-vv-name="style-tag-input"', '>condition<', '>Style Tags<'
]: req(marker in posh,f'Poshmark stable contract missing: {marker}')
req('List This Item' in posh and 'Delete Listing' in posh,'Poshmark negative action fixtures missing')

sources={p.name:p.read_text() for p in [EXT/'platforms/depop.js',EXT/'platforms/poshmark.js',EXT/'content.js']}
req('styles-module__' not in sources['depop.js'],'Depop adapter relies on generated CSS-module class')
req('setInterval(' not in sources['depop.js'] and 'setInterval(' not in sources['poshmark.js'],'platform adapter contains polling interval')
req('CORE_MARKETPLACE_SMART_FILL_ALL_V8200' in sources['content.js'],'marketplace one-button Fill route missing')
req('allowRecovery: false' in sources['content.js'],'marketplace AI requests must remain bounded to staged max-two-call workflow')
req('List This Item' not in sources['poshmark.js'] and 'Delete Listing' not in sources['poshmark.js'],'Poshmark adapter targets a dangerous action')
req('Post listing' not in sources['depop.js'] and 'priceAmount__input' not in sources['depop.js'] and 'shippingMethods-input' not in sources['depop.js'],'Depop adapter targets protected publish/price/shipping controls')
print('PASS V8.23.21 Depop/Poshmark Fill adapters plus isolated Vinted photo-destination detection')
