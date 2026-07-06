const express = require('express');

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 3000;
const STARTED_AT = new Date().toISOString();

const tools = [
  { tool_id: 'idea_analyzer', name: 'Idea Analyzer', purpose: 'Analyze raw user ideas into a core goal, intelligence pattern, risk level, needed tool type, and next action.', status: 'Approved', risk_level: 'low', version: '0.2.0', approval_state: 'approved', builtin: true },
  { tool_id: 'tool_mission_generator', name: 'Tool Mission Generator', purpose: 'Convert a raw idea or analyzed idea into a complete Codex-ready Tool Mission.', status: 'Approved', risk_level: 'low', version: '0.2.0', approval_state: 'approved', builtin: true },
  { tool_id: 'foundry_self_healer', name: 'Foundry Self-Healer', purpose: 'Diagnose and repair common Tool Foundry setup problems so the user does not repeat manual setup steps after redeploys or schema drift.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: true },
  { tool_id: 'foundry_operator', name: 'Foundry Operator', purpose: 'Automate Tool Foundry maintenance: diagnose setup, repair core tools, apply approved GitHub file updates, trigger Render redeploys, and verify backend readiness.', status: 'Approved', risk_level: 'medium', version: '0.1.0', approval_state: 'approved', builtin: true },
  { tool_id: 'pdf_tool_mission_planner', name: 'PDF Tool Mission Planner', purpose: 'Take a user request for a PDF/document analysis tool and generate a complete implementation mission for Codex or foundry_operator.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: false, input_schema_description: 'raw_request; optional target_builder; optional document_types; optional analysis_goals; optional constraints; optional risk_level_hint.', output_schema_description: 'tool_name_suggestion; user_facing_purpose; capability_needed; input_fields; output_fields; expected_behavior; success_criteria; failure_conditions; safety_boundaries; privacy_boundaries; cost_boundaries; test_cases; approval_requirements; automation_level; recommended_builder; assumptions; open_questions_for_owner; plain_english_summary.' },
  { tool_id: 'tool_readiness_checker', name: 'Tool Readiness Checker', purpose: 'Given a proposed tool idea, check whether the Tool Foundry already has the needed capabilities, whether a new tool is needed, what risk level it has, whether it requires approval, and what the next action should be.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: false, input_schema_description: 'raw_idea; optional context; optional desired_tool_type; optional risk_level; optional user_constraints; optional registry_snapshot.', output_schema_description: 'existing_capability_match; new_tool_needed; recommended_tool_id; risk_level; approval_required; reason; next_action; registry_check_summary; owner_level_decision_needed.' }
];

const missions = [];
const evaluations = [];
const executions = [];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAny(text, terms) {
  const n = normalize(text);
  return terms.some((term) => n.includes(term));
}

function tokens(value) {
  const stop = new Set(['the','and','for','that','with','into','from','this','tool','tools','backend','create','build','make','new','need','needed','given','whether','what','user','users']);
  return normalize(value).split(' ').filter((word) => word.length > 2 && !stop.has(word));
}

function ok(res, body) { return res.status(200).json(body); }
function fail(res, status, message, details) { return res.status(status).json({ ok: false, error: message, details }); }

function currentRegistry() { return tools.slice(); }

function analyzeIdea(input = {}) {
  const raw = input.raw_idea || input.idea || input.text || '';
  const text = normalize(raw);
  const approvalTerms = ['send email','send message','publish','public deploy','paid api','store sensitive','store personal','external account','delete','purchase','payment','autonomous','schedule'];
  const highTerms = ['medical','legal','financial advice','surveillance','spyware','weapon','credential','password','payments','execute trade'];
  const approvalRequired = approvalTerms.some((term) => text.includes(term));
  const risk = highTerms.some((term) => text.includes(term)) ? 'high' : approvalRequired ? 'medium' : 'low';
  return {
    ok: true,
    core_goal: raw ? String(raw).trim() : 'No idea provided.',
    intelligence_pattern: text.includes('analyze') || text.includes('check') ? 'analysis' : 'planning',
    risk_level: risk,
    needed_tool_type: text.includes('pdf') ? 'document_analysis' : text.includes('email') ? 'messaging_automation' : 'general_backend_tool',
    approval_required: approvalRequired || risk === 'high',
    next_action: approvalRequired || risk === 'high' ? 'Get owner approval before implementation or execution.' : 'Proceed with planning or use an existing approved tool if one matches.'
  };
}

function generateMission(input = {}) {
  const raw = input.raw_idea || input.idea || input.analyzed_idea || input.context || '';
  const idBase = tokens(raw).slice(0, 5).join('_') || 'new_tool';
  return {
    ok: true,
    mission: {
      tool_name: idBase,
      user_facing_purpose: `Help the owner with: ${raw || 'the requested tool capability'}`,
      capability_needed: raw || 'Missing capability to be defined by the owner.',
      input_fields: ['raw_idea', 'context', 'user_constraints'],
      output_fields: ['result', 'risk_level', 'approval_required', 'next_action'],
      success_criteria: ['Returns structured output.', 'Respects approval and privacy boundaries.', 'Handles missing input clearly.'],
      failure_conditions: ['Fabricates results.', 'Bypasses approval requirements.', 'Requires the owner to write code.'],
      safety_boundaries: ['No unsafe, illegal, or abusive tooling.', 'No real-world side effects without approval.'],
      privacy_boundaries: ['No credential collection.', 'No persistent sensitive data storage without approval.'],
      cost_boundaries: ['No paid API usage without approval.'],
      test_cases: ['Valid low-risk idea returns a next action.', 'Approval-gated idea returns approval_required true.'],
      approval_requirements: ['Required for public deployment, paid APIs, sensitive storage, messaging, publishing, external accounts, real-world actions, increased permissions, or autonomous scheduling.']
    }
  };
}

function planPdfTool(input = {}) {
  const raw = input.raw_request || input.raw_idea || 'PDF/document analysis tool';
  return {
    ok: true,
    mission: {
      tool_name_suggestion: `${tokens(raw).slice(0, 6).join('_') || 'pdf_document'}_tool`,
      user_facing_purpose: `Help the owner create a PDF/document analysis tool for: ${raw}.`,
      capability_needed: 'Accept supported document inputs, analyze the requested content, and return traceable results with page-level evidence where possible.',
      input_fields: [
        { name: 'documents', type: 'file or file list', required: true, description: 'PDF/document files supplied by the owner or end user.' },
        { name: 'task_instructions', type: 'string', required: false, description: 'Optional owner instructions.' },
        { name: 'citation_required', type: 'boolean', required: false, description: 'Whether claims need page references.' }
      ],
      output_fields: [
        { name: 'summary', type: 'string' },
        { name: 'structured_results', type: 'object or array' },
        { name: 'citations', type: 'array' },
        { name: 'warnings', type: 'array' },
        { name: 'review_required', type: 'boolean' }
      ],
      expected_behavior: ['Validate files before analysis.', 'Include citations when source text is available.', 'Flag uncertainty and sensitive workflows.'],
      success_criteria: ['Useful document-analysis output.', 'Page references when available.', 'Privacy protection by default.'],
      failure_conditions: ['Fabricates content or citations.', 'Stores documents without approval.', 'Overclaims high-stakes advice.'],
      safety_boundaries: ['No fraud, doxxing, forgery, or illegal use.'],
      privacy_boundaries: ['Default to no persistent document storage.'],
      cost_boundaries: ['Require approval before paid OCR, paid LLMs, or paid storage.'],
      test_cases: [{ name: 'Text PDF summary with citations', expected: 'Summary includes page references.' }],
      approval_requirements: { requires_owner_confirmation: ['Persistent storage', 'Third-party APIs', 'paid services', 'public deployment', 'external account connections', 'publishing outputs'] },
      automation_level: 'Mission planning may run automatically. Real document processing and external actions require approval.',
      recommended_builder: 'Codex',
      assumptions: ['PDF support first.'],
      open_questions_for_owner: [],
      plain_english_summary: `This mission plans a safe PDF/document-analysis tool for: ${raw}.`,
      source_request: raw,
      generated_at: new Date().toISOString(),
      mission_source: 'pdf_tool_mission_planner'
    }
  };
}

function scoreRegistryMatch(requestText, tool) {
  if (!tool || normalize(tool.status) !== 'approved') return null;
  const text = normalize(requestText);
  const haystack = normalize([tool.tool_id, tool.name, tool.purpose, tool.input_schema_description, tool.output_schema_description].filter(Boolean).join(' '));
  let overlap = 0;
  for (const token of new Set(tokens(text))) if (haystack.includes(token)) overlap += 1;
  let fit = null;
  let reason = '';
  if (tool.tool_id === 'idea_analyzer' && hasAny(text, ['startup idea','startup ideas','raw idea','raw ideas','idea analysis','risk level and next action','analyzes startup'])) {
    fit = 'strong';
    reason = 'The approved idea_analyzer already analyzes raw ideas and returns risk level and next action.';
  } else if (tool.tool_id === 'tool_mission_generator' && hasAny(text, ['mission','tool mission','codex-ready','implementation mission'])) {
    fit = 'strong';
    reason = 'The approved tool_mission_generator already creates complete tool missions.';
  } else if (tool.tool_id === 'pdf_tool_mission_planner' && hasAny(text, ['pdf','document','invoice','ocr','page citation'])) {
    fit = 'strong';
    reason = 'The approved pdf_tool_mission_planner already plans PDF/document analysis tools.';
  } else if (tool.tool_id === 'tool_readiness_checker' && hasAny(text, ['tool readiness','already has','new tool needed','approval required','registry check'])) {
    fit = 'strong';
    reason = 'The approved tool_readiness_checker checks registry fit, new-tool need, risk, approval, and next action.';
  } else if (overlap >= 4) {
    fit = 'strong';
    reason = 'The approved tool purpose substantially overlaps with the requested capability.';
  } else if (overlap >= 2) {
    fit = 'partial';
    reason = 'The approved tool overlaps with part of the requested capability.';
  }
  return fit ? { tool_id: tool.tool_id, name: tool.name, fit_level: fit, reason, score: overlap } : null;
}

function readinessCheck(input = {}) {
  const raw = typeof input.raw_idea === 'string' ? input.raw_idea.trim() : '';
  if (!raw) {
    return {
      existing_capability_match: null,
      new_tool_needed: false,
      recommended_tool_id: null,
      risk_level: normalize(input.risk_level) || 'low',
      approval_required: false,
      reason: 'input.raw_idea is required before readiness can be checked.',
      next_action: 'Provide input.raw_idea and run the checker again.',
      registry_check_summary: 'Registry check skipped because raw_idea was missing.',
      owner_level_decision_needed: false
    };
  }
  const combined = [input.raw_idea, input.context, input.desired_tool_type, input.user_constraints].filter(Boolean).join(' ');
  const registry = Array.isArray(input.registry_snapshot) && input.registry_snapshot.length ? input.registry_snapshot : currentRegistry();
  const matches = registry.map((tool) => scoreRegistryMatch(combined, tool)).filter(Boolean).sort((a, b) => {
    const rank = { strong: 2, partial: 1 };
    return (rank[b.fit_level] - rank[a.fit_level]) || (b.score - a.score);
  });
  const best = matches.find((m) => m.fit_level === 'strong') || matches[0] || null;
  const approvalTriggers = [
    ['public deployment', ['public deploy','public deployment','make public','public api']],
    ['paid API or paid service usage', ['paid api','paid service','api credits','billing','subscription']],
    ['personal or sensitive data storage', ['store personal','store sensitive','save personal','save sensitive','medical records','financial records','identity documents']],
    ['sending emails or messages', ['send email','send emails','send message','send messages','sms','email customers']],
    ['publishing content', ['publish','post publicly','social media']],
    ['external account access', ['connect account','external account','gmail','slack','google drive','oauth']],
    ['real-world action', ['purchase','book','cancel','delete','real-world action','execute trade']],
    ['increased permissions', ['admin permission','higher permission','root access']],
    ['autonomous scheduled action', ['autonomous','scheduled automation','cron','run every','without approval']]
  ];
  const approvalReasons = approvalTriggers.filter(([, terms]) => hasAny(combined, terms)).map(([label]) => label);
  const suppliedRisk = normalize(input.risk_level);
  const highRisk = hasAny(combined, ['medical advice','legal advice','financial advice','surveillance','spyware','payments','execute trade','destructive','sensitive data at scale']);
  const riskLevel = ['low','medium','high'].includes(suppliedRisk) ? suppliedRisk : highRisk ? 'high' : approvalReasons.length ? 'medium' : 'low';
  const ownerNeeded = approvalReasons.length > 0 || riskLevel === 'high';
  const strong = best && best.fit_level === 'strong';
  const newNeeded = !strong;
  const recommended = strong ? best.tool_id : `${tokens(input.desired_tool_type || raw).slice(0, 5).join('_') || 'new_tool'}_tool`;
  const reason = strong ? best.reason : best ? `A partial match exists (${best.tool_id}), but it may not cover the full requested capability.` : 'No approved existing capability appears to fully satisfy the proposed tool idea.';
  const next = strong
    ? `Use the existing approved ${best.tool_id} capability instead of building a duplicate tool.`
    : ownerNeeded
      ? `Get owner approval for ${approvalReasons.join(', ') || 'the high-risk capability'} before building or activating the tool.`
      : 'Create or repair a tool for the missing capability, then verify execution before approval.';
  return {
    existing_capability_match: best ? { tool_id: best.tool_id, name: best.name, fit_level: best.fit_level, reason: best.reason } : null,
    new_tool_needed: newNeeded,
    recommended_tool_id: recommended,
    risk_level: riskLevel,
    approval_required: ownerNeeded,
    reason,
    next_action: next,
    registry_check_summary: matches.length ? `Checked ${registry.length} registry tools and found ${matches.length} relevant match(es). Best match: ${best.tool_id} (${best.fit_level}).` : `Checked ${registry.length} registry tools and found no approved capability match.`,
    owner_level_decision_needed: ownerNeeded
  };
}

function selfHeal(input = {}) {
  return {
    status: 'ready_for_operator_use',
    core_tools_ready: true,
    core_tools_present: tools.filter((t) => t.builtin).map((t) => t.tool_id),
    missing_core_tools: [],
    configured_values: {
      API_KEY: Boolean(process.env.API_KEY),
      GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN),
      GITHUB_OWNER: Boolean(process.env.GITHUB_OWNER),
      GITHUB_REPO: Boolean(process.env.GITHUB_REPO),
      GITHUB_BRANCH: Boolean(process.env.GITHUB_BRANCH),
      RENDER_DEPLOY_HOOK_URL: Boolean(process.env.RENDER_DEPLOY_HOOK_URL),
      PUBLIC_BASE_URL: Boolean(process.env.PUBLIC_BASE_URL)
    },
    current_tools: currentRegistry(),
    counts: { tools: tools.length, missions: missions.length, evaluations: evaluations.length, executions: executions.length }
  };
}

async function githubPutFile(path, content) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error('GitHub write settings are not configured.');
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  let sha;
  const current = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tool-foundry-backend' } });
  if (current.ok) {
    const body = await current.json();
    sha = body.sha;
  }
  const put = await fetch(api, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'tool-foundry-backend' },
    body: JSON.stringify({ message: `Update ${path}`, content: Buffer.from(content, 'utf8').toString('base64'), branch, sha })
  });
  if (!put.ok) throw new Error(`GitHub update failed for ${path}: ${put.status} ${await put.text()}`);
  const body = await put.json();
  return { path, commit: body.commit && body.commit.sha };
}

async function foundryOperator(input = {}) {
  const result = { mode: input.mode || 'diagnose', started_at: new Date().toISOString(), diagnosis_before: selfHeal(input), actions_taken: [], blockers: [], results: {} };
  const allowed = input.approved === true && input.approval_confirmed === true;
  if (Array.isArray(input.files) && input.files.length) {
    if (!allowed) {
      result.blockers.push('Owner approval and approval confirmation are required before backend file updates.');
      result.next_action = 'Get owner approval before applying file changes.';
      return result;
    }
    const updates = [];
    for (const file of input.files) {
      if (!file || !file.path || typeof file.content !== 'string') continue;
      const update = await githubPutFile(file.path, file.content);
      updates.push(update);
      result.actions_taken.push(`updated:${file.path}`);
    }
    result.results.github_updates = updates;
    if (process.env.RENDER_DEPLOY_HOOK_URL) {
      const deploy = await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method: 'POST' });
      result.results.render_deploy = { skipped: false, ok: deploy.ok, status: deploy.status };
      result.actions_taken.push('render_deploy_triggered');
    }
  }
  result.results.diagnosis = selfHeal(input);
  result.next_action = result.blockers.length ? 'Resolve blockers before continuing.' : 'Operator completed the requested action.';
  return result;
}

const handlers = {
  idea_analyzer: analyzeIdea,
  tool_mission_generator: generateMission,
  foundry_self_healer: selfHeal,
  foundry_operator: foundryOperator,
  pdf_tool_mission_planner: planPdfTool,
  tool_readiness_checker: readinessCheck
};

app.get('/', (req, res) => ok(res, { service: 'tool-foundry-backend', status: 'ok' }));
app.get('/health', (req, res) => ok(res, { status: 'ok', service: 'tool-foundry-backend', timestamp: new Date().toISOString(), started_at: STARTED_AT, tools: tools.length, missions: missions.length }));
app.get('/tools/list', (req, res) => ok(res, { tools: currentRegistry() }));
app.post('/tools/list', (req, res) => ok(res, { tools: currentRegistry() }));

app.post('/tools/register', (req, res) => {
  const tool = req.body || {};
  if (!tool.tool_id) return fail(res, 400, 'tool_id is required.');
  const idx = tools.findIndex((t) => t.tool_id === tool.tool_id);
  const record = { ...tool, builtin: false };
  if (idx >= 0) tools[idx] = { ...tools[idx], ...record };
  else tools.push(record);
  ok(res, { tool_id: tool.tool_id, status: record.status || 'Draft', message: 'Tool registered.' });
});

app.post('/tools/mission/create', (req, res) => {
  const mission = { id: `mission_${Date.now()}`, status: 'Draft', ...(req.body || {}) };
  missions.push(mission);
  ok(res, { mission_id: mission.id, status: mission.status, mission });
});

app.get('/tools/mission/:id/status', (req, res) => {
  const mission = missions.find((m) => m.id === req.params.id);
  if (!mission) return fail(res, 404, 'Mission not found.');
  ok(res, mission);
});

app.post('/tools/evaluate', (req, res) => {
  const tool_id = req.body && req.body.tool_id;
  const tool = tools.find((t) => t.tool_id === tool_id);
  const evaluation = { tool_id, status: tool ? 'ready_for_approval_review' : 'not_found', score: tool ? 0.85 : 0, recommendation: tool ? 'Verify one live execution before approval.' : 'Register or install the tool before evaluation.' };
  evaluations.push(evaluation);
  ok(res, evaluation);
});

app.post('/tools/execute', async (req, res) => {
  try {
    const body = req.body || {};
    const toolId = body.tool_id;
    const input = body.input || {};
    if (!toolId) return fail(res, 400, 'tool_id is required.');
    const handler = handlers[toolId];
    if (!handler) return fail(res, 404, 'No executable handler is installed for this tool.');
    const result = await handler(input, currentRegistry());
    executions.push({ tool_id: toolId, at: new Date().toISOString() });
    ok(res, { tool_id: toolId, result, summary: `${tools.find((t) => t.tool_id === toolId)?.name || toolId} completed.`, warnings: [] });
  } catch (error) {
    fail(res, 500, error.message || 'Execution failed.');
  }
});

app.use((req, res) => fail(res, 404, 'Not found.'));

app.listen(PORT, () => {
  console.log(`tool-foundry-backend listening on ${PORT}`);
});
