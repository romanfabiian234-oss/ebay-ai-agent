#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const ROOT = path.resolve(__dirname, "../..");

function context() {
  const c = { console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, Promise, setTimeout, clearTimeout };
  c.globalThis = c; vm.createContext(c);
  for (const rel of ["Extension/shared/config.js","Extension/core/policy.js","Extension/core/snapshot.js","Extension/core/fill.js","Extension/core/ai.js","Extension/core/match.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), c, { filename: rel });
  return c;
}
function b(text, confidence=0.97, votes=2, photoId="tag") {
  return { text, confidence, votes, photoId, photo:2, role:"physical label", box:{x:.1,y:.5,width:.5,height:.05} };
}
function ocr(blocks) { return { ok:true, available:true, healthy:true, photos:[{ok:true,photoId:"tag",displayNumber:2,role:"physical label",blocks:blocks.map(({photoId,photo,role,...x})=>x)}], blockCount:blocks.length }; }

// Charter Club: CASHMERE on the same physical tag must make standalone M a valid Size context.
{
  const c=context(), v=c.EbayEvidenceValidatorV860, core=c.EbayCoreAiV800;
  const blocks=[b("CASHMERE"),b("CHARTER CLUB"),b("M")];
  const candidate=v.deriveOcrCandidate("Size", blocks, {name:"Size",options:[],optionsComplete:false});
  assert(candidate && candidate.value === "M", "Cashmere label must anchor standalone M as Size");
  const r=core.applyFastOcrMissingRecovery({answers:{},evidence:{},modelResults:{},rejectionReasons:{},warnings:[]},["Size"],ocr(blocks),v,[{name:"Size",type:"single",options:[],optionsComplete:false}]);
  assert.deepStrictEqual(Array.from(r.recovered),["Size"]);
  assert.strictEqual(r.bundle.answers.Size,"M");
}

// J.Crew: a partial 50-of-thousands Brand list must not reject a strong physical-tag brand.
{
  const c=context(), v=c.EbayEvidenceValidatorV860, core=c.EbayCoreAiV800;
  const blocks=[{...b("J.CREW"), role:"brand label"}];
  const brandOcr={ ok:true, available:true, healthy:true, photos:[{ok:true,photoId:"tag",displayNumber:2,role:"brand label",blocks:blocks.map(({photoId,photo,...x})=>x)}], blockCount:1 };
  const partial={name:"Brand",type:"single",options:["Nike","Adidas","Puma"],optionsComplete:false,optionTotal:4523};
  const r=core.applyFastOcrMissingRecovery({answers:{},evidence:{},modelResults:{},rejectionReasons:{},warnings:[]},["Brand"],brandOcr,v,[partial]);
  assert.deepStrictEqual(Array.from(r.recovered),["Brand"]);
  assert.strictEqual(r.bundle.answers.Brand.toLowerCase(),"j.crew");
  const complete={...partial,optionsComplete:true};
  const blocked=core.applyFastOcrMissingRecovery({answers:{},evidence:{},modelResults:{},rejectionReasons:{},warnings:[]},["Brand"],brandOcr,v,[complete]);
  assert.deepStrictEqual(Array.from(blocked.recovered),[],"complete catalog mismatch must remain blocked");
}

// Numeric physical Size 0 can cross only an incomplete catalog and must still require live Fill verification.
{
  const c=context(), resolver=c.EbayUniversalResolverV860, match=c.EbayBlocksV890.matchEbay;
  assert.strictEqual(resolver.sizeToken("0"),"0");
  assert.strictEqual(resolver.sizeToken("00"),"00");
  assert.strictEqual(resolver.sizeToken("0P"),"0p");
  assert.strictEqual(resolver.sizeToken("RN 0"),"", "arbitrary label text must not be normalized into numeric Size");
  const field={name:"Size",type:"single",options:["2","4","6"],optionsComplete:false};
  const analysis={answers:{Size:"0"},modelResults:{Size:{value:"0",localOcrRecovery:true,evidenceType:"physical_tag",status:"confirmed_by_tag"}}};
  const out=match.run({analysis,questions:["Size"],fields:[field]});
  assert.strictEqual(out.answers.Size,"0");
  assert.strictEqual(c.EbaySimpleFillV810.resolveCompositeSize("0", ["0","2","4"]), "0", "live Fill must resolve exact numeric Size 0");
  const gptOnly={answers:{Size:"0"},modelResults:{Size:{value:"0",evidenceType:"visual",status:"accepted"}}};
  const blocked=match.run({analysis:gptOnly,questions:["Size"],fields:[field]});
  assert.strictEqual(blocked.answers.Size,undefined,"ordinary GPT candidate must not bypass incomplete option catalog");
}

// Physical percentage may increase specificity; plain material name must not fabricate 100%.
{
  const c=context(), v=c.EbayEvidenceValidatorV860, core=c.EbayCoreAiV800;
  const field={name:"Material",type:"single",options:["Cashmere","100% Cashmere"],optionsComplete:true};
  const strong=ocr([b("100% CASHMERE")]);
  const base={answers:{Material:"Cashmere"},evidence:{},modelResults:{Material:{value:"Cashmere",evidenceType:"physical_tag",photoSources:[2]}},rejectionReasons:{},warnings:[]};
  const upgraded=core.applyFastOcrIndependentVerification(base,["Material"],strong,v,[field]);
  assert.strictEqual(upgraded.bundle.answers.Material,"100% Cashmere");
  assert.strictEqual(upgraded.bundle.modelResults.Material.localOcrSpecificityUpgrade,true);
  const plain=core.applyFastOcrIndependentVerification(base,["Material"],ocr([b("CASHMERE")]),v,[field]);
  assert.strictEqual(plain.bundle.answers.Material,"Cashmere","plain CASHMERE must not invent 100%");
  const split=core.applyFastOcrIndependentVerification(base,["Material"],ocr([b("100%"),b("CASHMERE")]),v,[field]);
  assert.strictEqual(split.bundle.answers.Material,"100% Cashmere","adjacent split OCR percentage should preserve exact composition");
  const partialField={name:"Material",type:"single",options:["Cotton","Wool"],optionsComplete:false};
  const partialUpgrade=core.applyFastOcrIndependentVerification(base,["Material"],strong,v,[partialField]);
  const matched=c.EbayBlocksV890.matchEbay.run({analysis:partialUpgrade.bundle,questions:["Material"],fields:[partialField]});
  assert.strictEqual(matched.answers.Material,"100% Cashmere","strong 100% Material may defer only to live exact verification when catalog is incomplete");
}

console.log("PASS V8.23.21 direct-label recovery: Cashmere/M, partial Brand, numeric Size and physical 100% Material are deterministic and live-verified");

function success(body){ return {ok:true,requestConfirmed:true,text:JSON.stringify(body),usage:{inputTokens:100,outputTokens:20,totalTokens:120,cost:.001,reported:true},transport:{upstreamStatus:200}}; }
(async()=>{
  // Real Charter Club class: one Primary, local M recovery, and physical 100% specificity upgrade; no paid Repair.
  {
    const c=context(); let calls=0;
    c.EbayAiAnalyzeV711={analyzePhotos:async()=>{calls++; return success({fill_response_schema_version:3,answers:{Brand:"Charter Club",Size:"",Material:"Cashmere"},support:{Brand:{source_type:"physical_tag",photo:2,evidence:"CHARTER CLUB"},Material:{source_type:"physical_tag",photo:2,evidence:"CASHMERE"}}});}};
    c.EbayOcrClientV860={likelyEvidenceImages:x=>x,analyzeSmart:async()=>ocr([b("100% CASHMERE"),b("CHARTER CLUB"),b("M")])};
    const image={photoId:"tag",requestPhotoNumber:2,dataUrl:"data:image/jpeg;base64,AA==",role:"physical label"};
    const r=await c.EbayCoreAiV800.analyzeListing({imagesPrepared:true,images:[image],allImages:[image],questions:["Brand","Size","Material"],fields:[
      {name:"Brand",type:"single",options:["Charter Club"],optionsComplete:true},
      {name:"Size",type:"single",options:[],optionsComplete:false},
      {name:"Material",type:"single",options:["Cashmere","100% Cashmere"],optionsComplete:true}
    ],settings:{tokenMode:"balanced",smartLocalOcrVerify:true},allowRecovery:true,pageContext:{draftId:"charter-club-m"}});
    assert.strictEqual(calls,1,"Charter Club direct label facts should not buy Repair GPT");
    assert.strictEqual(r.answers.Size,"M");
    assert.strictEqual(r.answers.Material,"100% Cashmere");
    assert.strictEqual(r.fastRepairUsed,false);
  }
  // Real J.Crew class: partial Brand catalog and numeric Size 0 are recovered locally in one GPT pass.
  {
    const c=context(); let calls=0;
    c.EbayAiAnalyzeV711={analyzePhotos:async()=>{calls++; return success({fill_response_schema_version:3,answers:{Brand:"",Size:""},support:{}});}};
    const brandBlock={...b("J.CREW"),role:"brand label"};
    const sizeBlock={...b("SIZE 0"),role:"size label"};
    c.EbayOcrClientV860={likelyEvidenceImages:x=>x,analyzeSmart:async()=>({ok:true,available:true,healthy:true,photos:[{ok:true,photoId:"tag",displayNumber:2,role:"brand size label",blocks:[brandBlock,sizeBlock].map(({photoId,photo,...x})=>x)}],blockCount:2})};
    const image={photoId:"tag",requestPhotoNumber:2,dataUrl:"data:image/jpeg;base64,AA==",role:"brand size label"};
    const r=await c.EbayCoreAiV800.analyzeListing({imagesPrepared:true,images:[image],allImages:[image],questions:["Brand","Size"],fields:[
      {name:"Brand",type:"single",options:["Nike","Adidas"],optionsComplete:false,optionTotal:4523},
      {name:"Size",type:"single",options:["2","4","6"],optionsComplete:false,optionTotal:40}
    ],settings:{tokenMode:"balanced",smartLocalOcrVerify:true},allowRecovery:true,pageContext:{draftId:"jcrew-zero"}});
    assert.strictEqual(calls,1,"J.Crew/Size 0 direct facts should stay single-pass");
    assert.strictEqual(String(r.answers.Brand).toLowerCase(),"j.crew");
    assert.strictEqual(r.answers.Size,"0");
  }
  console.log("PASS V8.23.21 direct-label end-to-end: Charter Club M/100% Cashmere and J.Crew Size 0 stay one-pass before live Fill verification");
})().catch(e=>{console.error(e);process.exitCode=1;});
