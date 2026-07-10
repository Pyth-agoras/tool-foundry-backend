use strict';

const path = require('path');
const {executeTransaction} = require('../bin/trusted-repository-writer');

const METADATA = {
  tool_id: 'trusted_repository_writer',
  name: 'Trusted Repository Writer',
  purpose: 'Execute fail-closed, manifest-approved branch writes with validation, approval, hash, test, deployment, verification, rollback, and audit gates.',
  status: 'Testing',
  risk_level: 'high',
  version: '1.0.0',
  approval_state: 'requires_exact_owner_approval',
  builtin: false,
  input_schema_description: 'manifest_path referencing a complete locally stored transaction manifest; approved and approval_confirmed must be true',
  output_schema_description: 'write_plan; preflight_result; changed_files; commit_result; test_result; deployment_result; verification_result; rollback_result; audit_record; final_status; blockers'
};

async function execute(input = {}) {
  if (input.approved !== true || input.approval_confirmed !== true) {
    return {final_status: 'blocked', blockers: ['Exact owner approval is required.']};
  }
  if (!input.manifest_path) {
    return {final_status: 'blocked', blockers: ['manifest_path is required.']};
  }
  return executeTransaction(path.resolve(input.manifest_path));
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS) throw new Error('Executable router exports are required.');
  router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;
  if (typeof router.registerTool === 'function') router.registerTool(METADATA);
  return {installed: true, tool_id: METADATA.tool_id};
}

module.exports = {METADATA, metadata: METADATA, execute, handle: execute, install};
