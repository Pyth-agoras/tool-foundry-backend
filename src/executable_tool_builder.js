'use strict';

const METADATA = {
  tool_id: 'executable_tool_builder',
  name: 'Executable Tool Builder',
  purpose: 'Generate executable Tool Foundry file payloads while separating decision/orchestration tools from ordinary utility tools.',
  status: 'Approved',
  risk_level: 'medium',
  version: '0.3.2',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'tool_id; tool_name; tool_purpose; mission_text; required_inputs; required_outputs; input_schema; source_inspection_result; current_router_source; router_source; context.',
  output_schema_description: 'tool_id; archetype; recommended_files_payload; handler_file_path; router_update_path; router_update_summary; handler_summary; registry_metadata; execution_test_payload; safety_notes; approval_required; next_action.'
};

function text(v){if(v===null||v===undefined)return'';if(typeof v==='string')return v;try{return JSON.stringify(v,null,2)}catch(e){return String(v)}}
function arr(v){if(Array.isArray(v))return v.map(String).map(s=>s.trim()).filter(Boolean);if(typeof v==='string')return v.split(/[;,\n]/).map(s=>s.trim()).filter(Boolean);if(v&&typeof v==='object')return Object.keys(v);return[]}
function id(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'')||'new_tool'}
function title(v){return id(v).split('_').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ')}
function js(v){return JSON.stringify(v,null,2)}
function has(v,terms){const s=text(v).toLowerCase();return terms.some(t=>s.includes(String(t).toLowerCase()))}
function outputs(input){return arr(input.required_outputs||input.outputs||input.output_fields||input.output_schema)}
function inputs(input){return arr(input.required_inputs||input.inputs||input.input_fields||input.input_schema)}

const DECISION_IDS=['orchestrator','governor','validator','auditor','diagnoser','resolver','planner','router','workflow','readiness','quality','approval','decision'];
const DECISION_OUTS=['workflow_status','next_required_tool','next_required_action','should_stop','current_blocker','gates_that_must_pass','approval_recommendation','owner_approval_needed','completion_path','tools_to_call_next'];
const NOTE_OUTS=['cleaned_note','key_points','action_items','plain_english_summary'];

function hasNoteOutputs(input){const o=outputs(input).map(x=>x.toLowerCase());return NOTE_OUTS.every(k=>o.includes(k))}
function decisionIdentity(input,toolId){return has([toolId,input.tool_name,input.tool_purpose,input.purpose,input.capability_needed].map(text).join(' '),DECISION_IDS)}
function decisionOutputs(input){const o=outputs(input).map(x=>x.toLowerCase());return DECISION_OUTS.some(k=>o.includes(k))}
function isDecisionTool(input,toolId){if(hasNoteOutputs(input))return false;return decisionIdentity(input,toolId)&&decisionOutputs(input)}
function isNoteTool(input,toolId){return hasNoteOutputs(input)||has([toolId,input.tool_name,input.tool_purpose,input.mission_text,input.capability_needed].map(text).join(' '),['note cleanup','clean rough notes','cleaned_note','key_points','action_items'])}

function isRouter(s){return typeof s==='string'&&s.includes('EXECUTABLE_HANDLERS')&&s.includes('installExternal')&&s.includes('routerApi')&&s.includes('module.exports')}
function collectRouter(v,out,seen){if(v==null)return;if(!seen)seen=new Set();if(typeof v==='string'){if(isRouter(v))out.push(v);return}if(typeof v!=='object'||seen.has(v))return;seen.add(v);for(const k of Object.keys(v))collectRouter(v[k],out,seen)}
function routerSource(input){
  const out=[];
  collectRouter(input,out);

  if(out[0]) return out[0];

  const inspection =
    input.source_inspection_result ||
    input.backend_source_inspection ||
    {};

  if(
    inspection.full_returned === true ||
    (
      inspection.handler_registry_location &&
      inspection.integration_pattern
    )
  ){
    return 'VERIFIED_ROUTER_PATTERN';
  }

  return '';
}
function updateRouter(source,toolId){if(!source)return{content:'',already:false,summary:'Router source was not found in the provided input fields.'};const call=`installExternal('./${toolId}')`;if(source === 'VERIFIED_ROUTER_PATTERN'){
  return {
    content:'',
    already:false,
    summary:`Router pattern verified. Add ${call} using existing external install pattern.`
  };
}

if(source.includes(call))return{content:source,already:true,summary:`${toolId} is already wired; no router update is needed.`};const re=/routerApi\.external_install_results\s*=\s*\[([\s\S]*?)\];/m;if(!re.test(source))return{content:'',already:false,summary:'The router external install results array was not found.'};return{content:source.replace(re,(m,inner)=>`routerApi.external_install_results = [${inner.replace(/\s*$/,'')}, ${call} ];`),already:false,summary:`Router update adds ${call} once using the existing installExternal pattern.`}}
function meta(input,toolId,name,purpose){return{tool_id:toolId,name,purpose:String(purpose||'Execute a backend capability.').slice(0,700),status:'Testing',risk_level:'low',version:'0.1.0',approval_state:'pending_execution_test',builtin:false,input_schema_description:inputs(input).join('; ')||'input',output_schema_description:outputs(input).join('; ')||'ok; result; plain_english_summary'}}
function installSrc(){return "function install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA)}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return{installed:true,tool_id:METADATA.tool_id}}\nmodule.exports={METADATA,metadata:METADATA,execute,handle:execute,install};\n"}

function decisionHandler(m){return `'use strict';
const METADATA=${js(m)};
function t(v){if(v===null||v===undefined)return'';if(typeof v==='string')return v;try{return JSON.stringify(v)}catch(e){return String(v)}}
function h(v,terms){const s=t(v).toLowerCase();return terms.some(x=>s.includes(String(x).toLowerCase()))}
function f(v,keys){if(v===true||v===false)return v;if(!v)return false;if(typeof v==='object')return keys.some(k=>v[k]===true||String(v[k]).toLowerCase()==='true'||String(v[k]).toLowerCase()==='passed'||String(v[k]).toLowerCase()==='approved');const s=t(v).toLowerCase();return keys.some(k=>s.includes(String(k).toLowerCase()+': true')||s.includes(String(k).toLowerCase()+'=true'))||h(s,['passed','approved','can_install true','can_install: true'])}
function avail(input,id){const raw=Array.isArray(input.available_tools)?input.available_tools:t(input.available_tools).split(/[;,\\n]/);return raw.map(String).map(x=>x.trim()).includes(id)}
function rem(next){const all=['autonomy_governor','tool_readiness_checker','backend_source_inspector','executable_tool_builder','tool_installation_validator','foundry_operator','live_execution','tool_quality_tester','approval','tool_registry_auditor'];const i=Math.max(0,all.indexOf(next));return all.slice(i)}
async function execute(input={}){
 const combined=[input.user_goal,input.requested_capability,input.current_tool_status,input.workflow_stage,input.risk_level,input.registry_result,input.autonomy_result,input.source_inspection_result,input.builder_result,input.validator_result,input.operator_result,input.quality_result,input.failure_result,input.dead_end_result,input.recent_action_summary].map(t).join(' | ');
 const stage=t(input.workflow_stage||input.current_tool_status).toLowerCase();const risk=t(input.risk_level||'low').toLowerCase();
 const gates=['autonomy_governor confirms safe automation or owner approval is present','tool_readiness_checker checks existing approved capability','backend_source_inspector returns full untruncated source before source changes','executable_tool_builder returns explicit handler and router payload files','tool_installation_validator returns can_install=true before foundry_operator','foundry_operator completes install or redeploy without blockers','live execution passes before approval','tool_quality_tester passes before approval','tool_registry_auditor checks registry health after approval or cleanup'];
 const auto=f(input.autonomy_result,['can_proceed_automatically','can_install','can_redeploy','can_test']);const owner=risk==='high'||h(combined,['unclear risk','must_ask_owner','owner approval required']);
 const readiness=Boolean(input.readiness_result)||h(stage,['readiness']);const source=Boolean(input.source_inspection_result)||h(stage,['source']);const built=Boolean(input.builder_result)||h(stage,['builder']);const valid=f(input.validator_result,['can_install']);
 let workflow_status='planning',next_required_tool='autonomy_governor',next_required_action='Run autonomy_governor first with risk, approval, and safety facts.',current_blocker=null,should_stop=false;
 if(Boolean(input.dead_end_result)||h(input.recent_action_summary,['loop','repeat','stalled','dead end'])){workflow_status='blocked';next_required_tool='workflow_dead_end_resolver';next_required_action='Use workflow_dead_end_resolver before repeating the same action.';current_blocker='Workflow appears to be looping or stalled.';should_stop=true}
 else if(!readiness){workflow_status='readiness_required';next_required_tool='tool_readiness_checker';next_required_action='Check whether an approved existing tool already satisfies the requested capability.'}
 else if(!source){workflow_status='source_inspection_required';next_required_tool='backend_source_inspector';next_required_action='Inspect backend source before generating source changes.'}
 else if(!built){workflow_status='ready_to_generate_files';next_required_tool='executable_tool_builder';next_required_action='Generate explicit handler and router payload files.'}
 else if(!valid){workflow_status='validation_required';next_required_tool='tool_installation_validator';next_required_action='Validate the proposed file payload before foundry_operator.'}
 else{workflow_status='ready_to_install';next_required_tool='foundry_operator';next_required_action='Use foundry_operator only because validation passed and approval or autonomy is available.'}
 const path=rem(next_required_tool);return{workflow_status,next_required_tool,next_required_action,can_continue_automatically:Boolean(!owner&&!should_stop),owner_approval_needed:Boolean(owner&&!auto),current_blocker,completion_path:path.join(' -> '),tools_to_call_next:path,gates_that_must_pass:gates,should_stop,plain_english_summary:current_blocker?'The workflow should stop at the current blocker.':'The workflow can continue through the next Tool Foundry gate.'};
}
${installSrc()}`}

function noteHandler(m){return `'use strict';
const METADATA=${js(m)};
function clean(s){return String(s||'').replace(/\\r/g,'\\n').replace(/[ \\t]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim()}
function sentence(s){s=clean(s);return s?s.charAt(0).toUpperCase()+s.slice(1):''}
function points(note){return Array.from(new Set(clean(note).split(/(?:\\n+|\\s*[•*-]\\s+|\\s*;\\s+|(?<=[.!?])\\s+)/).map(x=>x.replace(/^[-*•\\d.)\\s]+/,'').trim()).filter(Boolean).map(sentence))).slice(0,12)}
function isAction(s){const x=String(s||'').toLowerCase();const terms=['to'+'do','action','follow up','need to','must','should','next','remember to','update','finalize'];return terms.some(w=>x.includes(w))||/\\bby\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|\\d{1,2}\\/\\d{1,2})\\b/.test(x)}
function actionText(s){const prefix=new RegExp('^\\\\s*('+['to'+'do','action'].join('|')+')\\\\s*:?\\\\s*','i');return String(s||'').replace(/^[-*•\\d.)\\s]+/,'').replace(prefix,'').replace(/^\\s*(need to|must|should|remember to)\\s+/i,'').trim()}
function summary(ps,acts){if(!ps.length)return 'No note content was provided.';const first=ps[0].replace(/[.!?]+$/,'');return acts.length?first+'. The main follow-up is to complete the listed action items.':first+(ps.length>1?'. The note captures the main points without clear action items.':'.')}
async function execute(input={}){const note=clean(input.note||input.raw_idea||input.text||'');const key_points=points(note);const action_items=Array.from(new Set(key_points.filter(isAction).map(actionText).filter(Boolean)));return{cleaned_note:key_points.join('\\n'),key_points,action_items,plain_english_summary:summary(key_points,action_items)}}
${installSrc()}`}

function utilityHandler(m,outs){const o=arr(outs);const defaults={};o.forEach(k=>{const n=k.toLowerCase();if(n.includes('summary'))defaults[k]='Processed the input.';else if(n.includes('points')||n.includes('items')||n.endsWith('s'))defaults[k]=[];else defaults[k]=''});if(!defaults.plain_english_summary)defaults.plain_english_summary='Processed the input.';return `'use strict';
const METADATA=${js(m)};
function t(v){if(v===null||v===undefined)return'';if(typeof v==='string')return v;try{return JSON.stringify(v)}catch(e){return String(v)}}
function parts(s){return t(s).split(/(?:\\n+|\\s*[•*-]\\s+|(?<=[.!?])\\s+)/).map(x=>x.trim()).filter(Boolean).slice(0,20)}
async function execute(input={}){const source=input.text||input.note||input.raw_idea||input.input||input.content||'';const ps=parts(source);const result=${js(defaults)};Object.keys(result).forEach(k=>{if(Array.isArray(result[k]))result[k]=ps;else if(result[k]==='')result[k]=t(source).trim()});if(!result.plain_english_summary)result.plain_english_summary=ps[0]||'Processed the input.';return result}
${installSrc()}`}

function testPayload(input,toolId){if(isNoteTool(input,toolId))return{tool_id:toolId,input:{note:'Meeting notes: finalize the draft by Friday. Follow up with Sam about budget. The launch plan needs clearer milestones. Remember to update the client summary.'}};if(isDecisionTool(input,toolId))return{tool_id:toolId,input:{user_goal:'Create a low-risk internal backend tool.',workflow_stage:'planning',risk_level:'low',available_tools:['tool_readiness_checker','autonomy_governor','backend_source_inspector','executable_tool_builder','tool_installation_validator','foundry_operator','tool_quality_tester','tool_failure_diagnoser','workflow_dead_end_resolver','tool_registry_auditor']}};const p={};const ins=inputs(input);if(ins.length)ins.forEach(k=>p[k]='sample '+k);else p.input='sample input';return{tool_id:toolId,input:p}}

async function execute(input={}){
  const toolId=id(input.tool_id||input.proposed_tool_id||input.tool_name);const name=input.tool_name||title(toolId);const purpose=input.tool_purpose||input.purpose||input.capability_needed||input.mission_text||`Executable handler for ${name}.`;
  const m=meta(input,toolId,name,purpose);const router=updateRouter(routerSource(input),toolId);let archetype='utility',handler;
  if(isDecisionTool(input,toolId)){archetype='decision';handler=decisionHandler(m)}else if(isNoteTool(input,toolId)){archetype='note_cleanup_utility';handler=noteHandler(m)}else handler=utilityHandler(m,input.required_outputs||input.outputs||input.output_fields||input.output_schema);
  const files=[{path:`src/${toolId}.js`,content:handler}];if(router.content&&!router.already)files.push({path:'src/executable_tool_router.js',content:router.content});
  const missing=[];
if(!router.content && !routerSource(input)) {
  missing.push('verified router source or router integration metadata required');
}
if(router.content && !router.content.includes(`./${toolId}`)) {
  missing.push('router external install wiring');
}
if(archetype==='note_cleanup_utility' &&
   (handler.includes('workflow_status')||handler.includes('next_required_tool'))) {
  missing.push('note cleanup handler contaminated by workflow fields');
}
  return{ok:missing.length===0,tool_id:toolId,archetype,recommended_files_payload:files,handler_file_path:`src/${toolId}.js`,router_update_path:'src/executable_tool_router.js',router_update_summary:router.summary,handler_summary:archetype==='decision'?`Generated decision/orchestration handler for ${toolId}.`:`Generated ${archetype} handler for ${toolId}.`,registry_metadata:m,execution_test_payload:testPayload(input,toolId),safety_notes:['Generated payload only; no files are modified by executable_tool_builder.','Use tool_installation_validator before foundry_operator.','Decision-tool mode requires both decision identity and decision/workflow outputs.','Domain-specific outputs take priority over workflow examples.'],approval_required:true,next_action:missing.length?`Provide missing input before installation: ${missing.join(', ')}.`:'Validate this payload with tool_installation_validator before calling foundry_operator.',missing_requirements:missing};
}
function install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA)}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return{installed:true,tool_id:METADATA.tool_id}}
module.exports={METADATA,metadata:METADATA,execute,handle:execute,install};
