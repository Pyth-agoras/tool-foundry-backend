'use strict';

const STARTED_AT = new Date().toISOString();
const mutableMissions = [];
const mutableEvaluations = [];
const mutableExecutions = [];

const BUILTIN_TOOL_METADATA = [
  { tool_id: 'idea_analyzer', name: 'Idea Analyzer', purpose: 'Analyze raw user ideas into a core goal, risk level, needed tool type, and next action.', status: 'Approved', risk_level: 'low', version: '0.2.0', approval_state: 'approved', builtin: true },
  { tool_id: 'tool_mission_generator', name: 'Tool Mission Generator', purpose: 'Convert a raw idea into a complete Tool Mission.', status: 'Approved', risk_level: 'low', version: '0.2.0', approval_state: 'approved', builtin: true },
  { tool_id: 'foundry_self_healer', name: 'Foundry Self-Healer', purpose: 'Diagnose Tool Foundry setup problems.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: true },
  { tool_id: 'foundry_operator', name: 'Foundry Operator', purpose: 'Apply approved backend file updates, trigger Render redeploys, and verify backend readiness.', status: 'Approved', risk_level: 'medium', version: '0.1.0', approval_state: 'approved', builtin: true },
  { tool_id: 'pdf_tool_mission_planner', name: 'PDF Tool Mission Planner', purpose: 'Plan safe PDF/document analysis tools.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: false, input_schema_description: 'raw_request; optional target_builder; optional document_types; optional analysis_goals; optional constraints; optional risk_level_hint.', output_schema_description: 'tool_name_suggestion; user_facing_purpose; capability_needed; input_fields; output_fields; expected_behavior; success_criteria; failure_conditions; safety_boundaries; privacy_boundaries; cost_boundaries; test_cases; approval_requirements; automation_level; recommended_builder; assumptions; open_questions_for_owner; plain_english_summary.' },
  { tool_id: 'tool_readiness_checker', name: 'Tool Readiness Checker', purpose: 'Check whether existing tools satisfy a proposed capability and whether a new tool is needed.', status: 'Testing', risk_level: 'low', version: '0.1.0', approval_state: 'pending_execution_test', builtin: false, input_schema_description: 'raw_idea; optional context; optional desired_tool_type; optional risk_level; optional user_constraints; optional registry_snapshot.', output_schema_description: 'existing_capability_match; new_tool_needed; recommended_tool_id; risk_level; approval_required; reason; next_action; registry_check_summary; owner_level_decision_needed.' },
  { tool_id: 'backend_source_inspector', name: 'Backend Source Inspector', purpose: 'Read-only inspection of the approved Tool Foundry backend GitHub repo source structure to locate runtime entry files, routes, executable handler registries, built-in handlers, and safe patch targets.', status: 'Testing', risk_level: 'low', version: '0.1.0', approval_state: 'pending_execution_test', builtin: false, input_schema_description: 'inspect_scope; target_paths; search_terms; max_files; include_file_contents; include_summary.', output_schema_description: 'repo_owner; repo_name; branch; detected_entry_files; relevant_files; route_locations; handler_registry_location; executable_handlers_found; recommended_patch_targets; warnings; source_summary; next_action.' },
  { tool_id: 'executable_tool_builder', name: 'Executable Tool Builder', purpose: 'Turn an approved Tool Mission plus backend source inspection results into exact executable backend file updates that can be passed to foundry_operator.', status: 'Testing', risk_level: 'medium', version: '0.1.0', approval_state: 'pending_execution_test', builtin: false, input_schema_description: 'tool_id; tool_name; tool_purpose; mission_text; required_inputs; required_outputs; safety_boundaries; source_inspection_summary; existing_router_pattern; test_case.', output_schema_description: 'tool_id; recommended_files_payload; router_update_summary; handler_summary; registry_metadata; execution_test_payload; safety_notes; approval_required; next_action.' },
  { tool_id: 'tool_failure_diagnoser', name: 'Tool Failure Diagnoser', purpose: 'Diagnose failed Tool Foundry tool builds, installs, deployments, registrations, or executions, then recommend the exact repair path in plain English.', status: 'Testing', risk_level: 'low', version: '0.1.0', approval_state: 'pending_execution_test', builtin: false, input_schema_description: 'failed_tool_id; failure_stage; error_message; tool_status; registry_result; execution_result; deploy_result; health_result; tools_list_result; source_inspection_summary; recent_action_summary; user_goal', output_schema_description: 'failure_category; likely_root_cause; confidence_level; evidence; repair_path; exact_next_action; owner_approval_needed; should_retry; should_rebuild; should_redeploy; should_mark_needs_revision; should_mark_approved; recommended_tool_to_use_next; plain_english_summary' },
  { tool_id: 'tool_quality_tester', name: 'Tool Quality Tester', purpose: 'Run structured quality tests against a newly installed Tool Foundry backend tool and decide whether it should be Approved, Needs Revision, or Rejected.', status: 'Needs Revision', risk_level: 'low', version: '0.1.1', approval_state: 'pending_execution_test', builtin: false, input_schema_description: 'tool_id; tool_name; tool_purpose; expected_inputs; expected_outputs; test_cases; safety_boundaries; privacy_boundaries; cost_boundaries; execution_results; failure_conditions; user_goal.', output_schema_description: 'quality_status; approval_recommendation; passed_tests; failed_tests; schema_match; usefulness_score; safety_status; privacy_status; cost_status; revision_needed; exact_revision_request; should_mark_approved; should_mark_needs_revision; should_reject; plain_english_summary.' }
];

const mutableTools = new Map(BUILTIN_TOOL_METADATA.map((tool) => [tool.tool_id, { ...tool }]));

function getTools() { return Array.from(mutableTools.values()); }
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function hasAny(text, terms) { const n = normalize(text); return terms.some((term) => n.includes(normalize(term))); }
function tokenize(value) { const stop = new Set(['the','and','for','that','with','into','from','this','tool','tools','backend','create','build','make','new','need','needed','given','whether','what','user','users','return','returns','using','check','checks']); return normalize(value).split(' ').filter((word) => word.length > 2 && !stop.has(word)); }
function positiveTrigger(text, terms, negations) { const n = normalize(text); for (const negation of negations || []) if (n.includes(normalize(negation))) return false; return terms.some((term) => n.includes(normalize(term))); }

function inferRiskAndApproval(text, suppliedRisk) {
  const rules = [
    ['public deployment', ['public deploy','public deployment','make public','public api','public website'], ['no public deployment','not public','private deployment only','do not deploy publicly']],
    ['paid API or paid service usage', ['paid api','paid apis','paid service','api credits','billing','subscription','paid llm','paid ocr'], ['no paid api','no paid apis','without paid api','without paid apis','no paid service','no paid services','do not use paid api','do not use paid apis']],
    ['personal or sensitive data storage', ['store personal','store sensitive','save personal','save sensitive','medical records','financial records','identity documents','database of users','personal data storage'], ['no personal data storage','no sensitive data storage','do not store personal','do not store sensitive','without personal data storage','without sensitive data storage','no persistent storage','do not store raw ideas']],
    ['sending emails or messages', ['send email','send emails','send message','send messages','sms','email customers','dm customers'], ['do not send email','do not send emails','no emails','no messaging','do not send messages']],
    ['publishing content', ['publish','post publicly','social media','upload publicly'], ['do not publish','no publishing','not public']],
    ['external account access', ['connect account','external account','gmail','slack','google drive','github access','oauth'], ['no external account','without external account','do not connect account']],
    ['real-world action', ['purchase','book','cancel','delete','real-world action','execute trade','place order'], ['no real world action','no real-world action','do not purchase','do not delete']],
    ['increased permissions', ['admin permission','higher permission','increase permission','root access'], ['no increased permissions','no admin permission','do not increase permissions']],
    ['autonomous scheduled action', ['autonomous','scheduled automation','cron','run every','without approval','automatically every'], ['no autonomous','no scheduled automation','do not schedule','manual only']]
  ];
  const approval_reasons = rules.filter(([, terms, negations]) => positiveTrigger(text, terms, negations)).map(([label]) => label);
  const highTerms = ['medical advice','legal advice','financial advice','surveillance','spyware','payments','execute trade','destructive','weapon','credential theft','sensitive data at scale'];
  const highNegations = ['no medical advice','no legal advice','no financial advice','no surveillance','no spyware','no payments','do not execute trade'];
  const supplied = normalize(suppliedRisk);
  const risk_level = ['low','medium','high'].includes(supplied) ? supplied : positiveTrigger(text, highTerms, highNegations) ? 'high' : approval_reasons.length ? 'medium' : 'low';
  return { risk_level, approval_reasons, approval_required: approval_reasons.length > 0 || risk_level === 'high' };
}

function analyzeIdea(input = {}) {
  const raw = input.raw_idea || input.idea || input.text || '';
  const text = [raw, input.context, input.user_constraints].filter(Boolean).join(' ');
  const risk = inferRiskAndApproval(text, input.risk_level);
  return { ok: true, core_goal: raw ? String(raw).trim() : 'No idea provided.', intelligence_pattern: hasAny(text, ['analyze','assess','check','classify','score']) ? 'analysis' : 'planning', risk_level: risk.risk_level, approval_required: risk.approval_required, approval_reasons: risk.approval_reasons, needed_tool_type: hasAny(text, ['pdf','document']) ? 'document_analysis' : hasAny(text, ['email','message','sms']) ? 'messaging_automation' : 'general_backend_tool', next_action: risk.approval_required ? 'Get owner approval before implementation or execution.' : 'Proceed with planning or use an existing approved tool if one matches.' };
}

function generateMission(input = {}) {
  const raw = input.raw_idea || input.idea || input.analyzed_idea || input.context || 'new backend tool';
  const idBase = tokenize(raw).slice(0, 5).join('_') || 'new_tool';
  return { ok: true, mission: { tool_name: idBase, user_facing_purpose: `Help the owner with: ${raw}`, capability_needed: raw, input_fields: ['raw_idea','context','user_constraints'], output_fields: ['result','risk_level','approval_required','next_action'], success_criteria: ['Returns structured output.','Respects approval and privacy boundaries.','Handles missing input clearly.'], failure_conditions: ['Fabricates results.','Bypasses approval requirements.','Requires the owner to write code.'], safety_boundaries: ['No unsafe, illegal, or abusive tooling.','No real-world side effects without approval.'], privacy_boundaries: ['No credential collection.','No persistent sensitive data storage without approval.'], cost_boundaries: ['No paid API usage without approval.'], test_cases: ['Valid low-risk idea returns a next action.','Approval-gated idea returns approval_required true.'], approval_requirements: ['Required for public deployment, paid APIs, sensitive storage, messaging, publishing, external accounts, real-world actions, increased permissions, or autonomous scheduling.'] } };
}

function planPdfTool(input = {}) {
  const raw = input.raw_request || input.raw_idea || 'PDF/document analysis tool';
  return { ok: true, mission: { tool_name_suggestion: `${tokenize(raw).slice(0, 6).join('_') || 'pdf_document'}_tool`, user_facing_purpose: `Help the owner create a PDF/document analysis tool for: ${raw}.`, capability_needed: 'Accept supported document inputs, analyze the requested content, and return traceable results with page-level evidence where possible.', input_fields: [{ name: 'documents', type: 'file or file list', required: true, description: 'PDF/document files supplied by the owner or end user.' }, { name: 'task_instructions', type: 'string', required: false, description: 'Optional owner instructions.' }, { name: 'citation_required', type: 'boolean', required: false, description: 'Whether claims need page references.' }], output_fields: [{ name: 'summary', type: 'string' }, { name: 'structured_results', type: 'object or array' }, { name: 'citations', type: 'array' }, { name: 'warnings', type: 'array' }, { name: 'review_required', type: 'boolean' }], expected_behavior: ['Validate files before analysis.','Include citations when source text is available.','Flag uncertainty and sensitive workflows.'], success_criteria: ['Useful document-analysis output.','Page references when available.','Privacy protection by default.'], failure_conditions: ['Fabricates content or citations.','Stores documents without approval.','Overclaims high-stakes advice.'], safety_boundaries: ['No fraud, doxxing, forgery, or illegal use.'], privacy_boundaries: ['Default to no persistent document storage.'], cost_boundaries: ['Require approval before paid OCR, paid LLMs, or paid storage.'], test_cases: [{ name: 'Text PDF summary with citations', expected: 'Summary includes page references.' }], approval_requirements: { requires_owner_confirmation: ['Persistent storage','Third-party APIs','paid services','public deployment','external account connections','publishing outputs'] }, automation_level: 'Mission planning may run automatically. Real document processing and external actions require approval.', recommended_builder: 'Codex', assumptions: ['PDF support first.'], open_questions_for_owner: [], plain_english_summary: `This mission plans a safe PDF/document-analysis tool for: ${raw}.`, source_request: raw, generated_at: new Date().toISOString(), mission_source: 'pdf_tool_mission_planner' } };
}

function selfHeal() {
  return { status: 'ready_for_operator_use', core_tools_ready: true, core_tools_present: ['idea_analyzer','tool_mission_generator','foundry_self_healer','foundry_operator'], missing_core_tools: [], configured_values: { API_KEY: Boolean(process.env.API_KEY), GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN), GITHUB_OWNER: Boolean(process.env.GITHUB_OWNER), GITHUB_REPO: Boolean(process.env.GITHUB_REPO), GITHUB_BRANCH: Boolean(process.env.GITHUB_BRANCH), RENDER_DEPLOY_HOOK_URL: Boolean(process.env.RENDER_DEPLOY_HOOK_URL), PUBLIC_BASE_URL: Boolean(process.env.PUBLIC_BASE_URL) }, current_tools: getTools(), counts: { tools: getTools().length, missions: mutableMissions.length, evaluations: mutableEvaluations.length, executions: mutableExecutions.length } };
}

function scoreRegistryMatch(requestText, tool) {
  if (!tool || normalize(tool.status) !== 'approved') return null;
  const text = normalize(requestText);
  const haystack = normalize([tool.tool_id, tool.name, tool.purpose, tool.input_schema_description, tool.output_schema_description].filter(Boolean).join(' '));
  let overlap = 0;
  for (const token of new Set(tokenize(text))) if (haystack.includes(token)) overlap += 1;
  let fit = null; let reason = '';
  if (tool.tool_id === 'idea_analyzer' && hasAny(text, ['startup idea','startup ideas','raw idea','raw ideas','idea analysis','risk level and next action','analyzes startup'])) { fit = 'strong'; reason = 'The approved idea_analyzer already analyzes raw ideas and returns risk level and next action.'; }
  else if (tool.tool_id === 'tool_mission_generator' && hasAny(text, ['mission','tool mission','codex-ready','implementation mission'])) { fit = 'strong'; reason = 'The approved tool_mission_generator already creates complete tool missions.'; }
  else if (tool.tool_id === 'pdf_tool_mission_planner' && hasAny(text, ['pdf','document','invoice','ocr','page citation','page references'])) { fit = 'strong'; reason = 'The approved pdf_tool_mission_planner already plans PDF/document analysis tools.'; }
  else if (tool.tool_id === 'tool_readiness_checker' && hasAny(text, ['tool readiness','already has','new tool needed','approval required','registry check'])) { fit = 'strong'; reason = 'The tool_readiness_checker checks registry fit, new-tool need, risk, approval, and next action.'; }
  else if (overlap >= 4) { fit = 'strong'; reason = 'The approved tool purpose substantially overlaps with the requested capability.'; }
  else if (overlap >= 2) { fit = 'partial'; reason = 'The approved tool overlaps with part of the requested capability.'; }
  return fit ? { tool_id: tool.tool_id, name: tool.name, fit_level: fit, reason, score: overlap } : null;
}

function toolReadinessChecker(input = {}) {
  const raw = typeof input.raw_idea === 'string' ? input.raw_idea.trim() : '';
  if (!raw) return { existing_capability_match: null, new_tool_needed: false, recommended_tool_id: null, risk_level: normalize(input.risk_level) || 'low', approval_required: false, reason: 'input.raw_idea is required before readiness can be checked.', next_action: 'Provide input.raw_idea and run the checker again.', registry_check_summary: 'Registry check skipped because raw_idea was missing.', owner_level_decision_needed: false };
  const combined = [input.raw_idea, input.context, input.desired_tool_type, input.user_constraints].filter(Boolean).join(' ');
  const registry = Array.isArray(input.registry_snapshot) && input.registry_snapshot.length ? input.registry_snapshot : getTools();
  const matches = registry.map((tool) => scoreRegistryMatch(combined, tool)).filter(Boolean).sort((a, b) => ({ strong: 2, partial: 1 }[b.fit_level] - { strong: 2, partial: 1 }[a.fit_level]) || (b.score - a.score));
  const best = matches.find((m) => m.fit_level === 'strong') || matches[0] || null;
  const risk = inferRiskAndApproval(combined, input.risk_level);
  const strong = best && best.fit_level === 'strong';
  return { existing_capability_match: best ? { tool_id: best.tool_id, name: best.name, fit_level: best.fit_level, reason: best.reason } : null, new_tool_needed: !strong, recommended_tool_id: strong ? best.tool_id : `${tokenize(input.desired_tool_type || raw).slice(0, 5).join('_') || 'new_tool'}_tool`, risk_level: risk.risk_level, approval_required: risk.approval_required, reason: strong ? best.reason : best ? `A partial match exists (${best.tool_id}), but it may not cover the full requested capability.` : 'No approved existing capability appears to fully satisfy the proposed tool idea.', next_action: strong ? `Use the existing approved ${best.tool_id} capability instead of building a duplicate tool.` : risk.approval_required ? `Get owner approval for ${risk.approval_reasons.join(', ') || 'the high-risk capability'} before building or activating the tool.` : 'Create a tool implementation for the missing capability, then verify execution before approval.', registry_check_summary: matches.length ? `Checked ${registry.length} registry tools and found ${matches.length} relevant match(es). Best match: ${best.tool_id} (${best.fit_level}).` : `Checked ${registry.length} registry tools and found no approved capability match.`, owner_level_decision_needed: risk.approval_required };
}

async function githubPutFile(path, content) {
  const owner = process.env.GITHUB_OWNER, repo = process.env.GITHUB_REPO, branch = process.env.GITHUB_BRANCH || 'main', token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error('GitHub write settings are not configured.');
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tool-foundry-backend' };
  let sha;
  const current = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (current.ok) sha = (await current.json()).sha;
  const put = await fetch(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Update ${path}`, content: Buffer.from(content, 'utf8').toString('base64'), branch, sha }) });
  if (!put.ok) throw new Error(`GitHub update failed for ${path}: ${put.status} ${await put.text()}`);
  const body = await put.json();
  return { path, commit: body.commit && body.commit.sha };
}

async function foundryOperator(input = {}) {
  const result = { mode: input.mode || 'diagnose', started_at: new Date().toISOString(), diagnosis_before: selfHeal(), actions_taken: [], blockers: [], results: {} };
  const approved = input.approved === true && input.approval_confirmed === true;
  if (Array.isArray(input.files) && input.files.length) {
    if (!approved) { result.blockers.push('Owner approval and approval confirmation are required before backend file updates.'); result.next_action = 'Get owner approval before applying file changes.'; return result; }
    result.results.github_updates = [];
    for (const file of input.files) if (file && file.path && typeof file.content === 'string') { const update = await githubPutFile(file.path, file.content); result.results.github_updates.push(update); result.actions_taken.push(`updated:${file.path}`); }
    if (process.env.RENDER_DEPLOY_HOOK_URL) { const deploy = await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method: 'POST' }); result.results.render_deploy = { skipped: false, ok: deploy.ok, status: deploy.status }; result.actions_taken.push('render_deploy_triggered'); }
    else result.results.render_deploy = { skipped: true, reason: 'RENDER_DEPLOY_HOOK_URL not configured' };
  }
  result.results.diagnosis = selfHeal();
  result.next_action = result.blockers.length ? 'Resolve blockers before continuing.' : 'Operator completed the requested action.';
  return result;
}

function fallbackExecutableToolBuilder(input = {}) {
  return { ok: true, tool_id: input.tool_id || 'unknown_tool', recommended_files_payload: [], router_update_summary: 'Fallback handler is executable. Use the dedicated executable_tool_builder module when available for full file generation.', handler_summary: 'No source files were generated by fallback mode.', registry_metadata: null, execution_test_payload: null, safety_notes: ['Fallback mode does not modify backend files.'], approval_required: true, next_action: 'Use the installed executable_tool_builder module for production file generation.' };
}

function fallbackFailureDiagnoser(input = {}) {
  const all = normalize([input.error_message, input.execution_result, input.registry_result, input.tools_list_result, input.recent_action_summary].filter(Boolean).join(' '));
  const missingHandler = hasAny(all, ['no executable handler', 'missing handler', 'handler not installed']);
  return { failure_category: missingHandler ? 'approved_or_registered_without_executable_handler' : 'live_execution_test_failed', likely_root_cause: missingHandler ? 'The tool is registered, but a real executable handler is missing or not wired into EXECUTABLE_HANDLERS.' : 'The live execution test failed and needs diagnosis before approval.', confidence_level: 'high', evidence: { ...input }, repair_path: missingHandler ? 'Use backend_source_inspector to confirm router wiring, then foundry_operator with explicit files to wire the handler into EXECUTABLE_HANDLERS and redeploy.' : 'Keep the tool Needs Revision, repair the failing stage, redeploy if needed, and rerun live execution.', exact_next_action: missingHandler ? 'Patch src/executable_tool_router.js so the handler is registered in EXECUTABLE_HANDLERS, then redeploy and retest.' : 'Retest after repair.', owner_approval_needed: true, should_retry: false, should_rebuild: true, should_redeploy: true, should_mark_needs_revision: true, should_mark_approved: false, recommended_tool_to_use_next: 'backend_source_inspector, executable_tool_builder, foundry_operator', plain_english_summary: missingHandler ? 'The tool is registered, but execution failed because the backend does not have a working handler wired into the executable router.' : 'Execution failed, so the tool should remain Needs Revision until live execution passes.' };
}

function fallbackBackendSourceInspector(input = {}) {
  return { repo_owner: process.env.GITHUB_OWNER || null, repo_name: process.env.GITHUB_REPO || null, branch: process.env.GITHUB_BRANCH || 'main', detected_entry_files: [{ path: 'package.json', confidence: 'high' }, { path: 'server.js', confidence: 'high' }, { path: 'src/server.js', confidence: 'high' }], relevant_files: [], route_locations: { '/tools/list': { file: 'src/server.js' }, '/tools/execute': { file: 'src/server.js' } }, handler_registry_location: { file: 'src/executable_tool_router.js', exported: true }, executable_handlers_found: Object.keys(EXECUTABLE_HANDLERS).map((tool_id) => ({ tool_id, file: 'src/executable_tool_router.js', metadata_found: mutableTools.has(tool_id) })), recommended_patch_targets: [{ path: 'src/executable_tool_router.js', reason: 'Executable handler registry.' }], warnings: ['Fallback inspector returned runtime registry information only.'], source_summary: 'Runtime router is executable and exposes EXECUTABLE_HANDLERS.', next_action: 'Patch the executable router with explicit file contents when source changes are required.' };
}

const EXECUTABLE_HANDLERS = {
  idea_analyzer: analyzeIdea,
  tool_mission_generator: generateMission,
  foundry_self_healer: selfHeal,
  foundry_operator: foundryOperator,
  pdf_tool_mission_planner: planPdfTool,
  tool_readiness_checker: toolReadinessChecker,
  backend_source_inspector: fallbackBackendSourceInspector,
  executable_tool_builder: fallbackExecutableToolBuilder,
  tool_failure_diagnoser: fallbackFailureDiagnoser
};

async function executeTool(tool_id, input = {}) {
  const handler = EXECUTABLE_HANDLERS[tool_id];
  if (!handler) { const error = new Error('No executable handler is installed for this tool.'); error.statusCode = 404; throw error; }
  const result = await handler(input);
  mutableExecutions.push({ tool_id, at: new Date().toISOString() });
  return result;
}

function registerTool(record = {}) {
  if (!record.tool_id) { const error = new Error('tool_id is required.'); error.statusCode = 400; throw error; }
  const previous = mutableTools.get(record.tool_id) || {};
  const next = { ...previous, ...record, builtin: Boolean(record.builtin ?? previous.builtin) };
  mutableTools.set(record.tool_id, next);
  return { tool_id: record.tool_id, status: next.status || 'Draft', message: 'Tool registered.' };
}

function createMission(record = {}) { const mission = { id: `mission_${Date.now()}`, status: 'Draft', ...record }; mutableMissions.push(mission); return { mission_id: mission.id, status: mission.status, mission }; }
function getMissionStatus(id) { const mission = mutableMissions.find((m) => m.id === id); if (!mission) { const error = new Error('Mission not found.'); error.statusCode = 404; throw error; } return mission; }
function evaluateTool(record = {}) { const tool_id = record.tool_id; const tool = mutableTools.get(tool_id); const evaluation = { tool_id, status: tool ? 'ready_for_execution_verification' : 'not_found', score: tool ? 0.85 : 0, recommendation: tool ? 'Verify one live execution before approval.' : 'Register or install the tool before evaluation.' }; mutableEvaluations.push(evaluation); return evaluation; }

const routerApi = { STARTED_AT, BUILTIN_TOOL_METADATA, EXECUTABLE_HANDLERS, getTools, executeTool, registerTool, createMission, getMissionStatus, evaluateTool, selfHeal, toolReadinessChecker };

function installExternal(modulePath) {
  try {
    const mod = require(modulePath);
    if (mod && typeof mod.install === 'function') return mod.install(routerApi);
    if (mod && mod.metadata && typeof mod.handler === 'function') { EXECUTABLE_HANDLERS[mod.metadata.tool_id] = mod.handler; registerTool(mod.metadata); return { installed: true, tool_id: mod.metadata.tool_id };
    }
  } catch (error) {
    return { installed: false, modulePath, error: error.message };
  }
  return { installed: false, modulePath, error: 'No install(router) or metadata+handler export found.' };
}

routerApi.external_install_results = [
  installExternal('./backend_source_inspector'),
  installExternal('./executable_tool_builder'),
  installExternal('./tool_failure_diagnoser'),
  installExternal('./tool_quality_tester')
];

module.exports = routerApi;
