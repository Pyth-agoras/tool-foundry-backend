'use strict';

const METADATA={
  tool_id:'tool_workflow_orchestrator',
  name:'Tool Workflow Orchestrator',
  purpose:'Coordinate the full Tool Foundry workflow for creating, repairing, testing, approving, and using backend tools.',
  status:'Testing',
  risk_level:'low',
  version:'0.1.1',
  approval_state:'pending_execution_test',
  builtin:false,
  input_schema_description:'user_goal; requested_capability; current_tool_id; current_tool_status; workflow_stage; risk_level; owner_standing_rules; available_tools; registry_result; readiness_result; autonomy_result; source_inspection_result; builder_result; validator_result; operator_result; quality_result; failure_result; dead_end_result; attempted_steps; repeated_failure_patterns; recent_action_summary',
  output_schema_description:'workflow_status; next_required_tool; next_required_action; can_continue_automatically; owner_approval_needed; owner_approval_reason; current_blocker; completion_path; tools_to_call_next; gates_that_must_pass; should_create_mission; should_generate_files; should_validate_payload; should_install; should_redeploy; should_test; should_quality_check; should_approve; should_stop; plain_english_summary'
};

function text(v){if(v===null||v===undefined)return'';if(typeof v==='string')return v;try{return JSON.stringify(v)}catch(e){return String(v)}}
function lower(v){return text(v).toLowerCase()}
function has(v,terms){const s=lower(v);return terms.some(t=>s.includes(String(t).toLowerCase()))}
function boolField(v,keys){if(v===true||v===false)return v;if(!v)return false;if(typeof v==='object')return keys.some(k=>v[k]===true||String(v[k]).toLowerCase()==='true'||String(v[k]).toLowerCase()==='passed'||String(v[k]).toLowerCase()==='approved');const s=lower(v);return keys.some(k=>s.includes(String(k).toLowerCase()+': true')||s.includes(String(k).toLowerCase()+'=true'))||has(s,['passed','approved','can_install true','can_install: true'])}
function nonEmpty(v){if(v===null||v===undefined)return false;if(Array.isArray(v))return v.length>0;if(typeof v==='object')return Object.keys(v).length>0;return String(v).trim().length>0}
function available(input,id){const raw=Array.isArray(input.available_tools)?input.available_tools:text(input.available_tools).split(/[;,\n]/);return raw.map(String).map(x=>x.trim()).includes(id)}
function pathFrom(next){const all=['autonomy_governor','tool_readiness_checker','backend_source_inspector','executable_tool_builder','tool_installation_validator','foundry_operator','live_execution','tool_quality_tester','approval','tool_registry_auditor'];const i=all.indexOf(next);return all.slice(i>=0?i:0)}
function failureTermsPresent(s){return has(s,['failed tool call','failed install','failed deployment','failed validation','validation failed','deploy failed','install failed','missing files payload','missing file payload','same error','same failed action','unresolved blocker','error repeated','repeated error','repeated failed','failure loop','dead end detected','dead-end detected'])}
function countFailureEvents(s){const m=s.match(/(failed|failure|error|blocked|missing files payload|missing file payload|validation failed|deploy failed|install failed)/g);return m?m.length:0}
function repeatedAttemptEvidence(input){const raw=input.attempted_steps;if(!nonEmpty(raw))return false;const items=Array.isArray(raw)?raw.map(text):text(raw).split(/\n|->|;/).map(x=>x.trim()).filter(Boolean);const failed=items.filter(x=>failureTermsPresent(x)||has(x,['failed','error','blocked']));if(failed.length<2)return false;const norm=failed.map(x=>x.toLowerCase().replace(/\d+/g,'').replace(/\s+/g,' ').trim());return new Set(norm).size<norm.length||failed.length>=3}
function realLoopEvidence(input){
  if(nonEmpty(input.repeated_failure_patterns))return true;
  if(repeatedAttemptEvidence(input))return true;
  if(input.dead_end_result&&typeof input.dead_end_result==='object'){
    if(input.dead_end_result.dead_end_detected===true)return true;
    if(input.dead_end_result.should_pause_current_workflow===true)return true;
    if(nonEmpty(input.dead_end_result.loop_pattern)&&!has(input.dead_end_result.loop_pattern,['none','no loop','not detected']))return true;
  } else if(has(input.dead_end_result,['dead_end_detected:true','dead_end_detected true','real blocker','loop_pattern'])) return true;
  if(input.failure_result&&typeof input.failure_result==='object'){
    if(input.failure_result.unresolved_blocker===true||input.failure_result.should_mark_needs_revision===true)return true;
    if(nonEmpty(input.failure_result.real_blocker)||nonEmpty(input.failure_result.blocked_reason))return true;
    if(has(input.failure_result.failure_category,['repeated','loop','dead_end','missing_files_payload']))return true;
  } else if(has(input.failure_result,['unresolved blocker','should_mark_needs_revision:true','repeated failure','missing files payload'])) return true;
  const explicit=[input.execution_result,input.validator_result,input.operator_result,input.deploy_result,input.latest_error_message].map(text).join(' | ');
  if(failureTermsPresent(explicit)&&countFailureEvents(explicit)>=2)return true;
  const recent=lower(input.recent_action_summary);
  const benign=['without repeated back-and-forth','avoid back-and-forth','be autonomous','choose the workflow','do not ask me every step','low-risk internal tool','planning'];
  const recentClean=benign.reduce((s,p)=>s.replaceAll(p,''),recent);
  return failureTermsPresent(recentClean)&&countFailureEvents(recentClean)>=2;
}
async function execute(input={}){
  const stage=lower(input.workflow_stage||input.current_tool_status||'planning');
  const risk=lower(input.risk_level||'low');
  const gates=['autonomy_governor confirms safe automation or owner approval is present','tool_readiness_checker checks existing approved capability','backend_source_inspector returns full untruncated source before source changes','executable_tool_builder returns explicit handler and router payload files','tool_installation_validator returns can_install=true before foundry_operator','foundry_operator runs only if validation passes and owner approval or autonomy exists','live execution passes before approval','tool_quality_tester passes before approval','approval occurs only if all gates pass','tool_registry_auditor checks registry health after approval or cleanup'];
  const ownerRisk=risk==='high'||has([input.user_goal,input.requested_capability,input.owner_standing_rules,input.registry_result].map(text).join(' | '),['must_ask_owner','owner approval required','unclear risk','high risk']);
  const auto=boolField(input.autonomy_result,['can_proceed_automatically','can_install','can_redeploy','can_test']);
  const readiness=nonEmpty(input.readiness_result)||has(stage,['readiness']);
  const source=nonEmpty(input.source_inspection_result)||has(stage,['source']);
  const built=nonEmpty(input.builder_result)||has(stage,['builder','generated']);
  const valid=boolField(input.validator_result,['can_install']);
  const validationFailed=has(input.validator_result,['can_install:false','can_install false','validation_status":"failed','validation_status: failed','blocked before installation']);
  const operated=boolField(input.operator_result,['ok','completed','deployed','redeployed'])||has(input.operator_result,['render_deploy','operator completed']);
  const live=has([input.execution_result,input.recent_action_summary].map(text).join(' | '),['live execution passed','tool execution passed','execution passed']);
  const quality=boolField(input.quality_result,['should_mark_approved','quality_passed','passed']);
  let workflow_status='planning';
  let next_required_tool='autonomy_governor';
  let next_required_action='Run autonomy_governor first with risk, approval, and safety facts.';
  let current_blocker=null;
  let should_generate_files=false,should_validate_payload=false,should_install=false,should_redeploy=false,should_test=false,should_quality_check=false,should_approve=false,should_stop=false;
  if(realLoopEvidence(input)){
    workflow_status='blocked';next_required_tool='workflow_dead_end_resolver';next_required_action='Use workflow_dead_end_resolver because there is concrete evidence of repeated failed actions or an unresolved loop.';current_blocker='Concrete repeated-failure or dead-end evidence is present.';should_stop=true;
  } else if(validationFailed){
    workflow_status='blocked';next_required_tool='executable_tool_builder';next_required_action='Regenerate or repair the file payload, then rerun tool_installation_validator. Do not call foundry_operator.';current_blocker='tool_installation_validator blocked the payload.';should_validate_payload=true;should_stop=true;
  } else if(!nonEmpty(input.autonomy_result)&&(stage===''||stage.includes('planning')||stage.includes('start')||ownerRisk||risk==='low')){
    workflow_status='planning';next_required_tool='autonomy_governor';next_required_action='Run autonomy_governor first with risk, approval, and safety facts.';
  } else if(!readiness){
    workflow_status='readiness_required';next_required_tool='tool_readiness_checker';next_required_action='Check whether an approved existing tool already satisfies the requested capability.';
  } else if(!source){
    workflow_status='source_inspection_required';next_required_tool='backend_source_inspector';next_required_action='Inspect backend source in strict full-file mode before generating source changes.';
  } else if(!built){
    workflow_status='ready_to_generate_files';next_required_tool='executable_tool_builder';next_required_action='Generate explicit handler and router payload files using the full source inspection result.';should_generate_files=true;
  } else if(!valid){
    workflow_status='validation_required';next_required_tool='tool_installation_validator';next_required_action='Validate the proposed file payload before foundry_operator.';should_validate_payload=true;
  } else if(!operated){
    workflow_status='ready_to_install';next_required_tool='foundry_operator';next_required_action='Use foundry_operator only because validation passed and approval or autonomy is available.';should_install=true;should_redeploy=true;
  } else if(!live){
    workflow_status='live_test_required';next_required_tool='live_execution';next_required_action='Run live execution tests for the new tool and required foundation tools before approval.';should_test=true;
  } else if(!quality){
    workflow_status='quality_check_required';next_required_tool='tool_quality_tester';next_required_action='Run tool_quality_tester after live execution passes.';should_quality_check=true;
  } else {
    workflow_status='ready_for_approval';next_required_tool='approval';next_required_action='Mark Approved only after live execution and quality testing pass.';should_approve=true;
  }
  const path=pathFrom(next_required_tool);
  const toolsToCall=path.filter(x=>x==='live_execution'||x==='approval'||x===next_required_tool||available(input,x));
  const canContinue=!should_stop&&!ownerRisk;
  return{workflow_status,next_required_tool,next_required_action,can_continue_automatically:canContinue,owner_approval_needed:Boolean(ownerRisk&&!auto),owner_approval_reason:ownerRisk&&!auto?'Risk or approval state is unclear, so request only the specific owner-level approval needed.':'',current_blocker,completion_path:path.join(' -> '),tools_to_call_next:toolsToCall.length?toolsToCall:path,gates_that_must_pass:gates,should_create_mission:false,should_generate_files,should_validate_payload,should_install,should_redeploy,should_test,should_quality_check,should_approve,should_stop,plain_english_summary:current_blocker?'The workflow should stop at the concrete blocker before continuing.':'The workflow can continue through the next Tool Foundry gate without treating normal planning language as a dead-end loop.'};
}
function install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA)}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return{installed:true,tool_id:METADATA.tool_id}}
module.exports={METADATA,metadata:METADATA,execute,handle:execute,install};