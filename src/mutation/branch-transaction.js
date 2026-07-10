'use strict';
class BranchTransaction{
  constructor(repo){this.repo=repo;this.events=[]}
  async run(manifest,adapter){
    if(manifest.target_branch===manifest.default_branch) throw new Error('direct default-branch write forbidden');
    await adapter.assertBaseCommit(manifest.base_commit);
    await adapter.createBranch(manifest.target_branch,manifest.base_commit); this.events.push('branch_created');
    try{
      await adapter.writeFiles(manifest.files); this.events.push('files_written');
      await adapter.runTests(manifest.test_commands||[]); this.events.push('tests_passed');
      const commit=await adapter.commit(manifest.commit_message||'tool foundry transaction'); this.events.push('committed');
      return {ok:true,commit,events:this.events};
    }catch(error){
      await adapter.rollback(manifest.base_commit); this.events.push('rolled_back');
      return {ok:false,error:error.message,events:this.events};
    }
  }
}
module.exports={BranchTransaction};
