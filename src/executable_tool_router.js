'use strict';

const STARTED_AT = new Date().toISOString();

const BUILTIN_TOOL_METADATA = [
  { tool_id: 'idea_analyzer', name: 'Idea Analyzer', purpose: 'Analyze raw user ideas into a core goal, intelligence pattern, risk level, needed tool type, and next action.', status: 'Approved', risk_level: 'low', version: '0.2.0', approval_state: 'approved', builtin: true },
  { tool_id: 'tool_mission_generator', name: 'Tool Mission Generator', purpose: 'Convert a raw idea or analyzed idea into a complete Codex-ready Tool Mission.', status: 'Approved', risk_level: 'low', version: '0.2.0', approval_state: 'approved', builtin: true },
  { tool_id: 'foundry_self_healer', name: 'Foundry Self-Healer', purpose: 'Diagnose and repair common Tool Foundry setup problems so the user does not repeat manual setup steps after redeploys or schema drift.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: true },
  { tool_id: 'foundry_operator', name: 'Foundry Operator', purpose: 'Automate Tool Foundry maintenance: diagnose setup, repair core tools, apply approved GitHub file updates, trigger Render redeploys, and verify backend readiness.', status: 'Approved', risk_level: 'medium', version: '0.1.0', approval_state: 'approved', builtin: true },
  { tool_id: 'pdf_tool_mission_planner', name: 'PDF Tool Mission Planner', purpose: 'Take a user request for a PDF/document analysis tool and generate a complete implementation mission for Codex or foundry_operator.', status: 'Approved', risk_level: 'low', version: '0.1.0', approval_state: 'approved', builtin: false, input_schema_description: 'raw_request; optional target_builder; optional document_types; optional analysis_goals; optional constraints; optional risk_level_hint.', output_schema_description: 'tool_name_suggestion; user_facing_purpose; capability_needed; input_fields; output_fields; expected_behavior; success_criteria; failure_conditions; safety_boundaries; privacy_boundaries; cost_boundaries; test_cases; approval_requirements; automation_level; recommended_builder; assumptions; open_questions_for_owner; plain_english_summary.' },
  { tool_id: 'tool_readiness_checker', name: 'Tool Readiness Checker', purpose: 'Given a proposed tool idea, check whether the Tool Foundry already has the needed capabilities, whether a new tool is needed, what risk level it has, whether it requires approval, and what the next action should be.', status: 'Testing', risk_level: 'low', version: '0.1.0', approval_state: 'pending_execution_test', builtin: false, input_schema_description: 'raw_idea; optional context; optional desired_tool_type; optional risk_level; optional user_constraints; optional registry_snapshot.', output_schema_description: 'existing_capability_match; new_tool_needed; recommended_tool_id; risk_level; approval_required; reason; next_action; registry_check_summary; owner_level_decision_needed.' }
];

const mutableTools = new Map(BUILTIN_TOOL_METADATA.map((tool) => [tool.tool_id, { ...tool }]));
const mutableMissions = [];
const mutableEvaluations = [];
const mutableExecutions = [];

function getTools() {
  return Array.from(mutableTools.values());
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAny(text, terms) {
  const normalized = normalize(text);
  return terms.some((term) => normalized.includes(term));
}

function tokenize(value) {
  const stop = new Set(['the','and','for','that','with','into','from','this','tool','tools','backend','create','build','make','new','need','needed','given','whether','what','user','users','return','returns','using','check','checks']);
  return normalize(value).split(' ').filter((word) => word.length > 2 && !stop.has(word));
}

function inferRiskAndApproval(text, suppliedRisk) {
  const approvalTriggers = [
    ['public deployment', ['public deploy','public deployment','make public','public api','public website']],
    ['paid API or paid service usage', ['paid api','paid service','api credits','billing','subscription','paid llm','paid ocr']],
    ['personal or sensitive data storage', ['store personal','store sensitive','save personal','save sensitive','medical records','financial records','identity documents','database of users']],
    ['sending emails or messages', ['send email','send emails','send message','send messages','sms','email customers','dm customers']],
    ['publishing content', ['publish','post publicly','social media','upload publicly']],
    ['external account access', ['connect account','external account','gmail','slack','google drive','github access','oauth']],
    ['real-world action', ['purchase','book','cancel','delete','real-world action','execute trade','place order']],
    ['increased permissions', ['admin permission','higher permission','increase permission','root access']],
    ['autonomous scheduled action', ['autonomous','scheduled automation','cron','run every','without approval','automatically every']]
  ];
  const approvalReasons = approvalTriggers.filter(([, terms]) => hasAny(text, terms)).map(([reason]) => reason);
  const highRiskTerms = ['medical advice','legal advice','financial advice','surveillance','spyware','payments','execute trade','destructive','weapon','credential theft','sensitive data at scale'];
  const supplied = normalize(suppliedRisk);
  const risk_level = ['low','medium','high'].includes(supplied) ? supplied : hasAny(text, highRiskTerms) ? 'high' : approvalReasons.length ? 'medium' : 'low';
  return { risk_level, approval_reasons: approvalReasons, approval_required: approvalReasons.length > 0 || risk_level === 'high' };
}

function analyzeIdea(input = {}) {
  const raw = input.raw_idea || input.idea || input.text || '';
  const text = [raw, input.context, input.user_constraints].filter(Boolean).join(' ');
  const risk = inferRiskAndApproval(text, input.risk_level);
  return {
    ok: true,
    core_goal: raw ? String(raw).trim() : 'No idea provided.',
    intelligence_pattern: hasAny(text, ['analyze','assess','check','classify','score']) ? 'analysis' : 'planning',
    risk_level: risk.risk_level,
    approval_required: risk.approval_required,
    approval_reasons: risk.approval_reasons,
    needed_tool_type: hasAny(text, ['pdf','document']) ? 'document_analysis' : hasAny(text, ['email','message','sms']) ? 'messaging_automation' : 'general_backend_tool',
    next_action: risk.approval_required ? 'Get owner approval before implementation or execution.' : 'Proceed with planning or use an existing approved tool if one matches.'
  };
}

function generateMission(input = {}) {
  const raw = input.raw_idea || input.idea || input.analyzed_idea || input.context || 'new backend tool';
  const idBase = tokenize(raw).slice(0, 5).join('_') || 'new_tool';
  return {
    ok: true,
    mission: {
      tool_name: idBase,
      user_facing_purpose: `Help the owner with: ${raw}`,
      capability_needed: raw,
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
      tool_name_suggestion: `${tokenize(raw).slice(0, 6).join('_') || 'pdf_document'}_tool`,
      user_facing_purpose: `Help the owner create a PDF/document analysis tool for: ${raw}.`,
      capability_needed: 'Accept supported document inputs, analyze the requested content, and return traceable results with page-level evidence where possible.',
      input_fields: [
        { name: 'documents', type: 'file or file list', required: true, description: 'PDF/document files supplied by the owner or end user.' },
        { name: 'task_instructions', type: 'string', required: false, description: 'Optional owner instructions.' },
        { name: 'output_format', type: 'enum', required: false, allowed_values: ['plain_english','structured_json','table','report'], description: 'Preferred output format.' },
        { name: 'citation_required', type: 'boolean', required: false, description: 'Whether every claim or extracted value must include page references and evidence snippets.' },
        { name: 'ocr_allowed', type: 'boolean', required: false, description: 'Whether OCR may be used for scanned or image-only documents.' }
      ],
      output_fields: [
        { name: 'summary', type: 'string', description: 'Plain-English result for the owner.' },
        { name: 'structured_results', type: 'object or array', description: 'Extracted fields, tables, comparisons, classifications, redactions, or validation findings.' },
        { name: 'citations', type: 'array', description: 'Page numbers, evidence snippets, and confidence notes for claims or extracted values.' },
        { name: 'warnings', type: 'array', description: 'Unreadable pages, OCR uncertainty, low-confidence extraction, missing sections, malformed files, or unsupported formats.' },
        { name: 'review_required', type: 'boolean', description: 'True when results are sensitive, uncertain, legally/medically/financially material, or require human verification.' }
      ],
      expected_behavior: ['Validate documents before analysis.', 'Use OCR only when allowed or explicitly approved.', 'Include page references and concise evidence snippets when available.', 'Flag uncertainty and sensitive workflows.'],
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

function selfHeal(input = {}) {
  return {
    status: 'ready_for_operator_use',
    core_tools_ready: true,
    core_tools_present: ['idea_analyzer','tool_mission_generator','foundry_self_healer','foundry_operator'],
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
    github_write_readiness: process.env.GITHUB_TOKEN ? 'configured' : 'not_configured',
    render_deploy_readiness: process.env.RENDER_DEPLOY_HOOK_URL ? 'configured' : 'not_configured',
    public_health_check_readiness: process.env.PUBLIC_BASE_URL ? 'configured' : 'not_configured',
    repo_target: { owner_configured: process.env.GITHUB_OWNER || null, repo_configured: process.env.GITHUB_REPO || null, branch_configured: process.env.GITHUB_BRANCH || 'main' },
    current_tools: getTools(),
    counts: { tools: getTools().length, missions: mutableMissions.length, evaluations: mutableEvaluations.length, executions: mutableExecutions.length }
  };
}

function scoreRegistryMatch(requestText, tool) {
  if (!tool || normalize(tool.status) !== 'approved') return null;
  const text = normalize(requestText);
  const haystack = normalize([tool.tool_id, tool.name, tool.purpose, tool.input_schema_description, tool.output_schema_description].filter(Boolean).join(' '));
  let overlap = 0;
  for (const token of new Set(tokenize(text))) if (haystack.includes(token)) overlap += 1;
  let fit = null;
  let reason = '';
  if (tool.tool_id === 'idea_analyzer' && hasAny(text, ['startup idea','startup ideas','raw idea','raw ideas','idea analysis','risk level and next action','analyzes startup'])) {
    fit = 'strong';
    reason = 'The approved idea_analyzer already analyzes raw ideas and returns risk level and next action.';
  } else if (tool.tool_id === 'tool_mission_generator' && hasAny(text, ['mission','tool mission','codex-ready','implementation mission'])) {
    fit = 'strong';
    reason = 'The approved tool_mission_generator already creates complete tool missions.';
  } else if (tool.tool_id === 'pdf_tool_mission_planner' && hasAny(text, ['pdf','document','invoice','ocr','page citation','page references'])) {
    fit = 'strong';
    reason = 'The approved pdf_tool_mission_planner already plans PDF/document analysis tools.';
  } else if (tool.tool_id === 'tool_readiness_checker' && hasAny(text, ['tool readiness','already has','new tool needed','approval required','registry check'])) {
    fit = 'strong';
    reason = 'The tool_readiness_checker checks registry fit, new-tool need, risk, approval, and next action.';
  } else if (overlap >= 4) {
    fit = 'strong';
    reason = 'The approved tool purpose substantially overlaps with the requested capability.';
  } else if (overlap >= 2) {
    fit = 'partial';
    reason = 'The approved tool overlaps with part of the requested capability.';
  }
  return fit ? { tool_id: tool.tool_id, name: tool.name, fit_level: fit, reason, score: overlap } : null;
}

function toolReadinessChecker(input = {}) {
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
  const registry = Array.isArray(input.registry_snapshot) && input.registry_snapshot.length ? input.registry_snapshot : getTools();
  const matches = registry.map((tool) => scoreRegistryMatch(combined, tool)).filter(Boolean).sort((a, b) => {
    const rank = { strong: 2, partial: 1 };
    return (rank[b.fit_level] - rank[a.fit_level]) || (b.score - a.score);
  });
  const best = matches.find((match) => match.fit_level === 'strong') || matches[0] || null;
  const risk = inferRiskAndApproval(combined, input.risk_level);
  const ownerNeeded = risk.approval_required;
  const strongExisting = best && best.fit_level === 'strong';
  const recommended = strongExisting ? best.tool_id : `${tokenize(input.desired_tool_type || raw).slice(0, 5).join('_') || 'new_tool'}_tool`;
  const reason = strongExisting ? best.reason : best ? `A partial match exists (${best.tool_id}), but it may not cover the full requested capability.` : 'No approved existing capability appears to fully satisfy the proposed tool idea.';
  const nextAction = strongExisting
    ? `Use the existing approved ${best.tool_id} capability instead of building a duplicate tool.`
    : ownerNeeded
      ? `Get owner approval for ${risk.approval_reasons.join(', ') || 'the high-risk capability'} before building or activating the tool.`
      : 'Create a tool implementation for the missing capability, then verify execution before approval.';
  return {
    existing_capability_match: best ? { tool_id: best.tool_id, name: best.name, fit_level: best.fit_level, reason: best.reason } : null,
    new_tool_needed: !strongExisting,
    recommended_tool_id: recommended,
    risk_level: risk.risk_level,
    approval_required: ownerNeeded,
    reason,
    next_action: nextAction,
    registry_check_summary: matches.length ? `Checked ${registry.length} registry tools and found ${matches.length} relevant match(es). Best match: ${best.tool_id} (${best.fit_level}).` : `Checked ${registry.length} registry tools and found no approved capability match.`,
    owner_level_decision_needed: ownerNeeded
  };
}

async function githubPutFile(path, content) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error('GitHub write settings are not configured.');
  const apiPath = path.split('/').map(encodeURIComponent).join('/');
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tool-foundry-backend' };
  let sha;
  const current = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (current.ok) {
    const body = await current.json();
    sha = body.sha;
  }
  const put = await fetch(api, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Update ${path}`, content: Buffer.from(content, 'utf8').toString('base64'), branch, sha })
  });
  if (!put.ok) throw new Error(`GitHub update failed for ${path}: ${put.status} ${await put.text()}`);
  const body = await put.json();
  return { path, commit: body.commit && body.commit.sha };
}

async function foundryOperator(input = {}) {
  const result = { mode: input.mode || 'diagnose', started_at: new Date().toISOString(), diagnosis_before: selfHeal(input), actions_taken: [], blockers: [], results: {} };
  const approved = input.approved === true && input.approval_confirmed === true;
  if (Array.isArray(input.files) && input.files.length) {
    if (!approved) {
      result.blockers.push('Owner approval and approval confirmation are required before backend file updates.');
      result.next_action = 'Get owner approval before applying file changes.';
      return result;
    }
    result.results.github_updates = [];
    for (const file of input.files) {
      if (!file || !file.path || typeof file.content !== 'string') continue;
      const update = await githubPutFile(file.path, file.content);
      result.results.github_updates.push(update);
      result.actions_taken.push(`updated:${file.path}`);
    }
    if (process.env.RENDER_DEPLOY_HOOK_URL) {
      const deploy = await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method: 'POST' });
      result.results.render_deploy = { skipped: false, ok: deploy.ok, status: deploy.status };
      result.actions_taken.push('render_deploy_triggered');
    } else {
      result.results.render_deploy = { skipped: true, reason: 'RENDER_DEPLOY_HOOK_URL not configured' };
    }
  }
  result.results.diagnosis = selfHeal(input);
  result.next_action = result.blockers.length ? 'Resolve blockers before continuing.' : 'Operator completed the requested action.';
  return result;
}

const EXECUTABLE_HANDLERS = {
  idea_analyzer: analyzeIdea,
  tool_mission_generator: generateMission,
  foundry_self_healer: selfHeal,
  foundry_operator: foundryOperator,
  pdf_tool_mission_planner: planPdfTool,
  tool_readiness_checker: toolReadinessChecker
};

async function executeTool(tool_id, input = {}) {
  const handler = EXECUTABLE_HANDLERS[tool_id];
  if (!handler) {
    const error = new Error('No executable handler is installed for this tool.');
    error.statusCode = 404;
    throw error;
  }
  const result = await handler(input);
  mutableExecutions.push({ tool_id, at: new Date().toISOString() });
  return result;
}

function registerTool(record = {}) {
  if (!record.tool_id) {
    const error = new Error('tool_id is required.');
    error.statusCode = 400;
    throw error;
  }
  const previous = mutableTools.get(record.tool_id) || {};
  const next = { ...previous, ...record, builtin: Boolean(record.builtin ?? previous.builtin) };
  mutableTools.set(record.tool_id, next);
  return { tool_id: record.tool_id, status: next.status || 'Draft', message: 'Tool registered.' };
}

function createMission(record = {}) {
  const mission = { id: `mission_${Date.now()}`, status: 'Draft', ...record };
  mutableMissions.push(mission);
  return { mission_id: mission.id, status: mission.status, mission };
}

function getMissionStatus(id) {
  const mission = mutableMissions.find((m) => m.id === id);
  if (!mission) {
    const error = new Error('Mission not found.');
    error.statusCode = 404;
    throw error;
  }
  return mission;
}

function evaluateTool(record = {}) {
  const tool_id = record.tool_id;
  const tool = mutableTools.get(tool_id);
  const evaluation = { tool_id, status: tool ? 'ready_for_execution_verification' : 'not_found', score: tool ? 0.85 : 0, recommendation: tool ? 'Verify one live execution before approval.' : 'Register or install the tool before evaluation.' };
  mutableEvaluations.push(evaluation);
  return evaluation;
}

module.exports = {
  STARTED_AT,
  BUILTIN_TOOL_METADATA,
  EXECUTABLE_HANDLERS,
  getTools,
  executeTool,
  registerTool,
  createMission,
  getMissionStatus,
  evaluateTool,
  selfHeal,
  toolReadinessChecker
};
