from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]; EXT=ROOT/'Extension'; FIXTURE=ROOT/'Tests/fixtures/ebay_item_specifics_v8130.html'
def req(c,m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1200,'height':900}); page.set_content(FIXTURE.read_text())
    for rel in ['shared/config.js','core/policy.js','core/snapshot.js','core/verify.js','core/fill.js']:
        page.add_script_tag(content=(EXT/rel).read_text())
    info=page.evaluate("""async()=>{const m=await EbayPageFieldsV810.collectFieldMap({force:true});return {size:m.size,brandRequired:m.get('brand')?.required,brandType:m.get('brand')?.type,seasonType:m.get('season')?.type,handmadeType:m.get('handmade')?.type,color:m.get('color')?.read(),upc:m.has('upc')}}""")
    req(info['size']==4 and info['brandRequired'] and info['brandType']=='dropdown' and info['seasonType']=='multi' and info['handmadeType']=='yesno','snapshot types/required failed')
    req(info['color']=='Black' and not info['upc'],'closed dropdown/UPC policy failed')
    result=page.evaluate("""async()=>{const m=await EbayPageFieldsV810.collectFieldMap({force:true});EbayAiFillEngineV790.registerAdapters({getPreparedFieldMap:async()=>m,shouldStop:async()=>false,closeOpenMenus:async()=>({ok:true}),waitAutosave:async()=>({ok:true,confirmed:true}),showResult:async()=>({ok:true})});const r=await EbayAiFillEngineV790.fillAll({mode:'integration',payload:{answers:{Brand:'Gucci',Color:'Black',Season:'Spring, Fall, Winter',Handmade:'No',UPC:'999'},waitForAutosave:false}});const current={};for(const[k,f]of m.entries())current[k]=await f.read();return{r,current}}""")
    r=result['r']; req(r['ok'] and r['answerCount']==4 and r['filled']==3 and r['already']==1 and r['review']==0,f'fill failed {r}')
    req(result['current']['brand']=='Gucci' and result['current']['handmade']=='No','single/YesNo verify failed')
    req(set(x.strip() for x in result['current']['season'].split(','))=={'Spring','Fall','Winter'},'multi failed')
    clear=page.evaluate("""async()=>{const m=await EbayPageFieldsV810.collectFieldMap({force:true});const f=m.get('color');const before=await f.read();const sigBefore=EbayPageFieldsV810.fieldValueSignature();const r=await f.clear();const sigAfter=EbayPageFieldsV810.fieldValueSignature();const valueMap=EbayPageFieldsV810.fieldValueMap();return{before,ok:r.ok,after:await f.read(),sigBefore,sigAfter,mapColor:valueMap.Color}}""")
    req(clear['before']=='Black' and clear['ok'] and clear['after']=='','Clear All field clear regression')
    req(clear['sigBefore'] != clear['sigAfter'] and clear['mapColor']=='','field value signature/map must reflect a real Item Specific value change')
    stale=page.evaluate("""async()=>{const m=await EbayPageFieldsV810.collectFieldMap({force:true});const b=m.get('brand');document.getElementById('row-brand').remove();const refreshed=b.refresh();return{refreshed:!!refreshed,row:!!b.row,control:!!b.control,color:m.get('color').read()}}""")
    req(not stale['refreshed'] and not stale['row'] and not stale['control'],'stale row rebound to wrong field')
    browser.close()
print('PASS V8.23.21 real Chromium DOM: exact single, multi, Yes/No, Clear, UPC protection and stale-row safety')
