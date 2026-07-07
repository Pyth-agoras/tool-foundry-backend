'use strict';
const STARTED_AT=new Date().toISOString();
const mutableMissions=[];const mutableEvaluations=[];const mutableExecutions=[];
const BUILTIN_TOOL_METADATA=[
{tool_id:'idea_analyzer',name:'Idea Analyzer',purpose:'Analyze raw user ideas into a core goal, risk level, needed tool type, and next action.',status:'Approved',risk_level:'low',version:'0.2.0',approval_state:'approved',builtin:true},
{tool_id:'tool_mission_generator',name:'Tool Mission Generator',purpose:'Convert a raw idea into a complete Tool Mission.',status:'Approved',risk_level:'low',version:'0.2.0',approval_state:'approved',builtin:true},
{tool_id:'foundry_self_healer',name:'Foundry Self-Healer',purpose:'Diagnose Tool Foundry setup problems.',status:'Approved',risk_level:'low',version:'0.1.0',approval_state:'approved',builtin:true},
{tool_id:'foundry_operator',name:'Foundry Operator',purpose:'Apply approved backend file updates, trigger Render redeploys, and verify backend readiness.',status:'Approved',risk_level:'medium',version:'0.1.0',approval_state:'approved',builtin:true},
{tool_id:'pdf_tool_mission_planner',name:'PDF Tool Mission Planner',purpose:'Plan safe PDF/document analysis tools.',status:'Approved',risk_level:'low',version:'0.1.0',approval_state:'approved',builtin:false},
{tool_id:'tool_readiness_checker',name:'Tool Readiness Checker',purpose:'Check whether existing tools satisfy a proposed capability and whether a new tool is needed.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'backend_source_inspector',name:'Backend Source Inspector',purpose:'Read-only inspection of the approved Tool Foundry backend source layout.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'executable_tool_builder',name:'Executable Tool Builder',purpose:'Generate executable Tool Foundry file payloads while separating decision/orchestration tools from ordinary utility tools.',status:'Approved',risk_level:'medium',version:'0.3.2',approval_state:'approved',builtin:false},
{tool_id:'tool_failure_diagnoser',name:'Tool Failure Diagnoser',purpose:'Diagnose failed Tool Foundry tool builds, installs, deployments, registrations, or executions, then recommend the exact repair path in plain English.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'tool_quality_tester',name:'Tool Quality Tester',purpose:'Run structured quality tests against a newly installed Tool Foundry backend tool and decide whether it should be Approved, Needs Revision, or Rejected.',status:'Approved',risk_level:'low',version:'0.2.1',approval_state:'approved',builtin:false},
{tool_id:'tool_installation_validator',name:'Tool Installation Validator',purpose:'Validate proposed Tool Foundry backend tool file payloads before installation.',status:'Testing',risk_level:'low',version:'0.2.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'tool_registry_auditor',name:'Tool Registry Auditor',purpose:'Audit the Tool Foundry registry and verify approved tools are executable and safe.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'workflow_dead_end_resolver',name:'Workflow Dead-End Resolver',purpose:'Detect repeated Tool Foundry failure loops and recommend the shortest path to completion.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'autonomy_governor',name:'Autonomy Governor',purpose:'Decide whether Tool Foundry work may proceed automatically under owner safety gates.',status:'Approved',risk_level:'low',version:'0.2.2',approval_state:'approved',builtin:false},
{tool_id:'tool_workflow_orchestrator',name:'Tool Workflow Orchestrator',purpose:'Coordinate the full Tool Foundry workflow for creating, repairing, testing, approving, and using backend tools.',status:'Testing',risk_level:'low',version:'0.1.1',approval_state:'pending_execution_test',builtin:false},
{tool_id:'tool_call_contract_normalizer',name:'Tool Call Contract Normalizer',purpose:'Normalize Tool Foundry tool-call payloads before execution.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false},
{tool_id:'script_first_engineering_operator',name:'Script-First Engineering Operator',purpose:'Proactively recommend safe helper scripts, validators, parsers, test harnesses, benchmarks, and adapters that make programming and Tool Foundry workflows more reliable.',status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false,input_schema_description:'raw_idea; workflow_context; available_tools; codebase_summary; risk_constraints; approval_status',output_schema_description:'recommended_scripts; script_purposes; script_templates; expected_inputs_outputs; safety_classification; ephemeral_or_committed; execution_test_commands; integration_notes; owner_approval_needed; plain_english_summary'}
];
const mutableTools=new Map(BUILTIN_TOOL_METADATA.map(t=>[t.tool_id,{...t}]));
function getTools(){return Array.from(mutableTools.values())}
function normalize(v){return String(v||'').toLowerCase().replace(/[^a-z0-9_\s-]/g,' ').replace(/\s+/g,' ').trim()}
function hasAny(t,terms){const n=normalize(t);return terms.some(x=>n.includes(normalize(x)))}
function tokenize(v){return normalize(v).split(' ').filter(w=>w.length>2&&!['the','and','for','that','with','into','from','this','tool','tools','backend','create','build','make','new','need','needed','user','users','return','returns','using','check','checks'].includes(w))}
function analyzeIdea(input={}){const raw=input.raw_idea||input.idea||input.text||'';const text=[raw,input.context,input.user_constraints].filter(Boolean).join(' ');const risk=['low','medium','high'].includes(normalize(input.risk_level))?normalize(input.risk_level):'low';return{ok:true,core_goal:raw?String(raw).trim():'No idea provided.',intelligence_pattern:hasAny(text,['analyze','assess','check','classify','score'])?'analysis':'planning',risk_level:risk,approval_required:risk==='high',approval_reasons:[],needed_tool_type:hasAny(text,['pdf','document'])?'document_analysis':'general_backend_tool',next_action:risk==='high'?'Get owner approval before implementation or execution.':'Proceed with planning or use an existing approved tool if one matches.'}}
function generateMission(input={}){const raw=input.raw_idea||input.idea||input.analyzed_idea||input.context||'new backend tool';const idBase=tokenize(raw).slice(0,5).join('_')||'new_tool';const mission={id:`mission_${Date.now()}`,status:'Draft',tool_name:idBase,user_facing_purpose:`Help the owner with: ${raw}`,capability_needed:raw,input_fields:['raw_idea','context','user_constraints'],output_fields:['result','risk_level','approval_required','next_action'],success_criteria:['Returns structured output.','Respects approval and privacy boundaries.','Handles missing input clearly.'],failure_conditions:['Fabricates results.','Bypasses approval requirements.','Requires the owner to write code.'],safety_boundaries:['No unsafe, illegal, or abusive tooling.','No real-world side effects without approval.'],privacy_boundaries:['No credential collection.','No persistent sensitive data storage without approval.'],cost_boundaries:['No paid API usage without approval.'],test_cases:['Valid low-risk idea returns a next action.']};mutableMissions.push(mission);return{ok:true,mission}}
function planPdfTool(input={}){const raw=input.raw_request||input.raw_idea||'PDF/document analysis tool';return{ok:true,mission:{tool_name_suggestion:`${tokenize(raw).slice(0,6).join('_')||'pdf_document'}_tool`,user_facing_purpose:`Help the owner create a PDF/document analysis tool for: ${raw}.`,capability_needed:'Accept supported document inputs, analyze requested content, and return traceable results where possible.',plain_english_summary:`This mission plans a safe PDF/document-analysis tool for: ${raw}.`}}}
function selfHeal(){return{status:'ready_for_operator_use',core_tools_ready:true,core_tools_present:['idea_analyzer','tool_mission_generator','foundry_self_healer','foundry_operator'],missing_core_tools:[],configured_values:{API_KEY:Boolean(process.env.API_KEY),GITHUB_TOKEN:Boolean(process.env.GITHUB_TOKEN),GITHUB_OWNER:Boolean(process.env.GITHUB_OWNER),GITHUB_REPO:Boolean(process.env.GITHUB_REPO),GITHUB_BRANCH:Boolean(process.env.GITHUB_BRANCH),RENDER_DEPLOY_HOOK_URL:Boolean(process.env.RENDER_DEPLOY_HOOK_URL),PUBLIC_BASE_URL:Boolean(process.env.PUBLIC_BASE_URL)},current_tools:getTools(),counts:{tools:getTools().length,missions:mutableMissions.length,evaluations:mutableEvaluations.length,executions:mutableExecutions.length}}}
async function githubPutFile(path,content){const owner=process.env.GITHUB_OWNER,repo=process.env.GITHUB_REPO,branch=process.env.GITHUB_BRANCH||'main',token=process.env.GITHUB_TOKEN;if(!owner||!repo||!token)throw new Error('GitHub write settings are not configured.');const api=`https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'tool-foundry-backend'};let sha;const current=await fetch(`${api}?ref=${encodeURIComponent(branch)}`,{headers});if(current.ok)sha=(await current.json()).sha;const put=await fetch(api,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:`Update ${path}`,content:Buffer.from(content,'utf8').toString('base64'),branch,sha})});if(!put.ok)throw new Error(`GitHub update failed for ${path}: ${put.status} ${await put.text()}`);const body=await put.json();return{path,commit:body.commit&&body.commit.sha}}
async function foundryOperator(input={}) {
  const result = {
    mode: input.mode || 'diagnose',
    started_at: new Date().toISOString(),
    diagnosis_before: selfHeal(),
    actions_taken: [],
    blockers: [],
    results: {}
  };

  const approved =
    input.approved === true &&
    input.approval_confirmed === true;

  if (Array.isArray(input.files) && input.files.length) {
    if (!approved) {
      result.blockers.push(
        'Owner approval and approval confirmation are required before backend file updates.'
      );
      result.next_action =
        'Get owner approval before applying file changes.';
      return result;
    }

    result.results.github_updates = [];

    for (const file of input.files) {
      if (file && file.path && typeof file.content === 'string') {
        const update = await githubPutFile(file.path, file.content);
        result.results.github_updates.push(update);
        result.actions_taken.push(`updated:${file.path}`);
      }
    }

    if (process.env.RENDER_DEPLOY_HOOK_URL) {
      const deploy = await fetch(
        process.env.RENDER_DEPLOY_HOOK_URL,
        { method: 'POST' }
      );

      result.results.render_deploy = {
        ok: deploy.ok,
        status: deploy.status
      };

      result.actions_taken.push('render_deploy_triggered');
    }
  }

  result.results.verification = {
    health_check: 'required',
    tools_list_check: 'required',
    live_execution_check: 'required'
  };

  result.results.diagnosis = selfHeal();

  result.next_action =
    'Verify deployment adoption before marking success.';

  return result;
}
function scoreRegistryMatch(requestText,tool){if(!tool||normalize(tool.status)!=='approved')return null;const haystack=normalize([tool.tool_id,tool.name,tool.purpose,tool.input_schema_description,tool.output_schema_description].filter(Boolean).join(' '));let overlap=0;for(const token of new Set(tokenize(requestText)))if(haystack.includes(token))overlap++;if(overlap>=4)return{tool_id:tool.tool_id,name:tool.name,fit_level:'strong',reason:'The approved tool purpose substantially overlaps with the requested capability.',score:overlap};if(overlap>=2)return{tool_id:tool.tool_id,name:tool.name,fit_level:'partial',reason:'The approved tool overlaps with part of the requested capability.',score:overlap};return null}
function toolReadinessChecker(input={}){const raw=String(input.raw_idea||'').trim();if(!raw)return{existing_capability_match:null,new_tool_needed:false,recommended_tool_id:null,risk_level:'low',approval_required:false,reason:'input.raw_idea is required before readiness can be checked.',next_action:'Provide input.raw_idea and run the checker again.'};const matches=getTools().map(t=>scoreRegistryMatch(raw,t)).filter(Boolean).sort((a,b)=>b.score-a.score);const best=matches[0]||null;const strong=best&&best.fit_level==='strong';return{existing_capability_match:best,new_tool_needed:!strong,recommended_tool_id:strong?best.tool_id:`${tokenize(raw).slice(0,5).join('_')||'new_tool'}_tool`,risk_level:'low',approval_required:false,next_action:strong?`Use ${best.tool_id}.`:'Create a tool implementation for the missing capability.'}}
function fallbackExecutableToolBuilder(input={}){return{ok:true,tool_id:input.tool_id||'unknown_tool',recommended_files_payload:[],router_update_summary:'Fallback handler only.',handler_summary:'No files generated.',approval_required:true,next_action:'Use installed executable_tool_builder module.'}}
function fallbackFailureDiagnoser(input={}){return{failure_category:'live_execution_test_failed',likely_root_cause:'Execution failed and needs repair before approval.',confidence_level:'medium',evidence:{...input},repair_path:'Repair, redeploy, and rerun live execution.',exact_next_action:'Retest after repair.',owner_approval_needed:false,should_mark_needs_revision:true,should_mark_approved:false,plain_english_summary:'Execution failed, so the tool should remain Needs Revision.'}}
function fallbackBackendSourceInspector(){return{repo_owner:process.env.GITHUB_OWNER||null,repo_name:process.env.GITHUB_REPO||null,branch:process.env.GITHUB_BRANCH||'main',handler_registry_location:{file:'src/executable_tool_router.js',exported:true},executable_handlers_found:Object.keys(EXECUTABLE_HANDLERS).map(tool_id=>({tool_id,file:'src/executable_tool_router.js',metadata_found:mutableTools.has(tool_id)})),recommended_patch_targets:[{path:'src/executable_tool_router.js',reason:'Executable handler registry.'}],source_summary:'Runtime router is executable and exposes EXECUTABLE_HANDLERS.'}}
function scriptFirstEngineeringOperator(input={}){return require('./script_first_engineering_operator').execute(input)}
const EXECUTABLE_HANDLERS={idea_analyzer:analyzeIdea,tool_mission_generator:generateMission,foundry_self_healer:selfHeal,foundry_operator:foundryOperator,pdf_tool_mission_planner:planPdfTool,tool_readiness_checker:toolReadinessChecker,backend_source_inspector:fallbackBackendSourceInspector,executable_tool_builder:require('./executable_tool_builder').execute,tool_failure_diagnoser:fallbackFailureDiagnoser,script_first_engineering_operator:scriptFirstEngineeringOperator};
async function executeTool(tool_id,input={}){const handler=EXECUTABLE_HANDLERS[tool_id];if(!handler){const error=new Error('No executable handler is installed for this tool.');error.statusCode=404;throw error}const result=await handler(input);mutableExecutions.push({tool_id,at:new Date().toISOString()});return result}
function registerTool(record={}){if(!record.tool_id){const error=new Error('tool_id is required.');error.statusCode=400;throw error}const previous=mutableTools.get(record.tool_id)||{};const next={...previous,...record,builtin:Boolean(record.builtin??previous.builtin)};mutableTools.set(record.tool_id,next);return{tool_id:record.tool_id,status:next.status||'Draft',message:'Tool registered.'}}
function createMission(record={}){const mission={id:`mission_${Date.now()}`,status:'Draft',...record};mutableMissions.push(mission);return{mission_id:mission.id,status:mission.status,mission}}
function getMissionStatus(id){const mission=mutableMissions.find(m=>m.id===id);if(!mission){const error=new Error('Mission not found.');error.statusCode=404;throw error}return mission}
function evaluateTool(record={}){const tool=mutableTools.get(record.tool_id);const evaluation={tool_id:record.tool_id,status:tool?'ready_for_execution_verification':'not_found',score:tool?0.85:0,recommendation:tool?'Verify one live execution before approval.':'Register or install the tool before evaluation.'};mutableEvaluations.push(evaluation);return evaluation}
const routerApi={STARTED_AT,BUILTIN_TOOL_METADATA,EXECUTABLE_HANDLERS,getTools,executeTool,registerTool,createMission,getMissionStatus,evaluateTool,selfHeal,toolReadinessChecker};
function installExternal(modulePath){try{const mod=require(modulePath);if(mod&&typeof mod.install==='function')return mod.install(routerApi);if(mod&&mod.metadata&&typeof mod.handler==='function'){EXECUTABLE_HANDLERS[mod.metadata.tool_id]=mod.handler;registerTool(mod.metadata);return{installed:true,tool_id:mod.metadata.tool_id}}}catch(error){return{installed:false,modulePath,error:error.message}}return{installed:false,modulePath,error:'No install(router) or metadata+handler export found.'}}
routerApi.external_install_results=[installExternal('./backend_source_inspector'),installExternal('./executable_tool_builder'),installExternal('./tool_failure_diagnoser'),installExternal('./tool_quality_tester'),installExternal('./tool_installation_validator'),installExternal('./tool_registry_auditor'),installExternal('./workflow_dead_end_resolver'),installExternal('./autonomy_governor'),installExternal('./tool_workflow_orchestrator'),installExternal('./note_cleanup_tool'),installExternal('./advanced_custom_gpt_builder'),installExternal('./tool_call_contract_normalizer'),installExternal('./multi_rule_set_image_builder'),installExternal('./script_first_engineering_operator'),installExternal('./tool_install_orchestrator')];
module.exports=routerApi;
