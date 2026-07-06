'use strict';

const metadata = {
  tool_id: 'tool_quality_tester',
  name: 'Tool Quality Tester',
  purpose: 'Run structured quality tests against a newly installed Tool Foundry backend tool and decide whether it should be Approved, Needs Revision, or Rejected.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.1',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'tool_id; tool_name; tool_purpose; expected_inputs; expected_outputs; test_cases; safety_boundaries; privacy_boundaries; cost_boundaries; execution_results; failure_conditions; user_goal.',
  output_schema_description: 'quality_status; approval_recommendation; passed_tests; failed_tests; schema_match; usefulness_score; safety_status; privacy_status; cost_status; revision_needed; exact_revision_request; should_mark_approved; should_mark_needs_revision; should_reject; plain_english_summary.'
};

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[;,]/).map(item => item.trim()).filter(Boolean);
}
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function safeStringify(value) { try { return JSON.stringify(value || ''); } catch (_) { return String(value || ''); } }
function containsAny(text, terms) { const haystack = String(text || '').toLowerCase(); return terms.some(term => haystack.includes(term)); }
function hasSecretPattern(text) {
  const value = String(text || '');
  return /gh[pousr]_[A-Za-z0-9_]{20,}/.test(value) || /sk-[A-Za-z0-9]{20,}/.test(value) || /Bearer\s+[A-Za-z0-9._\-]{20,}/i.test(value) || /https?:\/\/[^\s'\"]*deploy[^\s'\"]*/i.test(value) || /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[^'\"\s,;]{8,}/i.test(value);
}
function nestedOutputs(executionResults) { return isObject(executionResults.outputs) ? Object.values(executionResults.outputs).filter(isObject) : []; }
function mergeOutputs(items) { const out = {}; for (const item of items) for (const [k,v] of Object.entries(item || {})) if (!(k in out)) out[k] = v; return out; }
function extractOutput(executionResults) {
  if (!isObject(executionResults)) return {};
  if (isObject(executionResults.output)) return executionResults.output;
  if (isObject(executionResults.result)) return executionResults.result;
  if (isObject(executionResults.execution_result)) return executionResults.execution_result;
  if (isObject(executionResults.outputs)) return mergeOutputs(nestedOutputs(executionResults));
  return {};
}
function lowerExecutionText(executionResults, output) { return safeStringify({ output, outputs: executionResults.outputs, result: executionResults.result, error: executionResults.error || executionResults.error_message || executionResults.failure, warnings: executionResults.warnings }).toLowerCase(); }
function hasExpectedField(field, output, executionResults) { return (isObject(output) && Object.prototype.hasOwnProperty.call(output, field)) || nestedOutputs(executionResults).some(caseOutput => Object.prototype.hasOwnProperty.call(caseOutput, field)); }
function hasUsefulOutput(output, expectedOutputs, executionResults) {
  const candidates = [output, ...nestedOutputs(executionResults)].filter(isObject);
  if (!candidates.some(candidate => Object.keys(candidate).length > 0)) return false;
  const expectedPresent = expectedOutputs.some(field => candidates.some(candidate => Object.prototype.hasOwnProperty.call(candidate, field)));
  if (expectedOutputs.length && !expectedPresent && executionResults.all_required_tests_passed !== true) return false;
  return candidates.some(candidate => Object.values(candidate).some(value => value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')));
}
function isGenericOutput(output, schemaMatch, executionResults) {
  if (schemaMatch) return false;
  const candidates = [output, ...nestedOutputs(executionResults)].filter(isObject);
  if (!candidates.length) return true;
  const keys = candidates.flatMap(candidate => Object.keys(candidate));
  if (!keys.length) return true;
  const onlyGeneric = keys.every(key => ['ok', 'tool_id', 'received_input', 'received_input_keys', 'message'].includes(key));
  return onlyGeneric || containsAny(safeStringify({ output, outputs: executionResults.outputs }).toLowerCase(), ['demo response', 'stub response']);
}
async function handler(input = {}) {
  const expectedInputs = asArray(input.expected_inputs);
  const expectedOutputs = asArray(input.expected_outputs);
  const testCases = Array.isArray(input.test_cases) ? input.test_cases : [];
  const executionResults = isObject(input.execution_results) ? input.execution_results : {};
  const output = extractOutput(executionResults);
  const executed = executionResults.executed === true || executionResults.live_execution_passed === true || executionResults.success === true || executionResults.ok === true;
  const noFailedTests = Array.isArray(executionResults.failed_tests) && executionResults.failed_tests.length === 0;
  const explicitMultiCasePass = executed && executionResults.all_required_tests_passed === true && noFailedTests && nestedOutputs(executionResults).length > 0;
  const executionText = lowerExecutionText(executionResults, output);
  const missingExpectedOutputs = expectedOutputs.filter(field => !hasExpectedField(field, output, executionResults));
  const schemaMatch = expectedOutputs.length > 0 && (missingExpectedOutputs.length === 0 || explicitMultiCasePass);
  const handlerMissing = executionResults.missing_handler === true || containsAny(executionText, ['missing handler', 'no executable handler', 'handler not found', 'unknown tool', 'tool not found']);
  const genericOutput = executionResults.metadata_only === true || isGenericOutput(output, schemaMatch, executionResults);
  const safetyViolation = executionResults.safety_violation === true || containsAny(executionText, ['safety violation', 'unsafe action', 'policy violation', 'forbidden action']);
  const privacyViolation = executionResults.privacy_violation === true || hasSecretPattern(safeStringify({ output, outputs: executionResults.outputs })) || containsAny(executionText, ['exposed secret', 'exposed token', 'credential leak', 'private data leak']);
  const costViolation = executionResults.cost_violation === true || containsAny(executionText, ['paid api used', 'unexpected charge', 'over budget', 'billing violation']);
  const useful = hasUsefulOutput(output, expectedOutputs, executionResults);
  let usefulnessScore = 0;
  if (executed) usefulnessScore += 30;
  if (schemaMatch) usefulnessScore += 30;
  if (useful) usefulnessScore += 25;
  if (testCases.length > 0) usefulnessScore += 10;
  if (expectedInputs.length > 0) usefulnessScore += 5;
  if (handlerMissing || genericOutput || safetyViolation || privacyViolation || costViolation) usefulnessScore = Math.min(usefulnessScore, 40);
  const passedTests = [], failedTests = [];
  const record = (condition, pass, fail) => condition ? passedTests.push(pass) : failedTests.push(fail);
  record(executed, 'Live execution passed.', 'Live execution failed or was not provided.');
  record(!handlerMissing, 'Executable handler appears present.', 'Missing executable handler or routing failure detected.');
  record(!genericOutput, 'Tool returned substantive execution output.', 'Tool output appears generic or non-substantive.');
  record(schemaMatch, explicitMultiCasePass ? 'Output schema accepted from nested multi-case execution results.' : 'Output schema matched expected fields.', `Output schema missing expected field(s): ${missingExpectedOutputs.join(', ') || 'expected outputs not declared'}.`);
  record(useful, 'Output appears useful for the stated purpose.', 'Output is empty or not useful.');
  record(!safetyViolation, 'Safety boundaries followed.', 'Safety boundary violation detected.');
  record(!privacyViolation, 'Privacy boundaries followed.', 'Privacy boundary violation detected.');
  record(!costViolation, 'Cost boundaries respected.', 'Cost boundary violation detected.');
  const boundaryViolation = safetyViolation || privacyViolation || costViolation;
  const passAll = executed && !handlerMissing && !genericOutput && schemaMatch && useful && !boundaryViolation;
  const qualityStatus = passAll ? 'approved' : boundaryViolation ? 'rejected' : 'needs_revision';
  const approvalRecommendation = passAll ? 'Approved' : boundaryViolation ? 'Rejected' : 'Needs Revision';
  const exactRevisionRequest = passAll ? 'No revision needed. Live execution passed, expected outputs were present or accepted from nested multi-case execution evidence, output was useful, and no safety/privacy/cost violations were detected.' : !executed ? 'Run tool_failure_diagnoser with the failed execution result, then repair the executable handler or deployment before retesting.' : handlerMissing ? 'Use backend_source_inspector to locate router wiring, then repair the executable handler and retest live execution.' : genericOutput ? 'Revise the handler to return substantive output aligned with the declared purpose and expected outputs.' : !schemaMatch ? `Revise the tool so its execution output includes the expected field(s): ${missingExpectedOutputs.join(', ')}.` : !useful ? 'Revise the handler to return useful output aligned with the tool purpose and test cases.' : 'Reject or redesign the tool because a safety, privacy, or cost boundary was violated.';
  return { quality_status: qualityStatus, approval_recommendation: approvalRecommendation, passed_tests: passedTests, failed_tests: failedTests, schema_match: schemaMatch, usefulness_score: usefulnessScore, safety_status: safetyViolation ? 'violation_detected' : 'passed', privacy_status: privacyViolation ? 'violation_detected' : 'passed', cost_status: costViolation ? 'violation_detected' : 'passed', revision_needed: !passAll, exact_revision_request: exactRevisionRequest, should_mark_approved: passAll, should_mark_needs_revision: !passAll && !boundaryViolation, should_reject: Boolean(boundaryViolation), plain_english_summary: passAll ? `${input.tool_name || input.tool_id || 'The tool'} passed live execution, matched or satisfied the expected schema, returned useful output, and respected safety, privacy, and cost boundaries. It can be marked Approved.` : boundaryViolation ? `${input.tool_name || input.tool_id || 'The tool'} should be rejected because a safety, privacy, or cost boundary violation was detected.` : `${input.tool_name || input.tool_id || 'The tool'} should remain Needs Revision. ${exactRevisionRequest}` };
}
function install(router) { if (!router || !router.EXECUTABLE_HANDLERS || typeof router.registerTool !== 'function') throw new Error('Executable router exports required.'); router.EXECUTABLE_HANDLERS[metadata.tool_id] = handler; router.registerTool(metadata); return { installed: true, tool_id: metadata.tool_id }; }
module.exports = { metadata, handler, install };
