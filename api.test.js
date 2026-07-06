const express = require("express");
const { readStore, writeStore, addEvent, nowIso, id } = require("./store");

const app = express();
app.use(express.json({ limit: "1mb" }));

const TOOL_STATES = ["Draft", "Building", "Testing", "Needs Revision", "Pending Approval", "Approved", "Deprecated"];

const BUILTIN_TOOLS = [
  {
    tool_id: "idea_analyzer",
    name: "Idea Analyzer",
    purpose: "Analyze raw user ideas into a core goal, intelligence pattern, risk level, needed tool type, and next action.",
    status: "Approved",
    version: "0.2.0",
    input_schema_description: "Accepts raw_idea as text.",
    output_schema_description: "Returns core_goal, intelligence_pattern, risk_level, risk_notes, needed_tool_type, and next_action.",
    risk_level: "low",
    approval_state: "approved",
    builtin: true
  },
  {
    tool_id: "tool_mission_generator",
    name: "Tool Mission Generator",
    purpose: "Convert a raw idea or analyzed idea into a complete Codex-ready Tool Mission.",
    status: "Approved",
    version: "0.2.0",
    input_schema_description: "Accepts raw_idea, analysis_result, desired_tool_type, risk_level, and user_constraints.",
    output_schema_description: "Returns a complete_tool_mission object ready to send to createToolMission.",
    risk_level: "low",
    approval_state: "approved",
    builtin: true
  },
  {
    tool_id: "foundry_self_healer",
    name: "Foundry Self-Healer",
    purpose: "Diagnose and repair common Tool Foundry setup problems so the user does not repeat manual setup steps after redeploys or schema drift.",
    status: "Approved",
    version: "0.1.0",
    input_schema_description: "Accepts repair_mode, check_scope, context, and optional raw_idea.",
    output_schema_description: "Returns health checks, repairs performed, missing pieces, next owner-level clicks, and recommended Codex tasks.",
    risk_level: "low",
    approval_state: "approved",
    builtin: true
  },
  {
    tool_id: "foundry_operator",
    name: "Foundry Operator",
    purpose: "Automate Tool Foundry maintenance: diagnose setup, repair core tools, apply approved GitHub file updates, trigger Render redeploys, and verify backend readiness.",
    status: "Approved",
    version: "0.1.0",
    input_schema_description: "Accepts mode, check_scope, files, commit_message, approval_confirmed, repair_mode, and optional raw_idea/context.",
    output_schema_description: "Returns diagnosis, repairs, GitHub update results, Render deploy results, post-deploy checks, blockers, and next owner-level actions.",
    risk_level: "medium",
    approval_state: "approved",
    builtin: true
  }
];

function getExpectedApiKey() {
  return process.env.API_KEY || "dev-only-change-me";
}

function authRequired(req, res, next) {
  if (req.path === "/health") return next();
  const expected = getExpectedApiKey();
  const headerKey = req.header("x-api-key");
  const auth = req.header("authorization") || "";
  const bearerKey = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;
  if (headerKey === expected || bearerKey === expected) return next();
  return res.status(401).json({ error: "Unauthorized", message: "Missing or invalid API key." });
}

app.use(authRequired);

function normalizeTool(tool) {
  return {
    tool_id: tool.tool_id,
    name: tool.name,
    purpose: tool.purpose,
    status: tool.status,
    risk_level: tool.risk_level || "unknown",
    version: tool.version || "0.1.0",
    approval_state: tool.approval_state || "unknown",
    builtin: Boolean(tool.builtin)
  };
}

function getAllTools(state) {
  const customById = new Map((state.tools || []).map((tool) => [tool.tool_id, tool]));
  const builtins = BUILTIN_TOOLS.map((tool) => ({ ...tool, ...(customById.get(tool.tool_id) || {}) }));
  const customOnly = (state.tools || []).filter((tool) => !BUILTIN_TOOLS.some((builtin) => builtin.tool_id === tool.tool_id));
  return [...builtins, ...customOnly];
}

function findTool(state, toolId) {
  return getAllTools(state).find((tool) => tool.tool_id === toolId);
}

function seedBuiltinTools(state) {
  if (!Array.isArray(state.tools)) state.tools = [];
  const seeded = [];
  for (const builtin of BUILTIN_TOOLS) {
    const existingIndex = state.tools.findIndex((tool) => tool.tool_id === builtin.tool_id);
    const record = {
      ...builtin,
      created_at: existingIndex >= 0 ? state.tools[existingIndex].created_at : nowIso(),
      updated_at: nowIso()
    };
    if (existingIndex >= 0) state.tools[existingIndex] = { ...state.tools[existingIndex], ...record };
    else state.tools.push(record);
    seeded.push(builtin.tool_id);
  }
  return seeded;
}

function summarizeIdea(rawIdea = "") {
  const text = String(rawIdea || "").trim();
  const lower = text.toLowerCase();
  const riskyTerms = ["weapon", "explosive", "bomb", "poison", "hack", "steal", "malware", "self harm", "hurt"];
  const riskHits = riskyTerms.filter((term) => lower.includes(term));
  const riskLevel = riskHits.length > 0 ? "high" : "low";

  let intelligencePattern = "general interpretation";
  if (lower.includes("build") || lower.includes("make") || lower.includes("create")) intelligencePattern = "builder / prototype compiler";
  if (lower.includes("research") || lower.includes("find")) intelligencePattern = "research agent";
  if (lower.includes("evaluate") || lower.includes("score") || lower.includes("test")) intelligencePattern = "evaluator";
  if (lower.includes("automate") || lower.includes("agent")) intelligencePattern = "workflow agent";

  return {
    core_goal: text ? `Clarify and operationalize this idea: ${text.slice(0, 220)}` : "No raw idea was provided.",
    intelligence_pattern: intelligencePattern,
    risk_level: riskLevel,
    risk_notes: riskHits.length ? `Detected sensitive terms: ${riskHits.join(", ")}. Require review before building tools.` : "No obvious high-risk terms detected by the starter analyzer.",
    needed_tool_type: riskLevel === "high" ? "safety-reviewed evaluator before any build tool" : "idea compiler / tool mission generator",
    next_action: riskLevel === "high" ? "Create a safe clarification mission and avoid operational harmful detail." : "Create a Tool Mission with inputs, outputs, success criteria, and tests."
  };
}

function generateToolMission(input = {}) {
  const rawIdea = String(input.raw_idea || input.idea || input.text || "").trim();
  const analysis = input.analysis_result || {};
  const desiredToolType = String(input.desired_tool_type || analysis.needed_tool_type || "AI tool").trim();
  const riskLevel = String(input.risk_level || analysis.risk_level || "low").trim();
  const userConstraints = String(input.user_constraints || "").trim();

  const baseName = desiredToolType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "generated_tool";

  const missionPurpose = rawIdea
    ? `Build a ${desiredToolType} for this user idea: ${rawIdea}`
    : `Build a ${desiredToolType} from the provided analysis.`;

  const capability = rawIdea
    ? `Convert the user idea into a reliable, callable backend tool that supports the Custom GPT's workflow: ${rawIdea}`
    : "Convert the provided analyzed idea into a reliable, callable backend tool that supports the Custom GPT's workflow.";

  return {
    complete_tool_mission: {
      tool_name: baseName,
      purpose: missionPurpose,
      capability_needed: capability,
      input_schema_description:
        "Accepts structured JSON input from the Custom GPT. Include raw user text, relevant context, and any options needed for the selected tool.",
      output_schema_description:
        "Returns a structured JSON result with a plain-English summary, key fields needed by the Custom GPT, warnings, and next_action.",
      success_criteria: [
        "The tool accepts structured input without requiring the user to write code.",
        "The tool returns a useful structured result that the Custom GPT can read and explain.",
        "The tool handles missing or vague input gracefully.",
        "The tool includes plain-English output suitable for a non-technical user.",
        "The tool can be registered and executed through the existing Tool Foundry API."
      ],
      failure_conditions: [
        "The tool asks the user programming questions.",
        "The tool requires manual command-line steps from the user.",
        "The tool returns only vague or unstructured text.",
        "The tool omits safety, privacy, or cost boundaries.",
        "The tool fails silently or hides important errors from the Custom GPT."
      ],
      safety_boundaries: [
        "Do not enable harmful, illegal, or unsafe capabilities.",
        "Do not execute untested code for real user work.",
        "Require user approval before tools affect real-world systems.",
        "Require user approval before public deployment, messaging, publishing, purchases, or account access."
      ],
      privacy_boundaries: [
        "Do not store sensitive user data unless explicitly approved.",
        "Do not expose secrets, API keys, tokens, or private files in logs or responses.",
        "Use the least data needed for the tool's purpose."
      ],
      cost_boundaries: [
        "Prefer free or low-cost implementation paths.",
        "Ask for user approval before paid API usage, higher hosting costs, or recurring jobs.",
        userConstraints || "Stay within the existing Render and GitHub setup unless the user approves an upgrade."
      ].filter(Boolean),
      test_cases: [
        "Normal input: a clear user idea should produce a complete structured result.",
        "Vague input: a vague idea should produce clarifying assumptions and a safe next action.",
        "Missing input: missing fields should return a graceful error or request for the missing owner-level detail.",
        "Risky input: potentially unsafe requests should be bounded and routed to review.",
        "Non-technical user: output should not include coding instructions unless explicitly requested."
      ],
      approval_required: true,
      codex_implementation_notes:
        `Implement the simplest reliable backend handler for tool_name '${baseName}'. Keep compatibility with the current Tool Foundry endpoints. Do not ask the user coding questions. Technical decisions should be made by Codex. Owner approval is required for cost, privacy, permissions, public deployment, external account access, and activation. Risk level: ${riskLevel}.`
    },
    source: {
      raw_idea: rawIdea,
      desired_tool_type: desiredToolType,
      risk_level: riskLevel,
      user_constraints: userConstraints,
      analysis_result: analysis
    }
  };
}

function runFoundrySelfHealer(input = {}) {
  const state = readStore();
  const beforeTools = Array.isArray(state.tools) ? state.tools.length : 0;
  const repairMode = input.repair_mode !== false;
  let repairsPerformed = [];

  if (repairMode) {
    const seeded = seedBuiltinTools(state);
    writeStore(state);
    addEvent("foundry.self_healer_repair", { seeded_tools: seeded });
    repairsPerformed.push(`Seeded or refreshed core built-in tools: ${seeded.join(", ")}.`);
  }

  const refreshed = readStore();
  const allTools = getAllTools(refreshed);
  const availableIds = allTools.map((tool) => tool.tool_id);
  const requiredBuiltinIds = BUILTIN_TOOLS.map((tool) => tool.tool_id);
  const missingBuiltins = requiredBuiltinIds.filter((toolId) => !availableIds.includes(toolId));

  const endpointChecks = [
    { name: "healthCheck", endpoint: "GET /health", status: "available" },
    { name: "listTools", endpoint: "GET /tools/list", status: "available" },
    { name: "createToolMission", endpoint: "POST /tools/mission/create", status: "available" },
    { name: "getToolMissionStatus", endpoint: "GET /tools/mission/status", status: "available" },
    { name: "sendToolMissionRevision", endpoint: "POST /tools/mission/revision", status: "available" },
    { name: "registerTool", endpoint: "POST /tools/register", status: "available" },
    { name: "evaluateTool", endpoint: "POST /tools/evaluate", status: "available" },
    { name: "executeTool", endpoint: "POST /tools/execute", status: "available" }
  ];

  const schemaMustExpose = [
    "registerTool must appear as an available action.",
    "executeTool must expose an input object, not only tool_id and user_visible_purpose.",
    "executeTool.input should include raw_idea, desired_tool_type, risk_level, user_constraints, repair_mode, and context.",
    "Authentication must use custom header x-api-key with the same secret as Render API_KEY."
  ];

  return {
    foundry_status: missingBuiltins.length === 0 ? "healthy_core_tools_available" : "needs_attention",
    repair_mode: repairMode,
    repairs_performed: repairsPerformed,
    before_tool_count: beforeTools,
    after_tool_count: allTools.length,
    core_tools_available: requiredBuiltinIds.filter((toolId) => availableIds.includes(toolId)),
    missing_core_tools: missingBuiltins,
    current_tools: allTools.map(normalizeTool),
    missions_count: refreshed.missions.length,
    evaluations_count: refreshed.evaluations.length,
    executions_count: refreshed.executions.length,
    endpoint_checks: endpointChecks,
    action_schema_requirements: schemaMustExpose,
    known_v0_limitations: [
      "Core starter tools now survive redeploys because they are built into the backend code.",
      "Custom tools and missions are still stored in local backend storage and may be lost across redeploys or instance resets unless a persistent database is added.",
      "Codex workspace commits may still need to be manually uploaded or pushed into GitHub unless Codex is connected to the repo.",
      "This self-healer cannot edit the Custom GPT Action schema inside ChatGPT; it can diagnose what the schema must expose."
    ],
    next_owner_level_actions: [
      "Run listTools after every redeploy to confirm core tools are visible.",
      "Run foundry_self_healer with repair_mode true if any core tools disappear.",
      "Add the next upgrade mission: persistent_database_upgrade, so custom tools and missions survive redeploys.",
      "Add the next upgrade mission: codex_github_sync_connector, so Codex updates reach GitHub without manual ZIP uploads."
    ],
    recommended_codex_task:
      "Build a persistent database upgrade for the Tool Foundry backend so missions, tool registry entries, evaluations, and execution logs survive redeploys. The user is non-technical, so choose the simplest low-cost storage option and do not ask programming questions.",
    user_message:
      "I checked the Tool Foundry. Core system tools are now protected against the manual re-registration loop. The remaining big risk is persistence for custom/generated tools, which should be upgraded next."
  };
}


function configuredEnv(keys) {
  const result = {};
  for (const key of keys) {
    result[key] = Boolean(process.env[key] && String(process.env[key]).trim());
  }
  return result;
}

function diagnoseFoundryState() {
  const state = readStore();
  const allTools = getAllTools(state);
  const availableIds = allTools.map((tool) => tool.tool_id);
  const requiredBuiltinIds = BUILTIN_TOOLS.map((tool) => tool.tool_id);
  const missingBuiltins = requiredBuiltinIds.filter((toolId) => !availableIds.includes(toolId));
  const env = configuredEnv([
    "API_KEY",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "RENDER_DEPLOY_HOOK_URL",
    "PUBLIC_BASE_URL"
  ]);

  const githubReady = Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO && env.GITHUB_BRANCH);
  const renderReady = Boolean(env.RENDER_DEPLOY_HOOK_URL);
  const publicCheckReady = Boolean(env.PUBLIC_BASE_URL);
  const coreToolsReady = missingBuiltins.length === 0;

  return {
    status: githubReady && renderReady && coreToolsReady ? "ready_for_operator_use" : "needs_owner_setup_or_repair",
    core_tools_ready: coreToolsReady,
    core_tools_present: requiredBuiltinIds.filter((toolId) => availableIds.includes(toolId)),
    missing_core_tools: missingBuiltins,
    configured_values: env,
    github_write_readiness: githubReady ? "configured" : "missing_required_values",
    render_deploy_readiness: renderReady ? "configured" : "missing_RENDER_DEPLOY_HOOK_URL",
    public_health_check_readiness: publicCheckReady ? "configured" : "missing_PUBLIC_BASE_URL",
    self_update_readiness:
      githubReady && renderReady
        ? "configured_but_updates_still_require_explicit_approval_unless_AUTO_APPROVE_SAFE_UPDATES_true"
        : "not_ready",
    safety_gate:
      process.env.AUTO_APPROVE_SAFE_UPDATES === "true"
        ? "AUTO_APPROVE_SAFE_UPDATES is true; safe updates may proceed without additional approval."
        : "Owner approval is required before backend self-updates.",
    repo_target: {
      owner_configured: process.env.GITHUB_OWNER || null,
      repo_configured: process.env.GITHUB_REPO || null,
      branch_configured: process.env.GITHUB_BRANCH || "main"
    },
    current_tools: allTools.map(normalizeTool),
    counts: {
      tools: allTools.length,
      missions: state.missions.length,
      evaluations: state.evaluations.length,
      executions: state.executions.length,
      events: state.events.length
    }
  };
}

function repairCoreTools() {
  const state = readStore();
  const seeded = seedBuiltinTools(state);
  writeStore(state);
  addEvent("foundry.operator_repair", { seeded_tools: seeded });
  return {
    repairs_performed: [`Seeded/refreshed built-in tools: ${seeded.join(", ")}.`],
    diagnosis_after_repair: diagnoseFoundryState()
  };
}

function validateUpgradeFile(file) {
  if (!file || typeof file.path !== "string") return { ok: false, reason: "Each file must include a path." };
  const rawPath = file.path.replace(/\\/g, "/").trim();
  if (!rawPath || rawPath.startsWith("/") || rawPath.includes("..")) {
    return { ok: false, reason: `Unsafe file path blocked: ${rawPath}` };
  }
  const blockedPrefixes = [".git/", "node_modules/", "data/", "tmp/"];
  const blockedExact = [".env", "data/store.json", "package-lock.json"];
  if (blockedExact.includes(rawPath) || blockedPrefixes.some((prefix) => rawPath.startsWith(prefix))) {
    return { ok: false, reason: `Protected path blocked: ${rawPath}` };
  }
  if (typeof file.content !== "string") return { ok: false, reason: `File ${rawPath} must include string content.` };
  return { ok: true, path: rawPath, content: file.content };
}

async function githubApi(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured.");
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tool-foundry-backend",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body && body.message ? body.message : `GitHub API failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function getExistingGithubFileSha(owner, repo, branch, filePath) {
  try {
    const body = await githubApi(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`);
    return body.sha || null;
  } catch (err) {
    if (String(err.message || "").toLowerCase().includes("not found")) return null;
    throw err;
  }
}

async function commitFilesToGithub(files, commitMessage) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!owner || !repo || !branch) {
    throw new Error("GITHUB_OWNER, GITHUB_REPO, and GITHUB_BRANCH must be configured.");
  }
  if (repo !== "tool-foundry-backend") {
    throw new Error("Safety block: GITHUB_REPO must be exactly tool-foundry-backend.");
  }

  const results = [];
  for (const file of files) {
    const valid = validateUpgradeFile(file);
    if (!valid.ok) throw new Error(valid.reason);
    const sha = await getExistingGithubFileSha(owner, repo, branch, valid.path);
    const payload = {
      message: commitMessage || `Tool Foundry automated update: ${valid.path}`,
      content: Buffer.from(valid.content, "utf8").toString("base64"),
      branch
    };
    if (sha) payload.sha = sha;

    const result = await githubApi(`/repos/${owner}/${repo}/contents/${encodeURIComponent(valid.path).replace(/%2F/g, "/")}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    results.push({
      path: valid.path,
      commit_sha: result.commit && result.commit.sha,
      html_url: result.content && result.content.html_url
    });
  }
  addEvent("foundry.github_update", { files: results.map((item) => item.path), count: results.length });
  return results;
}

async function triggerRenderDeploy() {
  const hookUrl = process.env.RENDER_DEPLOY_HOOK_URL;
  if (!hookUrl) throw new Error("RENDER_DEPLOY_HOOK_URL is not configured.");
  const response = await fetch(hookUrl, { method: "POST" });
  if (!response.ok) {
    // Some Render deploy hooks accept GET even if POST is blocked by an intermediary.
    const fallback = await fetch(hookUrl, { method: "GET" });
    if (!fallback.ok) throw new Error(`Render deploy hook failed with status ${response.status}/${fallback.status}.`);
  }
  addEvent("foundry.render_deploy_triggered", {});
  return { triggered: true, message: "Render deploy hook was called." };
}

async function checkPublicBackend() {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) return { skipped: true, reason: "PUBLIC_BASE_URL is not configured." };
  const cleanBase = base.replace(/\/+$/, "");
  const health = await fetch(`${cleanBase}/health`).then(async (res) => ({ status: res.status, ok: res.ok, body: await res.text() })).catch((err) => ({ ok: false, error: err.message }));
  let tools = { skipped: true, reason: "tools/list requires API key through the backend itself; use Custom GPT listTools for authenticated check." };
  try {
    const response = await fetch(`${cleanBase}/tools/list`, { headers: { "x-api-key": getExpectedApiKey() } });
    tools = { status: response.status, ok: response.ok, body: await response.text() };
  } catch (err) {
    tools = { ok: false, error: err.message };
  }
  return { health, tools };
}

async function runFoundryOperator(input = {}) {
  const mode = String(input.mode || input.operation || "diagnose").toLowerCase();
  const approvalConfirmed = Boolean(input.approval_confirmed || process.env.AUTO_APPROVE_SAFE_UPDATES === "true");
  const report = {
    mode,
    started_at: nowIso(),
    diagnosis_before: diagnoseFoundryState(),
    actions_taken: [],
    blockers: [],
    results: {}
  };

  if (mode === "diagnose") {
    report.results.diagnosis = report.diagnosis_before;
    report.next_action = report.diagnosis_before.status === "ready_for_operator_use"
      ? "The operator is ready. Use repair for registry repair, or upgrade/full_cycle for approved file updates."
      : "Add missing owner-level environment variables in Render, then redeploy once.";
    return report;
  }

  if (mode === "repair") {
    report.results.repair = repairCoreTools();
    report.actions_taken.push("Repaired/refreshed core built-in tool registrations.");
    return report;
  }

  if (mode === "deploy") {
    try {
      report.results.render_deploy = await triggerRenderDeploy();
      report.actions_taken.push("Triggered Render redeploy.");
    } catch (err) {
      report.blockers.push(err.message);
    }
    return report;
  }

  if (mode === "check" || mode === "verify") {
    report.results.public_checks = await checkPublicBackend();
    return report;
  }

  if (mode === "upgrade" || mode === "full_cycle") {
    const files = Array.isArray(input.files) ? input.files : [];
    if (!approvalConfirmed) {
      report.blockers.push("Owner approval is required before applying backend file updates. Re-run with approval_confirmed: true after reviewing the update purpose.");
      report.required_owner_action = "Approve this backend update before applying it.";
      return report;
    }
    if (!files.length) {
      report.blockers.push("No files were provided for the upgrade.");
      report.expected_file_format = { files: [{ path: "src/server.js", content: "..." }] };
      return report;
    }
    try {
      report.results.github_update = await commitFilesToGithub(files, input.commit_message || "Tool Foundry automated backend update");
      report.actions_taken.push("Committed approved file updates to GitHub.");
    } catch (err) {
      report.blockers.push(`GitHub update failed: ${err.message}`);
      return report;
    }
    try {
      report.results.render_deploy = await triggerRenderDeploy();
      report.actions_taken.push("Triggered Render redeploy.");
    } catch (err) {
      report.blockers.push(`Render deploy failed: ${err.message}`);
      return report;
    }
    if (mode === "full_cycle") {
      report.results.public_checks = await checkPublicBackend();
      report.actions_taken.push("Ran post-update public checks.");
    }
    return report;
  }

  report.blockers.push(`Unknown foundry_operator mode: ${mode}. Use diagnose, repair, deploy, check, upgrade, or full_cycle.`);
  return report;
}


app.get("/health", (req, res) => {
  res.json({ ok: true, service: "tool-foundry-backend", version: "0.2.0-self-healing", time: nowIso() });
});

app.get("/tools/list", (req, res) => {
  const state = readStore();
  res.json({ tools: getAllTools(state).map(normalizeTool) });
});

app.post("/tools/mission/create", (req, res) => {
  const body = req.body || {};
  const required = ["tool_name", "purpose", "capability_needed", "success_criteria"];
  const missing = required.filter((key) => body[key] === undefined || body[key] === null);
  if (missing.length) return res.status(400).json({ error: "Missing required fields", missing });

  const state = readStore();
  const mission = {
    mission_id: id("mission"),
    tool_name: body.tool_name,
    purpose: body.purpose,
    capability_needed: body.capability_needed,
    input_schema_description: body.input_schema_description || "",
    output_schema_description: body.output_schema_description || "",
    success_criteria: body.success_criteria || [],
    failure_conditions: body.failure_conditions || [],
    safety_boundaries: body.safety_boundaries || [],
    privacy_boundaries: body.privacy_boundaries || [],
    cost_boundaries: body.cost_boundaries || [],
    test_cases: body.test_cases || [],
    approval_required: Boolean(body.approval_required),
    codex_implementation_notes: body.codex_implementation_notes || "",
    status: "Draft",
    codex_report: "Mission created. Waiting for Codex/tool-building workflow.",
    created_at: nowIso(),
    updated_at: nowIso()
  };

  state.missions.push(mission);
  writeStore(state);
  addEvent("mission.created", { mission_id: mission.mission_id });
  res.json({ mission_id: mission.mission_id, status: mission.status, message: "Tool mission created." });
});

app.get("/tools/mission/status", (req, res) => {
  const { mission_id } = req.query;
  const state = readStore();
  const mission = state.missions.find((item) => item.mission_id === mission_id);
  if (!mission) return res.status(404).json({ error: "Mission not found" });
  res.json({
    mission_id: mission.mission_id,
    status: mission.status,
    codex_report: mission.codex_report || "",
    next_action: mission.next_action || "Review mission and decide whether to build, revise, test, or register a tool.",
    mission
  });
});

app.post("/tools/mission/revision", (req, res) => {
  const { mission_id, revision_request, reason } = req.body || {};
  if (!mission_id || !revision_request) return res.status(400).json({ error: "mission_id and revision_request are required." });

  const state = readStore();
  const mission = state.missions.find((item) => item.mission_id === mission_id);
  if (!mission) return res.status(404).json({ error: "Mission not found" });

  const revision = { revision_id: id("revision"), mission_id, revision_request, reason: reason || "", created_at: nowIso() };
  mission.status = "Needs Revision";
  mission.updated_at = nowIso();
  mission.codex_report = "Revision requested. Waiting for updated implementation.";
  state.revisions.push(revision);
  writeStore(state);
  addEvent("mission.revision_requested", { mission_id, revision_id: revision.revision_id });
  res.json({ mission_id, status: mission.status, message: "Revision request saved." });
});

app.post("/tools/register", (req, res) => {
  const body = req.body || {};
  const required = ["tool_id", "name", "purpose", "status"];
  const missing = required.filter((key) => !body[key]);
  if (missing.length) return res.status(400).json({ error: "Missing required fields", missing });
  if (!TOOL_STATES.includes(body.status)) return res.status(400).json({ error: "Invalid tool status", allowed_statuses: TOOL_STATES });

  const state = readStore();
  const existingIndex = state.tools.findIndex((tool) => tool.tool_id === body.tool_id);
  const builtin = BUILTIN_TOOLS.find((tool) => tool.tool_id === body.tool_id);
  const tool = {
    ...(builtin || {}),
    tool_id: body.tool_id,
    name: body.name,
    purpose: body.purpose,
    status: body.status,
    version: body.version || (builtin && builtin.version) || "0.1.0",
    input_schema_description: body.input_schema_description || (builtin && builtin.input_schema_description) || "",
    output_schema_description: body.output_schema_description || (builtin && builtin.output_schema_description) || "",
    risk_level: body.risk_level || (builtin && builtin.risk_level) || "low",
    approval_state: body.approval_state || (body.status === "Approved" ? "approved" : "pending"),
    builtin: Boolean(builtin),
    created_at: existingIndex >= 0 ? state.tools[existingIndex].created_at : nowIso(),
    updated_at: nowIso()
  };

  if (existingIndex >= 0) state.tools[existingIndex] = tool;
  else state.tools.push(tool);

  writeStore(state);
  addEvent("tool.registered", { tool_id: tool.tool_id, status: tool.status });
  res.json({ tool_id: tool.tool_id, status: tool.status, message: "Tool registered." });
});

app.post("/tools/evaluate", (req, res) => {
  const { tool_id, mission_id, evaluation_depth = "standard" } = req.body || {};
  if (!tool_id) return res.status(400).json({ error: "tool_id is required." });

  const state = readStore();
  const tool = findTool(state, tool_id);
  if (!tool) return res.status(404).json({ error: "Tool not found." });

  const passed = tool.status === "Approved" || tool.status === "Pending Approval";
  const score = passed ? 8.8 : 5.5;
  const evaluation = {
    evaluation_id: id("eval"),
    tool_id,
    mission_id: mission_id || null,
    evaluation_depth,
    score,
    passed,
    report: passed
      ? "Tool appears ready for controlled use based on its registered/built-in status. This v0 evaluator is basic and should be upgraded later."
      : "Tool is not approved or pending approval. It should not be executed for real user work yet.",
    approval_recommendation: passed ? "approve_or_keep_approved" : "do_not_approve_yet",
    created_at: nowIso()
  };

  state.evaluations.push(evaluation);
  writeStore(state);
  addEvent("tool.evaluated", { tool_id, evaluation_id: evaluation.evaluation_id });
  res.json({ tool_id, score, passed, report: evaluation.report, approval_recommendation: evaluation.approval_recommendation });
});

app.post("/tools/execute", (req, res) => {
  const { tool_id, input = {}, user_visible_purpose = "" } = req.body || {};
  if (!tool_id) return res.status(400).json({ error: "tool_id is required." });

  const state = readStore();
  const tool = findTool(state, tool_id);
  if (!tool) return res.status(404).json({ error: "Tool not found." });
  if (tool.status !== "Approved") {
    return res.status(403).json({ error: "Tool is not approved.", status: tool.status, message: "Only Approved tools may be executed." });
  }

  let result;
  let summary;
  const warnings = [];

  if (tool_id === "idea_analyzer") {
    result = summarizeIdea(input.raw_idea || input.idea || input.text || "");
    summary = "Idea Analyzer completed.";
  } else if (tool_id === "tool_mission_generator") {
    result = generateToolMission(input);
    summary = "Tool Mission Generator completed.";
  } else if (tool_id === "foundry_self_healer") {
    result = runFoundrySelfHealer(input);
    summary = "Foundry Self-Healer completed.";
  } else if (tool_id === "foundry_operator") {
    runFoundryOperator(input).then((operatorResult) => {
      const execution = { execution_id: id("exec"), tool_id, user_visible_purpose, input, result: operatorResult, warnings, created_at: nowIso() };
      state.executions.push(execution);
      writeStore(state);
      addEvent("tool.executed", { tool_id, execution_id: execution.execution_id });
      return res.json({ tool_id, result: operatorResult, summary: "Foundry Operator completed.", warnings });
    }).catch((err) => {
      return res.status(500).json({ error: "foundry_operator_failed", message: err.message });
    });
    return;
  } else {
    result = { message: "Tool is approved and registered, but this v0 backend does not yet have a custom executable handler for this tool.", received_input: input };
    summary = "Registered tool placeholder executed.";
    warnings.push("This v0 backend needs a real handler or sandbox executor for this specific tool.");
  }

  const execution = { execution_id: id("exec"), tool_id, user_visible_purpose, input, result, warnings, created_at: nowIso() };
  state.executions.push(execution);
  writeStore(state);
  addEvent("tool.executed", { tool_id, execution_id: execution.execution_id });
  res.json({ tool_id, result, summary, warnings });
});


app.post("/foundry/diagnose", async (req, res) => {
  try {
    res.json(await runFoundryOperator({ ...(req.body || {}), mode: "diagnose" }));
  } catch (err) {
    res.status(500).json({ error: "diagnose_failed", message: err.message });
  }
});

app.post("/foundry/repair", async (req, res) => {
  try {
    res.json(await runFoundryOperator({ ...(req.body || {}), mode: "repair" }));
  } catch (err) {
    res.status(500).json({ error: "repair_failed", message: err.message });
  }
});

app.post("/foundry/deploy", async (req, res) => {
  try {
    res.json(await runFoundryOperator({ ...(req.body || {}), mode: "deploy" }));
  } catch (err) {
    res.status(500).json({ error: "deploy_failed", message: err.message });
  }
});

app.post("/foundry/upgrade", async (req, res) => {
  try {
    res.json(await runFoundryOperator({ ...(req.body || {}), mode: "upgrade" }));
  } catch (err) {
    res.status(500).json({ error: "upgrade_failed", message: err.message });
  }
});

app.post("/foundry/full-cycle", async (req, res) => {
  try {
    res.json(await runFoundryOperator({ ...(req.body || {}), mode: "full_cycle" }));
  } catch (err) {
    res.status(500).json({ error: "full_cycle_failed", message: err.message });
  }
});


module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Tool Foundry backend listening on port ${port}`));
}
