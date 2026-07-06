'use strict';

const express = require('express');
const router = require('./executable_tool_router');

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 3000;

function ok(res, body) { return res.status(200).json(body); }
function fail(res, status, message, details) { return res.status(status).json({ ok: false, error: message, details }); }

app.get('/', (req, res) => ok(res, { service: 'tool-foundry-backend', status: 'ok', router: 'executable_tool_router' }));

app.get('/health', (req, res) => ok(res, {
  status: 'ok',
  service: 'tool-foundry-backend',
  router: 'executable_tool_router',
  timestamp: new Date().toISOString(),
  started_at: router.STARTED_AT,
  tools: router.getTools().length
}));

app.get('/tools/list', (req, res) => ok(res, { tools: router.getTools() }));
app.post('/tools/list', (req, res) => ok(res, { tools: router.getTools() }));

app.post('/tools/register', (req, res) => {
  try { ok(res, router.registerTool(req.body || {})); }
  catch (error) { fail(res, error.statusCode || 500, error.message || 'Tool registration failed.'); }
});

app.post('/tools/mission/create', (req, res) => {
  try { ok(res, router.createMission(req.body || {})); }
  catch (error) { fail(res, error.statusCode || 500, error.message || 'Mission creation failed.'); }
});

app.get('/tools/mission/:id/status', (req, res) => {
  try { ok(res, router.getMissionStatus(req.params.id)); }
  catch (error) { fail(res, error.statusCode || 500, error.message || 'Mission lookup failed.'); }
});

app.post('/tools/mission/:id/revision', (req, res) => {
  try {
    const mission = router.getMissionStatus(req.params.id);
    mission.status = 'Needs Revision';
    mission.revision_request = req.body && req.body.revision_request;
    mission.revision_reason = req.body && req.body.reason;
    ok(res, { mission_id: mission.id, status: mission.status, message: 'Revision recorded.' });
  } catch (error) { fail(res, error.statusCode || 500, error.message || 'Revision failed.'); }
});

app.post('/tools/evaluate', (req, res) => {
  try { ok(res, router.evaluateTool(req.body || {})); }
  catch (error) { fail(res, error.statusCode || 500, error.message || 'Evaluation failed.'); }
});

app.post('/tools/execute', async (req, res) => {
  try {
    const body = req.body || {};
    const tool_id = body.tool_id;
    const input = body.input || {};
    if (!tool_id) return fail(res, 400, 'tool_id is required.');
    const result = await router.executeTool(tool_id, input);
    ok(res, { tool_id, result, summary: `${tool_id} completed.`, warnings: [] });
  } catch (error) {
    fail(res, error.statusCode || 500, error.message || 'Execution failed.');
  }
});

app.use((req, res) => fail(res, 404, 'Not found.'));

app.listen(PORT, () => {
  console.log(`tool-foundry-backend listening on ${PORT} with executable_tool_router`);
});
