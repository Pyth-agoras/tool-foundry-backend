'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),http=require('http');
const {loadTools}=require('../src/registry/tool-loader');
const {authenticate}=require('../src/auth/authenticate');
const {verifyManifest,sha256}=require('../src/mutation/manifest-verifier');
const {BranchTransaction}=require('../src/mutation/branch-transaction');
const server=require('../src/server');

test('discovers exactly eight V2 tools',()=>{const r=loadTools();assert.strictEqual(r.tools.size,8);assert.deepStrictEqual(r.failures,[]);assert.deepStrictEqual(r.duplicates,[])});
test('auth matrix',()=>{assert.strictEqual(authenticate({},'').status,503);assert.strictEqual(authenticate({},'k').status,401);assert.strictEqual(authenticate({authorization:'Bearer k'},'k').ok,true);assert.strictEqual(authenticate({'x-api-key':'k'},'k').ok,true)});
test('ordinary manifest paths only',()=>{const c='x';const base={repository:'o/r',base_commit:'a',target_branch:'b',default_branch:'main',ordinary_tool:true,files:[{path:'src/tools/x.js',content:c,after_sha256:sha256(c),full_returned:true,truncated:false,redacted:false}]};assert.strictEqual(verifyManifest(base).ok,true);assert.strictEqual(verifyManifest({...base,files:[{...base.files[0],path:'src/server.js'}]}).ok,false)});
test('branch rollback on failed tests',async()=>{const events=[];const adapter={assertBaseCommit:async()=>{},createBranch:async()=>events.push('branch'),writeFiles:async()=>events.push('write'),runTests:async()=>{throw new Error('failed')},commit:async()=>{},rollback:async()=>events.push('rollback')};const r=await new BranchTransaction().run({base_commit:'a',target_branch:'b',default_branch:'main',files:[]},adapter);assert.strictEqual(r.ok,false);assert.ok(events.includes('rollback'))});
test('server import does not listen and health is public',async()=>{process.env.API_KEY='k';const s=server.createServer().listen(0);try{const port=s.address().port;const body=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${port}/health`,r=>{let x='';r.on('data',c=>x+=c);r.on('end',()=>resolve(JSON.parse(x)))}).on('error',reject));assert.strictEqual(body.auth_enforced,false);assert.strictEqual(body.mutation_gates_enforced,true)}finally{await new Promise(r=>s.close(r))}});
