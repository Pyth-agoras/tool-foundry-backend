'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verify } = require('../src/preflight_repair_verifier');
const { sha256 } = require('../src/mutation_gate');

test('missing evidence is a failure, never a warning', () => {
  const result = verify({});
  assert.equal(result.can_install, false);
  assert.equal(result.validation_status, 'failed');
  assert.ok(result.failed_checks.length > 0);
});

test('caller-supplied pass labels are rejected as proof', () => {
  const before = 'old\n';
  const after = 'new\n';
  const result = verify({
    mission_id: 'mission_1783652475518',
    scope_id: 'foundation_security',
    base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
    approval_manifest: {
      mission_id: 'mission_1783652475518',
      scope_id: 'foundation_security',
      base_commit: 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66',
      protected_paths_approved: true
    },
    current_file_map: [{ path: 'src/example.js', content: before, sha256: sha256(before) }],
    proposed_file_map: [{ path: 'src/example.js', content: after, sha256: sha256(after) }],
    rollback_file_map: [{ path: 'src/example.js', content: before, sha256: sha256(before) }],
    allowed_paths: ['src/example.js'],
    protected_paths: [],
    expected_active_entry_path: 'server.js -> src/server.js -> src/executable_tool_router.js',
    module_load_results: [{ name: 'real router imported', passed: true }],
    integration_test_results: [{ name: 'route schema agrees', passed: true }],
    proposed_health_flags: {
      auth_enforced: true,
      mutation_gates_enforced: false
    }
  });
  assert.equal(result.can_install, false);
  assert.ok(result.failed_checks.some(item => item.includes('pass label')));
});
