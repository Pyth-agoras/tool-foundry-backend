'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, verifyMutationManifest, isVerifiedGrant } = require('../src/mutation_gate');

function validInput() {
  const before = "'use strict';\n";
  const after = "'use strict';\nmodule.exports = true;\n";
  return {
    current_files: [{ path: 'src/example.js', content: before }],
    proposed_files: [{ path: 'src/example.js', content: after }],
    rollback_files: [{ path: 'src/example.js', content: before }],
    approval_manifest: {
      approved: true,
      approval_confirmed: true,
      owner_grant_id: 'grant_1',
      mission_id: 'mission_1783652475518',
      scope_id: 'foundation_security',
      base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
      operation: 'create_recovery_branch',
      allowed_paths: ['src/example.js'],
      proposed_hashes: { 'src/example.js': sha256(after) },
      current_hashes: { 'src/example.js': sha256(before) },
      rollback_hashes: { 'src/example.js': sha256(before) },
      protected_paths_approved: true
    }
  };
}

test('creates a private verified grant for an exact manifest', () => {
  const result = verifyMutationManifest(validInput(), {
    protected_paths: [],
    expected_mission_id: 'mission_1783652475518',
    expected_scope_id: 'foundation_security',
    expected_base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
    allowed_operations: ['create_recovery_branch']
  });
  assert.equal(result.ok, true);
  assert.equal(isVerifiedGrant(result.grant), true);
});

for (const field of ['mission_id', 'scope_id', 'base_commit']) {
  test(`rejects wrong ${field}`, () => {
    const input = validInput();
    input.approval_manifest[field] = 'wrong';
    assert.equal(verifyMutationManifest(input, {
      protected_paths: [],
      expected_mission_id: 'mission_1783652475518',
      expected_scope_id: 'foundation_security',
      expected_base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
      allowed_operations: ['create_recovery_branch']
    }).ok, false);
  });
}

test('rejects duplicate paths', () => {
  const input = validInput();
  input.proposed_files.push({ ...input.proposed_files[0] });
  assert.equal(verifyMutationManifest(input, {
      protected_paths: [],
      expected_mission_id: 'mission_1783652475518',
      expected_scope_id: 'foundation_security',
      expected_base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
      allowed_operations: ['create_recovery_branch']
    }).ok, false);
});

test('rejects wrong rollback', () => {
  const input = validInput();
  input.rollback_files[0].content = 'wrong';
  assert.equal(verifyMutationManifest(input, {
      protected_paths: [],
      expected_mission_id: 'mission_1783652475518',
      expected_scope_id: 'foundation_security',
      expected_base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
      allowed_operations: ['create_recovery_branch']
    }).ok, false);
});
