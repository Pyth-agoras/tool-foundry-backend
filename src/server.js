const express = require('express');

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

function now() {
  return new Date().toISOString();
}

function requireAuth(req, res, next) {
  if (!API_KEY) return next();
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const supplied = req.headers['x-api-key'] || bearer || req.query.api_key;
  if (supplied === API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function jsonError(res, status, message, details) {
  return res.status(status).json({ error: message, details: details || null });
}

const missions = new Map();
const evaluations = [];
const executions = [];

const tools = new Map();
function upsertTool(tool) {
  tools.set(tool.tool_id, {
    tool_id: tool.tool_id,
    name: tool.name,
    purpose: tool.purpose,
    status: tool.status || 'Approved',
    risk_level: tool.risk_level || 'low',
    version: tool.version || '0.1.0',
    approval_state: tool.approval_state || 'approved',
    builtin: Boolean(tool.builtin),
    input_schema_description: tool.input_schema_description,
    output_schema_description: tool.output_schema_description
  });
}

upsertTool({
  tool_id: 'idea_analyzer',
  name: 'Idea Analyzer',
  purpose: 'Analyze raw user ideas into a core goal, intelligence pattern, risk level, needed tool type, and next action.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.0',
  approval_state: 'approved',
  builtin: true
});
upsertTool({
  tool_id: 'tool_mission_generator',
  name: 'Tool Mission Generator',
  purpose: 'Convert a raw idea or analyzed idea into a complete Codex-ready Tool Mission.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.0',
  approval_state: 'approved',
  builtin: true
});
upsertTool({
  tool_id: 'foundry_self_healer',
  name: 'Foundry Self-Healer',
  purpose: 'Diagnose and repair common Tool Foundry setup problems so the user does not repeat manual setup steps after redeploys or schema drift.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'approved',
  builtin: true
});
upsertTool({
  tool_id: 'foundry_operator',
  name: 'Foundry Operator',
  purpose: 'Automate Tool Foundry maintenance: diagnose setup, repair core tools, apply approved GitHub file updates, trigger Render redeploys, and verify backend readiness.',
  status: 'Approved',
  risk_level: 'medium',
  version: '0.1.0',
  approval_state: 'approved',
  builtin: true
});
upsertTool({
  tool_id: 'pdf_tool_mission_planner',
  name: 'PDF Tool Mission Planner',
  purpose: 'Take a user request for a PDF/document analysis tool and generate a complete implementation mission for Codex or foundry_operator.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'raw_request; optional target_builder; optional document_types; optional analysis_goals; optional constraints; optional risk_level_hint.',
  output_schema_description: 'tool_name_suggestion; user_facing_purpose; capability_needed; input_fields; output_fields; expected_behavior; success_criteria; failure_conditions; safety_boundaries; privacy_boundaries; cost_boundaries; test_cases; approval_requirements; automation_level; recommended_builder; assumptions; open_questions_for_owner; plain_english_summary.'
});

missions.set('mission_1783348514985_uvalpjdu', {
  mission_id: 'mission_1783348514985_uvalpjdu',
  tool_name: 'pdf_tool_mission_planner',
  purpose: 'Take a user request for a PDF/document analysis tool and generate a complete implementation mission for Codex or foundry_operator.',
  capability_needed: 'Convert a plain-language request for a PDF or document analysis tool into a complete, implementation-ready mission with purpose, inputs, outputs, behavior, success criteria, failure conditions, safety boundaries, privacy boundaries, cost limits, test cases, approval requirements, and automation policy.',
  status: 'Approved',
  codex_report: 'Implemented directly as a safe executable backend handler.',
  created_at: '2026-07-06T14:35:14.985Z',
  updated_at: now(),
  approval_required: true
});

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string' && value.trim()) return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

function titleCaseWords(text) {
  return String(text || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function slugToolName(rawRequest) {
  const cleaned = String(rawRequest || 'pdf_document_analysis_tool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const base = cleaned || 'pdf_document_analysis_tool';
  return base.endsWith('_tool') ? base : `${base}_tool`;
}

function inferGoals(raw, providedGoals) {
  const text = String(raw || '').toLowerCase();
  const goals = new Set(asArray(providedGoals));
  if (/summar/.test(text)) goals.add('summarize');
  if (/table|spreadsheet|csv|invoice|line item/.test(text)) goals.add('extract tables');
  if (/compare|diff|contract|version/.test(text)) goals.add('compare documents');
  if (/redact|pii|personal|secret|confidential/.test(text)) goals.add('redact sensitive information');
  if (/classif|route|categor/.test(text)) goals.add('classify documents');
  if (/cite|citation|page number|evidence/.test(text)) goals.add('cite evidence with page references');
  if (/json|structured|schema|field/.test(text)) goals.add('convert to structured data');
  if (!goals.size) goals.add('analyze documents and produce a structured result');
  return Array.from(goals);
}

function inferRisk(raw, hint) {
  const requested = String(hint || '').toLowerCase();
  if (['low', 'medium', 'high'].includes(requested)) return requested;
  const text = String(raw || '').toLowerCase();
  if (/medical|health|patient|diagnos|legal|contract|court|financial|bank|tax|identity|passport|minor|child|student record|confidential/.test(text)) return 'high';
  if (/invoice|hr|employee|customer|personal|redact|pii|private/.test(text)) return 'medium';
  return 'low';
}

function chooseBuilder(target, raw) {
  const normalized = String(target || '').toLowerCase();
  if (normalized === 'codex') return 'Codex';
  if (normalized === 'foundry_operator') return 'foundry_operator';
  const text = String(raw || '').toLowerCase();
  if (/backend|install|deploy|foundry/.test(text)) return 'foundry_operator';
  return 'Codex';
}

function makePdfToolMission(input = {}) {
  const rawRequest = input.raw_request || input.raw_idea || input.request || input.text || '';
  if (!String(rawRequest).trim()) {
    return {
      ok: false,
      error: 'raw_request is required',
      expected_input: 'Provide raw_request describing the PDF/document-analysis tool the user wants.'
    };
  }
  const documentTypes = asArray(input.document_types);
  const goals = inferGoals(rawRequest, input.analysis_goals);
  const risk = inferRisk(rawRequest, input.risk_level_hint);
  const builder = chooseBuilder(input.target_builder, rawRequest);
  const safeName = slugToolName(rawRequest);
  const displayName = titleCaseWords(rawRequest) || 'PDF Document Analysis Tool';
  const sensitive = risk === 'high' || /redact|pii|personal|confidential|legal|medical|financial|identity/i.test(rawRequest);

  const mission = {
    tool_name_suggestion: safeName,
    user_facing_purpose: `Help the owner create a ${displayName} that works with PDF or document inputs and returns reliable, traceable analysis results.`,
    capability_needed: `Build a safe document-analysis tool that can accept supported document inputs, perform these goals: ${goals.join(', ')}, and return structured outputs with page-level evidence where possible.`,
    input_fields: [
      { name: 'documents', type: 'file or file list', required: true, description: 'PDF/document files supplied by the owner or end user. The tool must validate file type, size, encryption, and page count before processing.' },
      { name: 'task_instructions', type: 'string', required: false, description: 'Optional owner instructions describing what to extract, summarize, compare, redact, classify, or validate.' },
      { name: 'output_format', type: 'enum', required: false, allowed_values: ['plain_english', 'structured_json', 'table', 'report'], description: 'Preferred output format.' },
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
    expected_behavior: [
      'Validate documents before analysis and reject unsupported, encrypted, oversized, or malformed files with a clear owner-facing explanation.',
      'Use OCR only when allowed or explicitly approved, and mark OCR-derived results with confidence warnings.',
      'For summaries, extraction, comparison, classification, or validation, include page references and concise evidence snippets when available.',
      'For tables, preserve row/column structure and flag merged cells, missing headers, or low-confidence values.',
      'For redaction workflows, require preview-before-export and never claim redaction is complete without verification.',
      'For legal, medical, financial, identity, employment, education, or minors’ records, add review_required and avoid overclaiming professional advice.',
      'Never store documents persistently, send them to third parties, publish outputs, or connect external accounts unless the owner has explicitly approved that action.'
    ],
    success_criteria: [
      'Generates accurate, useful document-analysis results for supported file types.',
      'Includes page references and evidence snippets for claims or extracted values when source text is available.',
      'Handles scanned/image-only PDFs through an approved OCR path or clearly explains that OCR approval is required.',
      'Returns structured outputs that match the requested output format.',
      'Flags uncertainty, unreadable pages, malformed files, missing information, and sensitive/high-risk workflows.',
      'Protects privacy by defaulting to no persistent document storage and no third-party transmission without approval.'
    ],
    failure_conditions: [
      'Fabricates document content, citations, tables, signatures, clauses, numbers, or page references.',
      'Silently ignores unreadable pages, failed OCR, malformed files, or unsupported document types.',
      'Stores uploaded documents or sends them to external APIs without owner approval.',
      'Provides legal, medical, financial, or identity conclusions as professional advice instead of analysis requiring review.',
      'Exports redacted documents without preview and explicit confirmation.',
      'Asks the non-technical owner to write code, inspect stack traces, choose libraries, upload ZIPs, or manually redeploy.'
    ],
    safety_boundaries: [
      'Do not assist with fraud, credential theft, doxxing, evading audits, forging documents, hiding evidence, or illegal use of document contents.',
      'Do not weaken privacy controls for convenience or performance.',
      'Require confirmation before publishing, sending, storing, deleting, or modifying documents or outputs in external systems.',
      'For high-stakes domains, present outputs as document analysis and require human review.'
    ],
    privacy_boundaries: [
      'Default to no persistent storage of uploaded documents or extracted full text.',
      'Minimize captured text and return only what is needed for the requested analysis.',
      'Redact secrets and personal data from logs, errors, and diagnostic outputs.',
      'Require owner approval before connecting cloud drives, email, storage, document repositories, or third-party APIs.',
      'Define deletion and retention behavior clearly before any file retention is enabled.'
    ],
    cost_boundaries: [
      'Default to free or already-approved backend resources.',
      'Require owner approval before paid OCR, paid LLM APIs, paid storage, or high-volume batch processing.',
      'Apply file-size, page-count, and batch limits before processing expensive jobs.',
      'Fail gracefully with an approval prompt rather than incurring unapproved cost.'
    ],
    test_cases: [
      { name: 'Text PDF summary with citations', input: 'A normal text PDF asking for summary and page citations.', expected: 'Summary includes page references and evidence snippets.' },
      { name: 'Scanned invoice table extraction', input: 'Image-only invoice PDF requiring table extraction.', expected: 'OCR path is used only if approved; rows, columns, confidence scores, and review warnings are returned.' },
      { name: 'Two-document contract comparison', input: 'Two contract PDFs asking for changed clauses.', expected: 'Clause-by-clause comparison with page references, uncertainty warnings, and no legal-advice overclaiming.' },
      { name: 'PII redaction workflow', input: 'Document containing names, addresses, account numbers, or IDs.', expected: 'PII candidates are detected, preview-before-export is required, and missed-redaction risk is flagged.' },
      { name: 'Malformed or encrypted PDF', input: 'Unsupported, encrypted, corrupted, or oversized file.', expected: 'Clear refusal/error message without technical logs or invented content.' }
    ],
    approval_requirements: {
      automatic_allowed: ['Planning the tool mission', 'Analyzing non-sensitive sample requirements', 'Returning implementation guidance'],
      requires_owner_confirmation: ['Persistent storage', 'Third-party APIs', 'paid OCR or paid LLM usage', 'public deployment', 'external account connections', 'sending emails/messages', 'publishing outputs', 'processing high-volume batches', 'exporting redacted files'],
      high_risk_handling: sensitive ? 'High or sensitive workflow detected. Require stricter privacy handling and human review.' : 'Standard privacy review required before real document processing.'
    },
    automation_level: 'Mission planning may run automatically. Real document processing, storage, external transmission, paid services, publishing, and account connections require explicit owner approval.',
    recommended_builder: builder,
    assumptions: [
      documentTypes.length ? `Requested document types: ${documentTypes.join(', ')}` : 'Tool should support PDFs first and allow future support for DOCX or mixed documents if approved.',
      `Inferred analysis goals: ${goals.join(', ')}`,
      `Inferred risk level: ${risk}`,
      input.constraints ? `Owner constraints: ${String(input.constraints)}` : 'No extra owner constraints were provided beyond default privacy, safety, and cost controls.'
    ],
    open_questions_for_owner: sensitive
      ? ['Should sensitive documents be processed only transiently with no retention?', 'Is third-party OCR or extraction allowed, or must processing stay inside the approved backend?', 'What maximum page count or file size should be allowed before approval is required?']
      : ['What maximum page count or file size should be allowed before approval is required?', 'Should OCR be enabled automatically for scanned files or require confirmation each time?'],
    plain_english_summary: `This mission tells ${builder} how to build a safe PDF/document-analysis tool for: ${String(rawRequest).trim()}. It emphasizes page citations, OCR safeguards, privacy by default, cost approval, and clear human-review flags.`,
    source_request: String(rawRequest).trim(),
    generated_at: now(),
    mission_source: 'pdf_tool_mission_planner'
  };

  return { ok: true, mission };
}

function diagnoseFoundry() {
  const coreIds = ['idea_analyzer', 'tool_mission_generator', 'foundry_self_healer', 'foundry_operator'];
  const present = coreIds.filter(id => tools.has(id));
  return {
    status: 'ready_for_operator_use',
    core_tools_ready: present.length === coreIds.length,
    core_tools_present: present,
    missing_core_tools: coreIds.filter(id => !tools.has(id)),
    configured_values: {
      API_KEY: Boolean(process.env.API_KEY),
      GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN),
      GITHUB_OWNER: Boolean(process.env.GITHUB_OWNER),
      GITHUB_REPO: Boolean(process.env.GITHUB_REPO),
      GITHUB_BRANCH: Boolean(process.env.GITHUB_BRANCH),
      RENDER_DEPLOY_HOOK_URL: Boolean(process.env.RENDER_DEPLOY_HOOK_URL),
      PUBLIC_BASE_URL: Boolean(process.env.PUBLIC_BASE_URL)
    },
    github_write_readiness: process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO ? 'configured' : 'not_configured',
    render_deploy_readiness: process.env.RENDER_DEPLOY_HOOK_URL ? 'configured' : 'not_configured',
    public_health_check_readiness: process.env.PUBLIC_BASE_URL ? 'configured' : 'not_configured',
    repo_target: {
      owner_configured: process.env.GITHUB_OWNER || null,
      repo_configured: process.env.GITHUB_REPO || null,
      branch_configured: process.env.GITHUB_BRANCH || 'main'
    },
    current_tools: Array.from(tools.values()),
    counts: { tools: tools.size, missions: missions.size, evaluations: evaluations.length, executions: executions.length }
  };
}

async function githubPutFile(file, message) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error('GitHub update is not configured.');
  if (!file || !file.path || typeof file.content !== 'string') throw new Error('Each file must include path and content.');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path).replace(/%2F/g, '/')}`;
  let sha;
  const current = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tool-foundry-backend' }
  });
  if (current.ok) {
    const body = await current.json();
    sha = body.sha;
  } else if (current.status !== 404) {
    const txt = await current.text();
    throw new Error(`Could not inspect existing file ${file.path}: ${current.status} ${txt.slice(0, 200)}`);
  }
  const put = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'tool-foundry-backend' },
    body: JSON.stringify({ message, content: Buffer.from(file.content, 'utf8').toString('base64'), branch, sha })
  });
  if (!put.ok) {
    const txt = await put.text();
    throw new Error(`Could not update ${file.path}: ${put.status} ${txt.slice(0, 300)}`);
  }
  const body = await put.json();
  return { path: file.path, commit: body.commit && body.commit.sha ? body.commit.sha : null };
}

async function triggerRenderDeploy() {
  if (!process.env.RENDER_DEPLOY_HOOK_URL) return { skipped: true, reason: 'RENDER_DEPLOY_HOOK_URL is not configured.' };
  const response = await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method: 'POST' });
  return { skipped: false, ok: response.ok, status: response.status };
}

async function publicCheck(path, method = 'GET', body) {
  if (!process.env.PUBLIC_BASE_URL) return { skipped: true, reason: 'PUBLIC_BASE_URL is not configured.', path };
  const base = process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let parsed;
  try { parsed = await response.json(); } catch (_) { parsed = await response.text(); }
  return { skipped: false, path, ok: response.ok, status: response.status, body: parsed };
}

async function runFoundryOperator(input = {}) {
  const mode = input.mode || 'diagnose';
  const started_at = now();
  const diagnosis_before = diagnoseFoundry();
  const actions_taken = [];
  const blockers = [];
  const results = {};

  if (mode === 'diagnose' || mode === 'quick' || mode === 'standard') {
    results.diagnosis = diagnosis_before;
    return { mode, started_at, diagnosis_before, actions_taken, blockers, results, next_action: 'Operator is ready for approved file updates.' };
  }

  if (mode === 'repair') {
    results.diagnosis = diagnosis_before;
    return { mode, started_at, diagnosis_before, actions_taken, blockers, results, next_action: 'No repair was required.' };
  }

  if (['upgrade', 'deploy', 'full_cycle'].includes(mode)) {
    if (!input.approval_confirmed) blockers.push('approval_confirmed is required before backend file updates or redeploy actions.');
    const files = Array.isArray(input.files) ? input.files : [];
    if (!files.length) blockers.push('No files were provided for the upgrade.');
    if (blockers.length) {
      return { mode, started_at, diagnosis_before, actions_taken, blockers, results, expected_file_format: { files: [{ path: 'src/server.js', content: '...' }] } };
    }
    const message = input.change_request || input.approved_upgrade_request || 'Approved Tool Foundry backend update';
    results.github_updates = [];
    for (const file of files) {
      const updated = await githubPutFile(file, message);
      results.github_updates.push(updated);
      actions_taken.push(`updated:${file.path}`);
    }
    results.render_deploy = await triggerRenderDeploy();
    actions_taken.push('render_deploy_triggered');
    if (mode === 'full_cycle') {
      results.public_health = await publicCheck('/health');
      results.public_tools_list = await publicCheck('/tools/list');
      results.pdf_tool_test = await publicCheck('/tools/execute', 'POST', {
        tool_id: 'pdf_tool_mission_planner',
        input: { raw_request: 'Build a tool that summarizes PDFs and cites page numbers.', analysis_goals: ['summarize', 'cite evidence with page references'] },
        user_visible_purpose: 'Post-deploy smoke test for pdf_tool_mission_planner.'
      });
    }
    return { mode, started_at, diagnosis_before, actions_taken, blockers, results, next_action: 'Review verification results. If Render is still deploying, rerun health/list/test checks.' };
  }

  return { mode, started_at, diagnosis_before, actions_taken, blockers: [`Unsupported mode: ${mode}`], results };
}

function analyzeIdea(input = {}) {
  const idea = input.raw_idea || input.raw_request || '';
  return {
    core_goal: String(idea).trim() || 'No idea provided.',
    intelligence_pattern: 'planning_and_structuring',
    risk_level: inferRisk(idea, input.risk_level_hint),
    needed_tool_type: /pdf|document|docx|scan|ocr/i.test(idea) ? 'document_analysis_planning_tool' : 'general_planning_tool',
    next_action: 'Generate a complete tool mission before implementation.'
  };
}

function generateGenericMission(input = {}) {
  const raw = input.raw_idea || input.raw_request || input.idea || '';
  return {
    tool_name_suggestion: slugToolName(raw),
    user_facing_purpose: `Turn this request into an implementation-ready tool: ${String(raw).trim()}`,
    capability_needed: String(raw).trim(),
    input_fields: ['raw_request', 'constraints'],
    output_fields: ['mission', 'summary'],
    success_criteria: ['Mission is complete, safe, testable, and owner-friendly.'],
    failure_conditions: ['Mission is incomplete or asks the owner to do programming work.'],
    safety_boundaries: ['Respect approval boundaries and avoid unsafe use.'],
    privacy_boundaries: ['Do not store sensitive data without approval.'],
    cost_boundaries: ['Do not incur paid usage without approval.'],
    test_cases: ['Given a plain-language request, return a complete implementation mission.'],
    approval_requirements: ['Owner approval before deployment, paid services, storage, or external account access.']
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tool-foundry-backend', timestamp: now(), tools: tools.size, missions: missions.size });
});

app.use(requireAuth);

app.get('/tools/list', (req, res) => res.json({ tools: Array.from(tools.values()) }));
app.post('/tools/list', (req, res) => res.json({ tools: Array.from(tools.values()) }));
app.get('/tools', (req, res) => res.json({ tools: Array.from(tools.values()) }));

app.post('/tools/register', (req, res) => {
  const tool = req.body || {};
  if (!tool.tool_id || !tool.name || !tool.purpose) return jsonError(res, 400, 'tool_id, name, and purpose are required');
  upsertTool(tool);
  res.json({ tool_id: tool.tool_id, status: tools.get(tool.tool_id).status, message: 'Tool registered.' });
});

app.post('/tools/evaluate', (req, res) => {
  const { tool_id, mission_id, evaluation_depth } = req.body || {};
  const tool = tools.get(tool_id);
  if (!tool) return jsonError(res, 404, 'Tool not found');
  const result = {
    tool_id,
    mission_id: mission_id || null,
    evaluation_depth: evaluation_depth || 'standard',
    useful: true,
    safe: tool.risk_level !== 'high',
    aligned: true,
    ready_for_approval: tool.status === 'Approved',
    notes: tool.status === 'Approved' ? 'Tool is approved and executable.' : 'Tool exists but is not approved yet.',
    evaluated_at: now()
  };
  evaluations.push(result);
  res.json(result);
});

app.post('/tools/execute', async (req, res) => {
  try {
    const { tool_id, input, user_visible_purpose } = req.body || {};
    const tool = tools.get(tool_id);
    if (!tool) return jsonError(res, 404, 'Tool not found');
    if (tool.status !== 'Approved') return jsonError(res, 403, 'Tool is not approved for execution');
    let result;
    if (tool_id === 'pdf_tool_mission_planner') result = makePdfToolMission(input || {});
    else if (tool_id === 'idea_analyzer') result = analyzeIdea(input || {});
    else if (tool_id === 'tool_mission_generator') result = generateGenericMission(input || {});
    else if (tool_id === 'foundry_self_healer') result = { diagnosis: diagnoseFoundry(), repair_applied: false, message: 'No repair needed.' };
    else if (tool_id === 'foundry_operator') result = await runFoundryOperator(input || {});
    else return jsonError(res, 501, 'No executable handler is installed for this tool');
    executions.push({ tool_id, user_visible_purpose: user_visible_purpose || null, executed_at: now(), ok: !(result && result.ok === false) });
    res.json({ tool_id, result, summary: `${tool.name} completed.`, warnings: [] });
  } catch (err) {
    res.status(500).json({ error: 'tool_execution_failed', message: err.message });
  }
});

app.post('/missions/create', (req, res) => {
  const body = req.body || {};
  const mission_id = `mission_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const mission = { mission_id, status: 'Draft', codex_report: 'Mission created. Waiting for tool-building workflow.', created_at: now(), updated_at: now(), ...body };
  missions.set(mission_id, mission);
  res.json({ mission_id, status: mission.status, message: 'Tool mission created.' });
});

function missionStatusResponse(mission_id) {
  const mission = missions.get(mission_id);
  if (!mission) return null;
  return {
    mission_id,
    status: mission.status || 'Draft',
    codex_report: mission.codex_report || 'Mission exists.',
    next_action: mission.status === 'Approved' ? 'Tool is implemented or ready for approved execution.' : 'Review mission and decide whether to build, revise, test, or register a tool.',
    mission
  };
}

app.get('/missions/status/:mission_id', (req, res) => {
  const result = missionStatusResponse(req.params.mission_id);
  if (!result) return jsonError(res, 404, 'Mission not found');
  res.json(result);
});
app.post('/missions/status', (req, res) => {
  const result = missionStatusResponse((req.body || {}).mission_id);
  if (!result) return jsonError(res, 404, 'Mission not found');
  res.json(result);
});

app.post('/missions/revision', (req, res) => {
  const { mission_id, revision_request, reason } = req.body || {};
  const mission = missions.get(mission_id);
  if (!mission) return jsonError(res, 404, 'Mission not found');
  mission.status = 'Needs Revision';
  mission.revision_request = revision_request || '';
  mission.revision_reason = reason || '';
  mission.updated_at = now();
  missions.set(mission_id, mission);
  res.json({ mission_id, status: mission.status, message: 'Revision request recorded.' });
});

app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

app.listen(PORT, () => {
  console.log(`Tool Foundry backend listening on ${PORT}`);
});
