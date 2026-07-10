'use strict';
const metadata={"tool_id":"tool_preflight_verifier","name":"Tool Preflight Verifier","version":"2.0.0","purpose":"Independently verify an install manifest and alone return can_install true.","lifecycle_status":"Approved","risk_level":"low","input_schema":{"type":"object","required":["manifest","approval","evidence"]},"output_schema":{"type":"object","required":["can_install","blockers","checks"]},"protected_effects":[]};
function validateInput(input){return {ok:input&&typeof input==='object',errors:input&&typeof input==='object'?[]:['input must be an object']}}
const {verifyManifest}=require('../mutation/manifest-verifier');
const {verifyApproval}=require('../mutation/approval-verifier');
function collectEvidence(manifest){
  const files=Array.isArray(manifest&&manifest.files)?manifest.files:[];
  const syntacticErrors=[];
  const importsOk=files.every(file=>!/require\(/.test(String(file.content||''))||/\.js$/.test(file.path));
  const testEvidence=files.some(file=>/test/i.test(file.path));
  const secretBlocked=files.some(file=>/api[_-]?key|token|secret|password/i.test(String(file.content||'')));
  for(const file of files){
    if(/\.js$/.test(file.path)){
      try{new Function(String(file.content||''));}catch(error){syntacticErrors.push(error.message)}}
  }
  return {syntax:syntacticErrors.length===0,imports:importsOk,tests:testEvidence||files.length>0,secrets:!secretBlocked,discovery:false,rollback:false};
}
async function execute(input={}){
  const manifest=input.manifest||{};
  const approval=input.approval||{};
  const evidence=collectEvidence(manifest);
  const a=verifyManifest(manifest,{ordinary:manifest.ordinary_tool!==false});
  const b=verifyApproval(manifest,approval);
  const checks={manifest:a.ok,approval:b.ok,...evidence};
  const blockers=[...a.blockers,...b.blockers,...Object.entries(checks).filter(([,v])=>!v).map(([k])=>`check failed: ${k}`)];
  return{can_install:blockers.length===0,blockers,checks};
}
const tests=[{name:'metadata',run:()=>metadata.tool_id==='tool_preflight_verifier'}];
module.exports={metadata,validateInput,execute,tests};
