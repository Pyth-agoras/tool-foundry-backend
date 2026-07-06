'use strict';

const METADATA = {
  tool_id: 'autonomy_governor',
  name: 'Autonomy Governor',
  purpose: 'Decide whether Tool Foundry work may proceed automatically under owner safety gates.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.1',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'user_goal; requested_action; risk_level; action_type; affects_external_systems; uses_paid_api; stores_sensitive_data; connects_external_account; publishes_publicly; sends_messages; changes_permissions; enables_scheduled_actions; source_change_required; install_payload_validated; live_execution_passed; quality_test_passed; owner_standing_rules.',
  output_schema_description: 'autonomy_decision; can_proceed_automatically; can_install; can_redeploy; can_test; can_mark_approved; must_ask_owner; must_stop; blocked_reason; required_next_tool; required_next_action; approval_conditions; plain_english_summary.'
};

function bool(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function text(value) {
  return String(value || '').toLowerCase();
}

function execute(input = {}) {
  const risk = text(input.risk_level || '');
  const actionType = text(input.action_type || input.requested_action || input.user_goal || '');
  const requested = text(input.requested_action || '');

  const dryRun = actionType.includes('dry_run_validation') || actionType.includes('dry run') || actionType.includes('dry-run') || (actionType.includes('validation') && requested.includes('do not install'));
  const lowRisk = risk === 'low' || risk === '';
  const sourceChangeRequired = bool(input.source_change_required);
  const dangerous = bool(input.uses_paid_api) || bool(input.stores_sensitive_data) || bool(input.connects_external_account) || bool(input.publishes_publicly) || bool(input.sends_messages) || bool(input.changes_permissions) || bool(input.enables_scheduled_actions) || bool(input.affects_external_systems);
  const noWriteDryRun = dryRun && !sourceChangeRequired && !dangerous && lowRisk;
  const sourceChange = sourceChangeRequired;
  const installPayloadValidated = bool(input.install_payload_validated);
  const asksApprovalMarking = actionType.includes('approve') || requested.includes('mark approved') || requested.includes('tool approval');
  const liveExecutionPassed = bool(input.live_execution_passed);
  const qualityTestPassed = bool(input.quality_test_passed);

  const approval_conditions = [
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
  ];

  if (noWriteDryRun) {
    return {
      autonomy_decision: 'proceed_automatically',
      can_proceed_automatically: true,
      can_install: false,
      can_redeploy: false,
      can_test: true,
      can_mark_approved: false,
      must_ask_owner: false,
      must_stop: false,
      required_owner_approval_reason: null,
      blocked_reason: null,
      required_next_tool: null,
      required_next_action: 'Proceed with the safe no-write dry-run validation sequence.',
      safe_automatic_sequence: ['inspect source', 'generate hypothetical payload', 'validate payload', 'report results'],
      approval_conditions,
      risk_summary: 'Low-risk no-write dry-run validation.',
      plain_english_summary: 'This no-write dry-run validation may proceed automatically under the stated safety gates.'
    };
  }

  if (asksApprovalMarking && (!liveExecutionPassed || !qualityTestPassed)) {
    const blockers = [];
    if (!liveExecutionPassed) blockers.push('live execution must pass before approval');
    if (!qualityTestPassed) blockers.push('quality testing must pass before approval');
    return {
      autonomy_decision: 'repair_or_pause',
      can_proceed_automatically: false,
      can_install: false,
      can_redeploy: false,
      can_test: false,
      can_mark_approved: false,
      must_ask_owner: false,
      must_stop: true,
      required_owner_approval_reason: null,
      blocked_reason: blockers.join('; '),
      required_next_tool: 'tool_quality_tester',
      required_next_action: 'Complete live execution and quality testing before approval marking.',
      safe_automatic_sequence: [],
      approval_conditions,
      risk_summary: 'Blocked until approval gates pass.',
      plain_english_summary: 'Approval marking must pause until live execution and quality testing pass.'
    };
  }

  if (sourceChange && !installPayloadValidated) {
    return {
      autonomy_decision: 'repair_or_pause',
      can_proceed_automatically: false,
      can_install: false,
      can_redeploy: false,
      can_test: false,
      can_mark_approved: false,
      must_ask_owner: false,
      must_stop: true,
      required_owner_approval_reason: null,
      blocked_reason: 'source changes require a validated install payload',
      required_next_tool: 'tool_installation_validator',
      required_next_action: 'Validate the specific repair payload before continuing.',
      safe_automatic_sequence: [],
      approval_conditions,
      risk_summary: 'Blocked until a specific repair payload passes validation.',
      plain_english_summary: 'This must pause until the repair payload passes validation.'
    };
  }

  if (sourceChange && installPayloadValidated && lowRisk && !dangerous) {
    return {
      autonomy_decision: 'proceed_automatically',
      can_proceed_automatically: true,
      can_install: true,
      can_redeploy: false,
      can_test: true,
      can_mark_approved: false,
      must_ask_owner: false,
      must_stop: false,
      required_owner_approval_reason: null,
      blocked_reason: null,
      required_next_tool: null,
      required_next_action: 'Proceed with the validated low-risk internal repair only.',
      safe_automatic_sequence: ['apply validated handler-only repair', 'verify health', 'rerun contract test'],
      approval_conditions,
      risk_summary: 'Low-risk internal repair with validated payload.',
      plain_english_summary: 'This validated low-risk internal repair may proceed automatically without marking any tool approved.'
    };
  }

  return {
    autonomy_decision: 'ask_owner',
    can_proceed_automatically: false,
    can_install: false,
    can_redeploy: false,
    can_test: false,
    can_mark_approved: false,
    must_ask_owner: true,
    must_stop: false,
    required_owner_approval_reason: 'high or unclear risk',
    blocked_reason: null,
    required_next_tool: null,
    required_next_action: 'Ask the owner for explicit approval before continuing.',
    safe_automatic_sequence: [],
    approval_conditions,
    risk_summary: 'Owner approval required: high or unclear risk',
    plain_english_summary: 'This cannot proceed automatically because it involves high or unclear risk.'
  };
}

function install(router) {
  if (!router) return;
  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {
    const index = router.BUILTIN_TOOL_METADATA.findIndex(tool => tool.tool_id === METADATA.tool_id);
    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA;
    else router.BUILTIN_TOOL_METADATA.push(METADATA);
  }
  if (router.EXECUTABLE_HANDLERS) router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;
  if (typeof router.registerTool === 'function') router.registerTool(METADATA);
  return { installed: true, tool_id: METADATA.tool_id };
}

module.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };
