const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../../Extension');
const zone={isConnected:true,contains:x=>x.inComposer,querySelectorAll:()=>[]};
const editor={isConnected:true,closest:s=>s==='form'?zone:null};
const input={isConnected:true,disabled:false,accept:'image/*',multiple:true,inComposer:true,closest:()=>null};
let candidates=[input];
const context={console,URL,location:{hostname:'chatgpt.com',href:'https://chatgpt.com/'},document:{querySelector:s=>s==='#prompt-textarea'?editor:null,querySelectorAll:()=>candidates,addEventListener:()=>{}},setTimeout,clearTimeout,queueMicrotask};
vm.createContext(context);
for(const file of ['platforms/common.js','platforms/photo_transfer.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const api=context.MarketplacePhotoTransferV8220;
assert.equal(context.MarketplacePlatformV8200.detect(),'chatgpt');
assert.equal(context.MarketplacePlatformV8200.detect('https://chat.openai.com/'),'chatgpt');
assert.equal(context.MarketplacePlatformV8200.detect('https://chatgpt.com.evil.test/'),'unknown');
assert.equal(api.destinationControls().input,input);assert.equal(api.destinationControls().zone,zone);assert.equal(api.destinationReadyState().ready,true);
candidates=[{...input,accept:'.pdf'}];assert.equal(api.destinationControls().input,editor);
candidates=[{...input,disabled:true}];assert.equal(api.destinationControls().input,editor);
context.document.querySelector=()=>null;assert.equal(api.destinationReadyState().ready,false);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
for(const url of ['https://chatgpt.com/*','https://chat.openai.com/*']){
 assert.ok(manifest.host_permissions.includes(url));
 assert.ok(manifest.content_scripts.some(e=>e.matches.includes(url)&&e.run_at==='document_start'));
 assert.ok(manifest.content_scripts.some(e=>e.matches.includes(url)&&e.js.includes('platforms/photo_transfer.js')&&!e.js.includes('content.js')));
}
console.log('PASS ChatGPT domain detection, uploader selection, paste fallback, missing composer, and manifest routing');
