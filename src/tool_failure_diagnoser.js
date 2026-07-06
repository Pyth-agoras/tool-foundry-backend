'use strict';

const metadata = {
  tool_id: 'tool_failure_diagnoser',
  name: 'Tool Failure Diagnoser',
  purpose: 'Diagnose failed Tool Foundry tool builds, installs, deployments, registrations, or executions, then recommend the exact repair path in plain English.',
  status: 'Testing',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'pending_execution_test',
  builtin: false,
  input_schema_description: 'failed_tool_id; failure_stage; error_message; tool_status; registry_result; execution_result; deploy_result; health_result; tools_list_result; source_inspection_summary; recent_action_summary; user_goal',
  output_schema_description: 'failure_category; likely_root_cause; confidence_level; evidence; repair_path; exact_next_action; owner_approval_needed; should_retry; should_rebuild; should_redeploy; should_mark_needs_revision; should_mark_approved; recommended_tool_to_use_next; plain_english_summary'
};

const REQUIRED_INPUTS = ['failed_tool_id','failure_stage','error_message','tool_status','registry_result','execution_result','deploy_result','health_result','tools_list_result','source_inspection_summary','recent_action_summary','user_goal'];
const STAGES = new Set(['mission_creation','readiness_check','source_inspection','file_generation','operator_install','github_commit','render_deploy','health_check','tool_registration','tools_list_verification','tool_execution','approval_gate','action_schema','unknown']);

function lower(v) { return String(v || '').toLowerCase(); }
function has(text, ...needles) { const t = lower(text); return needles.some(n => t.includes(lower(n))); }
function joined(input) { return [input.error_message,input.tool_status,input.registry_result,input.execution_result,input.deploy_result,input.health_result,input.tools_list_result,input.source_inspection_summary,input.recent_action_summary,input.user_goal].map(v => String(v || '')).join(' | '); }
function evidenceFrom(input) {
  return {
    failed_tool_id: input.failed_tool_id || '',
    failure_stage: input.failure_stage || 'unknown',
    error_message: input.error_message || '',
    tool_status: input.tool_status || '',
    registry_result: input.registry_result || '',
    execution_result: input.execution_result || '',
    deploy_result: input.deploy_result || '',
    health_result: input.health_result || '',
    tools_list_result: input.tools_list_result || '',
    recent_action_summary: input.recent_action_summary || ''
  };
}
function base(input) {
  return {
    failure_category: 'unknown_failure',
    likely_root_cause: 'The available evidence is not enough to name one confirmed failure point.',
    confidence_level: 'low',
    evidence: evidenceFrom(input),
    repair_path: 'Use backend_source_inspector to confirm the real backend layout, then use executable_tool_builder to generate an explicit files payload before foundry_operator installs anything.',
    exact_next_action: 'Run backend_source_inspector, then executable_tool_builder, then foundry_operator only with explicit files and owner approval.',
    owner_approval_needed: false,
    should_retry: false,
    should_rebuild: true,
    should_redeploy: false,
    should_mark_needs_revision: true,
    should_mark_approved: false,
    recommended_tool_to_use_next: 'backend_source_inspector',
    plain_english_summary: 'The failure is unclear, so the safe next step is to inspect the backend source layout and rebuild an explicit executable handler payload before any install or approval.'
  };
}
function finalize(r) {
  if (r.should_mark_needs_revision || r.should_rebuild || r.should_redeploy || r.should_retry) r.should_mark_approved = false;
  return r;
}

async function handler(input = {}) {
  const missing = REQUIRED_INPUTS.filter(k => !(k in input));
  if (missing.length) {
    return finalize({
      failure_category: 'malformed_test_input',
      likely_root_cause: 'The diagnosis request is missing required input fields.',
      confidence_level: 'high',
      evidence: { missing_inputs: missing, provided_fields: Object.keys(input) },
      repair_path: 'Retry the diagnosis with all required fields, using empty strings when a result is unavailable.',
      exact_next_action: 'Retry tool_failure_diagnoser with the missing required fields included.',
      owner_approval_needed: false,
      should_retry: true,
      should_rebuild: false,
      should_redeploy: false,
      should_mark_needs_revision: false,
      should_mark_approved: false,
      recommended_tool_to_use_next: 'tool_failure_diagnoser',
      plain_english_summary: 'The test input was malformed, so the diagnoser cannot safely infer the failure yet.'
    });
  }

  const stage = STAGES.has(input.failure_stage) ? input.failure_stage : 'unknown';
  const all = joined(input);
  const status = lower(input.tool_status);
  const r = base(input);

  if (has(all, 'deploy succeeded') && (has(all, 'runtime did not change','did not adopt','old behavior','tools/list did not change') || (stage === 'render_deploy' && has(all, 'execution still old')))) {
    Object.assign(r, { failure_category:'render_runtime_not_updated', likely_root_cause:'Render deploy did not adopt the committed source update.', confidence_level:'high', repair_path:'Use foundry_operator to trigger a fresh automated redeploy and verify that /tools/list and live execution reflect the latest commit.', exact_next_action:'Run foundry_operator in repair/deploy verification mode and confirm the live runtime adopted the committed source update.', should_retry:true, should_rebuild:false, should_redeploy:true, recommended_tool_to_use_next:'foundry_operator', plain_english_summary:'The source update appears committed, but the live Render runtime is still serving old behavior. Render deploy did not adopt the committed source update.' });
  } else if (stage === 'operator_install' && has(all, 'approval_confirmed', 'approval confirmed', 'approval missing', 'missing approval')) {
    Object.assign(r, { failure_category:'approval_gate', likely_root_cause:'foundry_operator blocked the update because approval_confirmed was missing.', confidence_level:'high', repair_path:'Get owner approval for this specific backend update, then rerun foundry_operator with approved=true and approval_confirmed=true plus explicit files.', exact_next_action:'Confirm owner approval, then rerun foundry_operator with approval_confirmed=true and the explicit files payload.', owner_approval_needed:true, should_retry:true, should_rebuild:false, recommended_tool_to_use_next:'foundry_operator', plain_english_summary:'The operator correctly stopped before making backend changes because explicit owner approval was missing.' });
  } else if (stage === 'action_schema' || has(all, 'schema', 'missing required input', 'field not exposed', 'does not expose')) {
    Object.assign(r, { failure_category:'action_schema_missing_input', likely_root_cause:'The Action schema does not expose a needed input field or the caller used the wrong field shape.', confidence_level:'medium', repair_path:'Update the Action/tool input contract through the automated backend workflow, then retest with the required fields.', exact_next_action:'Use backend_source_inspector and executable_tool_builder to update the tool schema/handler contract, then install with foundry_operator after approval.', owner_approval_needed:true, should_retry:false, should_rebuild:true, recommended_tool_to_use_next:'backend_source_inspector', plain_english_summary:'The request shape and the tool contract do not match, so the backend cannot receive the data it needs.' });
  } else if (stage === 'health_check' || has(input.health_result, 'failed', 'error', 'down', 'not ok')) {
    Object.assign(r, { failure_category:'health_check_failed', likely_root_cause:'/health failed after deployment, so the backend runtime is not ready for tool approval.', confidence_level:'high', repair_path:'Use foundry_operator repair mode to diagnose the deployment/runtime health issue before testing tools.', exact_next_action:'Run foundry_operator repair mode to restore /health, then repeat /tools/list and live execution tests.', should_retry:true, should_redeploy:true, should_rebuild:false, recommended_tool_to_use_next:'foundry_operator', plain_english_summary:'The backend health check failed, so no tool should be approved until the runtime is healthy again.' });
  } else if (stage === 'tools_list_verification' || has(input.tools_list_result, 'not include', 'missing', 'not found')) {
    Object.assign(r, { failure_category:'tools_list_missing_tool', likely_root_cause:'/tools/list did not include the tool, which points to missing registry metadata or a runtime that did not adopt the update.', confidence_level:'high', repair_path:'Confirm the router metadata was updated and redeployed, then verify /tools/list again.', exact_next_action:'Use backend_source_inspector to verify registry metadata, then foundry_operator to install/redeploy the corrected files.', should_retry:false, should_rebuild:true, should_redeploy:true, recommended_tool_to_use_next:'backend_source_inspector', plain_english_summary:'The tool is not visible in the registry list, so it is not ready for execution or approval.' });
  } else if (stage === 'tool_registration' || has(all, 'registered but not approved', 'not approved', 'pending approval') || (has(input.registry_result, 'appears') && !has(status, 'approved'))) {
    Object.assign(r, { failure_category:'registered_not_approved', likely_root_cause:'The tool is registered but has not passed approval requirements or live execution testing.', confidence_level:'medium', repair_path:'Keep the tool in Testing or Needs Revision until live execution passes; then evaluate and register as Approved.', exact_next_action:'Run a live execution test and only register Approved if the execution result passes.', should_retry:true, should_rebuild:false, should_redeploy:false, should_mark_needs_revision:false, recommended_tool_to_use_next:'tool_failure_diagnoser', plain_english_summary:'The tool appears registered, but registration alone is not enough for approval.' });
  } else if (stage === 'tool_execution' && (has(all, 'no executable handler', 'missing executable handler', 'handler is installed') || (has(status, 'approved') && has(input.registry_result, 'appears') && has(input.execution_result, 'failed')))) {
    Object.assign(r, { failure_category:'approved_or_registered_without_executable_handler', likely_root_cause:'The tool is registered or marked Approved, but a real executable handler is missing or is not wired into EXECUTABLE_HANDLERS.', confidence_level:'high', repair_path:'Do not keep the tool Approved. Use backend_source_inspector to confirm the source layout, executable_tool_builder to generate real handler files and router wiring, then foundry_operator to install, redeploy, verify /health, verify /tools/list, and run a live execution test.', exact_next_action:'Mark the tool Needs Revision, then run backend_source_inspector followed by executable_tool_builder and foundry_operator with explicit files after owner approval.', owner_approval_needed:true, should_retry:false, should_rebuild:true, should_redeploy:true, should_mark_needs_revision:true, should_mark_approved:false, recommended_tool_to_use_next:'backend_source_inspector', plain_english_summary:'The tool is visible or even marked Approved, but execution failed because the backend does not have a working handler wired into the executable router. It should not be Approved until a live execution test passes.' });
  } else if (stage === 'tool_execution' || has(input.execution_result, 'failed', 'error')) {
    Object.assign(r, { failure_category:'live_execution_test_failed', likely_root_cause:'The live execution test failed, so the tool is incomplete until the handler, router wiring, or test input is fixed.', confidence_level:'high', repair_path:'Keep the tool in Needs Revision, inspect source routing, rebuild explicit handler files if needed, redeploy, and rerun the live execution test.', exact_next_action:'Use tool_failure_diagnoser evidence to decide whether to rebuild handler files or retry with corrected test input; do not approve yet.', should_retry:has(all,'malformed','missing required input'), should_rebuild:!has(all,'malformed','missing required input'), should_redeploy:!has(all,'malformed','missing required input'), should_mark_needs_revision:true, recommended_tool_to_use_next:has(all,'malformed','missing required input') ? 'tool_failure_diagnoser' : 'backend_source_inspector', plain_english_summary:'Execution failed. The tool remains incomplete until the live execution test passes.' });
  } else if (stage === 'file_generation' || has(all, 'mission text instead of explicit files', 'no files payload', 'placeholder handler', 'did not generate')) {
    Object.assign(r, { failure_category:'file_generation_not_real_payload', likely_root_cause:'executable_tool_builder did not generate a real executable files payload, or foundry_operator received mission text instead of explicit files.', confidence_level:'high', repair_path:'Regenerate explicit handler, registry metadata, and EXECUTABLE_HANDLERS wiring files before running foundry_operator.', exact_next_action:'Rerun executable_tool_builder with the mission, source inspection summary, router pattern, and concrete test case; do not run foundry_operator with mission text alone.', should_retry:true, should_rebuild:true, should_redeploy:false, recommended_tool_to_use_next:'executable_tool_builder', plain_english_summary:'The build did not produce installable backend files, so deployment should not proceed yet.' });
  } else if (stage === 'source_inspection' || has(all, 'backend_source_inspector was not used', 'wrong backend file', 'router not found')) {
    Object.assign(r, { failure_category:'source_layout_not_verified', likely_root_cause:'The backend source layout was not verified, or the wrong backend file was patched.', confidence_level:'medium', repair_path:'Run backend_source_inspector before generating any patches, then rebuild the files payload for the actual router location.', exact_next_action:'Run backend_source_inspector and use its recommended patch targets before executable_tool_builder or foundry_operator.', should_retry:true, should_rebuild:true, recommended_tool_to_use_next:'backend_source_inspector', plain_english_summary:'The update may have targeted the wrong file or skipped source inspection, so the safe fix is to inspect the live source layout first.' });
  } else if (stage === 'render_deploy' || has(input.deploy_result, 'failed', 'hook failed', 'deploy failed')) {
    Object.assign(r, { failure_category:'render_deploy_failed', likely_root_cause:'The Render deploy hook failed or the deployment did not complete successfully.', confidence_level:'high', repair_path:'Use foundry_operator to retry the automated deploy and verify /health before any tool approval.', exact_next_action:'Run foundry_operator deploy repair mode, then verify /health, /tools/list, and live execution.', should_retry:true, should_redeploy:true, recommended_tool_to_use_next:'foundry_operator', plain_english_summary:'Deployment failed, so the new backend code is not safely live yet.' });
  } else if (stage === 'github_commit' || has(all, 'commit failed', 'github failed')) {
    Object.assign(r, { failure_category:'github_commit_failed', likely_root_cause:'The approved source update was not committed successfully to GitHub.', confidence_level:'high', repair_path:'Rerun foundry_operator with the explicit files payload and verify the commit before deploying.', exact_next_action:'Run foundry_operator full_cycle again with explicit files and approval confirmed.', should_retry:true, should_rebuild:false, should_redeploy:false, recommended_tool_to_use_next:'foundry_operator', plain_english_summary:'The backend source update did not land in GitHub, so deployment cannot include it yet.' });
  }

  return finalize(r);
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS) throw new Error('Executable router with EXECUTABLE_HANDLERS is required.');
  router.EXECUTABLE_HANDLERS.tool_failure_diagnoser = handler;
  if (Array.isArray(router.BUILTIN_TOOL_METADATA) && !router.BUILTIN_TOOL_METADATA.some(t => t.tool_id === metadata.tool_id)) {
    router.BUILTIN_TOOL_METADATA.push(metadata);
  }
  return { installed: true, tool_id: metadata.tool_id };
}

module.exports = { metadata, handler, install, REQUIRED_INPUTS };
