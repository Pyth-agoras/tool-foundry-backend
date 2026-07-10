'use strict';
const http=require('http');
const config=require('./config');
const {authenticate}=require('./auth/authenticate');
const {RegistryService}=require('./registry/registry-service');
const {canExecute}=require('./lifecycle/enforce-lifecycle');
const startedAt=new Date().toISOString();
const registry=new RegistryService();
function json(res,status,body){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))}
async function readBody(req){let s='';for await(const c of req)s+=c;if(!s)return{};return JSON.parse(s)}
function route(req,res){
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{status:'ok',service:config.service,version:config.version,commit:config.commit,deployment_id:config.deploymentId,started_at:startedAt,auth_enforced:Boolean(config.apiKey),mutation_gates_enforced:true,registry_loaded:true,registry_tool_count:registry.tools.size,registry_load_failures:registry.failures.length});
  const auth=authenticate(req.headers,config.apiKey);if(!auth.ok)return json(res,auth.status,{error:auth.error});
  if(req.method==='GET'&&url.pathname==='/v2/tools')return json(res,200,registry.snapshot());
  const m=url.pathname.match(/^\/v2\/tools\/([a-z0-9_]+)\/execute$/);
  if(req.method==='POST'&&m)return readBody(req).then(async body=>{const tool=registry.get(m[1]);if(!tool)return json(res,404,{error:'Tool not found.'});if(!canExecute(tool.metadata))return json(res,409,{error:'Tool is not Approved.'});const v=tool.validateInput(body);if(!v.ok)return json(res,400,{errors:v.errors});try{return json(res,200,await tool.execute(body))}catch(e){return json(res,500,{error:e.message})}});
  return json(res,404,{error:'Not found.'});
}
function createServer(){return http.createServer((req,res)=>Promise.resolve(route(req,res)).catch(e=>json(res,500,{error:e.message})))}
if(require.main===module)createServer().listen(config.port,()=>console.log(`${config.service} listening on ${config.port}`));
module.exports={createServer,route,registry,startedAt};
