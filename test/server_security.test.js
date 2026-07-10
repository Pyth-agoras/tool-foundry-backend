'use strict';
process.env.TOOL_FOUNDRY_NO_LISTEN = '1';
process.env.API_KEY = '0123456789abcdef0123456789abcdef';
process.env.MAINTENANCE_API_KEY = 'maintenance-0123456789abcdef0123456789';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');

async function withServer(run) {
  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('health is public and every other route authenticates', async () => {
  await withServer(async base => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    for (const path of ['/', '/tools/list']) {
      assert.equal((await fetch(`${base}${path}`)).status, 401);
      assert.equal((await fetch(`${base}${path}`, {
        headers: { authorization: 'Bearer wrong' }
      })).status, 401);
      assert.equal((await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${process.env.API_KEY}` }
      })).status, 200);
    }
  });
});

test('direct registry mutation remains disabled with valid authentication', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/tools/register`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ tool_id: 'unsafe', status: 'Approved' })
    });
    assert.equal(response.status, 403);
  });
});
