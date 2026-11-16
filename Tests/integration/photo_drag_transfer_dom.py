from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
COLLECTOR = (ROOT / 'Extension/platforms/ebay_photos.js').read_text()
TRANSFER = (ROOT / 'Extension/platforms/photo_transfer.js').read_text()
UI_REGISTRY = (ROOT / 'Extension/ui/registry/registry.js').read_text()
PHOTO_UI = (ROOT / 'Extension/ui/photo-transfer/photo-transfer.js').read_text()
PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXcAAAAASUVORK5CYII='


def req(condition, message):
    if not condition:
        raise AssertionError(message)


def mock_runtime(platform):
    return f'''window.MarketplacePlatformV8200={{detect:()=>"{platform}"}};
window.chrome={{runtime:{{lastError:null,sendMessage:(message,cb)=>{{
  if(message.type==="MARKETPLACE_PHOTO_FETCH_V8210") cb({{ok:true,mime:"image/png",base64:"{PNG_BASE64}"}});
  else if(message.type==="MARKETPLACE_PHOTO_SESSION_CLEAR_V8220") cb({{ok:true}});
  else cb({{ok:false}});
}}}}}};'''


def payload_js(transfer_id, count):
    photos = ','.join(
        f'{{url:"https://i.ebayimg.com/images/g/p{i}/s-l1600.jpg",name:"photo-{i}.jpg"}}'
        for i in range(1, count + 1)
    )
    return f'{{kind:"marketplace_ai_photo_transfer",version:2,transferId:"{transfer_id}",source:"ebay",photos:[{photos}]}}'


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])

    # Depop: uploader appears after the transfer starts. All files must be sent
    # through the real multiple file input in one change event (no 4-file batches).
    depop = browser.new_page(viewport={'width': 900, 'height': 700})
    depop.set_content('<main><h1>List an item</h1><div id="mount"></div></main>')
    depop.add_script_tag(content=mock_runtime('depop'))
    depop.add_script_tag(content=UI_REGISTRY)
    depop.add_script_tag(content=PHOTO_UI)
    depop.add_script_tag(content=TRANSFER)
    depop.evaluate('''()=>setTimeout(()=>{
      document.getElementById("mount").innerHTML=`<form aria-label="List an item"><section id="photos"><h2>Photos</h2><div data-testid="upload-input"><input id="upload-input__input" type="file" multiple accept="image/jpeg,image/png"></div></section></form>`;
      window.depopChangeEvents=0;
      document.getElementById("upload-input__input").addEventListener("change",event=>{
        window.depopChangeEvents++;
        const root=document.getElementById("photos");
        for(const file of event.target.files){const img=document.createElement("img");img.width=80;img.height=80;img.alt=file.name;img.src=URL.createObjectURL(file);root.appendChild(img);}
      });
    },120)''')
    depop_result = depop.evaluate(f'''async()=>MarketplacePhotoTransferV8220.importPayload({payload_js("depop-test", 6)})''')
    req(depop_result['ok'] and depop_result['transferred'] == 6, f'delayed Depop import failed: {depop_result}')
    depop_state = depop.evaluate('''()=>({files:document.getElementById("upload-input__input").files.length,imgs:document.querySelectorAll("#photos img").length,changes:window.depopChangeEvents})''')
    req(depop_state['imgs'] == 6 and depop_state['changes'] == 1, f'Depop single-shot input upload failed: {depop_state}')

    # Poshmark live behavior: one input change opens the Covershot modal. Preview
    # tiles may already exist behind the modal, but the transfer is not complete
    # until the exact Covershot Apply button is committed. This reproduces the
    # real 4/6 and 0/3 failure pattern from live testing.
    poshmark = browser.new_page(viewport={'width': 900, 'height': 700})
    poshmark.set_content('''<main><section><h2>Photos &amp; Video</h2><div id="imagePlaceholder"><label><input id="img-file-input" type="file" multiple accept=".png,.jpg,.jpeg"></label></div></section></main>''')
    poshmark.add_script_tag(content=mock_runtime('poshmark'))
    poshmark.add_script_tag(content=UI_REGISTRY)
    poshmark.add_script_tag(content=PHOTO_UI)
    poshmark.add_script_tag(content=TRANSFER)
    poshmark.evaluate('''()=>{
      window.poshmarkChangeEvents=0; window.poshmarkApplyClicks=0;
      document.getElementById("img-file-input").addEventListener("change",event=>{
        window.poshmarkChangeEvents++;
        const files=Array.from(event.target.files);
        const root=document.getElementById("imagePlaceholder");
        // Reproduce the live race: listing previews can render first, while the
        // Covershot modal arrives later and its Apply button is enabled later still.
        for(const file of files){const img=document.createElement("img");img.width=80;img.height=80;img.alt=file.name;img.src=URL.createObjectURL(file);root.appendChild(img);}
        setTimeout(()=>{
          const modal=document.createElement("div");
          modal.setAttribute("data-test","modal-container"); modal.className="modal";
          modal.style.cssText="position:fixed;left:20px;top:20px;width:500px;height:400px;background:white;z-index:99";
          modal.innerHTML=`<h5>Select a Covershot</h5><div id="crop-previews"></div><button type="button">Cancel</button><button id="covershot-apply" type="button" disabled aria-disabled="true">Apply</button>`;
          for(let i=0;i<Math.min(4,files.length);i++){const preview=document.createElement("img");preview.width=50;preview.height=50;preview.src=URL.createObjectURL(files[i]);modal.querySelector('#crop-previews').appendChild(preview);}
          document.body.appendChild(modal);
          const apply=modal.querySelector('#covershot-apply');
          apply.addEventListener('click',()=>{window.poshmarkApplyClicks++;modal.remove();});
          setTimeout(()=>{apply.disabled=false;apply.setAttribute('aria-disabled','false');},300);
        },600);
      });
    }''')
    poshmark_result = poshmark.evaluate(f'''async()=>MarketplacePhotoTransferV8220.importPayload({payload_js("poshmark-test", 6)})''')
    req(poshmark_result['ok'] and poshmark_result['transferred'] == 6, f'Poshmark covershot commit import failed: {poshmark_result}')
    poshmark_state = poshmark.evaluate('''()=>({imgs:document.querySelectorAll("#imagePlaceholder img").length,changes:window.poshmarkChangeEvents,apply:window.poshmarkApplyClicks,modal:document.querySelectorAll('[data-test="modal-container"]').length})''')
    req(poshmark_state == {'imgs': 6, 'changes': 1, 'apply': 1, 'modal': 0}, f'Poshmark single-shot Covershot verification failed: {poshmark_state}')

    # Vinted: photo-only destination uses the listing file input in one change
    # event, verifies actual preview nodes, and keeps the official 20-photo cap.
    vinted = browser.new_page(viewport={'width': 900, 'height': 700})
    vinted.set_content("""<main><form id="vinted-listing"><section id="vinted-photos"><h2>Photos</h2><div data-testid="photo-upload"><input id="vinted-photo-input" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp"></div></section><section><h2>Item details</h2><label>Category<input name="category"></label></section><section><h2>Pricing</h2><label>Price<input name="price" inputmode="decimal"></label></section></form></main>""")
    vinted.add_script_tag(content=mock_runtime('vinted'))
    vinted.add_script_tag(content=UI_REGISTRY)
    vinted.add_script_tag(content=PHOTO_UI)
    vinted.add_script_tag(content=TRANSFER)
    vinted.evaluate("""()=>{
      window.vintedChangeEvents=0;
      document.getElementById('vinted-photo-input').addEventListener('change',event=>{
        window.vintedChangeEvents++;
        const root=document.getElementById('vinted-photos');
        for(const file of event.target.files){const img=document.createElement('img');img.width=80;img.height=80;img.alt=file.name;img.src=URL.createObjectURL(file);root.appendChild(img);}
      });
    }""")
    vinted_result = vinted.evaluate(f'''async()=>MarketplacePhotoTransferV8220.importPayload({payload_js("vinted-test", 7)})''')
    req(vinted_result['ok'] and vinted_result['transferred'] == 7, f'Vinted single-shot import failed: {vinted_result}')
    vinted_state = vinted.evaluate("""()=>({files:document.getElementById('vinted-photo-input').files.length,imgs:document.querySelectorAll('#vinted-photos img').length,changes:window.vintedChangeEvents,limit:MarketplacePhotoTransferV8220.destinationControls('vinted').limit})""")
    req(vinted_state == {'files': 7, 'imgs': 7, 'changes': 1, 'limit': 20}, f'Vinted photo verification failed: {vinted_state}')

    # Live-like eBay selection: selected toolbar is outside the exact gallery and
    # checkmark controls themselves have no photo URL. Identity is recovered by
    # the hit-test plus eBay's native N-selected count.
    source = browser.new_page(viewport={'width': 900, 'height': 700})
    source.set_content('''<main><div id="editor"><div id="toolbar">Select all - 2 selected</div><section id="gallery"><h2>PHOTOS &amp; VIDEO</h2><div id="counter">3/25</div>
      <div class="card" aria-selected="true" style="position:relative;display:inline-block;width:150px;height:130px"><img style="width:140px;height:120px" src="https://i.ebayimg.com/images/g/a/s-l225.jpg"><button class="native-check" data-i="0" style="position:absolute;left:55px;top:45px;width:36px;height:36px;border-radius:50%"></button></div>
      <div class="card" style="position:relative;display:inline-block;width:150px;height:130px"><img style="width:140px;height:120px" src="https://i.ebayimg.com/images/g/b/s-l225.jpg"><button class="native-check" data-i="1" style="position:absolute;left:55px;top:45px;width:36px;height:36px;border-radius:50%"></button></div>
      <div class="card" aria-selected="true" style="position:relative;display:inline-block;width:150px;height:130px"><img style="width:140px;height:120px" src="https://i.ebayimg.com/images/g/c/s-l225.jpg"><button class="native-check" data-i="2" style="position:absolute;left:55px;top:45px;width:36px;height:36px;border-radius:50%"></button></div>
    </section></div></main>''')
    source.add_script_tag(content='''window.MarketplacePlatformV8200={detect:()=>"ebay"};window.chrome={runtime:{lastError:null,sendMessage:(message,cb)=>cb({ok:true})}};window.EbayIdentityV3={canonicalPhotoUrl:v=>String(v)};window.EbayPageFieldsV810={draftIdFromUrl:()=>"draft-1"};''')
    source.add_script_tag(content=COLLECTOR)
    source.add_script_tag(content=UI_REGISTRY)
    source.add_script_tag(content=PHOTO_UI)
    source.add_script_tag(content=TRANSFER)
    hit_box = source.locator('.native-check').nth(0).bounding_box()
    hit_key = source.evaluate('(p)=>EbayPhotoCollectorV8220.photoKeyAtPoint(p.x,p.y)', {'x': hit_box['x'] + hit_box['width']/2, 'y': hit_box['y'] + hit_box['height']/2})
    req(hit_key == 'g:a', f'native checkmark hit-test did not resolve underlying eBay photo: {hit_key}')
    selected = source.evaluate('''()=>{const s=EbayPhotoCollectorV8220.selection();const el=document.getElementById("marketplace-ai-photo-drag-source-v8220");const dt=new DataTransfer();el.dispatchEvent(new DragEvent("dragstart",{bubbles:true,cancelable:true,dataTransfer:dt}));const payload=JSON.parse(dt.getData("text/plain").replace("MARKETPLACE_AI_PHOTOS_V1:",""));return {mode:s.mode,count:s.photos.length,selectedCount:s.selectedCount,label:el.textContent,payloadCount:payload.photos.length,urls:payload.photos.map(x=>x.url)}}''')
    req(selected['mode'] == 'selected' and selected['selectedCount'] == 2 and selected['count'] == 2, f'native eBay selection not honored: {selected}')
    req(selected['payloadCount'] == 2 and 'Drag 2 selected photos' in selected['label'], f'drag label/payload mismatch: {selected}')
    req('/g/a/' in selected['urls'][0] and '/g/c/' in selected['urls'][1], f'selected photo order mismatch: {selected}')

    # Regression for the delayed native count: no hover is required.
    source.evaluate('''()=>{
      const button=document.querySelector('.native-check[data-i="1"]');
      EbayPhotoCollectorV8220.watchNativeSelectionChange(2,'g:b','');
      setTimeout(()=>{
        document.getElementById('toolbar').textContent='Select all - 3 selected';
        button.closest('.card').setAttribute('aria-selected','true');
      },80);
    }''')
    source.wait_for_timeout(220)
    live_label = source.evaluate('()=>document.getElementById("marketplace-ai-photo-drag-source-v8220").textContent')
    req('Drag 3 selected photos' in live_label, f'drag label did not live-sync after delayed native selection mutation: {live_label}')

    # Shared collector recovers complete lazy gallery; also catches the historical
    # corrupted \b regex indirectly through live selection behavior above.
    recovery = browser.new_page(viewport={'width': 900, 'height': 700})
    recovery.set_content('''<main><section id="gallery"><h2>PHOTOS &amp; VIDEO</h2><div>11/25</div>
      <div data-image-url="https://i.ebayimg.com/images/g/a/s-l225.jpg"></div><div data-image-url="https://i.ebayimg.com/images/g/b/s-l225.jpg"></div>
      <div data-image-url="https://i.ebayimg.com/images/g/c/s-l225.jpg"></div><div data-image-url="https://i.ebayimg.com/images/g/d/s-l225.jpg"></div>
      <div data-image-url="https://i.ebayimg.com/images/g/e/s-l225.jpg"></div><div data-image-url="https://i.ebayimg.com/images/g/f/s-l225.jpg"></div>
      <div data-image-url="https://i.ebayimg.com/images/g/g/s-l225.jpg"></div><div data-image-url="https://i.ebayimg.com/images/g/h/s-l225.jpg"></div>
      <div data-image-url="https://i.ebayimg.com/images/g/i/s-l225.jpg"></div><div data-image-url="https://i.ebayimg.com/images/g/j/s-l225.jpg"></div>
      <div data-image-url="https://i.ebayimg.com/images/g/k/s-l225.jpg"></div>
    </section></main>''')
    recovery.add_script_tag(content='window.EbayIdentityV3={canonicalPhotoUrl:v=>String(v)};')
    recovery.add_script_tag(content=COLLECTOR)
    recovered = recovery.evaluate('()=>({count:EbayPhotoCollectorV8220.collectAllPhotos().length,expected:EbayPhotoCollectorV8220.expectedPhotoCount()})')
    req(recovered['expected'] == 11 and recovered['count'] == 11, f'gallery recovery failed: {recovered}')

    browser.close()

print('PASS V8.23.21 Chromium photo transfer: Depop + Poshmark + Vinted verified destination uploads, delayed eBay selection sync, ordered payload, and shared lazy-photo recovery')
