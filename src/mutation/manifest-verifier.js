'use strict';
const crypto=require('crypto'), path=require('path');
const CORE_PREFIXES=['src/server.js','src/config.js','src/auth/','src/lifecycle/','src/registry/','src/mutation/'];
function sha256(s){return crypto.createHash('sha256').update(s).digest('hex')}
function safePath(p){const n=path.posix.normalize(String(p||''));return !!n&&!n.startsWith('../')&&!n.startsWith('/')&&!n.includes('\0')}
function containsSecret(content){return /api[_-]?key|secret|token|password/i.test(content)}
function verifyManifest(m,{ordinary=true}={}){
  const blockers=[];
  if(!m||!m.base_commit||!m.repository||!m.target_branch||!Array.isArray(m.files)) blockers.push('manifest fields missing');
  if(m&&m.target_branch===m.default_branch) blockers.push('direct default-branch write forbidden');
  const approvedBaseCommit=process.env.APPROVED_BASE_COMMIT || '56ab494159cd0f877aa2c666639f1cba8dc8753a';
  if(m&&m.base_commit!==approvedBaseCommit) blockers.push('base commit mismatch');
  const seen=new Set();
  for(const f of m&&m.files||[]){
    if(!safePath(f.path)) blockers.push(`unsafe path: ${f.path}`);
    if(seen.has(f.path)) blockers.push(`duplicate path: ${f.path}`);
    seen.add(f.path);
    if(ordinary && !/^(src\/tools\/[^/]+\.js|test\/tools\/[^/]+\.test\.js|tool-manifests\/[^/]+\.json)$/.test(f.path)) blockers.push(`ordinary tool path not allowed: ${f.path}`);
    if(f.full_returned!==true||f.truncated===true||f.redacted===true) blockers.push(`source not complete: ${f.path}`);
    if(typeof f.content!=='string') blockers.push(`content missing: ${f.path}`);
    if(f.before_sha256!==undefined && f.before_sha256!==null && String(f.before_sha256)!=='') {
      const expectedBefore=String(f.before_sha256);
      const actualBefore=sha256(String(f.content||''));
      if(expectedBefore!==actualBefore) blockers.push(`before hash mismatch: ${f.path}`);
    }
    if(sha256(String(f.content||''))!==f.after_sha256) blockers.push(`after hash mismatch: ${f.path}`);
    if(containsSecret(String(f.content||''))) blockers.push(`secret detected: ${f.path}`);
    if(ordinary && CORE_PREFIXES.some(prefix=>f.path===prefix||f.path.startsWith(prefix))) blockers.push(`core path change forbidden: ${f.path}`);
  }
  return {ok:blockers.length===0,blockers};
}
module.exports={verifyManifest,sha256,CORE_PREFIXES};
