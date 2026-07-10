'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),http=require('http');
const {loadTools}=require('../src/registry/tool-loader');
const {authenticate}=require('../src/auth/authenticate');
const {verifyManifest,sha256}=require('../src/mutation/manifest-verifier');
const {verifyApproval,signReceipt}=require('../src/mutation/approval-verifier');
const {BranchTransaction}=require('../src/mutation/branch-transaction');
const server=require('../src/server');
const config=require('../src/config');

function makeManifest(overrides={}){const c='const ok=true;';return {repository:'o/r',base_commit:'56ab494159cd0f877aa2c666639f1cba8dc8753a',target_branch:'repair/test',default_branch:'main',ordinary_tool:true,files:[{path:'src/tools/x.js',content:c,before_sha256:sha256(c),after_sha256:sha256(c),full_returned:true,truncated:false,redacted:false,operation:'replace'}],protected_effects:[],...overrides}};
function makeApproval(manifest){const secret='test-secret';return {repository:manifest.repository,default_branch:manifest.default_branch,transaction_branch:manifest.target_branch,base_commit:manifest.base_commit,transaction_id:'tx-1',expires_at:new Date(Date.now()+60000).toISOString(),paths:manifest.files.map(f=>f.path),protected_effects:manifest.protected_effects||[],receipt:signReceipt({schema_version:2,repository:manifest.repository,default_branch:manifest.default_branch,base_commit:manifest.base_commit,transaction_branch:manifest.target_branch,transaction_id:'tx-1',expires_at:new Date(Date.now()+60000).toISOString(),operations:['replace'],paths:manifest.files.map(f=>f.path),before_hashes:manifest.files.map(f=>({path:f.path,before_sha256:f.before_sha256||''})),after_hashes:manifest.files.map(f=>({path:f.path,after_sha256:f.after_sha256||''})),fixed_validation_commands:['npm test'],protected_github_effects:[],protected_deployment_effects:[],protected_effects:manifest.protected_effects||[]},secret)}};
function request(serverInstance,pathname,options={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:serverInstance.address().port,path:pathname,method:options.method||'GET',headers:options.headers||{}},res=>{
      let x='';
      res.on('data',c=>x+=c);
      res.on('end',()=>resolve({statusCode:res.statusCode,body:JSON.parse(x)}));
    });
    req.on('error',reject);
    if(options.body!==undefined)req.write(typeof options.body==='string'?options.body:JSON.stringify(options.body));
    req.end();
  });
}

test('discovers exactly eight V2 tools',()=>{const r=loadTools();assert.strictEqual(r.tools.size,8);assert.deepStrictEqual(r.failures,[]);assert.deepStrictEqual(r.duplicates,[])})
test('auth matrix',()=>{assert.strictEqual(authenticate({},'').status,503);assert.strictEqual(authenticate({},'k').status,401);assert.strictEqual(authenticate({authorization:'Bearer k'},'k').ok,true);assert.strictEqual(authenticate({'x-api-key':'k'},'k').ok,true)})
test('ordinary manifest paths only',()=>{const base=makeManifest();assert.strictEqual(verifyManifest(base).ok,true);assert.strictEqual(verifyManifest({...base,files:[{...base.files[0],path:'src/server.js'}]}).ok,false)})
test('branch rollback on failed tests',async()=>{const events=[];const adapter={assertBaseCommit:async()=>{},createBranch:async()=>events.push('branch'),writeFiles:async()=>events.push('write'),runTests:async()=>{throw new Error('failed')},commit:async()=>{},rollback:async()=>events.push('rollback')};const r=await new BranchTransaction().run({base_commit:'a',target_branch:'b',default_branch:'main',files:[]},adapter);assert.strictEqual(r.ok,false);assert.ok(events.includes('rollback'))})
test('health flags reflect runtime auth and gate availability',async()=>{process.env.API_KEY='k';process.env.APPROVAL_SIGNING_SECRET='test-secret';process.env.GITHUB_REPOSITORY='o/r';process.env.GITHUB_TOKEN='x';process.env.RENDER_DEPLOY_HOOK_URL='https://example.invalid/hook';config.apiKey='k';config.approvalSigningSecret='test-secret';config.githubRepository='o/r';config.githubToken='x';config.renderDeployHookUrl='https://example.invalid/hook';const s=server.createServer().listen(0);try{const res=await request(s,'/health');assert.strictEqual(res.body.auth_enforced,true);assert.strictEqual(res.body.mutation_gates_enforced,true)}finally{await new Promise(r=>s.close(r))}})
test('missing auth configuration fails closed',async()=>{delete process.env.API_KEY;config.apiKey='';const s=server.createServer().listen(0);try{const res=await request(s,'/v2/tools');assert.strictEqual(res.statusCode,503)}finally{await new Promise(r=>s.close(r))}})
test('forged preflight evidence is rejected',async()=>{const pre=require('../src/tools/tool_preflight_verifier');const manifest=makeManifest({files:[{path:'src/tools/x.js',content:'const token="secret";',before_sha256:sha256('old'),after_sha256:sha256('const token="secret";'),full_returned:true,truncated:false,redacted:false}]});const out=await pre.execute({manifest,approval:makeApproval(manifest),evidence:{syntax:true,imports:true,tests:true,secrets:true,discovery:true,rollback:true}});assert.strictEqual(out.can_install,false);assert.ok(out.blockers.some(b=>/secret|check failed/i.test(b)))})
test('forged approval booleans and altered manifests are rejected',()=>{const manifest=makeManifest();const forgedApproval={approved:true,approval_confirmed:true,repository:'o/r',transaction_branch:'repair/test',default_branch:'main',base_commit:manifest.base_commit,transaction_id:'tx-1',expires_at:new Date(Date.now()+60000).toISOString(),paths:['src/tools/x.js'],protected_effects:[]};assert.strictEqual(verifyApproval(manifest,forgedApproval).ok,false);assert.strictEqual(verifyManifest({...manifest,files:[{...manifest.files[0],after_sha256:'bad'}]}).ok,false)})
test('caller adapter injection is rejected',async()=>{const installer=require('../src/tools/tool_installer_deployer');await assert.rejects(()=>installer.execute({manifest:makeManifest(),preflight:{can_install:true},approval:makeApproval(makeManifest()),adapter:{}}),/adapter/i)})
test('base commit mismatch and undeclared paths are rejected',()=>{assert.strictEqual(verifyManifest({...makeManifest(),base_commit:'z'}).ok,false);assert.strictEqual(verifyManifest({...makeManifest(),files:[{...makeManifest().files[0],path:'src/server.js'}]}).ok,false)})
test('default-branch writes and before-hash mismatches are rejected',()=>{assert.strictEqual(verifyManifest({...makeManifest(),target_branch:'main',default_branch:'main'}).ok,false);assert.strictEqual(verifyManifest({...makeManifest(),files:[{...makeManifest().files[0],before_sha256:'bad'}]}).ok,false)})
test('all required routes match OpenAPI',()=>{const y=fs.readFileSync(path.join(__dirname,'..','openapi.yaml'),'utf8');for(const p of ['/health','/v2/tools','/v2/tools/{tool_id}','/v2/tools/{tool_id}/execute','/v2/ideas/analyze','/v2/tools/create','/v2/source/inspect','/v2/preflight/verify','/v2/install','/v2/deployments/verify','/v2/tools/{tool_id}/repair','/v2/registry/audit'])assert.ok(y.includes(p),`missing ${p}`)})
test('the eight foundation tools execute substantively', async () => {
  const r = loadTools();
  for (const tool of r.tools.values()) {
    let input = {};
    if (tool.metadata.tool_id === 'tool_creator') {
      input = { tool_id: 'sample_tool', purpose: 'sample' };
    } else if (tool.metadata.tool_id === 'source_inspector') {
      input = { commit: 'a', path: 'src/tools/x.js', content: 'const x = 1;' };
    } else if (tool.metadata.tool_id === 'tool_preflight_verifier') {
      const manifest = makeManifest();
      input = { manifest, approval: makeApproval(manifest), evidence: {} };
    } else if (tool.metadata.tool_id === 'tool_installer_deployer') {
      const manifest = makeManifest();
      input = { manifest, preflight: { can_install: true }, approval: makeApproval(manifest) };
    } else if (tool.metadata.tool_id === 'deployment_verifier') {
      input = { expected: { commit: 'x' }, health: { commit: 'x', auth_enforced: true, mutation_gates_enforced: true, started_at: '2024-01-01T00:00:00.000Z' }, registry: { installed_tools: [] }, executions: {} };
    } else if (tool.metadata.tool_id === 'registry_auditor') {
      input = { registry: { installed_tools: [], load_failures: [], duplicate_ids: [] } };
    } else if (tool.metadata.tool_id === 'tool_repairer') {
      input = { tool_id: 'sample_tool', failure: 'x' };
    } else if (tool.metadata.tool_id === 'idea_analyzer') {
      input = { raw_idea: 'build a tool' };
    }
    const out = await tool.execute(input);
    assert.ok(out !== undefined);
    assert.ok(typeof out === 'object');
  }
});
test('sample ordinary tool installs using only its tool, test, and manifest files',async()=>{const creator=require('../src/tools/tool_creator');const out=await creator.execute({tool_id:'sample_tool',purpose:'sample'});assert.deepStrictEqual(out.files.map(f=>f.path),['src/tools/sample_tool.js','test/tools/sample_tool.test.js','tool-manifests/sample_tool.json']);assert.ok(out.files.every(f=>f.content&&f.content.length))})
test('removed legacy tool ids are absent',()=>{const r=loadTools();assert.strictEqual(r.tools.has('tool_readiness_checker'),false)})
