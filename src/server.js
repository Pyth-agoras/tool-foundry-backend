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
function requiresAuth(pathname){return pathname!=='/health';}
function mutationControlsAvailable(){return Boolean(config.apiKey)&&Boolean(process.env.APPROVAL_SIGNING_SECRET || process.env.APPROVAL_SECRET);}
function authConfigured(){return Boolean(config.apiKey);}

function healthPayload(){return {status:'ok',service:config.service,version:config.version,commit:config.commit,deployment_id:config.deploymentId,started_at:startedAt,auth_enforced:authConfigured(),mutation_gates_enforced:mutationControlsAvailable(),registry_loaded:true,registry_tool_count:registry.tools.size,registry_load_failures:registry.failures.length};}
async function route(req,res){
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,healthPayload());
  if(requiresAuth(url.pathname)){const auth=authenticate(req.headers,config.apiKey);if(!auth.ok)return json(res,auth.status,{error:auth.error});}
  if(req.method==='GET'&&url.pathname==='/v2/tools')return json(res,200,registry.snapshot());
  const toolRoute=url.pathname.match(/^\/v2\/tools\/([a-z0-9_]+)$/);
  if(req.method==='GET'&&toolRoute){const tool=registry.get(toolRoute[1]);if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,{tool_id:tool.metadata.tool_id,metadata:tool.metadata})}
  const executeRoute=url.pathname.match(/^\/v2\/tools\/([a-z0-9_]+)\/execute$/);
  if(req.method==='POST'&&executeRoute){const body=await readBody(req);const tool=registry.get(executeRoute[1]);if(!tool)return json(res,404,{error:'Tool not found.'});if(!canExecute(tool.metadata))return json(res,409,{error:'Tool is not Approved.'});const v=tool.validateInput(body);if(!v.ok)return json(res,400,{errors:v.errors});try{return json(res,200,await tool.execute(body))}catch(e){return json(res,500,{error:e.message})}}
  if(req.method==='POST'&&url.pathname==='/v2/ideas/analyze'){const body=await readBody(req);const tool=registry.get('idea_analyzer');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname==='/v2/tools/create'){const body=await readBody(req);const tool=registry.get('tool_creator');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname==='/v2/source/inspect'){const body=await readBody(req);const tool=registry.get('source_inspector');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname==='/v2/preflight/verify'){const body=await readBody(req);const tool=registry.get('tool_preflight_verifier');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname==='/v2/install'){const body=await readBody(req);const tool=registry.get('tool_installer_deployer');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname==='/v2/deployments/verify'){const body=await readBody(req);const tool=registry.get('deployment_verifier');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname.match(/^\/v2\/tools\/([a-z0-9_]+)\/repair$/)){const body=await readBody(req);const tool=registry.get('tool_repairer');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  if(req.method==='POST'&&url.pathname==='/v2/registry/audit'){const body=await readBody(req);const tool=registry.get('registry_auditor');if(!tool)return json(res,404,{error:'Tool not found.'});return json(res,200,await tool.execute(body))}
  return json(res,404,{error:'Not found.'});
}
function createServer(){return http.createServer((req,res)=>Promise.resolve(route(req,res)).catch(e=>json(res,500,{error:e.message}))) }
if(require.main===module)createServer().listen(config.port,()=>console.log(`${config.service} listening on ${config.port}`));
module.exports={createServer,route,registry,startedAt};
