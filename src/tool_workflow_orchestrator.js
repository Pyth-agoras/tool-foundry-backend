'use strict';

const METADATA={
  tool_id:'tool_workflow_orchestrator',
  name:'Tool Workflow Orchestrator',
  purpose:'Coordinate Tool Foundry creation, repair, testing, approval, and use without treating autonomy_governor as a mandatory gate.',
  status:'Testing',
  risk_level:'low',
  version:'0.2.0',
  approval_state:'pending_execution_test',
  builtin:false,
  input_schema_description:'user_goal; requested_capability; current_tool_id; current_tool_status; workflow_stage; risk_level; owner_approval_present; owner_standing_rules; available_tools; readiness_result; source_inspection_result; builder_result; validator_result; operator_result; execution_result; quality_result; registry_audit_result; failure_result; dead_end_result',
  output_schema_description:'workflow_status; next_required_tool; next_required_action; can_continue_automatically; owner_approval_needed; current_blocker; completion_path; gates_that_must_pass; should_generate_files; should_validate_payload; should_install; should_test; should_quality_check; should_approve; should_audit_registry; should_stop; plain_english_summary'
};

const asText=v=>{if(v===null||v===undefined)return'';if(typeof v==='string')return v;try{return JSON.stringify(v)}catch{return String(v)}};
const lower=v=>asText(v).toLowerCase();
const nonEmpty=v=>v!==null&&v!==undefined&&(Array.isArray(v)?v.length>0:typeof v==='object'?Object.keys(v).length>0:String(v).trim().length>0);
const has=(v,terms)=>{const s=lower(v);return terms.some(t=>s.includes(String(t).toLowerCase()))};
const truthy=(v,keys=[])=>{if(v===true)return true;if(!v)return false;if(typeof v==='object')return keys.some(k=>v[k]===true||['true','passed','approved','ok'].includes(String(v[k]).toLowerCase()));return has(v,['true','passed','approved','can_install:true','can_install true'])};

function ownerDecisionRequired(input,risk){
  if(risk==='high'||risk==='unclear')return true;
  const facts=[input.user_goal,input.requested_capability,input.owner_standing_rules].map(asText).join(' | ');
  return has(facts,['paid api','store sensitive','external account','publish publicly','send message','send email','change permission','scheduled autonomy','real-world effect']);
}

function repeatedFailure(input){
  if(input.dead_end_result&&input.dead_end_result.dead_end_detected===true)return true;
  if(input.failure_result&&input.failure_result.unresolved_blocker===true)return true;
  const patterns=input.repeated_failure_patterns;
  return Array.isArray(patterns)?patterns.length>=2:nonEmpty(patterns)&&has(patterns,['same failure','repeated failure','loop']);
}

async function execute(input={}){
  const risk=lower(input.risk_level||'low');
  const approvalPresent=input.owner_approval_present===true||has(input.owner_standing_rules,['approved','owner approval exists','approval recorded']);
  const ownerNeeded=ownerDecisionRequired(input,risk)&&!approvalPresent;
  const readiness=nonEmpty(input.readiness_result);
  const source=nonEmpty(input.source_inspection_result);
  const built=nonEmpty(input.builder_result);
  const valid=truthy(input.validator_result,['can_install'])&&!has(input.validator_result,['can_install:false','validation_status":"failed','validation_status: failed']);
  const operated=truthy(input.operator_result,['ok','completed','deployed'])||has(input.operator_result,['render_deploy_triggered','github_updates']);
  const live=truthy(input.execution_result,['passed','live_execution_passed','ok'])||has(input.execution_result,['execution passed','live execution passed']);
  const quality=truthy(input.quality_result,['quality_passed','should_mark_approved','passed']);
  const audited=truthy(input.registry_audit_result,['passed','registry_healthy','ok']);

  const gates=[
    'tool_readiness_checker checks for a truly equivalent approved capability',
    'backend_source_inspector returns complete untruncated source before source changes',
    'executable_tool_builder returns explicit complete files matching the requested contract',
    'tool_installation_validator returns can_install=true before foundry_operator',
    'foundry_operator runs only with exact owner approval for source-writing scope',
    'deployment adoption and representative live execution pass',
    'tool_quality_tester passes before approval',
    'tool_registry_auditor passes after approval or repair'
  ];

  let state={workflow_status:'readiness_required',next_required_tool:'tool_readiness_checker',next_required_action:'Check whether an existing Approved tool truly matches required inputs, outputs, and success criteria.',current_blocker:null,should_generate_files:false,should_validate_payload:false,should_install:false,should_test:false,should_quality_check:false,should_approve:false,should_audit_registry:false,should_stop:false};

  if(ownerNeeded){
    state={...state,workflow_status:'owner_decision_required',next_required_tool:null,next_required_action:'Request only the exact owner decision required for the changed risk or external effect.',current_blocker:'A true owner-level decision is required.',should_stop:true};
  }else if(repeatedFailure(input)){
    state={...state,workflow_status:'diagnosis_required',next_required_tool:'workflow_dead_end_resolver',next_required_action:'Resolve the repeated failure path, then run tool_failure_diagnoser with the exact evidence.',current_blocker:'Repeated failure evidence is present.',should_stop:false};
  }else if(!readiness){
    state={...state};
  }else if(!source){
    state={...state,workflow_status:'source_inspection_required',next_required_tool:'backend_source_inspector',next_required_action:'Inspect the exact source files in strict full-file mode.'};
  }else if(!built){
    state={...state,workflow_status:'file_generation_required',next_required_tool:'executable_tool_builder',next_required_action:'Generate explicit complete handler/router files from the inspected source.',should_generate_files:true};
  }else if(!valid){
    state={...state,workflow_status:'validation_required',next_required_tool:'tool_installation_validator',next_required_action:'Validate the complete proposed file payload. Do not install unless can_install=true.',should_validate_payload:true};
  }else if(!operated){
    state={...state,workflow_status:'installation_required',next_required_tool:'foundry_operator',next_required_action:'Install only the validated and approved exact file payload.',should_install:true};
  }else if(!live){
    state={...state,workflow_status:'live_test_required',next_required_tool:'live_execution',next_required_action:'Verify deployment adoption, a known-good tool, and the repaired tool.',should_test:true};
  }else if(!quality){
    state={...state,workflow_status:'quality_required',next_required_tool:'tool_quality_tester',next_required_action:'Run quality testing with execution_results as an object.',should_quality_check:true};
  }else if(!audited){
    state={...state,workflow_status:'registry_audit_required',next_required_tool:'tool_registry_auditor',next_required_action:'Audit registry metadata, executable wiring, and status consistency.',should_audit_registry:true};
  }else{
    state={...state,workflow_status:'ready_for_approval',next_required_tool:'approval',next_required_action:'Mark Approved because validation, live execution, quality, and registry audit passed.',should_approve:true};
  }

  const order=['tool_readiness_checker','backend_source_inspector','executable_tool_builder','tool_installation_validator','foundry_operator','live_execution','tool_quality_tester','tool_registry_auditor','approval'];
  const idx=order.indexOf(state.next_required_tool);
  const path=idx>=0?order.slice(idx):[];
  return {...state,can_continue_automatically:!state.should_stop&&!ownerNeeded,owner_approval_needed:ownerNeeded,owner_approval_reason:ownerNeeded?'The requested action changes risk, access, cost, exposure, messaging, permissions, autonomy, or real-world impact.':'',completion_path:path.join(' -> '),tools_to_call_next:path,gates_that_must_pass:gates,plain_english_summary:state.current_blocker||`Continue with ${state.next_required_tool||'the completed workflow'}.`};
}

function install(router){
  if(!router)return{installed:false,tool_id:METADATA.tool_id,reason:'router_missing'};
  if(Array.isArray(router.BUILTIN_TOOL_METADATA)){
    const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);
    if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA);
  }
  if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;
  if(typeof router.registerTool==='function')router.registerTool(METADATA);
  return{installed:true,tool_id:METADATA.tool_id};
}

module.exports={METADATA,metadata:METADATA,execute,handle:execute,install};
