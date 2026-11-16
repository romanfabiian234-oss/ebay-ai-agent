const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../Extension');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXcAAAAASUVORK5CYII=';
(async()=>{
const browser = await chromium.launch({headless:true});
try {
for (const mode of ['input','paste','depop','vinted']) {
 const page = await browser.newPage();
 await page.route('https://chatgpt.com/**', route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('https://chatgpt.com/');
 const chat = ['input','paste'].includes(mode);
 await page.setContent(chat ? `<article><img src="data:image/png;base64,${png}" width=80 height=80></article><input type=file accept=".pdf"><form id=zone><div id=prompt-textarea contenteditable=true>Keep my text</div>${mode==='input'?'<input id=upload type=file multiple accept="image/*">':''}<button id=send>Send</button></form>` : mode==='depop' ? '<form aria-label="List an item"><section id=zone><h2>Photos</h2><input id="upload-input__input" type=file multiple accept="image/*"></section></form>' : '<form><section id=zone><h2>Photos</h2><input id=upload name=photos type=file multiple accept="image/*"></section><input name=category><input name=price></form>');
 await page.evaluate(({png,mode,chat})=>{
  window.count=0;window.sent=0;window.MarketplacePlatformV8200={detect:()=>chat?'chatgpt':mode};
  window.chrome={runtime:{lastError:null,sendMessage:(m,cb)=>cb(m.type==='MARKETPLACE_PHOTO_FETCH_V8210'?{ok:true,mime:'image/png',base64:png}:{ok:true})}};
  document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.sent++});
  const target = mode==='paste'?document.querySelector('#prompt-textarea'):document.querySelector('#zone input');
  target.addEventListener(mode==='paste'?'paste':'change',e=>{
   window.count++; if(mode==='paste') e.preventDefault();
   const files = mode==='paste'?e.clipboardData.files:e.target.files;
   window.names=Array.from(files,f=>f.name);
   for(const file of files){const img=document.createElement('img');img.width=80;img.height=80;img.src=URL.createObjectURL(file);document.querySelector('#zone').append(img)}
  });
 },{png,mode,chat});
 for(const file of ['ui/registry/registry.js','ui/photo-transfer/photo-transfer.js','platforms/photo_drop_early.js','platforms/photo_transfer.js']) await page.addScriptTag({path:path.join(root,file)});
 const payload={kind:'marketplace_ai_photo_transfer',transferId:mode,photos:Array.from({length:7},(_,i)=>({url:`https://i.ebayimg.com/images/g/${i}/s-l1600.jpg`,name:`photo-${i}.jpg`}))};
 // Exercise the early custom drag receiver as well as the actual file pipeline.
 await page.evaluate(payload=>{const dt=new DataTransfer();dt.setData('application/x-marketplace-ai-photos','MARKETPLACE_AI_PHOTOS_V1:'+JSON.stringify(payload));document.querySelector('#zone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));},payload);
 await page.waitForFunction(()=>document.querySelectorAll('#zone img').length===7);
 const state=await page.evaluate(()=>({count:window.count,sent:window.sent,names:window.names,photos:MarketplacePhotoTransferV8220.photoImageCount(),text:document.querySelector('#prompt-textarea')?.textContent}));
 assert.equal(state.count,1);assert.equal(state.sent,0);assert.equal(state.photos,7);assert.equal(state.names.length,7);
 if(chat) assert.equal(state.text,'Keep my text');
 console.log('PASS',mode,'early drop; 7 attachments; one upload; no send; composer-only count');
 await page.close();
}
const page=await browser.newPage();await page.addScriptTag({path:path.join(root,'platforms/common.js')});
assert.equal(await page.evaluate(()=>MarketplacePlatformV8200.detect('https://chatgpt.com/c/test')),'chatgpt');
assert.equal(await page.evaluate(()=>MarketplacePlatformV8200.detect('https://chatgpt.com.evil.test/')),'unknown');
console.log('PASS exact ChatGPT hostname detection');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
