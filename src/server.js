const express = require("express");
const { readStore, writeStore, addEvent, nowIso, id } = require("./store");

const app = express();
app.use(express.json({ limit: "1mb" }));

const TOOL_STATES = ["Draft", "Building", "Testing", "Needs Revision", "Pending Approval", "Approved", "Deprecated"];

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

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "tool-foundry-backend", version: "0.1.0", time: nowIso() });
});

app.get("/tools/list", (req, res) => {
  const state = readStore();
  res.json({
    tools: state.tools.map((tool) => ({
      tool_id: tool.tool_id,
      name: tool.name,
      purpose: tool.purpose,
      status: tool.status,
      risk_level: tool.risk_level || "unknown",
      version: tool.version || "0.1.0",
      approval_state: tool.approval_state || "unknown"
    }))
  });
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
  const tool = {
    tool_id: body.tool_id,
    name: body.name,
    purpose: body.purpose,
    status: body.status,
    version: body.version || "0.1.0",
    input_schema_description: body.input_schema_description || "",
    output_schema_description: body.output_schema_description || "",
    risk_level: body.risk_level || "low",
    approval_state: body.approval_state || (body.status === "Approved" ? "approved" : "pending"),
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
  const tool = state.tools.find((item) => item.tool_id === tool_id);
  if (!tool) return res.status(404).json({ error: "Tool not found." });

  const passed = tool.status === "Approved" || tool.status === "Pending Approval";
  const score = passed ? 8.4 : 5.5;
  const evaluation = {
    evaluation_id: id("eval"),
    tool_id,
    mission_id: mission_id || null,
    evaluation_depth,
    score,
    passed,
    report: passed
      ? "Tool appears ready for controlled use based on its registered status. This v0 evaluator is basic and should be upgraded later."
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
  const tool = state.tools.find((item) => item.tool_id === tool_id);
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

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Tool Foundry backend listening on port ${port}`));
}
