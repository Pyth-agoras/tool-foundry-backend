'use strict';

const METADATA = {
  "tool_id": "workflow_dead_end_resolver",
  "name": "Workflow Dead-End Resolver",
  "purpose": "Detect repeated Tool Foundry failure loops, identify the real unresolved blocker, stop non-productive retries, and recommend the shortest non-repeating path to completion.",
  "status": "Testing",
  "risk_level": "low",
  "version": "0.1.0",
  "approval_state": "pending_execution_test",
  "builtin": false,
  "input_schema_description": "user_goal; current_tool_id; attempted_steps; repeated_failure_patterns; latest_error_message; current_tool_status; registry_result; execution_result; deploy_result; health_result; tools_list_result; source_inspection_result; builder_result; validator_result; quality_test_result; recent_action_summary; owner_constraints",
  "output_schema_description": "dead_end_detected; loop_pattern; real_blocker; wrong_actions_to_stop; correct_next_action; recommended_tool_to_use_next; repair_sequence; owner_approval_needed; retry_allowed; should_pause_current_workflow; completion_path; plain_english_summary"
};
function s(v){try{return typeof v==='string'?v:JSON.stringify(v)}catch(e){return String(v||'')}}
function l(v){return Array.isArray(v)?v.map(String):typeof v==='string'?v.split(/[;\n]/).map(x=>x.trim()).filter(Boolean):[]}
function h(t, terms){const n=s(t).toLowerCase();return terms.some(x=>n.includes(String(x).toLowerCase()))}
async function execute(input={}){
  const all=[input.user_goal,input.current_tool_id,l(input.attempted_steps).join(' | '),l(input.repeated_failure_patterns).join(' | '),input.latest_error_message,input.current_tool_status,input.registry_result,input.execution_result,input.deploy_result,input.health_result,input.tools_list_result,input.source_inspection_result,input.builder_result,input.validator_result,input.quality_test_result,input.recent_action_summary,input.owner_constraints].map(s).join(' | ');
  let loop='unclear_failure', blocker='unclear failure evidence', next='tool_failure_diagnoser', action='Use tool_failure_diagnoser first because the real blocker is unclear.', stop=['repeating the same failed action without new evidence'], seq=['Pause repeated retries','Run tool_failure_diagnoser with full evidence','Follow the diagnosed repair path'];
  if(h(all,['builder returned empty files payload','recommended_files_payload: []','recommended_files_payload was empty','empty files payload','no files payload'])){loop='builder_output_failure';blocker='executable_tool_builder output failure';next='executable_tool_builder';action='Repair or rerun executable_tool_builder so it produces a complete handler and router-wired files payload, then rerun tool_installation_validator.';stop=['continuing install without a valid files payload','calling foundry_operator before tool_installation_validator passes','creating another mission for the same unresolved dependency'];seq=['Pause the current install attempt','Repair or rerun executable_tool_builder with full source inspection output','Confirm recommended_files_payload includes handler and router wiring','Run tool_installation_validator','Resume install only after can_install is true'];}
  else if(h(all,['missing router wiring','not wired','executable_handlers','no executable handler','handler not installed'])){loop='missing_router_wiring';blocker='missing executable handler or EXECUTABLE_HANDLERS router wiring';next='backend_source_inspector';action='Use backend_source_inspector to confirm wiring, then generate a router repair and validate it before deployment.';stop=['approving the tool before live execution passes','rebuilding the mission instead of repairing router wiring'];seq=['Inspect router wiring','Generate corrected handler/router payload','Validate payload','Deploy after approval','Run live execution'];}
  else if(h(all,['deployment adoption','old deployment','tools/list still old','health still old','not adopted'])){loop='deployment_adoption_delay';blocker='deployment adoption delay or stale runtime';next='foundry_operator';action='Use foundry_operator deployment recheck and verify /health and /tools/list before rebuilding.';stop=['rebuilding while deployment adoption is unconfirmed'];seq=['Pause rebuild','Run foundry_operator deployment recheck','Verify /health','Verify /tools/list','Continue only after adoption is confirmed'];}
  const pause=loop!=='unclear_failure';
  return {dead_end_detected:pause,loop_pattern:loop,real_blocker:blocker,wrong_actions_to_stop:stop,correct_next_action:action,recommended_tool_to_use_next:next,repair_sequence:seq,owner_approval_needed:next==='foundry_operator',retry_allowed:!pause,should_pause_current_workflow:pause,completion_path:seq.join(' -> '),plain_english_summary:pause?'A non-productive Tool Foundry path was detected. Stop the repeated action and address the real blocker before resuming.':'The blocker is not clear enough to choose a repair safely. Run tool_failure_diagnoser first.',ok:true};
}
function install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA);}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return {installed:true,tool_id:METADATA.tool_id};}
module.exports={METADATA,metadata:METADATA,execute,handle:execute,install};
