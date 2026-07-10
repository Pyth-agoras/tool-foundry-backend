'use strict';

const crypto = require('node:crypto');

const VERIFIED_GRANTS = new WeakSet();
const ALLOWED_OPERATIONS = new Set(['create_recovery_branch', 'update_recovery_branch']);
const DEFAULT_PROTECTED_PATHS = new Set([
  'src/server.js',
  'src/executable_tool_router.js',
  'src/mutation_gate.js',
  'src/authentication_middleware.js',
  'src/preflight_repair_verifier.js',
  'package.json'
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function isFullCommit(value) {
  return /^[a-f0-9]{40}$/i.test(String(value || ''));
}

function isHash(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function isSafeRelativePath(value) {
  const path = String(value || '');
  return Boolean(path) &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !/^[a-z]:/i.test(path) &&
    !path.includes('..') &&
    !path.includes('\\') &&
    !path.split('/').includes('');
}

function looksSecretBearing(content) {
  const text = String(content || '');
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
    /\bsk-[A-Za-z0-9]{24,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/
  ];
  return patterns.some(pattern => pattern.test(text));
}

function mapFiles(files, label, errors) {
  if (!Array.isArray(files)) {
    errors.push(`${label} must be an array.`);
    return new Map();
  }
  const map = new Map();
  for (const file of files) {
    if (!file || !isSafeRelativePath(file.path) || typeof file.content !== 'string') {
      errors.push(`${label} contains an invalid path or incomplete content.`);
      continue;
    }
    if (map.has(file.path)) {
      errors.push(`${label} contains duplicate path ${file.path}.`);
      continue;
    }
    if (looksSecretBearing(file.content)) {
      errors.push(`${label} contains secret-bearing content at ${file.path}.`);
    }
    map.set(file.path, file);
  }
  return map;
}

function verifyMutationManifest(input = {}, policy = {}) {
  const errors = [];
  const manifest = input.approval_manifest;
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['approval_manifest is required.'] };
  }

  if (manifest.approved !== true || manifest.approval_confirmed !== true) {
    errors.push('Exact owner approval and confirmation are required.');
  }
  if (!manifest.owner_grant_id || !manifest.mission_id || !manifest.scope_id) {
    errors.push('owner_grant_id, mission_id, and scope_id are required.');
  }
  if (!isFullCommit(manifest.base_commit)) {
    errors.push('A complete base commit SHA is required.');
  }
  if (policy.expected_mission_id && manifest.mission_id !== policy.expected_mission_id) {
    errors.push('Mission ID does not match the backend-approved scope.');
  }
  if (policy.expected_scope_id && manifest.scope_id !== policy.expected_scope_id) {
    errors.push('Scope ID does not match the backend-approved scope.');
  }
  if (policy.expected_base_commit &&
      String(manifest.base_commit).toLowerCase() !== String(policy.expected_base_commit).toLowerCase()) {
    errors.push('Base commit does not match the backend-approved scope.');
  }
  if (policy.allowed_operations &&
      !new Set(policy.allowed_operations).has(manifest.operation)) {
    errors.push('Operation is outside the backend-approved scope.');
  }
  if (!ALLOWED_OPERATIONS.has(manifest.operation)) {
    errors.push('The requested operation is not allowed.');
  }
  if (manifest.expires_at && Date.parse(manifest.expires_at) <= Date.now()) {
    errors.push('The owner grant has expired.');
  }

  const current = mapFiles(input.current_files, 'current_files', errors);
  const proposed = mapFiles(input.proposed_files, 'proposed_files', errors);
  const rollback = mapFiles(input.rollback_files, 'rollback_files', errors);
  const allowedPaths = new Set(manifest.allowed_paths || []);
  const protectedPaths = new Set(policy.protected_paths || DEFAULT_PROTECTED_PATHS);

  for (const path of allowedPaths) {
    if (!isSafeRelativePath(path)) errors.push(`Unsafe allowed path: ${path}`);
  }
  if (allowedPaths.size !== proposed.size) {
    errors.push('allowed_paths must exactly match proposed_files.');
  }

  for (const [path, file] of proposed) {
    if (!allowedPaths.has(path)) errors.push(`Undeclared proposed path: ${path}`);
    const declared = manifest.proposed_hashes && manifest.proposed_hashes[path];
    if (!isHash(declared) || sha256(file.content) !== String(declared).toLowerCase()) {
      errors.push(`Proposed hash mismatch for ${path}.`);
    }

    const previous = current.get(path);
    const rollbackFile = rollback.get(path);
    if (previous) {
      const currentHash = manifest.current_hashes && manifest.current_hashes[path];
      if (!isHash(currentHash) || sha256(previous.content) !== String(currentHash).toLowerCase()) {
        errors.push(`Current hash mismatch for ${path}.`);
      }
      if (!rollbackFile || rollbackFile.content !== previous.content) {
        errors.push(`Rollback content does not restore ${path}.`);
      }
      const rollbackHash = manifest.rollback_hashes && manifest.rollback_hashes[path];
      if (!rollbackFile || !isHash(rollbackHash) ||
          sha256(rollbackFile.content) !== String(rollbackHash).toLowerCase()) {
        errors.push(`Rollback hash mismatch for ${path}.`);
      }
    } else if (rollbackFile && rollbackFile.content !== '') {
      errors.push(`New file ${path} must roll back by deletion.`);
    }

    if (protectedPaths.has(path) && manifest.protected_paths_approved !== true) {
      errors.push(`Protected path was not explicitly approved: ${path}.`);
    }
  }

  for (const path of rollback.keys()) {
    if (!proposed.has(path)) errors.push(`Extra rollback path: ${path}.`);
  }

  if (errors.length) return { ok: false, errors };

  const grant = Object.freeze({
    mission_id: manifest.mission_id,
    scope_id: manifest.scope_id,
    owner_grant_id: manifest.owner_grant_id,
    base_commit: manifest.base_commit.toLowerCase(),
    operation: manifest.operation,
    paths: Object.freeze([...allowedPaths].sort())
  });
  VERIFIED_GRANTS.add(grant);
  return { ok: true, grant, errors: [] };
}

function isVerifiedGrant(value) {
  return Boolean(value && typeof value === 'object' && VERIFIED_GRANTS.has(value));
}

module.exports = {
  DEFAULT_PROTECTED_PATHS,
  isFullCommit,
  isHash,
  isSafeRelativePath,
  isVerifiedGrant,
  looksSecretBearing,
  sha256,
  verifyMutationManifest
};
