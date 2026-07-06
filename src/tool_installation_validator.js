'use strict';

const metadata = {
  tool_id: 'tool_installation_validator',
  name: 'Tool Installation Validator',
  purpose: 'Validate proposed Tool Foundry backend tool file payloads before foundry_operator installs them.',
  status: 'Testing',
  risk_level: 'low',
  version: '0.1.1',
  approval_state: 'pending_execution_test',
  builtin: false,
  input_schema_description: 'proposed_tool_id; proposed_files_payload; source_inspection_summary; router_file_path; handler_file_path; expected_registry_metadata; expected_test_payload; install_goal; recent_failure_summary.',
  output_schema_description: 'validation_status; can_install; missing_requirements; router_wiring_status; handler_status; registry_metadata_status; test_plan_status; approval_gate_status; exact_fix_needed; should_call_foundry_operator; plain_english_summary.'
};

function text(value) {
  try { return JSON.stringify(value || '').toLowerCase(); } catch (_) { return String(value || '').toLowerCase(); }
}

function getFile(files, path) {
  return files.find(function (file) { return file && file.path === path; });
}

function fileContent(file) {
  return file && typeof file.content === 'string' ? file.content : '';
}

function contains(value, needle) {
  return String(value || '').toLowerCase().indexOf(String(needle || '').toLowerCase()) !== -1;
}

function weakOrPlaceholder(content) {
  const compact = String(content || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!compact) return true;
  if (compact.length < 70) return true;
  if (contains(compact, 'placeholder') || contains(compact, 'todo')) return true;
  if (contains(compact, 'return { ok: true };') || contains(compact, 'return {ok:true};')) return true;
  if (contains(compact, 'received_input') && !contains(compact, 'validation_status')) return true;
  return false;
}

function handlerExportLooksValid(content) {
  const c = String(content || '');
  if (contains(c, 'module.exports') && (contains(c, 'handler') || contains(c, 'install'))) return true;
  if (contains(c, 'exports.handler')) return true;
  if (contains(c, 'async function handler')) return true;
  return false;
}

function routerContainsWiring(content, toolId) {
  const c = String(content || '');
  if (!contains(c, toolId)) return false;
  if (contains(c, 'EXECUTABLE_HANDLERS') && contains(c, toolId)) return true;
  if (contains(c, "installexternal('./" + toolId + "')")) return true;
  if (contains(c, 'installexternal("./' + toolId + '")')) return true;
  return false;
}

async function handler(input) {
  input = input || {};
  const proposedToolId = String(input.proposed_tool_id || '').trim();
  const files = Array.isArray(input.proposed_files_payload) ? input.proposed_files_payload : [];
  const routerPath = input.router_file_path || 'src/executable_tool_router.js';
  const handlerPath = input.handler_file_path || (proposedToolId ? 'src/' + proposedToolId + '.js' : '');
  const expectedMetadata = input.expected_registry_metadata || {};
  const expectedTestPayload = input.expected_test_payload || null;

  const missing = [];
  if (!proposedToolId) missing.push('proposed_tool_id is required.');
  if (!files.length) missing.push('proposed_files_payload must include explicit file paths and contents.');
  files.forEach(function (file) { if (!file || !file.path || typeof file.content !== 'string') missing.push('Every proposed file must include path and string content.'); });

  const handlerFile = handlerPath ? getFile(files, handlerPath) : null;
  const routerFile = getFile(files, routerPath);
  const handlerText = fileContent(handlerFile);
  const routerText = fileContent(routerFile);
  const allPayloadText = files.map(function (file) { return String(file.path || '') + '\n' + fileContent(file); }).join('\n');

  const hasHandler = Boolean(handlerFile);
  const handlerValid = hasHandler && handlerExportLooksValid(handlerText) && !weakOrPlaceholder(handlerText);
  const hasRouter = Boolean(routerFile);
  const routerWired = hasRouter && routerContainsWiring(routerText, proposedToolId);
  const metadataPresent = contains(routerText, proposedToolId) || contains(handlerText, proposedToolId) || contains(text(expectedMetadata), proposedToolId);
  const testPayloadPresent = Boolean(expectedTestPayload && typeof expectedTestPayload === 'object' && expectedTestPayload.tool_id && Object.prototype.hasOwnProperty.call(expectedTestPayload, 'input'));
  const docsOnly = files.length > 0 && files.every(function (file) { return /\.(md|txt)$/i.test(String(file.path || '')); });
  const metadataOnly = files.length > 0 && files.every(function (file) { return /\.json$/i.test(String(file.path || '')); });
  const placeholderOnly = files.length > 0 && files.every(function (file) { return weakOrPlaceholder(fileContent(file)) || /\.(json|md|txt)$/i.test(String(file.path || '')); });

  if (!hasHandler) missing.push('Handler file is missing from the proposed payload: ' + handlerPath + '.');
  if (hasHandler && !handlerValid) missing.push('Handler file is missing a valid executable export or appears placeholder-only.');
  if (!hasRouter) missing.push('Router file is missing from the proposed payload: ' + routerPath + '.');
  if (hasRouter && !routerWired) missing.push('Router wiring is missing: EXECUTABLE_HANDLERS or installExternal registration was not found for ' + proposedToolId + '.');
  if (!metadataPresent) missing.push('Registry/list metadata for the proposed tool is missing.');
  if (!testPayloadPresent) missing.push('Expected live execution test payload is missing or incomplete.');
  if (docsOnly) missing.push('Payload is documentation-only.');
  if (metadataOnly) missing.push('Payload is metadata-only.');
  if (placeholderOnly) missing.push('Payload appears placeholder-only.');

  const canInstall = missing.length === 0;
  return {
    validation_status: canInstall ? 'passed' : 'failed',
    can_install: canInstall,
    missing_requirements: missing,
    router_wiring_status: routerWired ? 'present' : hasRouter ? 'missing_tool_registration' : 'router_file_missing',
    handler_status: handlerValid ? 'present_and_substantive' : hasHandler ? 'present_but_invalid_or_placeholder' : 'handler_file_missing',
    registry_metadata_status: metadataPresent ? 'present' : 'missing',
    test_plan_status: testPayloadPresent ? 'present' : 'missing_or_incomplete',
    approval_gate_status: canInstall ? 'ready_for_owner_approved_foundry_operator_install' : 'blocked_before_foundry_operator',
    exact_fix_needed: canInstall ? 'No fix needed before foundry_operator. Payload has explicit file paths, handler, router wiring, registry metadata, and test payload.' : 'Do not call foundry_operator yet. Fix these issues first: ' + missing.join(' '),
    should_call_foundry_operator: canInstall,
    plain_english_summary: canInstall ? 'The proposed payload for ' + proposedToolId + ' appears ready for foundry_operator after owner approval.' : 'The proposed payload for ' + (proposedToolId || 'the tool') + ' is blocked before installation: ' + missing.join(' ')
  };
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS || typeof router.registerTool !== 'function') throw new Error('Executable router exports required.');
  router.EXECUTABLE_HANDLERS[metadata.tool_id] = handler;
  router.registerTool(metadata);
  return { installed: true, tool_id: metadata.tool_id };
}

module.exports = { metadata, handler, install };
