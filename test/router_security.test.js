'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('real router enforces lifecycle and bootstrap closure', async () => {
  const router = require('../src/executable_tool_router');
  const idea = await router.executeTool('idea_analyzer', { raw_idea: 'Analyze notes' });
  assert.equal(idea.ok, true);

  await assert.rejects(
    () => router.executeTool('tool_readiness_checker', { raw_idea: 'test' }),
    /not Approved/
  );

  await assert.rejects(
    () => router.executeTool(
      'backend_source_inspector',
      { maintenance_authority: true },
      undefined
    ),
    /Caller-supplied authority/
  );

  assert.throws(
    () => router.registerTool({ tool_id: 'late_tool', status: 'Approved' }),
    /Post-bootstrap registration/
  );

  await assert.rejects(
    () => router.executeTool('foundry_operator', {
      files: [{ path: 'x', content: 'x' }],
      approved: true,
      approval_confirmed: true
    }),
    /Caller-supplied authority/
  );
});
