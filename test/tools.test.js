'use strict';
const test=require('node:test'),assert=require('node:assert');
const {loadTools}=require('../src/registry/tool-loader');

test('all embedded tool tests pass',async()=>{const r=loadTools();for(const t of r.tools.values())for(const c of t.tests)assert.strictEqual(await c.run(),true)});
test('sample tool creation requires no core edits',async()=>{const creator=require('../src/tools/tool_creator');const r=await creator.execute({tool_id:'sample_tool',purpose:'sample'});assert.deepStrictEqual(r.files.map(f=>f.path),['src/tools/sample_tool.js','test/tools/sample_tool.test.js','tool-manifests/sample_tool.json'])});
test('preflight alone returns can_install',async()=>{const pre=require('../src/tools/tool_preflight_verifier');const {sha256}=require('../src/mutation/manifest-verifier');const manifest={repository:'o/r',base_commit:'a',target_branch:'b',default_branch:'main',ordinary_tool:true,protected_effects:[],files:[{path:'src/tools/x.js',content:'const ok=true;',before_sha256:sha256('old'),after_sha256:sha256('const ok=true;'),full_returned:true,truncated:false,redacted:false}]};const approval={repository:'o/r',target_branch:'b',paths:['src/tools/x.js'],protected_effects:[],receipt:'dummy'};const out=await pre.execute({manifest,approval,evidence:{}});assert.strictEqual(out.can_install,false)});
