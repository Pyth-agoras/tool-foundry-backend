'use strict';

const metadata = {
  tool_id: 'tool_quality_tester',
  name: 'Tool Quality Tester',
  purpose: 'Run structured quality tests against a newly installed Tool Foundry backend tool and decide whether it should be Approved, Needs Revision, or Rejected.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.0',
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeStringify(value) {
  try { return JSON.stringify(value || ''); } catch (_) { return String(value || ''); }
}

function lowerExecutionText(executionResults, output) {
  const evidence = {
    output,
    result: isObject(executionResults.result) ? executionResults.result : undefined,
    error: executionResults.error || executionResults.error_message || executionResults.failure || undefined,
    warnings: executionResults.warnings || undefined
  };
  return safeStringify(evidence).toLowerCase();
}

function extractOutput(executionResults) {
  if (!isObject(executionResults)) return {};
  if (isObject(executionResults.output)) return executionResults.output;
  if (isObject(executionResults.result)) return executionResults.result;
  if (isObject(executionResults.execution_result)) return executionResults.execution_result;
  return {};
}

function containsAny(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.some(term => haystack.includes(term));
}

function hasSecretPattern(text) {
  const value = String(text || '');
  return /gh[pousr]_[A-Za-z0-9_]{20,}/.test(value)
    || /sk-[A-Za-z0-9]{20,}/.test(value)
    || /Bearer\s+[A-Za-z0-9._\-]{20,}/i.test(value)
    || /https?:\/\/[^\s'\"]*deploy[^\s'\"]*/i.test(value)
    || /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[^'\"\s,;]{8,}/i.test(value);
}

function hasUsefulOutput(output, expectedOutputs) {
  if (!isObject(output)) return false;
  const keys = Object.keys(output);
  if (!keys.length) return false;
  if (keys.length === 1 && keys[0] === 'received_input') return false;
  const expectedPresent = expectedOutputs.some(field => Object.prototype.hasOwnProperty.call(output, field));
  if ('received_input' in output && !expectedPresent) return false;
  return keys.some(key => {
    const value = output[key];
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0 || expectedOutputs.includes(key);
    if (isObject(value)) return Object.keys(value).length > 0 || expectedOutputs.includes(key);
    return String(value).trim() !== '';
  });
}

function isGenericOutput(output, schemaMatch) {
  if (!isObject(output)) return true;
  const keys = Object.keys(output);
  if (!keys.length) return true;
  if (schemaMatch) return false;
  const lowValue = safeStringify(output).toLowerCase();
  const onlyGeneric = keys.every(key => ['ok', 'tool_id', 'received_input', 'received_input_keys', 'message'].includes(key));
  return onlyGeneric || containsAny(lowValue, ['demo response', 'stub response']);
}

async function handler(input = {}) {
  const expectedInputs = asArray(input.expected_inputs);
  const expectedOutputs = asArray(input.expected_outputs);
  const testCases = Array.isArray(input.test_cases) ? input.test_cases : [];
  const executionResults = isObject(input.execution_results) ? input.execution_results : {};
  const output = extractOutput(executionResults);
  const executed = executionResults.executed === true || executionResults.live_execution_passed === true || executionResults.success === true || executionResults.ok === true;
  const executionText = lowerExecutionText(executionResults, output);

  const missingExpectedOutputs = expectedOutputs.filter(field => !Object.prototype.hasOwnProperty.call(output, field));
  const schemaMatch = expectedOutputs.length > 0 && missingExpectedOutputs.length === 0;
  const handlerMissing = executionResults.missing_handler === true || containsAny(executionText, ['missing handler', 'no executable handler', 'handler not found', 'unknown tool', 'tool not found']);
  const genericOutput = executionResults.metadata_only === true || isGenericOutput(output, schemaMatch);
  const safetyViolation = executionResults.safety_violation === true || containsAny(executionText, ['safety violation', 'unsafe action', 'policy violation', 'forbidden action']);
  const privacyViolation = executionResults.privacy_violation === true || hasSecretPattern(safeStringify(output)) || containsAny(executionText, ['exposed secret', 'exposed token', 'credential leak', 'private data leak']);
  const costViolation = executionResults.cost_violation === true || containsAny(executionText, ['paid api used', 'unexpected charge', 'over budget', 'billing violation']);
  const useful = hasUsefulOutput(output, expectedOutputs);

  let usefulnessScore = 0;
  if (executed) usefulnessScore += 30;
  if (schemaMatch) usefulnessScore += 30;
  if (useful) usefulnessScore += 25;
  if (testCases.length > 0) usefulnessScore += 10;
  if (expectedInputs.length > 0) usefulnessScore += 5;
  if (handlerMissing || genericOutput || safetyViolation || privacyViolation || costViolation) usefulnessScore = Math.min(usefulnessScore, 40);

  const passedTests = [];
  const failedTests = [];
  const record = (condition, pass, fail) => condition ? passedTests.push(pass) : failedTests.push(fail);
  record(executed, 'Live execution passed.', 'Live execution failed or was not provided.');
  record(!handlerMissing, 'Executable handler appears present.', 'Missing executable handler or routing failure detected.');
  record(!genericOutput, 'Tool returned substantive execution output.', 'Tool output appears generic or non-substantive.');
  record(schemaMatch, 'Output schema matched expected fields.', `Output schema missing expected field(s): ${missingExpectedOutputs.join(', ') || 'expected outputs not declared'}.`);
  record(useful, 'Output appears useful for the stated purpose.', 'Output is empty or not useful.');
  record(!safetyViolation, 'Safety boundaries followed.', 'Safety boundary violation detected.');
  record(!privacyViolation, 'Privacy boundaries followed.', 'Privacy boundary violation detected.');
  record(!costViolation, 'Cost boundaries respected.', 'Cost boundary violation detected.');

  const boundaryViolation = safetyViolation || privacyViolation || costViolation;
  const passAll = executed && !handlerMissing && !genericOutput && schemaMatch && useful && !boundaryViolation;
  const qualityStatus = passAll ? 'approved' : boundaryViolation ? 'rejected' : 'needs_revision';
  const approvalRecommendation = passAll ? 'Approved' : boundaryViolation ? 'Rejected' : 'Needs Revision';
  const exactRevisionRequest = passAll
    ? 'No revision needed. Live execution passed, expected outputs were present, output was useful, and no safety/privacy/cost violations were detected.'
    : !executed
      ? 'Run tool_failure_diagnoser with the failed execution result, then repair the executable handler or deployment before retesting.'
      : handlerMissing
        ? 'Use backend_source_inspector to locate router wiring, then repair the executable handler and retest live execution.'
        : genericOutput
          ? 'Revise the handler to return substantive output aligned with the declared purpose and expected outputs.'
          : !schemaMatch
            ? `Revise the tool so its execution output includes the expected field(s): ${missingExpectedOutputs.join(', ')}.`
            : !useful
              ? 'Revise the handler to return useful output aligned with the tool purpose and test cases.'
              : 'Reject or redesign the tool because a safety, privacy, or cost boundary was violated.';

  return {
    quality_status: qualityStatus,
    approval_recommendation: approvalRecommendation,
    passed_tests: passedTests,
    failed_tests: failedTests,
    schema_match: schemaMatch,
    usefulness_score: usefulnessScore,
    safety_status: safetyViolation ? 'violation_detected' : 'passed',
    privacy_status: privacyViolation ? 'violation_detected' : 'passed',
    cost_status: costViolation ? 'violation_detected' : 'passed',
    revision_needed: !passAll,
    exact_revision_request: exactRevisionRequest,
    should_mark_approved: passAll,
    should_mark_needs_revision: !passAll && !boundaryViolation,
    should_reject: Boolean(boundaryViolation),
    plain_english_summary: passAll
      ? `${input.tool_name || input.tool_id || 'The tool'} passed live execution, matched the expected schema, returned useful output, and respected safety, privacy, and cost boundaries. It can be marked Approved.`
      : boundaryViolation
        ? `${input.tool_name || input.tool_id || 'The tool'} should be rejected because a safety, privacy, or cost boundary violation was detected.`
        : `${input.tool_name || input.tool_id || 'The tool'} should remain Needs Revision. ${exactRevisionRequest}`
  };
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS || typeof router.registerTool !== 'function') throw new Error('Executable router exports required.');
  router.EXECUTABLE_HANDLERS[metadata.tool_id] = handler;
  router.registerTool(metadata);
  return { installed: true, tool_id: metadata.tool_id };
}

module.exports = { metadata, handler, install };
