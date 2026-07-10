#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const {executeTransaction, sha256, validateManifest} = require('../bin/trusted-repository-writer');

function git(repo, args) {
  const r = cp.spawnSync('git', args, {cwd: repo, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-writer-'));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'app.js'), "module.exports = 'old';\n");
  fs.writeFileSync(path.join(repo, 'test.js'), "const assert=require('assert');assert.strictEqual(require('./app'),'new');\n");
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'initial']);
  return repo;
}
function manifest(repo, overrides={}) {
  const old = fs.readFileSync(path.join(repo, 'app.js'));
  const content = "module.exports = 'new';\n";
  return {
    transaction_id: 'tx-001',
    repo_path: repo,
    repository: {owner: 'owner', name: 'repo'},
    base_branch: 'main',
    target_branch: 'repair/tx-001',
    validation: {validation_status: 'passed', can_install: true, install_payload_validated: true},
    approval: {
      approved: true,
      approval_confirmed: true,
      repository: 'owner/repo',
      target_branch: 'repair/tx-001',
      paths: ['app.js']
    },
    files: [{
      path: 'app.js',
      expected_before_sha256: sha256(old),
      content,
      after_sha256: sha256(content),
      full_returned: true,
      truncated: false,
      redacted: false
    }],
    test_commands: [{command: process.execPath, args: ['test.js']}],
    commit_message: 'repair',
    ...overrides
  };
}
(async () => {
  {
    const repo = fixture();
    const m = manifest(repo);
    const file = path.join(os.tmpdir(), `trusted-writer-manifest-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(file, JSON.stringify(m));
    const result = await executeTransaction(file);
    assert.strictEqual(result.final_status, 'completed');
    assert.strictEqual(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']), 'repair/tx-001');
  }
  {
    const repo = fixture();
    const m = manifest(repo);
    m.validation.can_install = false;
    assert.throws(() => validateManifest(m, repo), /Preflight/);
  }
  {
    const repo = fixture();
    const m = manifest(repo);
    m.files[0].expected_before_sha256 = '0'.repeat(64);
    assert.throws(() => validateManifest(m, repo), /hash mismatch/);
  }
  {
    const repo = fixture();
    const m = manifest(repo);
    m.approval.paths = ['other.js'];
    assert.throws(() => validateManifest(m, repo), /Approval paths/);
  }
  {
    const repo = fixture();
    const m = manifest(repo, {
      test_commands: [{command: process.execPath, args: ['-e', 'process.exit(1)']}]
    });
    const file = path.join(os.tmpdir(), `trusted-writer-manifest-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(file, JSON.stringify(m));
    const result = await executeTransaction(file);
    assert.strictEqual(result.final_status, 'failed');
    assert.strictEqual(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main');
    assert.strictEqual(fs.readFileSync(path.join(repo, 'app.js'), 'utf8'), "module.exports = 'old';\n");
  }
  console.log('trusted_repository_writer tests passed');
})().catch(e => { console.error(e); process.exit(1); });
