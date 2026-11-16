// Dependency-free DOM fixtures for the collector and source drag payload.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element {
 constructor(tag,text='',attrs={}){this.tagName=tag.toUpperCase();this.nodeType=1;this.text=text;this.attrs=attrs;this.children=[];this.listeners={};this.dataset={};this.style={};this.isConnected=true;}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n)}return this}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ')}
 set textContent(v){this.text=v;this.children=[]}
 get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}))}
 get src(){return this.attrs.src||''} get currentSrc(){return this.src}
 get outerHTML(){return `<${this.tagName} ${this.attributes.map(a=>`${a.name}="${a.value}"`).join(' ')}>${this.text}${this.children.map(n=>n.outerHTML).join('')}</${this.tagName}>`}
 getAttribute(n){return this.attrs[n]||null} setAttribute(n,v){this.attrs[n]=v}
 matches(s){return s.split(',').some(x=>{x=x.trim();if(x==='*')return true;if(/^[\w]+$/.test(x))return this.tagName===x.toUpperCase();const m=x.match(/^\[([\w-]+)(?:=['"]([^'"]+)['"])?\]$/);return m?m[2]===undefined?m[1] in this.attrs:this.attrs[m[1]]===m[2]:false})}
 querySelectorAll(s){return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)])}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 closest(s){if(s.includes('id^=')&&/^(marketplace-ai-|ebay-ai-)/.test(this.attrs.id||''))return this;return this.matches(s)?this:this.parentElement?.closest(s)||null}
 contains(n){return n===this||this.children.some(c=>c.contains(n))}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f)}
 dispatchEvent(e){e.target??=this;for(const f of this.listeners[e.type]||[])f(e)}
 getBoundingClientRect(){return {width:100,height:100}}
}
const el=(...a)=>new Element(...a);const url=id=>`https://i.ebayimg.com/images/g/${id}/s-l225.jpg`;
const root=path.resolve(__dirname,'../../Extension');
function setup(before=false){
 const heading=el('h2','PHOTOS & VIDEO');
 const counter=el('span','7/25');
 const header=el('div').append(heading,el('p','Help text '.repeat(90)),counter,el('img','',{src:url('Main')}));
 const grid=el('div');for(let i=1;i<7;i++)grid.append(el('img','',{src:url('Photo'+i)}));
 const section=el('section').append(header,grid);
 const form=el('form').append(section,el('section').append(el('h2','TITLE'),el('img','',{src:url('UNRELATED')})));
 const body=el('body').append(form);const document=el('html').append(body);document.body=body;document.documentElement=document;
 document.getElementById=id=>document.querySelectorAll('*').find(n=>n.attrs.id===id)||null;
 const timers=[],observers=[];const notices=[];
 const ctx={console,URL,Set,Map,location:{href:'https://www.ebay.com/lstng?draftId=1',hostname:'www.ebay.com',pathname:'/lstng',search:'?draftId=1'},document,
 getComputedStyle:()=>({backgroundImage:'',content:''}),performance:{getEntriesByType:()=>[{name:url('OLD_LISTING'),initiatorType:'img'}]},
 setTimeout:f=>(timers.push(f),timers.length),clearTimeout:()=>{},requestAnimationFrame:f=>f(),queueMicrotask:f=>f(),
 CustomEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts)}},MutationObserver:class{constructor(cb){this.cb=cb;observers.push(this)}observe(){}disconnect(){}},
 MarketplacePlatformV8200:{detect:()=> 'ebay'},chrome:{runtime:{sendMessage:(m,cb)=>cb({ok:true})}},
 EbayUI:{photoTransfer:{source:({id})=>{const n=el('button','',{id});body.append(n);return n},notice:(m)=>notices.push(m)}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(before?'/tmp/ebay_photos_before.js':path.join(root,'platforms/ebay_photos.js'),'utf8'),ctx);
 return {ctx,header,grid,counter,section,timers,observers,notices};
}
if(process.argv.includes('--compare-before')){
 const {ctx}=setup(true);assert.equal(ctx.EbayPhotoCollectorV8220.collectAllPhotos().length,1);console.log('REPRODUCED previous code: 7 visible photos -> only 1 collected');
}
const f=setup();const api=f.ctx.EbayPhotoCollectorV8220;
assert.equal(api.expectedPhotoCount(),7);assert.equal(api.photoSection(),f.section);
assert.equal(api.collectAllPhotos().length,7);assert.equal(api.selection().complete,true);
assert.deepEqual(Array.from(api.collectAllPhotos(),p=>p.key),['g:Main',...Array.from({length:6},(_,i)=>'g:Photo'+(i+1))]);
assert.notEqual(api.photoKey(url('Aa')),api.photoKey(url('aa')));
vm.runInContext(fs.readFileSync(path.join(root,'platforms/photo_transfer.js'),'utf8'),f.ctx);
const handle=f.ctx.document.getElementById('marketplace-ai-photo-drag-source-v8220');
assert.match(handle.textContent,/Drag 7 photos/);
function drag(){const data={};const e={type:'dragstart',preventDefault(){this.prevented=true},dataTransfer:{setData:(k,v)=>data[k]=v}};handle.dispatchEvent(e);return {e,data}}
let d=drag();assert.equal(JSON.parse(d.data['text/plain'].split('MARKETPLACE_AI_PHOTOS_V1:')[1]).photos.length,7);
// Existing transfer includes all seven URLs, not just a changed button label.
f.grid.children.pop();assert.equal(api.selection().complete,false);
d=drag();assert.equal(d.e.prevented,true);assert.equal(d.data['text/plain'],undefined);
// Do not substitute an old listing's resource for the missing photo.
assert.equal(api.collectAllPhotos().length,6);
f.grid.append(el('img','',{src:url('Photo6')}));f.counter.textContent='8/25';f.grid.append(el('img','',{src:url('Photo7')}));
for(const observer of f.observers)observer.cb([{target:f.grid}]);while(f.timers.length)f.timers.shift()();
assert.match(handle.textContent,/Drag 8 photos/);
// Select exactly two photos, preserving the user-selected subset.
f.header.append(el('span','2 selected'));f.grid.children[0].attrs['aria-selected']='true';f.grid.children[1].attrs['aria-selected']='true';
const selected=api.selection();assert.equal(selected.photos.length,2);assert.equal(selected.complete,true);
assert.deepEqual(Array.from(selected.photos,p=>p.key),['g:Photo1','g:Photo2']);
console.log('PASS seven-photo collection and payload, long help text counter, scoped gallery, case-sensitive IDs, incomplete drag blocked, stale resources excluded, automatic label refresh, selected subset');
// Layout variants missed by the previous fix: header-only SECTION, sibling grid,
// internal headings, plain text label, and an uploader directly inside a form.
for (const variant of ['header-section','internal-heading','plain-label','form-siblings']) {
 const f=setup();
 const main=f.header.children.pop();
 f.grid.children.unshift(main);main.parentElement=f.grid;
 if(variant==='header-section') f.header.tagName='SECTION';
 if(variant==='internal-heading')f.section.children.splice(1,0,el('h3','Upload photos'));
 if(variant==='plain-label')f.header.children[0].tagName='DIV';
 if(variant==='form-siblings'){
   const form=f.section.parentElement;form.children.splice(0,1,f.header,f.grid);f.header.parentElement=form;f.grid.parentElement=form;
 }
 const current=f.ctx.EbayPhotoCollectorV8220;
 assert.equal(current.collectAllPhotos().length,7,variant);
 assert.equal(current.expectedPhotoCount(),7,variant);
 if(process.argv.includes('--compare-v82323')){
   vm.runInContext(fs.readFileSync('/tmp/ebay_photos_v82323.js','utf8'),f.ctx);
   assert.equal(f.ctx.EbayPhotoCollectorV8220.collectAllPhotos().length,0,`old ${variant}`);
 }
 console.log('PASS zero-photo regression:',variant,'-> 7 current-listing photos');
}
