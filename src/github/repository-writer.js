'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
const {createTempWorkspace}=require('../workspace/temp-workspace');
const {redactError}=require('../ops/error-redactor');
class RepositoryWriter {
  constructor(config={}) {
    this.config=config;
    this.workspaceRoot=config.workspaceRoot||process.env.TOOL_FOUNDRY_WORKSPACE_ROOT||path.join(os.tmpdir(),'tool-foundry-workspaces');
    this.repo=config.repository||process.env.GITHUB_REPOSITORY||'';
    this.defaultBranch=config.defaultBranch||process.env.GITHUB_DEFAULT_BRANCH||'main';
    this.token=config.token||process.env.GITHUB_TOKEN||'';
    this.branchPrefix=config.branchPrefix||process.env.TOOL_BRANCH_PREFIX||'repair';
    this.serviceBaseUrl=config.serviceBaseUrl||process.env.SERVICE_BASE_URL||'';
    this.deployHook=config.deployHook||process.env.RENDER_DEPLOY_HOOK_URL||'';
    this.secret=config.approvalSigningSecret||process.env.APPROVAL_SIGNING_SECRET||'';
  }
  _run(cmd,args,opts={}){
    const result=spawnSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...opts});
    if(result.error) throw result.error;
    if(result.status!==0) throw new Error(`${cmd} ${args.join(' ')} failed: ${redactError(result.stderr||result.stdout||'command failed')}`);
    return result.stdout.trim();
  }
  async assertBaseCommit(baseCommit){
    if(!baseCommit || String(baseCommit)!==String(this.config.approvedBaseCommit||process.env.APPROVED_BASE_COMMIT||'')) throw new Error('base commit mismatch');
  }
  async createBranch(targetBranch,baseCommit){
    if(!targetBranch) throw new Error('missing target branch');
    if(targetBranch===this.defaultBranch) throw new Error('default branch write forbidden');
    if(targetBranch==='replacement/tool-foundry-v2') throw new Error('review branch transaction forbidden');
    const workspace=await createTempWorkspace({root:this.workspaceRoot,baseCommit,branch:targetBranch,repoUrl:this.repo?`https://x-access-token:${this.token}@github.com/${this.repo}.git`:undefined});
    this.workspace=workspace;
    return workspace;
  }
  async writeFiles(files){
    if(!this.workspace) throw new Error('workspace not prepared');
    for(const file of files||[]){
      const target=path.join(this.workspace, file.path);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target, String(file.content||''));
    }
  }
  async runValidation(commands){
    if(!this.workspace) throw new Error('workspace not prepared');
    for(const command of commands||[]){
      const [exe,...args]=command.split(' ');
      const result=spawnSync(exe,args,{cwd:this.workspace,encoding:'utf8',stdio:['ignore','pipe','pipe']});
      if(result.error) throw result.error;
      if(result.status!==0) throw new Error(redactError(result.stderr||result.stdout||`validation failed: ${command}`));
    }
  }
  async commit(message){
    if(!this.workspace) throw new Error('workspace not prepared');
    this._run('git',['-C',this.workspace,'add','-A']);
    this._run('git',['-C',this.workspace,'commit','-m',message]);
    return message;
  }
  async push(branch){
    if(!this.workspace) throw new Error('workspace not prepared');
    this._run('git',['-C',this.workspace,'push','--set-upstream','origin',branch]);
    return branch;
  }
  async preparePullRequest(){
    return {url:'https://example.invalid/pr'};
  }
  async rollback(){
    if(this.workspace){
      fs.rmSync(this.workspace,{recursive:true,force:true});
      this.workspace=null;
    }
  }
}
module.exports={RepositoryWriter};
