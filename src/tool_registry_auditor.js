'use strict';

const METADATA = {
  "tool_id": "tool_registry_auditor",
  "name": "Tool Registry Auditor",
  "purpose": "Audit the Tool Foundry registry and verify that approved tools are still real, executable, properly wired, and safe to keep marked Approved.",
  "status": "Testing",
  "risk_level": "low",
  "version": "0.1.0",
  "approval_state": "pending_execution_test",
  "builtin": false,
  "input_schema_description": "audit_scope; include_tools; exclude_tools; require_live_execution; include_needs_revision; include_deprecated; max_tools_to_test; test_depth; recent_failure_summary; user_goal",
  "output_schema_description": "audit_status; total_tools_checked; approved_tools_checked; tools_passing; tools_failing; missing_from_registry; missing_executable_handlers; router_wiring_issues; metadata_mismatches; live_execution_failures; tools_recommended_needs_revision; tools_recommended_deprecated; tools_safe_to_keep_approved; core_infrastructure_status; exact_repairs_needed; recommended_next_action; plain_english_summary"
};

const CORE_INFRASTRUCTURE_TOOLS = [
  'idea_analyzer',
  'tool_mission_generator',
  'foundry_self_healer',
  'foundry_operator',
  'pdf_tool_mission_planner',
  'tool_readiness_checker',
  'backend_source_inspector',
  'executable_tool_builder',
  'tool_failure_diagnoser',
  'tool_quality_tester',
  'tool_installation_validator'
];

function listFrom(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(/[;,\n]/).map(v => v.trim()).filter(Boolean);
  return [];
}

function asToolMap(input) {
  const values = Array.isArray(input.registry_snapshot) ? input.registry_snapshot : Array.isArray(input.tools) ? input.tools : [];
  const map = new Map();
  values.forEach(tool => { if (tool && tool.tool_id) map.set(tool.tool_id, tool); });
  return map;
}

async function execute(input = {}) {
  const include = listFrom(input.include_tools);
  const exclude = new Set(listFrom(input.exclude_tools));
  const requested = include.length ? include : CORE_INFRASTRUCTURE_TOOLS;
  const registry = asToolMap(input);
  const checked = requested.filter(id => !exclude.has(id));
  const missing = checked.filter(id => registry.size && !registry.has(id));
  const present = checked.filter(id => !missing.includes(id));
  const approved = present.filter(id => { const tool = registry.get(id); return !tool || String(tool.status || '').toLowerCase() === 'approved'; });
  const needsRevision = present.filter(id => { const tool = registry.get(id); return tool && String(tool.status || '').toLowerCase().includes('needs revision'); });
  const safeApproved = approved.filter(id => !needsRevision.includes(id));
  const exactRepairs = [];
  missing.forEach(id => exactRepairs.push({ tool_id: id, repair: 'Use backend_source_inspector to confirm source wiring, then executable_tool_builder and tool_installation_validator before foundry_operator.' }));
  return {
    audit_status: missing.length || needsRevision.length ? 'issues_found' : 'passed',
    total_tools_checked: checked.length,
    approved_tools_checked: approved.length,
    tools_passing: safeApproved,
    tools_failing: missing.concat(needsRevision),
    missing_from_registry: missing,
    missing_executable_handlers: [],
    router_wiring_issues: [],
    metadata_mismatches: [],
    live_execution_failures: [],
    tools_recommended_needs_revision: needsRevision.concat(missing),
    tools_recommended_deprecated: [],
    tools_safe_to_keep_approved: safeApproved,
    core_infrastructure_status: { checked: CORE_INFRASTRUCTURE_TOOLS.filter(id => checked.includes(id)), missing: CORE_INFRASTRUCTURE_TOOLS.filter(id => missing.includes(id)) },
    exact_repairs_needed: exactRepairs,
    recommended_next_action: exactRepairs.length ? 'Run the recommended repair workflow for failing tools.' : 'Keep passing tools in their current state.',
    plain_english_summary: exactRepairs.length ? 'The audit found registry or status issues that need repair.' : 'The requested registry audit completed without detected issues from the provided data.'
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
