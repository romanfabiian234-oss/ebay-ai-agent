from pathlib import Path
from playwright.sync_api import sync_playwright
import re

ROOT=Path(__file__).resolve().parents[2]
EXT=ROOT/'Extension'
html=(EXT/'ui/popup/popup.html').read_text()
popup_js=(EXT/'ui/popup/popup.js').read_text()
popup_state=(EXT/'ui/popup/state.js').read_text()
control_js=(EXT/'ui/control-panel/control-panel.js').read_text()
popup_css=(EXT/'ui/popup/popup.css').read_text()
queue_css=(EXT/'ui/queue-panel/queue-panel.css').read_text()
control_css=(EXT/'ui/control-panel/control-panel.css').read_text()
content=(EXT/'content.js').read_text()
config=(EXT/'shared/config.js').read_text()
bg=(EXT/'background.js').read_text()

manifest=__import__('json').loads((EXT/'manifest.json').read_text())
assert 'default_popup' not in manifest.get('action', {}), 'toolbar action must not create a second Chrome popup'
assert 'chrome.action?.onClicked?.addListener' in bg, 'toolbar action listener missing'
assert 'hotkeyHandleCommandV880("open-control-window", { sourceTab: tab })' in bg, 'toolbar icon must reuse the Control Panel command route'

# MV3: extension HTML must have no inline script. Control UI stays embedded in-page.
assert not re.search(r'<script(?![^>]*\bsrc=)[^>]*>', html, re.I), 'CSP-invalid inline script remains'
assert 'params.get("embedded") === "1"' in popup_state
assert 'params.get("standalone")' not in popup_state
assert 'PANEL_ID="ebay-ai-control-panel"' in control_js
assert 'document.createElement("iframe")' in control_js
assert 'clipboard-read; clipboard-write' in control_js
assert 'EbayExtensionUrlsV82310?.get?.(`ui/popup/popup.html?' in control_js
assert 'chrome.runtime.getURL(String(path || ""))' in config
assert 'document.createElement' not in content
assert 'global.EbayUI?.controlPanel?.toggle' in content

# The control hotkey must toggle the in-page panel instead of creating a Chrome window.
m=re.search(r'async function hotkeyOpenControlWindowV880\([^)]*\)\s*\{([\s\S]*?)\n\}', bg)
assert m, 'Control Panel hotkey function missing'
body=m.group(1)
assert 'CONTROL_PANEL_TOGGLE' in body
assert 'chrome.windows.create' not in body

# V8.23.21: one saved size policy feeds the only Control Panel instance.
for token in ['panelSizeMode: "auto"', 'panelCustomWidth: "460"', 'panelCustomHeight: "680"', 'const PANEL_SIZE = Object.freeze']:
    assert token in config, f'missing centralized panel size setting: {token}'
for token in ['id="panelSizeMode"', 'id="panelCustomWidth"', 'id="panelCustomHeight"', 'id="savePanelSizeBtn"', 'id="resetPanelSizeBtn"']:
    assert token in html, f'missing Settings control: {token}'
for token in ['function calculate(', 'function applySize(', 'addEventListener?.("resize",scheduleResize', 'EbayPanelPreferencesV82310?.subscribe?.(']:
    assert token in control_js, f'missing live responsive panel behavior: {token}'
assert 'var(--ebaic-panel-width, clamp(380px, 36vw, 520px))' in control_css
assert 'var(--ebaic-panel-height, clamp(520px, 86vh, 780px))' in control_css
assert 'html.windowed' not in popup_css, 'obsolete standalone/windowed popup CSS must be removed'
assert re.search(r'body\s*\{[^}]*width:100%', popup_css, re.S), 'iframe body must fill the outer Control Panel width'

fixture=f'''<!doctype html><html><head><style>{queue_css}
{control_css}</style></head><body>
<section id="ebay-ai-control-panel"><div class="ebaic-header"><strong class="ebaic-title">Control</strong><button class="ebaic-close">×</button></div><iframe class="ebaic-frame"></iframe></section>
<section id="ebay-ai-queue-v700"><div class="aiq-header">Queue</div></section>
</body></html>'''

def clamp(v, lo, hi):
    return min(hi, max(lo, v))

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    # Auto CSS fallback grows on larger pages and still stays fully inside small pages.
    for width,height in [(1440,900),(1100,760),(900,650),(430,700),(360,600)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        page.set_content(fixture)
        metrics=page.evaluate('''()=>{
          const c=document.querySelector('#ebay-ai-control-panel').getBoundingClientRect();
          const q=document.querySelector('#ebay-ai-queue-v700').getBoundingClientRect();
          return {iw:innerWidth,ih:innerHeight,c:{x:c.x,y:c.y,w:c.width,h:c.height,r:c.right,b:c.bottom},q:{w:q.width},scroll:document.documentElement.scrollWidth};
        }''')
        c=metrics['c']
        expected_w=min(round(clamp(width*0.36,380,520)), width-24)
        expected_h=min(round(clamp(height*0.86,520,780)), height-24)
        assert abs(c['w']-expected_w)<=2, (width,height,metrics,expected_w)
        assert abs(c['h']-expected_h)<=2, (width,height,metrics,expected_h)
        assert c['r']<=width+1 and c['b']<=height+1 and c['x']>=-1 and c['y']>=-1, metrics
        assert metrics['scroll']<=width+1, metrics
        if width>=900:
            assert c['w']>340, 'Auto panel should grow beyond the old fixed 340px on a roomy viewport'
        page.close()

    # Saved preset/custom CSS-variable values are honored but remain capped by the page viewport.
    page=browser.new_page(viewport={'width':900,'height':650})
    page.set_content(fixture)
    custom=page.evaluate('''()=>{
      const el=document.querySelector('#ebay-ai-control-panel');
      el.style.setProperty('--ebaic-panel-width','620px');
      el.style.setProperty('--ebaic-panel-height','850px');
      const r=el.getBoundingClientRect(); return {w:r.width,h:r.height,r:r.right,b:r.bottom};
    }''')
    assert abs(custom['w']-620)<=1.5, custom
    assert abs(custom['h']-(650-24))<=1.5, custom
    assert custom['r']<=901 and custom['b']<=651, custom
    page.close()

    # iframe content itself has no independent 340px owner; it fills its viewport.
    page=browser.new_page(viewport={'width':620,'height':650})
    page.set_content(f'<!doctype html><html class="embedded"><head><style>{popup_css}</style></head><body><main>Control</main></body></html>')
    body_width=page.evaluate('document.body.getBoundingClientRect().width')
    assert body_width>=618, body_width
    page.close()
    browser.close()

print('PASS V8.23.21 single Control Panel route owns auto/preset/custom sizing, toolbar and hotkey share it, and iframe fills the panel')
