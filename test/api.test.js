const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

process.env.API_KEY = "test-key";
process.env.DATA_FILE = path.join(os.tmpdir(), `tool-foundry-test-${Date.now()}.json`);

const app = require("../src/server");

test("health endpoint works without auth", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("protected endpoint rejects missing API key", async () => {
  const res = await request(app).get("/tools/list");
  assert.equal(res.status, 401);
});

test("can create mission, register idea analyzer, evaluate, and execute", async () => {
  const mission = await request(app)
    .post("/tools/mission/create")
    .set("x-api-key", "test-key")
    .send({
      tool_name: "Idea Analyzer",
      purpose: "Analyze raw user ideas.",
      capability_needed: "Return core goal, intelligence pattern, risk level, and next action.",
      success_criteria: ["Returns structured output"],
      approval_required: false
    });

  assert.equal(mission.status, 200);
  assert.ok(mission.body.mission_id);

  const register = await request(app)
    .post("/tools/register")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "idea_analyzer",
      name: "Idea Analyzer",
      purpose: "Analyze raw user ideas into structured next steps.",
      status: "Approved",
      version: "0.1.0",
      risk_level: "low",
      approval_state: "approved"
    });

  assert.equal(register.status, 200);

  const evaluation = await request(app)
    .post("/tools/evaluate")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "idea_analyzer",
      mission_id: mission.body.mission_id,
      evaluation_depth: "quick"
    });

  assert.equal(evaluation.status, 200);
  assert.equal(evaluation.body.passed, true);

  const execution = await request(app)
    .post("/tools/execute")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "idea_analyzer",
      input: { raw_idea: "I want an AI that builds tools for itself." },
      user_visible_purpose: "Test the starter idea analyzer."
    });

  assert.equal(execution.status, 200);
  assert.equal(execution.body.tool_id, "idea_analyzer");
  assert.ok(execution.body.result.core_goal);
});


test("can register and execute tool mission generator", async () => {
  const register = await request(app)
    .post("/tools/register")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "tool_mission_generator",
      name: "Tool Mission Generator",
      purpose: "Convert a raw idea or analyzed idea into a complete Codex-ready Tool Mission.",
      status: "Approved",
      version: "0.1.0",
      risk_level: "low",
      approval_state: "approved"
    });

  assert.equal(register.status, 200);

  const execution = await request(app)
    .post("/tools/execute")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "tool_mission_generator",
      input: {
        raw_idea: "I want a PDF analyzer tool.",
        desired_tool_type: "pdf_analyzer",
        risk_level: "low",
        user_constraints: "No coding questions for the user."
      },
      user_visible_purpose: "Generate a Codex-ready tool mission."
    });

  assert.equal(execution.status, 200);
  assert.equal(execution.body.tool_id, "tool_mission_generator");
  assert.ok(execution.body.result.complete_tool_mission);
  assert.ok(execution.body.result.complete_tool_mission.tool_name);
  assert.ok(execution.body.result.complete_tool_mission.success_criteria.length);
  assert.ok(execution.body.result.complete_tool_mission.codex_implementation_notes);
});
