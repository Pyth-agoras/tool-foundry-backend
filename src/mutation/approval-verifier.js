'use strict';
function verifyApproval(manifest,approval){
  const blockers=[];
  if(!approval||approval.approved!==true||approval.approval_confirmed!==true) blockers.push('exact owner approval missing');
  if(approval&&approval.repository!==manifest.repository) blockers.push('repository mismatch');
  if(approval&&approval.target_branch!==manifest.target_branch) blockers.push('target branch mismatch');
  const a=[...(approval&&approval.paths||[])].sort(), b=[...(manifest.files||[]).map(f=>f.path)].sort();
  if(JSON.stringify(a)!==JSON.stringify(b)) blockers.push('approved paths mismatch');
  return {ok:blockers.length===0,blockers};
}
module.exports={verifyApproval};
