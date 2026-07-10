'use strict';

const express = require('express');
const router = require('./executable_tool_router');
const {
  authenticationConfigured,
  requireAuthentication,
  requireMaintenanceAuthentication
} = require('./authentication_middleware');

const PORT = process.env.PORT || 3000;
const DEPLOYMENT_ADOPTION_MARKER = 'foundation_security_recovery_f449950a_proposal';

function ok(res, data) {
  return res.json(data);
}

function fail(res, error) {
  const status = error && error.statusCode ? error.statusCode : 500;
  return res.status(status).json({
    error: error && error.message ? error.message : String(error || 'Unknown error')
  });
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => ok(res, {
    ok: true,
    status: 'ok',
    service: 'tool-foundry-backend',
    router: 'executable_tool_router',
    deployment_adoption_marker: DEPLOYMENT_ADOPTION_MARKER,
    timestamp: new Date().toISOString(),
    started_at: router.STARTED_AT,
    tools: router.getTools().length,
    auth_enforced: authenticationConfigured(),
    mutation_gates_enforced: false,
    external_install_results: router.external_install_results
  }));

  app.use(requireAuthentication);

  app.get('/', (req, res) => ok(res, {
    service: 'tool-foundry-backend',
    status: 'ok',
    router: 'executable_tool_router'
  }));

  app.get('/tools/list', (req, res) => ok(res, {
    tools: router.getTools(),
    external_install_results: router.external_install_results
  }));

  app.post('/tools/register', (req, res) => {
    res.status(403).json({
      error: 'Direct runtime registration and promotion are disabled.'
    });
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
      if (!body.tool_id) {
        const error = new Error('tool_id is required.');
        error.statusCode = 400;
        throw error;
      }

      let executionContext;
      if (String(req.get('x-tool-foundry-maintenance') || '').toLowerCase() === 'true') {
        await new Promise(resolve => {
          requireMaintenanceAuthentication(req, res, () => resolve());
        });
        if (res.headersSent) return;
        executionContext = router.createMaintenanceContext(body.tool_id);
      }

      const result = await router.executeTool(
        body.tool_id,
        body.input || {},
        executionContext
      );
      ok(res, {
        tool_id: body.tool_id,
        result,
        summary: `${body.tool_id} completed.`,
        warnings: []
      });
    } catch (error) {
      fail(res, error);
    }
  });

  return app;
}

const app = createApp();

if (require.main === module && process.env.TOOL_FOUNDRY_NO_LISTEN !== '1') {
  app.listen(PORT, () => {
    console.log(`tool-foundry-backend listening on ${PORT}`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
