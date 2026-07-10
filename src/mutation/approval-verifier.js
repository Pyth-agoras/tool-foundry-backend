'use strict';
const crypto=require('crypto');
const {redactError}=require('../ops/error-redactor');
const consumed=new Set();
function signReceipt(payload,secret){
  return crypto.createHmac('sha256',secret).update(JSON.stringify(payload)).digest('hex');
}
function normalizePaths(files){return [...files].map(f=>String(f.path||'')).sort()}
function buildReceiptPayload(manifest,approval){
  return {
    schema_version: 2,
    repository: String(manifest.repository||''),
    default_branch: String(manifest.default_branch||''),
    base_commit: String(manifest.base_commit||''),
    transaction_branch: String(manifest.target_branch||''),
    transaction_id: String(approval.transaction_id||''),
    expires_at: String(approval.expires_at||''),
    operations: Array.isArray(approval.operations)?approval.operations:[],
    paths: normalizePaths(manifest.files||[]),
    before_hashes: (manifest.files||[]).map(f=>({path:f.path,before_sha256:f.before_sha256||''})),
    after_hashes: (manifest.files||[]).map(f=>({path:f.path,after_sha256:f.after_sha256||''})),
    fixed_validation_commands: Array.isArray(approval.fixed_validation_commands)?approval.fixed_validation_commands:[],
    protected_github_effects: approval.protected_github_effects||[],
    protected_deployment_effects: approval.protected_deployment_effects||[],
    protected_effects: manifest.protected_effects||[]
  };
}
function verifyApproval(manifest,approval){
  const blockers=[];
  const secret=String(process.env.APPROVAL_SIGNING_SECRET||'');
  if(!manifest||!approval||typeof approval!=='object') return {ok:false,blockers:['approval object missing']};
  if(!approval.receipt) blockers.push('approval receipt missing');
  if(!secret) blockers.push('approval signing secret unavailable');
  if(approval.repository!==manifest.repository) blockers.push('repository mismatch');
  if(approval.default_branch!==manifest.default_branch) blockers.push('default branch mismatch');
  if(approval.transaction_branch!==manifest.target_branch) blockers.push('target branch mismatch');
  if(approval.base_commit!==manifest.base_commit) blockers.push('base commit mismatch');
  if(approval.transaction_id && consumed.has(String(approval.transaction_id))) blockers.push('approval replayed');
  if(approval.expires_at && approval.expires_at < new Date().toISOString()) blockers.push('approval expired');
  if(JSON.stringify(normalizePaths(approval.paths||[]))!==JSON.stringify(normalizePaths(manifest.files||[]))) blockers.push('approved paths mismatch');
  if(JSON.stringify(approval.protected_effects||[])!==JSON.stringify(manifest.protected_effects||[])) blockers.push('protected effects mismatch');
  if(approval.receipt && secret){
    const expectedPayload=buildReceiptPayload(manifest,approval);
    const expected=signReceipt(expectedPayload,secret);
    if(approval.receipt!==expected) blockers.push('approval receipt signature mismatch');
  }
  if(blockers.length===0 && approval.transaction_id) consumed.add(String(approval.transaction_id));
  return {ok:blockers.length===0,blockers};
}
module.exports={verifyApproval,signReceipt,buildReceiptPayload,consumed};
