#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[^'"\s,;]{8,}/i
];

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}
function stableStringify(value) {
  return JSON.stringify(canonical(value));
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function safeRel(p) {
  const rel = String(p || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || rel.includes('\0')) fail('Invalid manifest path.', {path: p});
  const normalized = path.posix.normalize(rel);
  if (normalized.startsWith('../') || normalized === '..') fail('Path traversal rejected.', {path: p});
  return normalized;
}
function redact(value) {
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[REDACTED]');
  return s;
}
function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeout || 120000
  });
  if (result.error) fail(`Command failed to start: ${command}`, {error: result.error.message});
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(' ')}`, {
      status: result.status,
      stdout: redact(result.stdout || ''),
      stderr: redact(result.stderr || '')
    });
  }
  return {stdout: result.stdout || '', stderr: result.stderr || '', status: result.status};
}
function git(repo, args) {
  return run('git', args, {cwd: repo});
}
function ensureClean(repo) {
  const out = git(repo, ['status', '--porcelain']).stdout.trim();
  if (out) fail('Repository working tree is not clean.', {status: out});
}
function currentBranch(repo) {
  return git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
}
function currentCommit(repo) {
  return git(repo, ['rev-parse', 'HEAD']).stdout.trim();
}
function fileContent(repo, rel) {
  const full = path.join(repo, rel);
  return fs.existsSync(full) ? fs.readFileSync(full) : Buffer.from('');
}
function secretFree(content) {
  const s = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  return !SECRET_PATTERNS.some(re => re.test(s));
}
function validateManifest(manifest, repo) {
  const blockers = [];
  if (!manifest.transaction_id) blockers.push('transaction_id is required');
  if (!manifest.repository || !manifest.repository.owner || !manifest.repository.name) blockers.push('repository owner and name are required');
  if (!manifest.base_branch || !manifest.target_branch) blockers.push('base_branch and target_branch are required');
  if (manifest.target_branch === manifest.base_branch && !manifest.emergency_default_branch_override) blockers.push('direct default/base branch writes are forbidden');
  if (!manifest.validation || manifest.validation.validation_status !== 'passed' || manifest.validation.can_install !== true || manifest.validation.install_payload_validated !== true) blockers.push('validated install evidence is incomplete');
  if (!manifest.approval || manifest.approval.approved !== true || manifest.approval.approval_confirmed !== true) blockers.push('exact owner approval is incomplete');
  if (!Array.isArray(manifest.files) || !manifest.files.length) blockers.push('files manifest is required');
  if (!Array.isArray(manifest.test_commands) || !manifest.test_commands.length) blockers.push('at least one test command is required');
  if (blockers.length) fail('Preflight manifest validation failed.', {blockers});

  const approvedPaths = (manifest.approval.paths || []).map(safeRel).sort();
  const manifestPaths = manifest.files.map(f => safeRel(f.path)).sort();
  if (stableStringify(approvedPaths) !== stableStringify(manifestPaths)) {
    fail('Approval paths do not exactly match manifest paths.', {approvedPaths, manifestPaths});
  }
  if (manifest.approval.repository !== `${manifest.repository.owner}/${manifest.repository.name}`) {
    fail('Approval repository does not match manifest repository.');
  }
  if (manifest.approval.target_branch !== manifest.target_branch) {
    fail('Approval target branch does not match manifest target branch.');
  }

  const seen = new Set();
  for (const file of manifest.files) {
    const rel = safeRel(file.path);
    if (seen.has(rel)) fail('Duplicate path in manifest.', {path: rel});
    seen.add(rel);
    if (file.full_returned !== true || file.truncated === true || file.redacted === true) {
      fail('Replacement source must be complete, untruncated, and unredacted.', {path: rel});
    }
    if (typeof file.content !== 'string' || file.content.length === 0) fail('Replacement content is empty.', {path: rel});
    if (!secretFree(file.content)) fail('Probable credential found in replacement content.', {path: rel});
    const before = fileContent(repo, rel);
    const actual = sha256(before);
    if (actual !== file.expected_before_sha256) {
      fail('Prior file hash mismatch.', {path: rel, expected: file.expected_before_sha256, actual});
    }
    if (sha256(file.content) !== file.after_sha256) {
      fail('Replacement content hash mismatch.', {path: rel});
    }
  }
}
function changedPaths(repo) {
  return git(repo, ['status', '--porcelain']).stdout
    .split('\n').filter(Boolean).map(line => line.slice(3).replace(/\\/g, '/')).sort();
}
function writeAudit(repo, record) {
  const dir = path.join(repo, '.trusted-writer-audit');
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${record.transaction_id}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
  return file;
}
async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {headers});
  const body = await response.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = {raw: body}; }
  return {status: response.status, body: parsed};
}
async function verifyLive(manifest, beforeHealth) {
  if (!manifest.verification || !manifest.verification.health_url) return {skipped: true};
  const headers = {};
  if (manifest.verification.api_key_env) {
    const key = process.env[manifest.verification.api_key_env];
    if (!key) fail('Verification API key environment variable is missing.');
    headers['x-api-key'] = key;
  }
  const result = await fetchJson(manifest.verification.health_url, headers);
  if (result.status !== 200) fail('Live health verification failed.', {status: result.status, body: result.body});
  const health = result.body;
  if (manifest.verification.require_auth_enforced && health.auth_enforced !== true) fail('auth_enforced is not true.');
  if (manifest.verification.require_mutation_gates_enforced && health.mutation_gates_enforced !== true) fail('mutation_gates_enforced is not true.');
  if (beforeHealth) {
    const markerChanged = beforeHealth.deployment_adoption_marker !== health.deployment_adoption_marker;
    const startChanged = beforeHealth.started_at !== health.started_at;
    if (!markerChanged && !startChanged) fail('Deployment adoption was not proven.');
  }
  return {status: result.status, health};
}
function runShellCommand(spec, repo) {
  if (!spec || !spec.command || !Array.isArray(spec.args)) fail('Invalid command specification.');
  return run(spec.command, spec.args, {
    cwd: spec.cwd ? path.resolve(repo, spec.cwd) : repo,
    timeout: spec.timeout_ms || 120000
  });
}
async function executeTransaction(manifestPath) {
  const manifest = readJson(manifestPath);
  const repo = path.resolve(manifest.repo_path || process.cwd());
  const record = {
    transaction_id: manifest.transaction_id,
    started_at: new Date().toISOString(),
    final_status: 'started',
    blockers: [],
    actions: []
  };

  try {
    ensureClean(repo);
    validateManifest(manifest, repo);
    record.actions.push({stage: 'preflight', status: 'passed'});

    const existingAudit = path.join(repo, '.trusted-writer-audit', `${manifest.transaction_id}.json`);
    if (fs.existsSync(existingAudit)) {
      const old = readJson(existingAudit);
      if (old.final_status === 'completed') {
        return {...old, idempotent_replay: true};
      }
      fail('Transaction ID already exists with a non-completed state.');
    }

    const baseCommit = currentCommit(repo);
    const baseBranch = currentBranch(repo);
    if (baseBranch !== manifest.base_branch) fail('Current branch does not match base_branch.', {baseBranch});
    const backupBranch = `backup/${manifest.transaction_id}`;
    git(repo, ['branch', backupBranch, baseCommit]);
    git(repo, ['checkout', '-b', manifest.target_branch]);
    record.actions.push({stage: 'branch', status: 'passed', backup_branch: backupBranch, target_branch: manifest.target_branch});

    for (const file of manifest.files) {
      const rel = safeRel(file.path);
      const full = path.join(repo, rel);
      fs.mkdirSync(path.dirname(full), {recursive: true});
      fs.writeFileSync(full, file.content, 'utf8');
    }

    const actualChanged = changedPaths(repo);
    const expectedChanged = manifest.files.map(f => safeRel(f.path)).sort();
    if (stableStringify(actualChanged) !== stableStringify(expectedChanged)) {
      fail('Changed paths do not exactly match the manifest.', {actualChanged, expectedChanged});
    }
    git(repo, ['diff', '--check']);
    record.actions.push({stage: 'write', status: 'passed', changed_files: actualChanged});

    const testResults = [];
    for (const spec of manifest.test_commands) {
      const r = runShellCommand(spec, repo);
      testResults.push({command: spec.command, args: spec.args, status: r.status});
    }
    record.actions.push({stage: 'tests', status: 'passed', results: testResults});

    git(repo, ['add', '--', ...expectedChanged]);
    git(repo, ['commit', '-m', manifest.commit_message || `trusted-writer: ${manifest.transaction_id}`]);
    const commit = currentCommit(repo);
    record.actions.push({stage: 'commit', status: 'passed', commit});

    let beforeHealth = null;
    if (manifest.verification && manifest.verification.health_url) {
      const before = await fetchJson(manifest.verification.health_url);
      beforeHealth = before.body;
    }

    if (manifest.push === true) {
      git(repo, ['push', '-u', 'origin', manifest.target_branch]);
      record.actions.push({stage: 'push', status: 'passed'});
    }

    if (manifest.deploy_command) {
      runShellCommand(manifest.deploy_command, repo);
      record.actions.push({stage: 'deploy', status: 'passed'});
    }

    const verification = await verifyLive(manifest, beforeHealth);
    record.actions.push({stage: 'verification', status: 'passed', result: verification});

    record.final_status = 'completed';
    record.completed_at = new Date().toISOString();
    record.audit_file = writeAudit(repo, record);
    return record;
  } catch (error) {
    record.blockers.push({message: error.message, details: error.details || {}});
    try {
      const branch = currentBranch(repo);
      const backupBranch = `backup/${manifest.transaction_id}`;
      if (git(repo, ['branch', '--list', backupBranch]).stdout.trim()) {
        git(repo, ['reset', '--hard']);
        if (branch !== manifest.base_branch) git(repo, ['checkout', manifest.base_branch]);
        git(repo, ['reset', '--hard', backupBranch]);
        record.actions.push({stage: 'rollback', status: 'passed', backup_branch: backupBranch});
      }
    } catch (rollbackError) {
      record.actions.push({stage: 'rollback', status: 'failed', error: rollbackError.message});
    }
    record.final_status = 'failed';
    record.completed_at = new Date().toISOString();
    try { record.audit_file = writeAudit(repo, record); } catch {}
    return record;
  }
}

if (require.main === module) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: trusted-repository-writer <manifest.json>');
    process.exit(2);
  }
  executeTransaction(path.resolve(manifestPath)).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.final_status === 'completed' ? 0 : 1);
  }).catch(error => {
    console.error(redact(error.stack || error.message));
    process.exit(1);
  });
}

module.exports = {executeTransaction, validateManifest, sha256, safeRel};
