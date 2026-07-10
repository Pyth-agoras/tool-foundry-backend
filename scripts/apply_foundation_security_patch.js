'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE_COMMIT = 'f449950a77e48e85f2a2e2cb9d18e54614bf4a66';
const BASE_HASHES = {
  "package.json": "602ee70c0f291ddf3e1c5a4a7ad3055097124ce01592e632f6873971c9f73a50",
  "src/server.js": "fe80d8b310a20d24066ba8ab7f7616562f925d3c7e52bb191e1a3e0beb74bf27",
  "src/executable_tool_router.js": "fc5d05cdf0335185128fbe82ae4e6c3da8e89b24437dba3c81b520baa24a0114"
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertHash(filePath) {
  const actual = sha256(read(filePath));
  if (actual !== BASE_HASHES[filePath]) {
    throw new Error(`Base hash mismatch for ${filePath}: ${actual}`);
  }
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Router patch anchor not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Router patch anchor is not unique: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

for (const filePath of Object.keys(BASE_HASHES)) assertHash(filePath);

let router = read('src/executable_tool_router.js');

router = replaceOnce(
  router,
  "const mutableMissions=[];const mutableEvaluations=[];const mutableExecutions=[];",
  `const mutableMissions=[];const mutableEvaluations=[];const mutableExecutions=[];
const { isVerifiedGrant } = require('./mutation_gate');
const BOOTSTRAP_AUTHORITY = Symbol('bootstrap');
const MAINTENANCE_AUTHORITY = Symbol('maintenance');
const MUTATION_AUTHORITY = Symbol('mutation');
let bootstrapOpen = true;
const READ_ONLY_RECOVERY_TOOLS = new Set([
  'backend_source_inspector','tool_failure_diagnoser','tool_quality_tester',
  'tool_installation_validator','tool_registry_auditor',
  'workflow_dead_end_resolver','tool_workflow_orchestrator',
  'tool_call_contract_normalizer','preflight_repair_verifier'
]);
const SOURCE_WRITING_TOOLS = new Set(['foundry_operator']);
function trusted(context, authority) {
  return Boolean(context && context.authority === authority);
}
function createMaintenanceContext(toolId) {
  if (!READ_ONLY_RECOVERY_TOOLS.has(toolId)) {
    const error = new Error('Tool is not allowlisted for read-only recovery execution.');
    error.statusCode = 403;
    throw error;
  }
  return Object.freeze({ authority: MAINTENANCE_AUTHORITY, tool_id: toolId });
}
function createMutationContext(grant) {
  if (!isVerifiedGrant(grant)) {
    const error = new Error('A backend-verified mutation grant is required.');
    error.statusCode = 403;
    throw error;
  }
  return Object.freeze({ authority: MUTATION_AUTHORITY, grant });
}
function getBootstrapContext() {
  if (!bootstrapOpen) {
    const error = new Error('Bootstrap registration is closed.');
    error.statusCode = 403;
    throw error;
  }
  return Object.freeze({ authority: BOOTSTRAP_AUTHORITY });
}`,
  'authority declarations'
);

router = replaceOnce(
  router,
  "async function executeTool(tool_id,input={}){const handler=EXECUTABLE_HANDLERS[tool_id];if(!handler){const error=new Error('No executable handler is installed for this tool.');error.statusCode=404;throw error}const result=await handler(input);mutableExecutions.push({tool_id,at:new Date().toISOString()});return result}",
  `async function executeTool(tool_id,input={},context) {
    if (input && typeof input === 'object' && (
      input.maintenance_authority || input.mutation_authority ||
      input.approved === true || input.approval_confirmed === true
    )) {
      const error = new Error('Caller-supplied authority fields are not accepted.');
      error.statusCode = 403;
      throw error;
    }
    const metadata = mutableTools.get(tool_id);
    if (!metadata) {
      const error = new Error('No metadata is registered for this tool.');
      error.statusCode = 404;
      throw error;
    }
    const handler = EXECUTABLE_HANDLERS[tool_id];
    if (!handler) {
      const error = new Error('No executable handler is installed for this tool.');
      error.statusCode = 404;
      throw error;
    }
    const maintenanceAllowed =
      trusted(context, MAINTENANCE_AUTHORITY) &&
      context.tool_id === tool_id &&
      READ_ONLY_RECOVERY_TOOLS.has(tool_id);
    if (metadata.status !== 'Approved' && !maintenanceAllowed) {
      const error = new Error(\`Tool \${tool_id} is not Approved for normal execution.\`);
      error.statusCode = 403;
      throw error;
    }
    if (SOURCE_WRITING_TOOLS.has(tool_id)) {
      if (!trusted(context, MUTATION_AUTHORITY) || !isVerifiedGrant(context.grant)) {
        const error = new Error('Source-writing execution requires a backend-verified mutation grant.');
        error.statusCode = 403;
        throw error;
      }
    }
    const result = await handler(input);
    mutableExecutions.push({tool_id,at:new Date().toISOString()});
    return result;
  }`,
  'executeTool'
);

router = replaceOnce(
  router,
  "function registerTool(record={}){if(!record.tool_id){const error=new Error('tool_id is required.');error.statusCode=400;throw error}const previous=mutableTools.get(record.tool_id)||{};const next={...previous,...record,builtin:Boolean(record.builtin??previous.builtin)};mutableTools.set(record.tool_id,next);return{tool_id:record.tool_id,status:next.status||'Draft',message:'Tool registered.'}}",
  `function registerTool(record={},context) {
    if (!record.tool_id) {
      const error = new Error('tool_id is required.');
      error.statusCode = 400;
      throw error;
    }
    const bootstrapAuthorized = bootstrapOpen && trusted(context, BOOTSTRAP_AUTHORITY);
    const maintenanceAuthorized = trusted(context, MAINTENANCE_AUTHORITY);
    if (!bootstrapAuthorized && !maintenanceAuthorized) {
      const error = new Error('Post-bootstrap registration requires trusted maintenance authority.');
      error.statusCode = 403;
      throw error;
    }
    const previous = mutableTools.get(record.tool_id) || {};
    if (!bootstrapAuthorized && record.status === 'Approved' && previous.status !== 'Approved') {
      const error = new Error('Direct post-bootstrap promotion is prohibited.');
      error.statusCode = 403;
      throw error;
    }
    const next={...previous,...record,builtin:Boolean(record.builtin??previous.builtin)};
    mutableTools.set(record.tool_id,next);
    return{tool_id:record.tool_id,status:next.status||'Draft',message:'Tool registered.'};
  }`,
  'registerTool'
);

router = replaceOnce(
  router,
  "const routerApi={STARTED_AT,BUILTIN_TOOL_METADATA,EXECUTABLE_HANDLERS,getTools,executeTool,registerTool,createMission,getMissionStatus,evaluateTool,selfHeal,toolReadinessChecker};",
  "const routerApi={STARTED_AT,BUILTIN_TOOL_METADATA,EXECUTABLE_HANDLERS,getTools,executeTool,registerTool,createMission,getMissionStatus,evaluateTool,selfHeal,toolReadinessChecker,createMaintenanceContext,createMutationContext,getBootstrapContext};",
  'routerApi exports'
);

router = replaceOnce(
  router,
  "registerTool(mod.metadata);return{installed:true,tool_id:mod.metadata.tool_id}",
  "registerTool(mod.metadata,getBootstrapContext());return{installed:true,tool_id:mod.metadata.tool_id}",
  'external metadata registration'
);

router = replaceOnce(
  router,
  "routerApi.external_install_results=[installExternal('./backend_source_inspector'),installExternal('./executable_tool_builder'),installExternal('./tool_failure_diagnoser'),installExternal('./tool_quality_tester'),installExternal('./tool_installation_validator'),installExternal('./tool_registry_auditor'),installExternal('./workflow_dead_end_resolver'),installExternal('./autonomy_governor'),installExternal('./tool_workflow_orchestrator'),installExternal('./note_cleanup_tool'),installExternal('./advanced_custom_gpt_builder'),installExternal('./tool_call_contract_normalizer'),installExternal('./multi_rule_set_image_builder'),installExternal('./script_first_engineering_operator'),installExternal('./tool_install_orchestrator')]; module.exports=routerApi;",
  "routerApi.external_install_results=[installExternal('./backend_source_inspector'),installExternal('./executable_tool_builder'),installExternal('./tool_failure_diagnoser'),installExternal('./tool_quality_tester'),installExternal('./tool_installation_validator'),installExternal('./tool_registry_auditor'),installExternal('./workflow_dead_end_resolver'),installExternal('./autonomy_governor'),installExternal('./tool_workflow_orchestrator'),installExternal('./note_cleanup_tool'),installExternal('./advanced_custom_gpt_builder'),installExternal('./tool_call_contract_normalizer'),installExternal('./multi_rule_set_image_builder'),installExternal('./script_first_engineering_operator'),installExternal('./tool_install_orchestrator'),installExternal('./preflight_repair_verifier')]; bootstrapOpen=false; Object.freeze(routerApi.external_install_results); module.exports=routerApi;",
  'external installation sequence'
);

fs.writeFileSync('src/executable_tool_router.js', router);
fs.copyFileSync(path.join(__dirname, '..', 'payload', 'src', 'server.js'), 'src/server.js');
fs.copyFileSync(path.join(__dirname, '..', 'payload', 'package.json'), 'package.json');
for (const name of [
  'authentication_middleware.js',
  'mutation_gate.js',
  'preflight_repair_verifier.js'
]) {
  fs.copyFileSync(
    path.join(__dirname, '..', 'payload', 'src', name),
    path.join('src', name)
  );
}

console.log(JSON.stringify({
  applied: true,
  base_commit: BASE_COMMIT,
  changed_paths: [
    'package.json','src/server.js','src/executable_tool_router.js',
    'src/authentication_middleware.js','src/mutation_gate.js',
    'src/preflight_repair_verifier.js'
  ]
}, null, 2));
