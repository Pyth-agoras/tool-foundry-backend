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

test("built-in core tools appear without manual registration", async () => {
  const res = await request(app).get("/tools/list").set("x-api-key", "test-key");
  assert.equal(res.status, 200);
  const ids = res.body.tools.map((tool) => tool.tool_id);
  assert.ok(ids.includes("idea_analyzer"));
  assert.ok(ids.includes("tool_mission_generator"));
  assert.ok(ids.includes("foundry_self_healer"));
});

test("can execute built-in idea analyzer without manual registration", async () => {
  const execution = await request(app)
    .post("/tools/execute")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "idea_analyzer",
      input: { raw_idea: "I want an AI that builds tools for itself." },
      user_visible_purpose: "Test the built-in idea analyzer."
    });

  assert.equal(execution.status, 200);
  assert.equal(execution.body.tool_id, "idea_analyzer");
  assert.ok(execution.body.result.core_goal);
});

test("can execute built-in tool mission generator without manual registration", async () => {
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

test("can execute foundry self-healer and seed core tools", async () => {
  const execution = await request(app)
    .post("/tools/execute")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "foundry_self_healer",
      input: {
        repair_mode: true,
        check_scope: "core tools, action schema, registry"
      },
      user_visible_purpose: "Repair and diagnose Tool Foundry setup."
    });

  assert.equal(execution.status, 200);
  assert.equal(execution.body.tool_id, "foundry_self_healer");
  assert.equal(execution.body.result.foundry_status, "healthy_core_tools_available");
  assert.ok(execution.body.result.core_tools_available.includes("idea_analyzer"));
  assert.ok(execution.body.result.core_tools_available.includes("tool_mission_generator"));
  assert.ok(execution.body.result.core_tools_available.includes("foundry_self_healer"));
});

test("can create a mission using generated mission fields", async () => {
  const generated = await request(app)
    .post("/tools/execute")
    .set("x-api-key", "test-key")
    .send({
      tool_id: "tool_mission_generator",
      input: {
        raw_idea: "I want a setup repair tool.",
        desired_tool_type: "foundry maintenance tool",
        risk_level: "low",
        user_constraints: "Keep it non-technical."
      },
      user_visible_purpose: "Generate a mission."
    });

  const missionBody = generated.body.result.complete_tool_mission;
  const mission = await request(app)
    .post("/tools/mission/create")
    .set("x-api-key", "test-key")
    .send(missionBody);

  assert.equal(mission.status, 200);
  assert.ok(mission.body.mission_id);
});
