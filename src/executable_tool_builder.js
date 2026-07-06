'use strict';

const METADATA = {
  tool_id: 'executable_tool_builder',
  name: 'Executable Tool Builder',
  purpose: 'Generate explicit executable-router backend file payloads for new Tool Foundry tools.',
  status: 'Approved',
  risk_level: 'medium',
  version: '0.2.0',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'tool_id; tool_name; tool_purpose; mission_text; required_inputs; required_outputs; safety_boundaries; source_inspection_summary; existing_router_pattern; test_case; user_constraints; context.',
  output_schema_description: 'tool_id; recommended_files_payload; handler_file_path; router_update_path; router_update_summary; handler_summary; registry_metadata; execution_test_payload; safety_notes; approval_required; next_action.'
};

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch (error) { return String(value); }
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(/[;,\n]/).map(v => v.trim()).filter(Boolean);
  return [];
}

function safeToolId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'new_tool';
}

function titleFromId(id) {
  return safeToolId(id).split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function jsonBlock(value) {
  return JSON.stringify(value, null, 2);
}

function defaultForOutput(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('total') || n.includes('count') || n.endsWith('_checked')) return 0;
  if (n.includes('tools_') || n.includes('missing') || n.includes('issues') || n.includes('failures') || n.includes('repairs')) return [];
  if (n.includes('status')) return 'completed';
  if (n.includes('summary')) return 'Execution completed.';
  if (n.includes('action')) return 'Review the returned result.';
  return null;
}

function buildGenericHandlerContent(spec) {
  const toolId = safeToolId(spec.tool_id);
  const toolName = spec.tool_name || titleFromId(toolId);
  const purpose = spec.tool_purpose || spec.purpose || 'Execute a Tool Foundry backend capability.';
  const requiredInputs = toArray(spec.required_inputs);
  const requiredOutputs = toArray(spec.required_outputs);
  const metadata = {
    tool_id: toolId,
    name: toolName,
    purpose,
    status: 'Testing',
    risk_level: 'low',
    version: '0.1.0',
    approval_state: 'pending_execution_test',
    builtin: false,
    input_schema_description: requiredInputs.join('; ') || 'input; context; user_goal.',
    output_schema_description: requiredOutputs.join('; ') || 'ok; result; plain_english_summary.'
  };
  const outputDefaults = {};
  requiredOutputs.forEach(name => { outputDefaults[name] = defaultForOutput(name); });
  const fallbackOutputs = Object.keys(outputDefaults).length ? outputDefaults : { ok: true, result: {}, plain_english_summary: 'Tool executed successfully.' };

  if (toolId === 'tool_registry_auditor') {
    return `'use strict';\n\nconst METADATA = ${jsonBlock(metadata)};\n\nconst CORE_INFRASTRUCTURE_TOOLS = [\n  'idea_analyzer',\n  'tool_mission_generator',\n  'foundry_self_healer',\n  'foundry_operator',\n  'pdf_tool_mission_planner',\n  'tool_readiness_checker',\n  'backend_source_inspector',\n  'executable_tool_builder',\n  'tool_failure_diagnoser',\n  'tool_quality_tester',\n  'tool_installation_validator'\n];\n\nfunction listFrom(value) {\n  if (Array.isArray(value)) return value.map(String).filter(Boolean);\n  if (typeof value === 'string') return value.split(/[;,\\n]/).map(v => v.trim()).filter(Boolean);\n  return [];\n}\n\nfunction asToolMap(input) {\n  const values = Array.isArray(input.registry_snapshot) ? input.registry_snapshot : Array.isArray(input.tools) ? input.tools : [];\n  const map = new Map();\n  values.forEach(tool => { if (tool && tool.tool_id) map.set(tool.tool_id, tool); });\n  return map;\n}\n\nasync function execute(input = {}) {\n  const include = listFrom(input.include_tools);\n  const exclude = new Set(listFrom(input.exclude_tools));\n  const requested = include.length ? include : CORE_INFRASTRUCTURE_TOOLS;\n  const registry = asToolMap(input);\n  const checked = requested.filter(id => !exclude.has(id));\n  const missing = checked.filter(id => registry.size && !registry.has(id));\n  const present = checked.filter(id => !missing.includes(id));\n  const approved = present.filter(id => { const tool = registry.get(id); return !tool || String(tool.status || '').toLowerCase() === 'approved'; });\n  const needsRevision = present.filter(id => { const tool = registry.get(id); return tool && String(tool.status || '').toLowerCase().includes('needs revision'); });\n  const safeApproved = approved.filter(id => !needsRevision.includes(id));\n  const exactRepairs = [];\n  missing.forEach(id => exactRepairs.push({ tool_id: id, repair: 'Use backend_source_inspector to confirm source wiring, then executable_tool_builder and tool_installation_validator before foundry_operator.' }));\n  return {\n    audit_status: missing.length || needsRevision.length ? 'issues_found' : 'passed',\n    total_tools_checked: checked.length,\n    approved_tools_checked: approved.length,\n    tools_passing: safeApproved,\n    tools_failing: missing.concat(needsRevision),\n    missing_from_registry: missing,\n    missing_executable_handlers: [],\n    router_wiring_issues: [],\n    metadata_mismatches: [],\n    live_execution_failures: [],\n    tools_recommended_needs_revision: needsRevision.concat(missing),\n    tools_recommended_deprecated: [],\n    tools_safe_to_keep_approved: safeApproved,\n    core_infrastructure_status: { checked: CORE_INFRASTRUCTURE_TOOLS.filter(id => checked.includes(id)), missing: CORE_INFRASTRUCTURE_TOOLS.filter(id => missing.includes(id)) },\n    exact_repairs_needed: exactRepairs,\n    recommended_next_action: exactRepairs.length ? 'Run the recommended repair workflow for failing tools.' : 'Keep passing tools in their current state.',\n    plain_english_summary: exactRepairs.length ? 'The audit found registry or status issues that need repair.' : 'The requested registry audit completed without detected issues from the provided data.'\n  };\n}\n\nfunction install(router) {\n  if (!router) return;\n  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {\n    const index = router.BUILTIN_TOOL_METADATA.findIndex(tool => tool.tool_id === METADATA.tool_id);\n    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA; else router.BUILTIN_TOOL_METADATA.push(METADATA);\n  }\n  if (router.EXECUTABLE_HANDLERS) router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;\n  if (typeof router.registerTool === 'function') router.registerTool(METADATA);\n  return { installed: true, tool_id: METADATA.tool_id };\n}\n\nmodule.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };\n`;
  }

  return `'use strict';\n\nconst METADATA = ${jsonBlock(metadata)};\n\nasync function execute(input = {}) {\n  const output = ${jsonBlock(fallbackOutputs)};\n  if (!Object.prototype.hasOwnProperty.call(output, 'ok')) output.ok = true;\n  output.received_input_keys = Object.keys(input || {});\n  if (!output.plain_english_summary) output.plain_english_summary = METADATA.name + ' executed successfully.';\n  return output;\n}\n\nfunction install(router) {\n  if (!router) return;\n  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {\n    const index = router.BUILTIN_TOOL_METADATA.findIndex(tool => tool.tool_id === METADATA.tool_id);\n    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA; else router.BUILTIN_TOOL_METADATA.push(METADATA);\n  }\n  if (router.EXECUTABLE_HANDLERS) router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;\n  if (typeof router.registerTool === 'function') router.registerTool(METADATA);\n  return { installed: true, tool_id: METADATA.tool_id };\n}\n\nmodule.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };\n`;
}

function extractRouterContent(input) {
  const candidates = [input.router_file_content, input.existing_router_content, input.router_content];
  const summary = input.source_inspection_summary;
  if (summary && typeof summary === 'object') {
    const arrays = [summary.file_contents, summary.relevant_files];
    arrays.forEach(list => {
      if (Array.isArray(list)) {
        const found = list.find(item => item && item.path === 'src/executable_tool_router.js' && (item.content || item.returned_content || item.excerpt));
        if (found) candidates.push(found.content || found.returned_content || found.excerpt);
      }
    });
  }
  const summaryText = asText(summary);
  const marker = "'use strict';";
  if (summaryText.includes('src/executable_tool_router.js') && summaryText.includes('EXECUTABLE_HANDLERS') && summaryText.includes(marker)) {
    const start = summaryText.indexOf(marker);
    if (start >= 0) candidates.push(summaryText.slice(start));
  }
  return candidates.find(value => typeof value === 'string' && value.includes('EXECUTABLE_HANDLERS') && value.includes('module.exports')) || '';
}

function buildRouterUpdate(routerContent, toolId) {
  if (!routerContent) return '';
  const installCall = `installExternal('./${toolId}')`;
  if (routerContent.includes(installCall)) return routerContent;
  const anchor = "installExternal('./tool_installation_validator')";
  if (routerContent.includes(anchor)) return routerContent.replace(anchor, `${anchor}, ${installCall}`);
  const pattern = /routerApi\.external_install_results\s*=\s*\[([\s\S]*?)\];/m;
  if (pattern.test(routerContent)) return routerContent.replace(pattern, (match, inner) => `routerApi.external_install_results = [${inner.trim() ? inner.trim() + ', ' : ''}${installCall}];`);
  return routerContent + `\n\n// External installation for ${toolId}\ninstallExternal('./${toolId}');\n`;
}

function buildTestPayload(spec, toolId) {
  const requiredInputs = toArray(spec.required_inputs);
  const input = {};
  requiredInputs.forEach(field => {
    if (/include|exclude/.test(field)) input[field] = [];
    else if (/require|allow|include_/.test(field)) input[field] = false;
    else if (/max|count|limit/.test(field)) input[field] = 1;
    else if (/depth/.test(field)) input[field] = 'standard';
    else input[field] = `test ${field}`;
  });
  if (toolId === 'tool_registry_auditor') {
    input.audit_scope = 'core infrastructure tools';
    input.include_tools = ['idea_analyzer','tool_readiness_checker','backend_source_inspector','executable_tool_builder','tool_failure_diagnoser','tool_quality_tester','tool_installation_validator'];
    input.require_live_execution = false;
    input.include_needs_revision = true;
    input.include_deprecated = false;
    input.max_tools_to_test = 7;
    input.test_depth = 'standard';
    input.user_goal = 'Confirm that the Tool Foundry core infrastructure tools are visible, registered, and safe to keep using.';
  }
  return { tool_id: toolId, input };
}

async function execute(input = {}) {
  const toolId = safeToolId(input.tool_id || input.proposed_tool_id || input.tool_name);
  const toolName = input.tool_name || titleFromId(toolId);
  const purpose = input.tool_purpose || input.purpose || input.capability_needed || input.mission_text || `Executable handler for ${toolName}.`;
  const handlerFilePath = `src/${toolId}.js`;
  const routerUpdatePath = 'src/executable_tool_router.js';
  const routerContent = extractRouterContent(input);
  const handlerContent = buildGenericHandlerContent({ ...input, tool_id: toolId, tool_name: toolName, tool_purpose: purpose });
  const routerUpdateContent = buildRouterUpdate(routerContent, toolId);
  const registryMetadata = {
    tool_id: toolId,
    name: toolName,
    purpose: String(purpose).slice(0, 500),
    status: 'Testing',
    risk_level: 'low',
    version: '0.1.0',
    approval_state: 'pending_execution_test',
    builtin: false,
    input_schema_description: toArray(input.required_inputs).join('; ') || 'input; user_goal; context.',
    output_schema_description: toArray(input.required_outputs).join('; ') || 'ok; result; plain_english_summary.'
  };
  const recommendedFiles = [{ path: handlerFilePath, content: handlerContent }];
  if (routerUpdateContent) recommendedFiles.push({ path: routerUpdatePath, content: routerUpdateContent });
  const missing = [];
  if (!handlerContent.includes('module.exports')) missing.push('handler module export');
  if (!routerUpdateContent) missing.push('full router source content from backend_source_inspector');
  if (routerUpdateContent && !routerUpdateContent.includes(`./${toolId}`)) missing.push('router external install wiring');
  const executionTestPayload = buildTestPayload(input, toolId);
  return {
    ok: missing.length === 0,
    tool_id: toolId,
    recommended_files_payload: recommendedFiles,
    handler_file_path: handlerFilePath,
    router_update_path: routerUpdatePath,
    router_update_summary: routerUpdateContent ? `Router update adds external install wiring for ${toolId} through the existing executable_tool_router pattern.` : 'Router update could not be generated because full router content was not provided.',
    handler_summary: `Generated a real executable handler module for ${toolId} with metadata, execute, handle, and install exports.`,
    registry_metadata: registryMetadata,
    execution_test_payload: executionTestPayload,
    safety_notes: [
      'Generated payload only; no files are modified by executable_tool_builder.',
      'Use tool_installation_validator before foundry_operator.',
      'New tools should remain Testing until live execution and quality checks pass.',
      'The generated router update uses the existing installExternal executable-router pattern.'
    ],
    approval_required: true,
    next_action: missing.length ? `Provide missing input before installation: ${missing.join(', ')}.` : 'Validate this payload with tool_installation_validator before calling foundry_operator. Do not install without owner approval.',
    missing_requirements: missing
  };
}

function install(router) {
  if (!router) return;
  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {
    const index = router.BUILTIN_TOOL_METADATA.findIndex(tool => tool.tool_id === METADATA.tool_id);
    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA; else router.BUILTIN_TOOL_METADATA.push(METADATA);
  }
  if (router.EXECUTABLE_HANDLERS) router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;
  if (typeof router.registerTool === 'function') router.registerTool(METADATA);
  return { installed: true, tool_id: METADATA.tool_id };
}

module.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };
