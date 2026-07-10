'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
async function createTempWorkspace({root,baseCommit,branch,repoUrl}={}){
  if(!root||!baseCommit||!branch) throw new Error('workspace parameters missing');
  fs.mkdirSync(root,{recursive:true});
  const dir=path.join(root, `${branch.replace(/\//g,'-')}-${Date.now()}`);
  fs.mkdirSync(dir,{recursive:true});
  const gitInit=spawnSync('git',['init','-b',branch],{cwd:dir,encoding:'utf8'});
  if(gitInit.status!==0) throw new Error(gitInit.stderr||gitInit.stdout||'git init failed');
  if(repoUrl){
    const remote=spawnSync('git',['remote','add','origin',repoUrl],{cwd:dir,encoding:'utf8'});
    if(remote.status!==0) throw new Error(remote.stderr||remote.stdout||'remote add failed');
  }
  const fetch=spawnSync('git',['fetch','--depth','1','origin',baseCommit],{cwd:dir,encoding:'utf8'});
  if(fetch.status!==0) throw new Error(fetch.stderr||fetch.stdout||'fetch failed');
  const checkout=spawnSync('git',['checkout','-f',baseCommit],{cwd:dir,encoding:'utf8'});
  if(checkout.status!==0) throw new Error(checkout.stderr||checkout.stdout||'checkout failed');
  return dir;
}
module.exports={createTempWorkspace};
