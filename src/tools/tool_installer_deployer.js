'use strict';
const metadata={"tool_id":"tool_installer_deployer","name":"Tool Installer Deployer","version":"2.0.0","purpose":"Install only a preflight-passed, exactly approved branch manifest.","lifecycle_status":"Approved","risk_level":"low","input_schema":{"type":"object","required":["manifest","preflight","approval"]},"output_schema":{"type":"object","required":["final_status","transaction"]},"protected_effects":[]};
function validateInput(input){return {ok:input&&typeof input==='object',errors:input&&typeof input==='object'?[]:['input must be an object']}}
const config=require('../config');const {verifyApproval}=require('../mutation/approval-verifier');const {verifyManifest}=require('../mutation/manifest-verifier');const {BranchTransaction}=require('../mutation/branch-transaction');
const {RepositoryWriter}=require('../github/repository-writer');
async function execute(input={}){
  if(input.adapter!==undefined)throw new Error('caller adapter injection rejected');
  if(input.token!==undefined)throw new Error('caller token injection rejected');
  if(input.commands!==undefined)throw new Error('caller command injection rejected');
  if(!input.preflight||input.preflight.can_install!==true)throw new Error('preflight pass required');
  const manifest=input.manifest||{};
  const manifestCheck=verifyManifest(manifest,{ordinary:manifest.ordinary_tool!==false});
  if(!manifestCheck.ok)throw new Error(manifestCheck.blockers.join('; '));
  if(!config.apiKey||!config.approvalSigningSecret||!config.githubRepository||!config.githubToken||!config.renderDeployHookUrl){
    return {final_status:'blocked',transaction:{ok:false,error:'deployment configuration missing',events:['blocked']}};
  }
  const approvalCheck=verifyApproval(manifest,input.approval||{});
  if(!approvalCheck.ok)throw new Error(approvalCheck.blockers.join('; '));
  const writer=new RepositoryWriter({approvedBaseCommit:config.approvedBaseCommit||process.env.APPROVED_BASE_COMMIT,approvedBaseCommitValue:process.env.APPROVED_BASE_COMMIT,repository:config.githubRepository,defaultBranch:config.githubDefaultBranch,token:config.githubToken,workspaceRoot:config.workspaceRoot||process.env.TOOL_FOUNDRY_WORKSPACE_ROOT,branchPrefix:config.toolBranchPrefix,serviceBaseUrl:config.serviceBaseUrl,deployHook:config.renderDeployHookUrl,approvalSigningSecret:config.approvalSigningSecret});
  const tx=new BranchTransaction(writer);
  const result=await tx.run(manifest,{writer});
  return{final_status:result.ok?'committed':'rolled_back',transaction:result};
}
const tests=[{name:'metadata',run:()=>metadata.tool_id==='tool_installer_deployer'}];
module.exports={metadata,validateInput,execute,tests};
