'use strict';

const vm = require('node:vm');
const {
  isFullCommit,
  isHash,
  isSafeRelativePath,
  looksSecretBearing,
  sha256
} = require('./mutation_gate');

function status(ok, details = []) {
  return { passed: Boolean(ok), details };
}

function fileMap(files, label, failed) {
  const map = new Map();
  if (!Array.isArray(files)) {
    failed.push(`${label} is missing or is not an array.`);
    return map;
  }
  for (const file of files) {
    if (!file || !isSafeRelativePath(file.path) || typeof file.content !== 'string') {
      failed.push(`${label} contains an invalid path or incomplete content.`);
      continue;
    }
    if (map.has(file.path)) {
      failed.push(`${label} contains duplicate path ${file.path}.`);
      continue;
    }
    if (!isHash(file.sha256) || sha256(file.content) !== file.sha256.toLowerCase()) {
      failed.push(`${label} hash mismatch for ${file.path}.`);
    }
    if (looksSecretBearing(file.content)) {
      failed.push(`${label} contains secret-bearing content at ${file.path}.`);
    }
    map.set(file.path, file);
  }
  return map;
}

function syntaxCheck(proposed, failed) {
  let ok = true;
  for (const [path, file] of proposed) {
    if (!path.endsWith('.js')) continue;
    try {
      new vm.Script(file.content, { filename: path });
    } catch (error) {
      failed.push(`JavaScript syntax failed for ${path}: ${error.message}`);
      ok = false;
    }
  }
  return ok;
}

function parseEvidence(results, requiredNames, label, failed) {
  if (!Array.isArray(results)) {
    failed.push(`${label} evidence is missing.`);
    return false;
  }
  const byName = new Map(results.map(item => [item && item.name, item]));
  let ok = true;

  for (const name of requiredNames) {
    const item = byName.get(name);
    if (!item || typeof item !== 'object') {
      failed.push(`${label} lacks evidence for: ${name}.`);
      ok = false;
      continue;
    }

    if ('passed' in item) {
      failed.push(`${label} evidence for ${name} improperly relies on a caller pass label.`);
      ok = false;
      continue;
    }

    if (typeof item.command !== 'string' || item.command.trim() === '' ||
        !Number.isInteger(item.exit_code) ||
        typeof item.stdout !== 'string' ||
        typeof item.stderr !== 'string' ||
        !isHash(item.workspace_hash)) {
      failed.push(`${label} evidence for ${name} is incomplete.`);
      ok = false;
      continue;
    }

    const calculated = sha256(JSON.stringify({
      name: item.name,
      command: item.command,
      exit_code: item.exit_code,
      stdout: item.stdout,
      stderr: item.stderr,
      workspace_hash: item.workspace_hash
    }));

    if (!isHash(item.evidence_hash) || calculated !== item.evidence_hash.toLowerCase()) {
      failed.push(`${label} evidence hash mismatch for ${name}.`);
      ok = false;
      continue;
    }

    if (item.exit_code !== 0) {
      failed.push(`${label} command failed for ${name}.`);
      ok = false;
      continue;
    }

    if (!/(?:^|\n)(?:ok\b|# pass\b|PASS\b)/m.test(item.stdout)) {
      failed.push(`${label} evidence for ${name} has no successful test output.`);
      ok = false;
    }
  }

  return ok;
}

function verify(input = {}) {
  const failed = [];
  const missing = [];
  const current = fileMap(input.current_file_map, 'current_file_map', failed);
  const proposed = fileMap(input.proposed_file_map, 'proposed_file_map', failed);
  const rollback = fileMap(input.rollback_file_map, 'rollback_file_map', failed);

  const baseCommitMatch = isFullCommit(input.base_commit) &&
    input.base_commit === input.approval_manifest?.base_commit;
  if (!baseCommitMatch) failed.push('Base commit is missing or does not match the manifest.');

  if (input.mission_id !== input.approval_manifest?.mission_id) {
    failed.push('Mission ID does not match the approval manifest.');
  }
  if (input.scope_id !== input.approval_manifest?.scope_id) {
    failed.push('Scope ID does not match the approval manifest.');
  }

  const allowed = new Set(input.allowed_paths || []);
  const protectedPaths = new Set(input.protected_paths || []);
  for (const path of proposed.keys()) {
    if (!allowed.has(path)) failed.push(`Proposed path is undeclared: ${path}.`);
  }
  for (const path of allowed) {
    if (!proposed.has(path)) failed.push(`Allowed path has no proposed file: ${path}.`);
  }

  let rollbackOk = true;
  for (const [path] of proposed) {
    const previous = current.get(path);
    const rollbackFile = rollback.get(path);
    if (previous) {
      if (!rollbackFile || rollbackFile.content !== previous.content ||
          rollbackFile.sha256 !== previous.sha256) {
        failed.push(`Rollback does not exactly restore ${path}.`);
        rollbackOk = false;
      }
    } else if (!rollbackFile || rollbackFile.content !== '' ||
               rollbackFile.sha256 !== sha256('')) {
      failed.push(`New file ${path} lacks a deletion rollback marker.`);
      rollbackOk = false;
    }
    if (protectedPaths.has(path) &&
        input.approval_manifest?.protected_paths_approved !== true) {
      failed.push(`Protected path lacks explicit approval: ${path}.`);
    }
  }

  const syntaxOk = syntaxCheck(proposed, failed);

  const moduleChecks = [
    'real router imported',
    'baseline successful modules preserved',
    'baseline failures reported',
    'no new external load failures',
    'required exports present'
  ];
  const moduleOk = parseEvidence(
    input.module_load_results,
    moduleChecks,
    'Module load',
    failed
  );

  const integrationChecks = [
    'all non-health routes reject missing credentials',
    'all non-health routes reject wrong credentials',
    'correct bearer credential succeeds',
    'server import opens no listener',
    'idea_analyzer behavior preserved',
    'Testing tool rejected in normal mode',
    'allowlisted recovery tool requires trusted maintenance context',
    'request input cannot impersonate maintenance context',
    'post-bootstrap registration rejected',
    'post-bootstrap promotion rejected',
    'source writer rejected without verified grant',
    'wrong mission rejected',
    'wrong scope rejected',
    'wrong base commit rejected',
    'wrong path rejected',
    'wrong contents rejected',
    'wrong hash rejected',
    'wrong rollback rejected',
    'duplicate paths rejected',
    'handler baseline preserved',
    'metadata baseline preserved',
    'route schema agrees',
    'rollback restores pinned hashes'
  ];
  const integrationOk = parseEvidence(
    input.integration_test_results,
    integrationChecks,
    'Integration',
    failed
  );

  const expectedEntry = 'server.js -> src/server.js -> src/executable_tool_router.js';
  if (input.expected_active_entry_path !== expectedEntry) {
    failed.push('Active entry path does not match the expected runtime.');
  }

  const authOk = integrationOk &&
    input.proposed_health_flags?.auth_enforced === true;
  const mutationFlagTruthful =
    input.proposed_health_flags?.mutation_gates_enforced === false;
  if (!mutationFlagTruthful) {
    failed.push('mutation_gates_enforced must remain false in this bounded patch.');
  }

  const canInstall = failed.length === 0 && missing.length === 0;
  return {
    validation_status: canInstall ? 'passed' : 'failed',
    can_install: canInstall,
    base_commit_match: status(baseCommitMatch),
    file_hash_status: status(!failed.some(x => /hash mismatch/i.test(x))),
    rollback_status: status(rollbackOk),
    protected_path_status: status(!failed.some(x => /Protected path/i.test(x))),
    syntax_status: status(syntaxOk),
    module_load_status: status(moduleOk),
    router_integrity_status: status(moduleOk && integrationOk),
    route_contract_status: status(integrationOk),
    authentication_status: status(authOk),
    lifecycle_status: status(integrationOk),
    mutation_gate_status: status(integrationOk && mutationFlagTruthful),
    foundation_survival_status: status(moduleOk && integrationOk),
    missing_evidence: missing,
    failed_checks: failed,
    exact_repairs_needed: failed.map(item => `Resolve: ${item}`),
    plain_english_summary: canInstall
      ? 'The proposal is complete and independently supported by hashed command evidence.'
      : 'The proposal cannot be installed until every listed failure is resolved.'
  };
}

const metadata = {
  tool_id: 'preflight_repair_verifier',
  name: 'Preflight Repair Verifier',
  purpose: 'Independently validate a complete, hash-bound Tool Foundry maintenance proposal.',
  status: 'Testing',
  risk_level: 'low',
  version: '0.2.0',
  approval_state: 'pending_execution_test',
  builtin: false
};

function install(router) {
  router.EXECUTABLE_HANDLERS[metadata.tool_id] = verify;
  router.registerTool(metadata, router.getBootstrapContext());
  return { installed: true, tool_id: metadata.tool_id };
}

module.exports = { execute: verify, handler: verify, install, metadata, verify };
