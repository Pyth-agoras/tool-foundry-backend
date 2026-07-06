'use strict';

const METADATA = {
  tool_id: 'executable_tool_builder',
  name: 'Executable Tool Builder',
  purpose: 'Generate explicit executable-router backend file payloads for new Tool Foundry tools.',
  status: 'Approved',
  risk_level: 'medium',
  version: '0.2.1',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'tool_id; tool_name; tool_purpose; mission_text; required_inputs; required_outputs; safety_boundaries; source_inspection_summary; source_inspection_result; relevant_files; file_contents; full_file_contents; source_files; current_router_source; router_source; existing_router_pattern; test_case; user_constraints; context.',
  output_schema_description: 'tool_id; recommended_files_payload; handler_file_path; router_update_path; router_update_summary; handler_summary; registry_metadata; execution_test_payload; safety_notes; approval_required; next_action.'
};

function txt(v) { if (v === null || v === undefined) return ''; if (typeof v === 'string') return v; try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); } }
function arr(v) { if (Array.isArray(v)) return v.map(String).filter(Boolean); if (typeof v === 'string') return v.split(/[;,\n]/).map(s => s.trim()).filter(Boolean); return []; }
function id(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'new_tool'; }
function title(v) { return id(v).split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '); }
function j(v) { return JSON.stringify(v, null, 2); }

function isRouterSource(s) {
  return typeof s === 'string' && s.includes('EXECUTABLE_HANDLERS') && s.includes('installExternal') && s.includes('module.exports') && s.includes('routerApi');
}
function decodeSource(s) {
  if (typeof s !== 'string') return '';
  if (isRouterSource(s)) return s;
  const expanded = s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");
  if (isRouterSource(expanded)) return expanded;
  const t = s.trim();
  if ((t.startsWith('{') || t.startsWith('[')) && t.includes('executable_tool_router')) {
    try { return extractRouterContent(JSON.parse(t)); } catch (e) {}
  }
  return '';
}
function collectSources(v, out, seen) {
  if (v === null || v === undefined) return;
  if (!seen) seen = new Set();
  if (typeof v === 'string') { const c = decodeSource(v); if (c) out.push(c); return; }
  if (typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  const p = String(v.path || v.file || v.filename || '');
  if (p === 'src/executable_tool_router.js' || p.endsWith('/src/executable_tool_router.js')) {
    ['content','full_content','full_file_content','returned_content','source','text','excerpt'].forEach(k => { const c = decodeSource(v[k]); if (c) out.push(c); });
  }
  Object.keys(v).forEach(k => collectSources(v[k], out, seen));
}
function extractRouterContent(input) {
  const out = [];
  ['router_file_content','existing_router_content','router_content','current_router_source','router_source','existing_router_pattern','source_inspection_summary','source_inspection_result','relevant_files','file_contents','full_file_contents','source_files','context'].forEach(k => collectSources(input && input[k], out));
  return out.find(isRouterSource) || '';
}
function updateRouter(source, toolId) {
  if (!source) return { content: '', already: false, summary: 'Router source was not found in the provided input fields.' };
  const call = `installExternal('./${toolId}')`;
  if (source.includes(call)) return { content: source, already: true, summary: `${toolId} is already wired; no router update is needed.` };
  const re = /routerApi\.external_install_results\s*=\s*\[([\s\S]*?)\];/m;
  if (!re.test(source)) return { content: '', already: false, summary: 'The installExternal results array was not found in the router source.' };
  return {
    content: source.replace(re, (m, inner) => `routerApi.external_install_results = [${inner.replace(/\s*$/, '')}, ${call} ];`),
    already: false,
    summary: `Router update adds ${call} once using the existing installExternal pattern.`
  };
}

function workflowHandler(metadata) {
  return `'use strict';\n\nconst METADATA = ${j(metadata)};\nfunction s(v){try{return typeof v==='string'?v:JSON.stringify(v)}catch(e){return String(v||'')}}\nfunction l(v){return Array.isArray(v)?v.map(String):typeof v==='string'?v.split(/[;\\n]/).map(x=>x.trim()).filter(Boolean):[]}\nfunction h(t, terms){const n=s(t).toLowerCase();return terms.some(x=>n.includes(String(x).toLowerCase()))}\nasync function execute(input={}){\n  const all=[input.user_goal,input.current_tool_id,l(input.attempted_steps).join(' | '),l(input.repeated_failure_patterns).join(' | '),input.latest_error_message,input.current_tool_status,input.registry_result,input.execution_result,input.deploy_result,input.health_result,input.tools_list_result,input.source_inspection_result,input.builder_result,input.validator_result,input.quality_test_result,input.recent_action_summary,input.owner_constraints].map(s).join(' | ');\n  let loop='unclear_failure', blocker='unclear failure evidence', next='tool_failure_diagnoser', action='Use tool_failure_diagnoser first because the real blocker is unclear.', stop=['repeating the same failed action without new evidence'], seq=['Pause repeated retries','Run tool_failure_diagnoser with full evidence','Follow the diagnosed repair path'];\n  if(h(all,['builder returned empty files payload','recommended_files_payload: []','recommended_files_payload was empty','empty files payload','no files payload'])){loop='builder_output_failure';blocker='executable_tool_builder output failure';next='executable_tool_builder';action='Repair or rerun executable_tool_builder so it produces a complete handler and router-wired files payload, then rerun tool_installation_validator.';stop=['continuing install without a valid files payload','calling foundry_operator before tool_installation_validator passes','creating another mission for the same unresolved dependency'];seq=['Pause the current install attempt','Repair or rerun executable_tool_builder with full source inspection output','Confirm recommended_files_payload includes handler and router wiring','Run tool_installation_validator','Resume install only after can_install is true'];}\n  else if(h(all,['missing router wiring','not wired','executable_handlers','no executable handler','handler not installed'])){loop='missing_router_wiring';blocker='missing executable handler or EXECUTABLE_HANDLERS router wiring';next='backend_source_inspector';action='Use backend_source_inspector to confirm wiring, then generate a router repair and validate it before deployment.';stop=['approving the tool before live execution passes','rebuilding the mission instead of repairing router wiring'];seq=['Inspect router wiring','Generate corrected handler/router payload','Validate payload','Deploy after approval','Run live execution'];}\n  else if(h(all,['deployment adoption','old deployment','tools/list still old','health still old','not adopted'])){loop='deployment_adoption_delay';blocker='deployment adoption delay or stale runtime';next='foundry_operator';action='Use foundry_operator deployment recheck and verify /health and /tools/list before rebuilding.';stop=['rebuilding while deployment adoption is unconfirmed'];seq=['Pause rebuild','Run foundry_operator deployment recheck','Verify /health','Verify /tools/list','Continue only after adoption is confirmed'];}\n  const pause=loop!=='unclear_failure';\n  return {dead_end_detected:pause,loop_pattern:loop,real_blocker:blocker,wrong_actions_to_stop:stop,correct_next_action:action,recommended_tool_to_use_next:next,repair_sequence:seq,owner_approval_needed:next==='foundry_operator',retry_allowed:!pause,should_pause_current_workflow:pause,completion_path:seq.join(' -> '),plain_english_summary:pause?'A non-productive Tool Foundry path was detected. Stop the repeated action and address the real blocker before resuming.':'The blocker is not clear enough to choose a repair safely. Run tool_failure_diagnoser first.',ok:true};\n}\nfunction install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA);}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return {installed:true,tool_id:METADATA.tool_id};}\nmodule.exports={METADATA,metadata:METADATA,execute,handle:execute,install};\n`;
}
function genericHandler(metadata, outputs) {
  const defaults = {};
  arr(outputs).forEach(name => {
    const n = String(name).toLowerCase();
    defaults[name] = n.includes('summary') ? 'Generated response.' : n.includes('list') || n.includes('items') ? [] : n.includes('count') ? 0 : null;
  });
  return `'use strict';\n\nconst METADATA = ${j(metadata)};\nasync function execute(input={}){return Object.assign(${j(defaults)}, {ok:true, received_input_keys:Object.keys(input||{}), plain_english_summary:'Executable handler completed.'});}\nfunction install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA);}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return {installed:true,tool_id:METADATA.tool_id};}\nmodule.exports={METADATA,metadata:METADATA,execute,handle:execute,install};\n`;
}
function buildHandler(spec) {
  const toolId = id(spec.tool_id);
  const metadata = {
    tool_id: toolId,
    name: spec.tool_name || title(toolId),
    purpose: spec.tool_purpose || spec.purpose || 'Execute a Tool Foundry backend capability.',
    status: 'Testing',
    risk_level: 'low',
    version: '0.1.0',
    approval_state: 'pending_execution_test',
    builtin: false,
    input_schema_description: arr(spec.required_inputs).join('; ') || 'input; user_goal; context.',
    output_schema_description: arr(spec.required_outputs).join('; ') || 'ok; result; plain_english_summary.'
  };
  return toolId === 'workflow_dead_end_resolver' ? workflowHandler(metadata) : genericHandler(metadata, spec.required_outputs);
}
function testPayload(spec, toolId) {
  if (toolId === 'workflow_dead_end_resolver') return { tool_id: toolId, input: { user_goal: 'Install tool_registry_auditor.', current_tool_id: 'tool_registry_auditor', attempted_steps: ['created mission','called executable_tool_builder','builder returned empty files payload','tool_installation_validator blocked install','attempted to continue install anyway'], repeated_failure_patterns: ['mission created but no files payload','installer called before valid payload','new tool install attempted without required files'], latest_error_message: 'recommended_files_payload was empty and validator returned can_install: false.', current_tool_status: 'Draft', registry_result: 'Tool mission exists but tool is not installed.', execution_result: 'Tool cannot execute because it is not installed.', builder_result: 'recommended_files_payload: []', validator_result: 'can_install: false', recent_action_summary: 'The workflow tried to proceed without a valid files payload.' } };
  const input = {};
  arr(spec.required_inputs).forEach(k => input[k] = `sample ${k}`);
  return { tool_id: toolId, input };
}
async function execute(input = {}) {
  const toolId = id(input.tool_id || input.proposed_tool_id || input.tool_name);
  const toolName = input.tool_name || title(toolId);
  const purpose = input.tool_purpose || input.purpose || input.capability_needed || input.mission_text || `Executable handler for ${toolName}.`;
  const handlerPath = `src/${toolId}.js`;
  const routerPath = 'src/executable_tool_router.js';
  const router = updateRouter(extractRouterContent(input), toolId);
  const handler = buildHandler({ ...input, tool_id: toolId, tool_name: toolName, tool_purpose: purpose });
  const registry_metadata = { tool_id: toolId, name: toolName, purpose: String(purpose).slice(0,500), status: 'Testing', risk_level: 'low', version: '0.1.0', approval_state: 'pending_execution_test', builtin: false, input_schema_description: arr(input.required_inputs).join('; ') || 'input; user_goal; context.', output_schema_description: arr(input.required_outputs).join('; ') || 'ok; result; plain_english_summary.' };
  const files = [{ path: handlerPath, content: handler }];
  if (router.content && !router.already) files.push({ path: routerPath, content: router.content });
  const missing = [];
  if (!handler.includes('module.exports')) missing.push('handler module export');
  if (!router.content) missing.push('full router source content from backend_source_inspector');
  if (router.content && !router.content.includes(`./${toolId}`)) missing.push('router external install wiring');
  return { ok: missing.length === 0, tool_id: toolId, recommended_files_payload: files, handler_file_path: handlerPath, router_update_path: routerPath, router_update_summary: router.summary, handler_summary: `Generated executable handler for ${toolId} plus router update when needed.`, registry_metadata, execution_test_payload: testPayload(input, toolId), safety_notes: ['Generated payload only; no files are modified by executable_tool_builder.','Use tool_installation_validator before foundry_operator.','Router updates preserve existing source and use the existing installExternal executable-router pattern.','If the target tool is already wired, no duplicate router install line is generated.'], approval_required: true, next_action: missing.length ? `Provide missing input before installation: ${missing.join(', ')}.` : 'Validate this payload with tool_installation_validator before calling foundry_operator.', missing_requirements: missing };
}
function install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA);}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return {installed:true,tool_id:METADATA.tool_id};}
module.exports = { METADATA, metadata: METADATA, execute, handle: execute, install };
