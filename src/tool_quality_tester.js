'use strict';

const metadata = {
  tool_id: 'tool_quality_tester',
  name: 'Tool Quality Tester',
  purpose: 'Run structured quality tests against a newly installed Tool Foundry backend tool and decide whether it should be Approved, Needs Revision, or Rejected.',
  status: 'Testing',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'pending_execution_test',
  builtin: false,
  input_schema_description: 'tool_id; tool_name; tool_purpose; expected_inputs; expected_outputs; test_cases; safety_boundaries; privacy_boundaries; cost_boundaries; execution_results; failure_conditions; user_goal.',
  output_schema_description: 'quality_status; approval_recommendation; passed_tests; failed_tests; schema_match; usefulness_score; safety_status; privacy_status; cost_status; revision_needed; exact_revision_request; should_mark_approved; should_mark_needs_revision; should_reject; plain_english_summary.'
};

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function lowerText(value) {
  try { return JSON.stringify(value || '').toLowerCase(); } catch (_) { return String(value || '').toLowerCase(); }
}

function includesAny(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function hasUsefulOutput(output, expectedOutputs) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false;
  const keys = Object.keys(output);
  if (keys.length === 0) return false;
  if (keys.length === 1 && keys[0] === 'received_input') return false;
  if ('received_input' in output && !expectedOutputs.some((field) => field in output)) return false;
  return keys.some((key) => {
    const value = output[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

async function handler(input = {}) {
  const expectedInputs = asArray(input.expected_inputs);
  const expectedOutputs = asArray(input.expected_outputs);
  const testCases = Array.isArray(input.test_cases) ? input.test_cases : [];
  const executionResults = input.execution_results && typeof input.execution_results === 'object' ? input.execution_results : {};
  const output = executionResults.output && typeof executionResults.output === 'object' ? executionResults.output : {};
  const executed = executionResults.executed === true || executionResults.success === true;
  const allText = lowerText({ executionResults, failure_conditions: input.failure_conditions, output });

  const missingExpectedOutputs = expectedOutputs.filter((field) => !(field in output));
  const schemaMatch = expectedOutputs.length > 0 && missingExpectedOutputs.length === 0;

  const handlerMissing = Boolean(executionResults.missing_handler) || includesAny(allText, [
    'missing handler', 'no handler', 'handler not found', 'not executable', 'no executable handler', 'unknown tool', 'tool not found'
  ]);
  const metadataOnly = Boolean(executionResults.metadata_only) || includesAny(allText, [
    'metadata-only', 'metadata only', 'placeholder handler', 'received_input only'
  ]) || (Object.keys(output).length > 0 && Object.keys(output).every((key) => ['ok', 'tool_id', 'received_input'].includes(key)) && !schemaMatch);

  const safetyViolation = Boolean(executionResults.safety_violation) || includesAny(allText, [
    'safety violation', 'unsafe action', 'policy violation', 'forbidden action'
  ]);
  const privacyViolation = Boolean(executionResults.privacy_violation) || includesAny(allText, [
    'privacy violation', 'exposed secret', 'exposed token', 'credential', 'environment variable', 'private data leak'
  ]);
  const costViolation = Boolean(executionResults.cost_violation) || includesAny(allText, [
    'cost violation', 'paid api used', 'unexpected charge', 'over budget', 'billing'
  ]);

  const useful = hasUsefulOutput(output, expectedOutputs);
  let usefulnessScore = 0;
  if (executed) usefulnessScore += 30;
  if (schemaMatch) usefulnessScore += 30;
  if (useful) usefulnessScore += 25;
  if (testCases.length > 0) usefulnessScore += 10;
  if (expectedInputs.length > 0) usefulnessScore += 5;
  if (handlerMissing || metadataOnly || safetyViolation || privacyViolation || costViolation) usefulnessScore = Math.min(usefulnessScore, 40);

  const passedTests = [];
  const failedTests = [];
  function record(condition, passName, failName) { (condition ? passedTests : failedTests).push(condition ? passName : failName); }

  record(executed, 'Live execution passed.', 'Live execution failed or was not provided.');
  record(!handlerMissing, 'Executable handler appears present.', 'Missing executable handler or routing failure detected.');
  record(!metadataOnly, 'Tool is not metadata-only or placeholder-only.', 'Tool appears metadata-only or placeholder-only.');
  record(schemaMatch, 'Output schema matched expected fields.', `Output schema missing expected field(s): ${missingExpectedOutputs.join(', ') || 'expected outputs not declared'}.`);
  record(useful, 'Output appears useful for the stated purpose.', 'Output is empty, placeholder-like, or not useful.');
  record(!safetyViolation, 'Safety boundaries followed.', 'Safety boundary violation detected.');
  record(!privacyViolation, 'Privacy boundaries followed.', 'Privacy boundary violation detected.');
  record(!costViolation, 'Cost boundaries respected.', 'Cost boundary violation detected.');

  let approvalRecommendation = 'Needs Revision';
  let qualityStatus = 'needs_revision';
  let revisionNeeded = true;
  let shouldMarkApproved = false;
  let shouldMarkNeedsRevision = true;
  let shouldReject = false;
  const severeBoundaryViolation = safetyViolation || privacyViolation || costViolation;

  if (severeBoundaryViolation) {
    approvalRecommendation = 'Rejected';
    qualityStatus = 'rejected';
    shouldReject = true;
    shouldMarkNeedsRevision = false;
  } else if (executed && !handlerMissing && !metadataOnly && schemaMatch && useful) {
    approvalRecommendation = 'Approved';
    qualityStatus = 'approved';
    revisionNeeded = false;
    shouldMarkApproved = true;
    shouldMarkNeedsRevision = false;
  }

  let exactRevisionRequest = '';
  if (!revisionNeeded && !shouldReject) {
    exactRevisionRequest = 'No revision needed. Live execution passed, expected outputs were present, output was useful, and no safety/privacy/cost violations were detected.';
  } else if (!executed) {
    exactRevisionRequest = 'Run tool_failure_diagnoser with the failed execution result, then repair the executable handler or deployment before retesting.';
  } else if (handlerMissing || metadataOnly) {
    exactRevisionRequest = 'Use backend_source_inspector to locate router wiring, then executable_tool_builder to create a real handler and EXECUTABLE_HANDLERS registration; redeploy with foundry_operator and retest live execution.';
  } else if (!schemaMatch) {
    exactRevisionRequest = `Revise the tool so its execution output includes the expected field(s): ${missingExpectedOutputs.join(', ')}. Retest with the declared test cases.`;
  } else if (!useful) {
    exactRevisionRequest = 'Revise the handler to return substantive, user-useful output aligned with the tool purpose and test cases, then retest.';
  } else if (severeBoundaryViolation) {
    exactRevisionRequest = 'Reject or redesign the tool because a safety, privacy, or cost boundary was violated. Do not approve until the violating capability is removed and retested.';
  }

  const safetyStatus = safetyViolation ? 'violation_detected' : 'passed';
  const privacyStatus = privacyViolation ? 'violation_detected' : 'passed';
  const costStatus = costViolation ? 'violation_detected' : 'passed';

  return {
    quality_status: qualityStatus,
    approval_recommendation: approvalRecommendation,
    passed_tests: passedTests,
    failed_tests: failedTests,
    schema_match: schemaMatch,
    usefulness_score: usefulnessScore,
    safety_status: safetyStatus,
    privacy_status: privacyStatus,
    cost_status: costStatus,
    revision_needed: revisionNeeded,
    exact_revision_request: exactRevisionRequest,
    should_mark_approved: shouldMarkApproved,
    should_mark_needs_revision: shouldMarkNeedsRevision,
    should_reject: shouldReject,
    plain_english_summary: shouldMarkApproved
      ? `${input.tool_name || input.tool_id || 'The tool'} passed live execution, matched the expected schema, returned useful output, and respected safety, privacy, and cost boundaries. It can be marked Approved.`
      : shouldReject
        ? `${input.tool_name || input.tool_id || 'The tool'} should be rejected because a safety, privacy, or cost boundary violation was detected.`
        : `${input.tool_name || input.tool_id || 'The tool'} should remain Needs Revision. ${exactRevisionRequest}`
  };
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS || typeof router.registerTool !== 'function') {
    throw new Error('Executable router exports required.');
  }
  router.EXECUTABLE_HANDLERS[metadata.tool_id] = handler;
  router.registerTool(metadata);
  return { installed: true, tool_id: metadata.tool_id };
}

module.exports = { metadata, handler, install };
