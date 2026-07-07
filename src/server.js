'use strict';

const express = require('express');
const router = require('./executable_tool_router');

const app = express();
const PORT = process.env.PORT || 3000;
const DEPLOYMENT_ADOPTION_MARKER = 'deployment_adoption_2026_07_07_multi_rule_set_image_builder_live_v1';

app.use(express.json({ limit: '2mb' }));

function ok(res, data) {
  return res.json(data);
}

function fail(res, error) {
  const status = error && error.statusCode ? error.statusCode : 500;
  return res.status(status).json({ error: error && error.message ? error.message : String(error || 'Unknown error') });
}

app.get('/', (req, res) => ok(res, {
  service: 'tool-foundry-backend',
  status: 'ok',
  router: 'executable_tool_router'
}));

app.get('/health', (req, res) => ok(res, {
  ok: true,
  status: 'ok',
  service: 'tool-foundry-backend',
  router: 'executable_tool_router',
  deployment_adoption_marker: DEPLOYMENT_ADOPTION_MARKER,
  timestamp: new Date().toISOString(),
  started_at: router.STARTED_AT,
  tools: router.getTools().length
}));

app.get('/tools/list', (req, res) => ok(res, { tools: router.getTools() }));

app.post('/tools/register', (req, res) => {
  try { ok(res, router.registerTool(req.body || {})); }
  catch (error) { fail(res, error); }
});

app.post('/tools/mission/create', (req, res) => {
  try { ok(res, router.createMission(req.body || {})); }
  catch (error) { fail(res, error); }
});

app.get('/tools/mission/status/:id', (req, res) => {
  try { ok(res, router.getMissionStatus(req.params.id)); }
  catch (error) { fail(res, error); }
});

app.post('/tools/evaluate', (req, res) => {
  try { ok(res, router.evaluateTool(req.body || {})); }
  catch (error) { fail(res, error); }
});

app.post('/tools/execute', async (req, res) => {
  try {
    const body = req.body || {};
    const toolId = body.tool_id;
    const input = body.input || {};
    if (!toolId) {
      const error = new Error('tool_id is required.');
      error.statusCode = 400;
      throw error;
    }
    const result = await router.executeTool(toolId, input);
    ok(res, { tool_id: toolId, result, summary: `${toolId} completed.`, warnings: [] });
  } catch (error) {
    fail(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`tool-foundry-backend listening on ${PORT}`);
});

module.exports = app;
