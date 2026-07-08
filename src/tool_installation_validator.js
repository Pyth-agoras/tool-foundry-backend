'use strict';

const METADATA = {
  tool_id: 'tool_installation_validator',
  name: 'Tool Installation Validator',
  purpose: 'Validate proposed Tool Foundry backend tool file payloads before foundry_operator installs them, including new tool installs and safe handler-only repairs for already wired tools.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.0',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'validation_mode; proposed_tool_id; proposed_files_payload; source_inspection_summary; router_file_path; handler_file_path; expected_registry_metadata; expected_test_payload; install_goal; recent_failure_summary; router_modification_required; already_wired_in_executable_handlers.',
  output_schema_description: 'validation_status; can_install; validation_mode; missing_requirements; router_wiring_status; handler_status; registry_metadata_status; test_plan_status; approval_gate_status; exact_fix_needed; should_call_foundry_operator; plain_english_summary.'
};

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (error) { return String(value); }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePath(value) {
  return String(value || '').replace(/^\/+/, '').trim();
}

function getPayloadFiles(input) {
  return Array.isArray(input.proposed_files_payload) ? input.proposed_files_payload : [];
}

function findFile(files, path) {
  const safePath = normalizePath(path);
  return files.find(file => normalizePath(file && file.path) === safePath);
}

function hasSubstantiveContent(content) {
  const text = asText(content).trim();
  if (text.length < 40) return false;
  const lowered = text.toLowerCase();
  const banned = ['placeholder', 'todo', 'tbd', 'mission text only', 'documentation only', 'metadata only', 'repair_payload_blocked', 'not implemented'];
  if (banned.some(term => lowered.includes(term))) return false;
  const executableSignals = ['module.exports', 'exports.', 'async function', 'function ', '=>', 'const ', 'class '];
  return executableSignals.some(signal => text.includes(signal));
}

function hasRouterWiring(content, proposedToolId) {
  const text = asText(content);
  if (!text) return false;
  return text.includes('EXECUTABLE_HANDLERS') && text.includes(proposedToolId);
}

function hasRegistryMetadata(input, files, proposedToolId) {
  if (isPlainObject(input.expected_registry_metadata)) return true;
  const metadataText = asText(input.expected_registry_metadata).trim();
  if (metadataText && metadataText !== '{}' && metadataText !== 'null') return true;
  return files.some(file => {
    const text = asText(file && file.content);
    return text.includes('tool_id') && text.includes(proposedToolId) && (text.includes('purpose') || text.includes('status'));
  });
}

function hasValidTestPayload(input) {
  const payload = input.expected_test_payload;
  if (isPlainObject(payload)) {
    return Object.keys(payload).length > 0 && Boolean(payload.tool_id || payload.input || payload.raw_idea || payload.inspect_scope);
  }
  const text = asText(payload).trim();
  if (!text || text === '{}' || text === 'null') return false;
  return text.length >= 8;
}

function sourceConfirmsWiring(input, proposedToolId) {
  if (input.already_wired_in_executable_handlers === true) return true;
  const summary = asText(input.source_inspection_summary);
  return summary.includes('EXECUTABLE_HANDLERS') && summary.includes(proposedToolId) && (summary.includes('wired') || summary.includes('metadata_found') || summary.includes('handler'));
}

function validateNewToolInstall(input, files, proposedToolId, handlerPath, routerPath) {
  const missing = [];
  const handlerFile = findFile(files, handlerPath);
  const routerFile = findFile(files, routerPath);
  const handlerOk = Boolean(handlerFile && hasSubstantiveContent(handlerFile.content));
  const routerOk = Boolean(routerFile && hasSubstantiveContent(routerFile.content) && hasRouterWiring(routerFile.content, proposedToolId));
  const registryOk = hasRegistryMetadata(input, files, proposedToolId);
  const testOk = hasValidTestPayload(input);

  if (!files.length) missing.push('proposed_files_payload must include explicit file paths and file contents.');
  if (!handlerFile) missing.push('Handler file is missing from the proposed payload: ' + handlerPath + '.');
  else if (!handlerOk) missing.push('Handler file is missing a valid executable export or appears placeholder-only.');
  if (!routerFile) missing.push('Router file is missing from the proposed payload: ' + routerPath + '.');
  else if (!routerOk) missing.push('Router file does not include substantive EXECUTABLE_HANDLERS wiring for ' + proposedToolId + '.');
  if (!registryOk) missing.push('Registry/list metadata for the proposed tool is missing.');

  return {
    missing,
    router_wiring_status: routerOk ? 'router_wiring_present' : (routerFile ? 'router_wiring_missing_or_incomplete' : 'router_file_missing'),
    handler_status: handlerOk ? 'present_and_substantive' : (handlerFile ? 'present_but_invalid_or_placeholder' : 'handler_file_missing'),
    registry_metadata_status: registryOk ? 'present' : 'missing',
    test_plan_status: testOk ? 'present' : 'missing_or_incomplete'
  };
}

function validateHandlerOnlyRepair(input, files, proposedToolId, handlerPath) {
  const missing = [];
  const handlerFile = findFile(files, handlerPath);
  const handlerOk = Boolean(handlerFile && hasSubstantiveContent(handlerFile.content));
  const wiredOk = sourceConfirmsWiring(input, proposedToolId);
  const routerNotRequired = input.router_modification_required === false || String(input.router_modification_required).toLowerCase() === 'false';
  const registryOk = hasRegistryMetadata(input, files, proposedToolId) || Boolean(input.registry_metadata_unchanged);
  const testOk = hasValidTestPayload(input);
  const goal = asText(input.install_goal).toLowerCase();
  const limitedRepairGoal = goal.includes('repair') || goal.includes('handler') || goal.includes('existing');
  const introducesNewTool = input.already_wired_in_executable_handlers === false || (!wiredOk && !asText(input.source_inspection_summary).includes(proposedToolId));

  if (!proposedToolId) missing.push('proposed_tool_id is required.');
  if (!files.length) missing.push('proposed_files_payload must include explicit file paths and file contents.');
  if (!handlerFile) missing.push('Handler file is missing from the proposed payload: ' + handlerPath + '.');
  else if (!handlerOk) missing.push('Handler file is missing a valid executable export or appears placeholder-only.');
  if (!wiredOk) missing.push('Source inspection must confirm the tool is already wired in EXECUTABLE_HANDLERS.');
  if (!routerNotRequired) missing.push('router_modification_required must be false for handler_only_repair.');
  if (!registryOk) missing.push('Registry metadata must be present or explicitly unchanged.');
  if (!limitedRepairGoal) missing.push('Install goal must be limited to updating existing handler behavior.');
  if (introducesNewTool) missing.push('handler_only_repair cannot introduce a new tool ID.');

  return {
    missing,
    router_wiring_status: wiredOk && routerNotRequired ? 'already_wired_router_modification_not_required' : 'router_wiring_not_confirmed_or_router_modification_required',
    handler_status: handlerOk ? 'present_and_substantive' : (handlerFile ? 'present_but_invalid_or_placeholder' : 'handler_file_missing'),
    registry_metadata_status: registryOk ? 'present_or_unchanged' : 'missing',
    test_plan_status: testOk ? 'present' : 'missing_or_incomplete'
  };
}

async function execute(input) {
  const params = input || {};
  const proposedToolId = String(params.proposed_tool_id || '').trim();
  const validationMode = params.validation_mode === 'handler_only_repair' ? 'handler_only_repair' : 'new_tool_install';
  const files = getPayloadFiles(params);
  const handlerPath = normalizePath(params.handler_file_path || (proposedToolId ? 'src/' + proposedToolId + '.js' : ''));
  const routerPath = normalizePath(params.router_file_path || 'src/executable_tool_router.js');

  let result;
  if (validationMode === 'handler_only_repair') {
    result = validateHandlerOnlyRepair(params, files, proposedToolId, handlerPath);
  } else {
    result = validateNewToolInstall(params, files, proposedToolId, handlerPath, routerPath);
  }

  const canInstall = result.missing.length === 0;
  const validationStatus = canInstall ? 'passed' : 'failed';
  const exactFixNeeded = canInstall ? 'No blocking issues found. It is safe to call foundry_operator after owner approval.' : 'Do not call foundry_operator yet. Fix these issues first: ' + result.missing.join(' ');

  return {
    validation_status: validationStatus,
    can_install: canInstall,
    validation_mode: validationMode,
    missing_requirements: result.missing,
    router_wiring_status: result.router_wiring_status,
    handler_status: result.handler_status,
    registry_metadata_status: result.registry_metadata_status,
    test_plan_status: result.test_plan_status,
    approval_gate_status: canInstall ? 'ready_for_foundry_operator_with_owner_approval' : 'blocked_before_foundry_operator',
    exact_fix_needed: exactFixNeeded,
    should_call_foundry_operator: canInstall,
    plain_english_summary: canInstall ? 'The proposed ' + validationMode + ' payload is complete enough for installation after owner approval.' : 'The proposed ' + validationMode + ' payload is blocked before installation: ' + result.missing.join(' ')
  };
}

function install(router) {
  if (!router) return;
  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {
    const index = router.BUILTIN_TOOL_METADATA.findIndex(tool => tool.tool_id === METADATA.tool_id);
    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA;
    else router.BUILTIN_TOOL_METADATA.push(METADATA);
  }
  if (router.EXECUTABLE_HANDLERS) {
    router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;
  }
}

module.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };
