from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[2]; EXT=ROOT/'Extension'
expected={'background.js','content.js','manifest.json'}
assert expected.issubset({p.name for p in EXT.iterdir() if p.is_file()})
for d in ['core','modes','platforms','ui','shared','icons']: assert (EXT/d).is_dir(),d
for forbidden in ['blocks','flow','runtime','core/ai','core/ebay','core/fill_engine','core/validation','core/resolver','core/ocr']:
    assert not (EXT/forbidden).exists(), forbidden
core={p.name for p in (EXT/'core').glob('*.js')}; assert core=={'snapshot.js','ai.js','policy.js','match.js','fill.js','verify.js','save.js','text_parser.js','review_model.js'},core
modes={p.name for p in (EXT/'modes').glob('*.js')}; assert modes=={'photo.js','text.js','queue.js','review.js','manual_analysis.js','queue_page.js','photo_selection.js','queue_controls.js','fill_actions.js','settings.js','review_workspace.js','diagnostics.js','popup_sync.js','connections.js','text_workspace.js','popup_controller.js'},modes
platforms={p.name for p in (EXT/'platforms').glob('*.js')}; assert platforms=={'common.js','ebay_photos.js','ebay_helper.js','ebay_queue_dom.js','depop.js','poshmark.js','photo_transfer.js','photo_drop_early.js'},platforms
ui_dirs={p.name for p in (EXT/'ui').iterdir() if p.is_dir()}; assert ui_dirs=={'registry','popup','progress','photo-selection','queue-panel','queue-controls','assistant-panel','status','settings','notifications','diagnostics','fill-actions','review','theme','text-import','connections','control-panel','photo-transfer'},ui_dirs
assert not [p for p in (EXT/'ui').iterdir() if p.is_file()], 'UI root must contain containers only'
shared={p.name for p in (EXT/'shared').glob('*.js')}; assert shared=={'config.js','messages.js','storage.js','logger.js','usage.js','settings_policy.js','connections.js','diagnostics.js','photo_state.js','question_preferences.js','draft_state.js','events.js','panel_preferences.js','text_utils.js','app_state.js'},shared
manifest=json.loads((EXT/'manifest.json').read_text()); assert bool(re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,3}', manifest['version'])) and manifest['version_name']==manifest['version'] and 'Beta' not in manifest['name']
assert 'default_popup' not in manifest.get('action',{})
main=next(entry for entry in manifest['content_scripts'] if 'content.js' in entry.get('js',[])); assert not any('blocks/' in x or 'flow/' in x or 'runtime/' in x for x in main['js'])
assert (EXT/'content.js').read_text().count('chrome.runtime.onMessage.addListener')==1
assert (EXT/'background.js').read_text().count('chrome.runtime.onMessage.addListener')==1
assert 'chrome.action?.onClicked?.addListener' in (EXT/'background.js').read_text()
assert 'fillAllRecordManualRouteA58' not in (EXT/'core/fill.js').read_text()
print('PASS V8.23.21 simple production structure and single router/writer invariants')
