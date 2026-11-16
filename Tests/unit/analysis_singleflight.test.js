#!/usr/bin/env node
"use strict";
const fs=require("fs"),vm=require("vm"),path=require("path"),assert=require("assert");
const ROOT=path.resolve(__dirname,"../..");
function ctx(){
 const c={console,URL,Map,Set,Object,Array,String,Number,Boolean,Math,Date,Promise,setTimeout,clearTimeout}; c.globalThis=c; vm.createContext(c);
 for(const rel of ["Extension/shared/config.js","Extension/core/policy.js","Extension/core/snapshot.js","Extension/core/fill.js","Extension/core/ai.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT,rel),"utf8"),c,{filename:rel});
 return c;
}
function response(){return {ok:true,requestConfirmed:true,text:JSON.stringify({fill_response_schema_version:3,answers:{Color:"Black"},support:{Color:{source_type:"visual",photo:1,evidence:"black fabric"}}}),usage:{inputTokens:100,outputTokens:20,totalTokens:120,cost:.001,reported:true},transport:{upstreamStatus:200}};}
function payload(extra={}){const image={photoId:"p1",requestPhotoNumber:1,dataUrl:"data:image/jpeg;base64,AA==",role:"front"}; return {imagesPrepared:true,images:[image],allImages:[image],questions:["Color"],fields:[{name:"Color",type:"single",options:["Black"],optionsComplete:true}],settings:{tokenMode:"balanced",smartLocalOcrVerify:false},allowRecovery:false,pageContext:{draftId:"draft-1",category:"Sweaters"},...extra};}
(async()=>{
  // Identical concurrent analysis must share one paid primary request.
  {
    const c=ctx(); let calls=0;
    c.EbayAiAnalyzeV711={analyzePhotos:async()=>{calls++; await new Promise(r=>setTimeout(r,40)); return response();}};
    const [a,b]=await Promise.all([c.EbayCoreAiV800.analyzeListing(payload()),c.EbayCoreAiV800.analyzeListing(payload())]);
    assert.strictEqual(calls,1,"identical concurrent analyses must use one upstream request");
    assert.strictEqual(a.ok,true); assert.strictEqual(b.ok,true);
    assert([a.singleFlightJoined,b.singleFlightJoined].includes(true),"one caller should report joining the in-flight analysis");
    assert.strictEqual(c.EbayCoreAiV800.activeAnalysisCount(),0,"single-flight map must clean up after success");
  }
  // Different drafts must never share analysis.
  {
    const c=ctx(); let calls=0;
    c.EbayAiAnalyzeV711={analyzePhotos:async()=>{calls++; await new Promise(r=>setTimeout(r,10)); return response();}};
    await Promise.all([c.EbayCoreAiV800.analyzeListing(payload()),c.EbayCoreAiV800.analyzeListing(payload({pageContext:{draftId:"draft-2",category:"Sweaters"}}))]);
    assert.strictEqual(calls,2,"different drafts must remain independent");
  }
  // Failure must clear the guard so a later explicit retry can run once.
  {
    const c=ctx(); let calls=0;
    c.EbayAiAnalyzeV711={analyzePhotos:async()=>{calls++; if(calls===1) throw new Error("temporary failure"); return response();}};
    await assert.rejects(()=>c.EbayCoreAiV800.analyzeListing(payload()),/failed|temporary/i);
    assert.strictEqual(c.EbayCoreAiV800.activeAnalysisCount(),0,"failed analysis must release single-flight guard");
    const later=await c.EbayCoreAiV800.analyzeListing(payload());
    assert.strictEqual(later.ok,true); assert.strictEqual(calls,2,"later explicit retry must be allowed after cleanup");
  }
  console.log("PASS V8.23.21 analysis single-flight: identical concurrent Fill joins one paid request; different drafts stay separate; failures clean up safely");
})().catch(e=>{console.error(e);process.exit(1);});
