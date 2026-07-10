'use strict';
const fs=require('fs');
const path=require('path');
const {redactError}=require('./error-redactor');
async function rollbackTransaction({workspace,branch,repoRoot}){
  if(workspace && fs.existsSync(workspace)) fs.rmSync(workspace,{recursive:true,force:true});
  return {status:'rolled_back',branch:redactError(String(branch||''))};
}
module.exports={rollbackTransaction};
