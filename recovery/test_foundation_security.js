#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

async function main() {
  process.env.API_KEY = process.env.API_KEY || 'foundation-security-test-key';
  const repo = path.resolve(process.argv[2] || process.cwd());
  const app = require(path.join(repo, 'src', 'server.js'));
  const router = require(path.join(repo, 'src', 'executable_tool_router.js'));

  const server = app.listen(0);
  try {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/health`);
    assert.strictEqual(health.status, 200);
    const healthJson = await health.json();
    assert.strictEqual(healthJson.auth_enforced, true);
    assert.strictEqual(healthJson.mutation_gates_enforced, true);
    assert.strictEqual(healthJson.router, 'executable_tool_router');
    assert.ok(healthJson.started_at);

    assert.strictEqual((await fetch(`${base}/tools/list`)).status, 401);
    assert.strictEqual((await fetch(`${base}/tools/list`, {
      headers: {'x-api-key': 'wrong-key'}
    })).status, 401);
    assert.strictEqual((await fetch(`${base}/tools/list`, {
      headers: {'x-api-key': process.env.API_KEY}
    })).status, 200);

    const noApproval = await router.executeTool('foundry_operator', {
      files: [{path: 'src/SHOULD_NOT_WRITE.js', content: 'x'}]
    });
    assert.ok(noApproval.blockers.length > 0);
    assert.strictEqual(noApproval.actions_taken.length, 0);

    const approvalWithoutValidation = await router.executeTool('foundry_operator', {
      approved: true,
      approval_confirmed: true,
      files: [{path: 'src/SHOULD_NOT_WRITE.js', content: 'x'}]
    });
    assert.ok(approvalWithoutValidation.blockers.length > 0);
    assert.strictEqual(approvalWithoutValidation.actions_taken.length, 0);

    const validationWithoutApproval = await router.executeTool('foundry_operator', {
      install_payload_validated: true,
      validation_result: {validation_status: 'passed', can_install: true},
      files: [{path: 'src/SHOULD_NOT_WRITE.js', content: 'x'}]
    });
    assert.ok(validationWithoutApproval.blockers.length > 0);
    assert.strictEqual(validationWithoutApproval.actions_taken.length, 0);

    console.log('Foundation security tests passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
