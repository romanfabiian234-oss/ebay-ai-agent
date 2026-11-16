#!/usr/bin/env node
"use strict";
const fs=require("fs"), vm=require("vm"), path=require("path"), assert=require("assert");
const ROOT=path.resolve(__dirname,"../..");
const context={console,URL,Map,Set,Object,Array,String,Number,Boolean,Math,Date,Promise,setTimeout,clearTimeout}; context.globalThis=context; vm.createContext(context);
for(const rel of ["Extension/shared/config.js","Extension/core/policy.js","Extension/core/snapshot.js","Extension/core/ai.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT,rel),"utf8"),context,{filename:rel});
const core=context.EbayCoreAiV800, req=context.EbayAiRequestBuilderV711;
assert(core?.promoteOcrEvidenceImages && req?.imageDetail,"adaptive detail APIs missing");
const images=[
  {photoId:"tag-strong",role:"size tag",url:"https://i.ebayimg.com/images/g/a/s-l1600.jpg"},
  {photoId:"tag-weak",role:"care tag",url:"https://i.ebayimg.com/images/g/b/s-l1600.jpg"},
  {photoId:"front",role:"front",url:"https://i.ebayimg.com/images/g/c/s-l1600.jpg"}
];
const ocr={photos:[
  {photoId:"tag-strong",blocks:[{text:"SIZE XXS",confidence:.97,votes:2}]},
  {photoId:"tag-weak",blocks:[{text:"MATERIAL WOOL",confidence:.69,votes:1}],rectangleDetected:true,rectangleConfidence:.75}
]};
const promoted=Array.from(core.promoteOcrEvidenceImages(images,ocr));
const strong=promoted.find(x=>x.photoId==="tag-strong"), weak=promoted.find(x=>x.photoId==="tag-weak"), front=promoted.find(x=>x.photoId==="front");
assert.strictEqual(strong.localOcrStrongEvidenceCandidate,true);
assert.notStrictEqual(strong.forceHighDetail,true,"strong local label evidence should not pay for duplicate PRIMARY high-detail reading");
assert.strictEqual(req.imageDetail(strong,{tokenMode:"balanced"},"primary"),"low","strong OCR label should stay LOW in primary");
assert.strictEqual(req.imageDetail(strong,{tokenMode:"balanced"},"recovery"),"high","targeted repair must re-read evidence at HIGH detail");
assert.strictEqual(weak.forceHighDetail,true,"weak direct OCR signal should promote primary evidence to HIGH detail");
assert.strictEqual(req.imageDetail(weak,{tokenMode:"balanced"},"primary"),"high");
assert.strictEqual(req.imageDetail(front,{tokenMode:"balanced"},"primary"),"low");
console.log("PASS V8.23.21 adaptive Vision detail: strong local OCR avoids duplicate HIGH-detail primary tokens; weak/conflicting evidence remains HIGH");
