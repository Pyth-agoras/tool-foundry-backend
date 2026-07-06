'use strict';

const METADATA = {
  tool_id: 'autonomy_governor',
  name: 'Autonomy Governor',
  purpose: 'Decide when the Tool Foundry may proceed automatically, retry, repair, install, redeploy, test, approve, stop for owner approval, or pause because a workflow is unsafe or incomplete.',
  status: 'Testing',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'pending_execution_test',
  builtin: false,
  input_schema_description: 'user_goal; requested_action; tool_id; tool_status; risk_level; approval_state; action_type; affects_external_systems; uses_paid_api; stores_sensitive_data; connects_external_account; publishes_publicly; sends_messages; changes_permissions; enables_scheduled_actions; source_change_required; install_payload_validated; live_execution_passed; quality_test_passed; failure_diagnosis; dead_end_analysis; registry_audit_result; owner_standing_rules; recent_action_summary',
  output_schema_description: 'autonomy_decision; can_proceed_automatically; can_install; can_redeploy; can_test; can_mark_approved; must_ask_owner; must_stop; required_owner_approval_reason; blocked_reason; required_next_tool; required_next_action; safe_automatic_sequence; approval_conditions; risk_summary; plain_english_summary'
};

function bool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', 'yes', '1'].includes(value.trim().toLowerCase());
  return Boolean(value);
}
function norm(value) { return String(value || '').toLowerCase(); }
function mentionsAny(value, terms) { const v = norm(value); return terms.some((term) => v.includes(term)); }
function isClearNoBlocker(value) {
  const v = norm(value);
  return !v || v.includes('no blocker') || v.includes('no blockers') || v.includes('no loop') || v.includes('no drift') || v.includes('passed') || v.includes('none');
}
function unresolved(value) {
  if (isClearNoBlocker(value)) return false;
  return mentionsAny(value, ['unresolved', 'blocker', 'failed', 'failure', 'missing', 'stale', 'loop detected', 'drift', 'unsafe', 'incomplete']);
}

async function execute(input = {}) {
  const risk = norm(input.risk_level || 'unclear').trim();
  const requested = norm(input.requested_action);
  const actionType = norm(input.action_type);
  const action = `${requested} ${actionType}`;
  const sourceChange = bool(input.source_change_required);
  const payloadValidated = bool(input.install_payload_validated);
  const livePassed = bool(input.live_execution_passed);
  const qualityPassed = bool(input.quality_test_passed);
  const approvalLike = mentionsAny(action, ['approve', 'approved', 'approval']);
  const installLike = mentionsAny(action, ['install', 'source', 'backend']);
  const redeployLike = mentionsAny(action, ['redeploy', 'deploy']);
  const testLike = mentionsAny(action, ['test', 'verify', 'execution']);
  const internal = mentionsAny(action, ['internal', 'tool foundry', 'internal_tool']) && !bool(input.affects_external_systems);

  const ownerReasons = [];
  if (bool(input.uses_paid_api)) ownerReasons.push('paid API usage');
  if (bool(input.connects_external_account)) ownerReasons.push('external account access');
  if (bool(input.stores_sensitive_data)) ownerReasons.push('sensitive-data storage');
  if (bool(input.publishes_publicly)) ownerReasons.push('public publishing');
  if (bool(input.sends_messages)) ownerReasons.push('sending emails or messages');
  if (bool(input.affects_external_systems)) ownerReasons.push('real-world or external-system action');
  if (bool(input.changes_permissions)) ownerReasons.push('permission changes');
  if (bool(input.enables_scheduled_actions)) ownerReasons.push('scheduled autonomous actions');
  if (['high', 'unclear', 'unknown', ''].includes(risk)) ownerReasons.push('high or unclear risk');
  if (mentionsAny(input.owner_standing_rules, ['privacy boundary unclear', 'cost boundary unclear', 'product decision'])) ownerReasons.push('unclear boundary or user-facing product decision');

  const blockers = [];
  if (sourceChange && !payloadValidated) blockers.push('source changes require a validated install payload');
  if (unresolved(input.failure_diagnosis)) blockers.push('failure diagnosis has unresolved blockers');
  if (unresolved(input.dead_end_analysis)) blockers.push('dead-end analysis indicates a loop or unresolved workflow problem');
  if (unresolved(input.registry_audit_result)) blockers.push('registry audit indicates drift or missing wiring');
  if (approvalLike && !livePassed) blockers.push('live execution must pass before approval');
  if (approvalLike && !qualityPassed) blockers.push('quality testing must pass before approval');

  const lowRiskInternal = risk === 'low' && internal && ownerReasons.length === 0;
  const mustAskOwner = ownerReasons.length > 0;
  const mustStop = !mustAskOwner && blockers.length > 0;
  const baseSafe = lowRiskInternal && blockers.length === 0;
  const canInstall = baseSafe && (!sourceChange || payloadValidated) && (installLike || redeployLike || testLike || approvalLike);
  const canRedeploy = canInstall && (redeployLike || installLike || approvalLike);
  const canTest = canInstall && (testLike || installLike || approvalLike);
  const canMarkApproved = baseSafe && payloadValidated && livePassed && qualityPassed && approvalLike;
  const canProceedAutomatically = baseSafe && (!approvalLike || canMarkApproved);

  let autonomyDecision = 'proceed_automatically';
  let requiredNextTool = null;
  let requiredNextAction = 'Proceed with the safe automatic Tool Foundry sequence.';
  if (mustAskOwner) {
    autonomyDecision = 'ask_owner';
    requiredNextAction = 'Stop and ask the owner for explicit approval before continuing.';
  } else if (mustStop) {
    autonomyDecision = 'repair_or_pause';
    if (blockers.some((b) => b.includes('validated install payload'))) requiredNextTool = 'tool_installation_validator';
    else if (blockers.some((b) => b.includes('live execution'))) requiredNextTool = 'tool_failure_diagnoser';
    else if (blockers.some((b) => b.includes('quality'))) requiredNextTool = 'tool_quality_tester';
    else if (blockers.some((b) => b.includes('dead-end'))) requiredNextTool = 'workflow_dead_end_resolver';
    else if (blockers.some((b) => b.includes('registry'))) requiredNextTool = 'tool_registry_auditor';
    else requiredNextTool = 'tool_failure_diagnoser';
    requiredNextAction = 'Repair or complete the missing safety gate before continuing.';
  }

  const sequence = canProceedAutomatically ? [
    'install only after tool_installation_validator passes',
    'redeploy through approved foundry_operator workflow',
    'verify /health',
    'verify /tools/list',
    'run existing tool execution tests',
    'run live autonomy_governor tests',
    'run tool_quality_tester',
    'mark Approved only if live execution and quality tests pass'
  ] : [];

  return {
    autonomy_decision: autonomyDecision,
    can_proceed_automatically: canProceedAutomatically,
    can_install: canInstall,
    can_redeploy: canRedeploy,
    can_test: canTest,
    can_mark_approved: canMarkApproved,
    must_ask_owner: mustAskOwner,
    must_stop: mustStop,
    required_owner_approval_reason: ownerReasons.join('; ') || null,
    blocked_reason: blockers.join('; ') || null,
    required_next_tool: requiredNextTool,
    required_next_action: requiredNextAction,
    safe_automatic_sequence: sequence,
    approval_conditions: [
      'risk level is low',
      'action is internal to Tool Foundry',
      'no paid API usage',
      'no sensitive-data storage',
      'no external account connection',
      'no public publishing',
      'no messaging',
      'no external or real-world system effect',
      'no permission increase',
      'no scheduled autonomous action',
      'validated install payload for source changes',
      'live execution passed before approval',
      'quality testing passed before approval'
    ],
    risk_summary: mustAskOwner ? `Owner approval required: ${ownerReasons.join('; ')}` : (mustStop ? `Blocked until repaired: ${blockers.join('; ')}` : 'Low-risk internal Tool Foundry workflow with required gates satisfied.'),
    plain_english_summary: mustAskOwner ? `This cannot proceed automatically because it involves ${ownerReasons.join(', ')}.` : (mustStop ? `This must pause or be repaired first because ${blockers.join(', ')}.` : 'This low-risk internal Tool Foundry workflow may proceed automatically under the stated safety gates.')
  };
}

function install(router) {
  if (!router) return { installed: false, reason: 'router missing' };
  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {
    const index = router.BUILTIN_TOOL_METADATA.findIndex((tool) => tool.tool_id === METADATA.tool_id);
    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA;
    else router.BUILTIN_TOOL_METADATA.push(METADATA);
  }
  if (router.EXECUTABLE_HANDLERS) router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;
  if (typeof router.registerTool === 'function') router.registerTool(METADATA);
  return { installed: true, tool_id: METADATA.tool_id };
}

module.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };
