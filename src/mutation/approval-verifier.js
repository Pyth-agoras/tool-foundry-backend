'use strict';
const crypto=require('crypto');
function signReceipt(payload,secret){
  return crypto.createHmac('sha256',secret).update(JSON.stringify(payload)).digest('hex');
}
function normalizePaths(files){return [...files].map(f=>String(f.path||'')).sort()}
function buildReceiptPayload(manifest,approval){
  return {
    repository: String(manifest.repository||''),
    base_commit: String(manifest.base_commit||''),
    target_branch: String(manifest.target_branch||''),
    paths: normalizePaths(manifest.files||[]),
    before_hashes: (manifest.files||[]).map(f=>({path:f.path,before_sha256:f.before_sha256||''})),
    after_hashes: (manifest.files||[]).map(f=>({path:f.path,after_sha256:f.after_sha256||''})),
    protected_effects: manifest.protected_effects||[],
    expires_at: approval&&approval.expires_at ? String(approval.expires_at) : '',
    transaction_id: approval&&approval.transaction_id ? String(approval.transaction_id) : ''
  };
}
function normalizeApprovalPaths(approval,manifest){
  if(Array.isArray(approval&&approval.paths)) return normalizePaths(approval.paths.map(p=>({path:p})));
  return normalizePaths(manifest.files||[]);
}
function verifyApproval(manifest,approval){
  const blockers=[];
  const secret=process.env.APPROVAL_SIGNING_SECRET || process.env.APPROVAL_SECRET || '';
  if(!manifest||!approval||typeof approval!=='object') return {ok:false,blockers:['approval object missing']};
  if(!approval.receipt) blockers.push('approval receipt missing');
  if(!secret) blockers.push('approval signing secret unavailable');
  if(approval.repository!==manifest.repository) blockers.push('repository mismatch');
  if(approval.target_branch!==manifest.target_branch) blockers.push('target branch mismatch');
  if(JSON.stringify(normalizeApprovalPaths(approval,manifest))!==JSON.stringify(normalizePaths(manifest.files||[]))) blockers.push('approved paths mismatch');
  if(JSON.stringify(approval.protected_effects||[])!==JSON.stringify(manifest.protected_effects||[])) blockers.push('protected effects mismatch');
  if(approval.expires_at && approval.expires_at < new Date().toISOString()) blockers.push('approval expired');
  const expectedPayload=buildReceiptPayload(manifest,approval);
  if(approval.receipt && secret){
    const expected=signReceipt(expectedPayload,secret);
    if(approval.receipt!==expected) blockers.push('approval receipt signature mismatch');
  }
  return {ok:blockers.length===0,blockers};
}
module.exports={verifyApproval,signReceipt,buildReceiptPayload};
