'use strict';

const metadata = {
  tool_id: 'tool_installation_validator',
  name: 'Tool Installation Validator',
  purpose: 'Validate proposed Tool Foundry backend tool file payloads before foundry_operator installs them.',
  status: 'Testing',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'pending_execution_test',
  builtin: false,
  input_schema_description: 'proposed_tool_id; proposed_files_payload; source_inspection_summary; router_file_path; handler_file_path; expected_registry_metadata; expected_test_payload; install_goal; recent_failure_summary.',
  output_schema_description: 'validation_status; can_install; missing_requirements; router_wiring_status; handler_status; registry_metadata_status; test_plan_status; approval_gate_status; exact_fix_needed; should_call_foundry_operator; plain_english_summary.'
};

function asText(value) { try { return JSON.stringify(value || '').toLowerCase(); } catch (_) { return String(value || '').toLowerCase(); } }
function hasAny(text, terms) { const haystack = String(text || '').toLowerCase(); return terms.some((term) => haystack.includes(term)); }
function fileByPath(files, path) { return files.find((file) => file && file.path === path); }
function contentOf(file) { return file && typeof file.content === 'string' ? file.content : ''; }
function looksLikePlaceholder(content) {
  const compact = String(content || '').replace(/\s+/g, ' ').toLowerCase();
  if (!compact.trim()) return true;
  if (compact.length < 80) return true;
  if (compact.includes('todo') || compact.includes('placeholder')) return true;
  if (/return\s*\{\s*ok\s*:\s*true\s*\}/.test(compact)) return true;
  if (compact.includes('received_input') && !compact.includes('validation_status')) return true;
  return false;
}
function hasHandlerExport(content) {
  const text = String(content || '');
  return (text.includes('module.exports') && (text.includes('handler') || text.includes('install'))) || text.includes('exports.handler') || text.includes('async function handler');
}
function hasRouterWiring(content, toolId) {
  const text = String(content || '');
  return text.includes(toolId) && (text.includes(`EXECUTABLE_HANDLERS[metadata.tool_id]`) || text.includes(`EXECUTABLE_HANDLERS['${toolId}']`) || text.includes(`EXECUTABLE_HANDLERS.${toolId}`) || text.includes(`installExternal('./${toolId}')`) || text.includes(`installExternal("./${toolId}")`));
}
function hasRegistryMetadata(content, toolId, expectedMetadata) {
  const text = String(content || '');
  const metaText = asText(expectedMetadata || {});
  return (text.includes(toolId) && (text.includes('BUILTIN_TOOL_METADATA') || text.includes('registerTool') || text.includes('metadata'))) || metaText.includes(toolId);
}

async function handler(input = {}) {
  const toolId = String(input.proposed_tool_id || '').trim();
  const files = Array.isArray(input.proposed_files_payload) ? input.proposed_files_payload : [];
  const routerPath = input.router_file_path || 'src/executable_tool_router.js';
  const handlerPath = input.handler_file_path || (toolId ? `src/${toolId}.js` : '');
  const expectedTestPayload = input.expected_test_payload;
  const expectedRegistryMetadata = input.expected_registry_metadata || {};
  const missing = [];

  if (!toolId) missing.push('proposed_tool_id is required.');
  if (!files.length) missing.push('proposed_files_payload must include explicit files.');
  const invalidFiles = files.filter((file) => !file || !file.path || typeof file.content !== 'string');
  if (invalidFiles.length) missing.push('Every proposed file must include an explicit path and string content.');

  const handlerFile = handlerPath ? fileByPath(files, handlerPath) : null;
  const routerFile = fileByPath(files, routerPath);
  const handlerContent = contentOf(handlerFile);
  const routerContent = contentOf(routerFile);
  const payloadText = files.map((file) => `${file.path || ''}\n${contentOf(file)}`).join('\n---\n');

  const documentationOnly = files.length > 0 && files.every((file) => /\.(md|txt|json)$/i.test(String(file.path || '')));
  const metadataOnly = files.length > 0 && files.every((file) => /\.json$/i.test(String(file.path || '')) || hasAny(contentOf(file), ['"tool_id"', 'input_schema_description', 'output_schema_description']) && !hasAny(contentOf(file), ['function', 'module.exports', 'EXECUTABLE_HANDLERS']));
  const placeholderOnly = files.length > 0 && files.every((file) => looksLikePlaceholder(contentOf(file)) || /\.(md|txt|json)$/i.test(String(file.path || '')));

  const handlerPresent = Boolean(handlerFile);
  const handlerExportOk = handlerPresent && hasHandlerExport(handlerContent);
  const handlerSubstantive = handlerPresent && !looksLikePlaceholder(handlerContent);
  const routerIncluded = Boolean(routerFile);
  const routerWired = routerIncluded && hasRouterWiring(routerContent, toolId);
  const registryPresent = hasRegistryMetadata(routerContent + '\n' + handlerContent + '\n' + asText(expectedRegistryMetadata), toolId, expectedRegistryMetadata);
  const testPayloadPresent = Boolean(expectedTestPayload && typeof expectedTestPayload === 'object' && expectedTestPayload.tool_id && expectedTestPayload.input !== undefined);

  if (!handlerPresent) missing.push(`Handler file is missing from payload: ${handlerPath}.`);
  if (handlerPresent && !handlerExportOk) missing.push('Handler export style does not match working executable tools. Expected module exports with metadata/handler/install or equivalent handler export.');
  if (handlerPresent && !handlerSubstantive) missing.push('Handler file appears placeholder-only or too weak for safe installation.');
  if (!routerIncluded) missing.push(`Router file is missing from payload: ${routerPath}.`);
  if (routerIncluded && !routerWired) missing.push('Router wiring is missing: EXECUTABLE_HANDLERS or installExternal registration for the proposed tool was not found.');
  if (!registryPresent) missing.push('Registry/list metadata for the proposed tool is missing.');
  if (!testPayloadPresent) missing.push('Expected live execution test payload is missing or incomplete.');
  if (documentationOnly) missing.push('Payload is documentation-only.');
  if (metadataOnly) missing.push('Payload is metadata-only.');
  if (placeholderOnly) missing.push('Payload appears placeholder-only.');

  const canInstall = missing.length === 0;
  return {
    validation_status: canInstall ? 'passed' : 'failed',
    can_install: canInstall,
    missing_requirements: missing,
    router_wiring_status: routerWired ? 'present' : routerIncluded ? 'missing_tool_registration' : 'router_file_missing',
    handler_status: handlerPresent ? handlerExportOk && handlerSubstantive ? 'present_and_substantive' : 'present_but_invalid_or_placeholder' : 'handler_file_missing',
    registry_metadata_status: registryPresent ? 'present' : 'missing',
    test_plan_status: testPayloadPresent ? 'present' : 'missing_or_incomplete',
    approval_gate_status: canInstall ? 'ready_for_owner_approved_foundry_operator_install' : 'blocked_before_foundry_operator',
    exact_fix_needed: canInstall ? 'No fix needed before foundry_operator. Payload includes explicit files, handler, router wiring, registry metadata, and test payload.' : `Do not call foundry_operator yet. Fix: ${missing.join(' ') || 'Add missing executable installation requirements.'} Then rerun backend_source_inspector and executable_tool_builder before installation.`,
    should_call_foundry_operator: canInstall,
    plain_english_summary: canInstall ? `The proposed payload for ${toolId} appears safe to pass to foundry_operator after owner approval.` : `The proposed payload for ${toolId || 'the tool'} is blocked before installation because ${missing.join(' ')}`
  };
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS || typeof router.registerTool !== 'function') throw new Error('Executable router exports required.');
  router.EXECUTABLE_HANDLERS[metadata.tool_id] = handler;
  router.registerTool(metadata);
  return { installed: true, tool_id: metadata.tool_id };
}

module.exports = { metadata, handler, install };
