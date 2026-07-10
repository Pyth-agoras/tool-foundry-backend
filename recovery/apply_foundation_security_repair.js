#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repo = path.resolve(process.argv[2] || process.cwd());
const serverPath = path.join(repo, 'src', 'server.js');
const routerPath = path.join(repo, 'src', 'executable_tool_router.js');
const backupDir = path.join(repo, '.recovery-backup-foundation-security');

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
function read(file) {
  if (!fs.existsSync(file)) die(`Missing required file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) { fs.writeFileSync(file, content, 'utf8'); }
function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) die(`Could not find expected ${label} pattern.`);
  if (source.indexOf(search, first + search.length) >= 0) {
    die(`Expected exactly one ${label} pattern, found multiple.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

const serverBefore = read(serverPath);
const routerBefore = read(routerPath);

if (!serverBefore.includes("app.get('/health'")) die('Health route not found.');
if (!serverBefore.includes("app.post('/tools/execute'")) die('Tool execute route not found.');
if (!routerBefore.includes('async function foundryOperator(input={})')) die('Built-in foundryOperator not found.');
if (!routerBefore.includes('input.approved === true') || !routerBefore.includes('input.approval_confirmed === true')) {
  die('Existing owner approval gate was not found; refusing broad rewrite.');
}
if (!routerBefore.includes('module.exports=routerApi;')) die('Router export marker not found.');

fs.mkdirSync(backupDir, { recursive: true });
write(path.join(backupDir, 'server.js.before'), serverBefore);
write(path.join(backupDir, 'executable_tool_router.js.before'), routerBefore);
write(path.join(backupDir, 'manifest.json'), JSON.stringify({
  created_at: new Date().toISOString(),
  files: {
    'src/server.js': sha256(serverBefore),
    'src/executable_tool_router.js': sha256(routerBefore)
  }
}, null, 2));

let server = serverBefore;
const middlewareAnchor = "app.use(express.json({ limit: '2mb' }));\n";
const middlewareReplacement = `app.use(express.json({ limit: '2mb' }));

const API_KEY = String(process.env.API_KEY || '');
const AUTH_ENFORCED = API_KEY.length > 0;

function suppliedApiKey(req) {
  const direct = String(req.get('x-api-key') || '');
  const auth = String(req.get('authorization') || '');
  if (direct) return direct;
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function requireAuth(req, res, next) {
  if (!AUTH_ENFORCED) {
    return res.status(503).json({ error: 'Authentication enforcement is not configured.' });
  }
  const supplied = suppliedApiKey(req);
  const expected = Buffer.from(API_KEY);
  const actual = Buffer.from(supplied);
  const valid = expected.length === actual.length &&
    expected.length > 0 &&
    require('crypto').timingSafeEqual(expected, actual);
  if (!valid) return res.status(401).json({ error: 'Unauthorized.' });
  return next();
}
`;
server = replaceOnce(server, middlewareAnchor, middlewareReplacement, 'JSON middleware');

const healthOld = `app.get('/health', (req, res) => ok(res, {
  ok: true,
  status: 'ok',
  service: 'tool-foundry-backend',
  router: 'executable_tool_router',
  deployment_adoption_marker: DEPLOYMENT_ADOPTION_MARKER,
  timestamp: new Date().toISOString(),
  started_at: router.STARTED_AT,
  tools: router.getTools().length
}));`;

const healthNew = `app.get('/health', (req, res) => ok(res, {
  ok: true,
  status: 'ok',
  service: 'tool-foundry-backend',
  router: 'executable_tool_router',
  deployment_adoption_marker: DEPLOYMENT_ADOPTION_MARKER,
  timestamp: new Date().toISOString(),
  started_at: router.STARTED_AT,
  tools: router.getTools().length,
  auth_enforced: AUTH_ENFORCED,
  mutation_gates_enforced: router.MUTATION_GATES_ENFORCED === true
}));`;
server = replaceOnce(server, healthOld, healthNew, 'health route');

for (const [oldText, newText] of [
  ["app.get('/tools/list',", "app.get('/tools/list', requireAuth,"],
  ["app.post('/tools/register',", "app.post('/tools/register', requireAuth,"],
  ["app.post('/tools/mission/create',", "app.post('/tools/mission/create', requireAuth,"],
  ["app.get('/tools/mission/status/:id',", "app.get('/tools/mission/status/:id', requireAuth,"],
  ["app.post('/tools/evaluate',", "app.post('/tools/evaluate', requireAuth,"],
  ["app.post('/tools/execute',", "app.post('/tools/execute', requireAuth,"]
]) {
  server = replaceOnce(server, oldText, newText, oldText);
}

const listenOld = `app.listen(PORT, () => {
  console.log(\`tool-foundry-backend listening on \${PORT}\`);
});

module.exports = app;`;
const listenNew = `if (require.main === module) {
  app.listen(PORT, () => {
    console.log(\`tool-foundry-backend listening on \${PORT}\`);
  });
}

module.exports = app;`;
server = replaceOnce(server, listenOld, listenNew, 'server listen/export block');

let router = routerBefore;
const approvalOld = `  const approved =
    input.approved === true &&
    input.approval_confirmed === true;`;
const approvalNew = `  const approved =
    input.approved === true &&
    input.approval_confirmed === true;

  const validated =
    input.install_payload_validated === true &&
    input.validation_result &&
    input.validation_result.can_install === true &&
    input.validation_result.validation_status === 'passed';`;
router = replaceOnce(router, approvalOld, approvalNew, 'foundryOperator approval gate');

const filesGateOld = `  if (Array.isArray(input.files) && input.files.length) {
    if (!approved) {`;
const filesGateNew = `  if (Array.isArray(input.files) && input.files.length) {
    if (!approved || !validated) {`;
router = replaceOnce(router, filesGateOld, filesGateNew, 'foundryOperator file gate');

router = router.replace(
  'Owner approval and approval confirmation are required before backend file updates.',
  'Validated install evidence plus owner approval and approval confirmation are required before backend file updates.'
);
router = router.replace(
  'Get owner approval before applying file changes.',
  'Provide validation_status:passed, can_install:true, install_payload_validated:true, and exact owner approval before applying file changes.'
);

router = replaceOnce(
  router,
  'module.exports=routerApi;',
  'routerApi.MUTATION_GATES_ENFORCED=true;\nmodule.exports=routerApi;',
  'router export'
);

write(serverPath, server);
write(routerPath, router);

console.log(JSON.stringify({
  ok: true,
  changed_files: ['src/server.js', 'src/executable_tool_router.js'],
  before_sha256: {
    'src/server.js': sha256(serverBefore),
    'src/executable_tool_router.js': sha256(routerBefore)
  },
  after_sha256: {
    'src/server.js': sha256(server),
    'src/executable_tool_router.js': sha256(router)
  },
  backup_dir: backupDir
}, null, 2));
