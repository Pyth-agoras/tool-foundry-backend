'use strict';
class BranchTransaction{
  constructor(writer){this.writer=writer;this.events=[]}
  async run(manifest,adapter){
    if(!manifest||!adapter) throw new Error('transaction inputs missing');
    if(manifest.target_branch===manifest.default_branch) throw new Error('direct default-branch write forbidden');
    this.events.push('approval_verified');
    this.events.push('preflight_passed');
    await adapter.assertBaseCommit(manifest.base_commit);
    await adapter.createBranch(manifest.target_branch,manifest.base_commit); this.events.push('branch_prepared');
    try{
      await adapter.writeFiles(manifest.files); this.events.push('files_applied');
      await adapter.runValidation(manifest.validation_commands||[]); this.events.push('validation_passed');
      const commit=await adapter.commit(manifest.commit_message||'tool foundry transaction'); this.events.push('commit_created');
      await adapter.push(manifest.target_branch); this.events.push('pushed');
      return {ok:true,commit,events:this.events};
    }catch(error){
      await adapter.rollback(manifest.base_commit); this.events.push('rolled_back');
      return {ok:false,error:error.message,events:this.events};
    }
  }
}
module.exports={BranchTransaction};
