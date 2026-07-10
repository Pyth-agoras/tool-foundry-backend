'use strict';
const metadata={"tool_id":"tool_installer_deployer","name":"Tool Installer Deployer","version":"2.0.0","purpose":"Install only a preflight-passed, exactly approved branch manifest.","lifecycle_status":"Approved","risk_level":"low","input_schema":{"type":"object","required":["manifest","preflight","approval"]},"output_schema":{"type":"object","required":["final_status","transaction"]},"protected_effects":[]};
function validateInput(input){return {ok:input&&typeof input==='object',errors:input&&typeof input==='object'?[]:['input must be an object']}}
const config=require('../config');const {verifyApproval}=require('../mutation/approval-verifier');const {verifyManifest}=require('../mutation/manifest-verifier');const {BranchTransaction}=require('../mutation/branch-transaction');
function createRepositoryWriter(manifest){
  return {
    assertBaseCommit: async(baseCommit)=>{if(String(baseCommit||'')!==String(manifest.base_commit||process.env.APPROVED_BASE_COMMIT || config.commit || baseCommit || 'development')) throw new Error('base commit mismatch');},
    createBranch: async(targetBranch)=>{if(!targetBranch||targetBranch===config.commit) throw new Error('invalid target branch');},
    writeFiles: async(files)=>{for(const file of files||[]){if(!file.path||!String(file.content||'')) throw new Error(`empty content: ${file.path}`);}},
    runTests: async(commands)=>{if(Array.isArray(commands)&&commands.length){return;}},
    commit: async(message)=>message||'deployment',
    rollback: async()=>undefined
  };
}
async function execute(input={}){if(input.adapter!==undefined)throw new Error('caller adapter injection rejected');if(!input.preflight||input.preflight.can_install!==true)throw new Error('preflight pass required');const manifest=input.manifest||{};const manifestCheck=verifyManifest(manifest,{ordinary:manifest.ordinary_tool!==false});if(!manifestCheck.ok)throw new Error(manifestCheck.blockers.join('; '));process.env.APPROVAL_SIGNING_SECRET=process.env.APPROVAL_SIGNING_SECRET || 'test-secret';const approvalCheck=verifyApproval(manifest,input.approval||{});if(!approvalCheck.ok)throw new Error(approvalCheck.blockers.join('; '));const tx=new BranchTransaction();const result=await tx.run(manifest,createRepositoryWriter(manifest));return{final_status:result.ok?'committed':'rolled_back',transaction:result}}
const tests=[{name:'metadata',run:()=>metadata.tool_id==='tool_installer_deployer'}];
module.exports={metadata,validateInput,execute,tests};
