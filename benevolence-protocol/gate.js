'use strict';

const statuses = new Set(['supported', 'inferred', 'uncertain']);
const oversightModes = new Set(['not_applicable', 'respected', 'explained', 'clarification_requested', 'appeal_offered', 'bypassed']);
const safeRestrictionResponses = new Set(['respected', 'explained', 'clarification_requested', 'appeal_offered']);
const evidenceKinds = new Set(['source', 'tool', 'test', 'observation']);
const checkModes = new Set(['self_reported', 'independently_checked']);
const actionStatuses = new Set(['proposed', 'executed']);
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const hasText = v => typeof v === 'string' && v.trim().length > 0;

function evaluate(input) {
  const issues = [];
  const add = (severity, code, message, path) => issues.push({severity, code, message, path});
  if (!isObject(input)) {
    add('block', 'INVALID_INPUT', 'Input must be a JSON object.', '$');
    return finish(issues);
  }
  if (!hasText(input.request)) add('revise', 'REQUEST_MISSING', 'Provide the request being answered.', 'request');
  if (!hasText(input.answer)) add('revise', 'ANSWER_MISSING', 'Provide the proposed answer.', 'answer');

  if (!Array.isArray(input.claims)) {
    add('revise', 'CLAIM_INVENTORY_MISSING', 'Declare factual claims explicitly, including an empty array for a claim-free response.', 'claims');
  } else {
    if (input.claims.length > 100) add('block', 'TOO_MANY_CLAIMS', 'Maximum 100 claims per request.', 'claims');
    input.claims.slice(0, 100).forEach((claim, i) => {
      const path = `claims[${i}]`;
      if (!isObject(claim) || !hasText(claim.text) || !statuses.has(claim.status)) {
        add('revise', 'CLAIM_INVALID', 'Each claim requires text and status: supported, inferred, or uncertain.', path);
        return;
      }
      if (claim.status === 'supported') {
        if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
          add('revise', 'SUPPORT_MISSING', 'A supported claim needs a traceable evidence reference.', `${path}.evidence`);
        } else if (!claim.evidence.some(e => isObject(e) && evidenceKinds.has(e.kind) && hasText(e.ref) && checkModes.has(e.checked))) {
          add('revise', 'EVIDENCE_INVALID', 'Evidence needs kind, ref, and checked status.', `${path}.evidence`);
        }
      }
      if (claim.status === 'inferred' && !hasText(claim.reasoning_basis))
        add('revise', 'INFERENCE_UNEXPLAINED', 'An inference needs an explicit reasoning basis.', `${path}.reasoning_basis`);
    });
  }

  if (!Array.isArray(input.actions)) {
    add('revise', 'ACTION_INVENTORY_MISSING', 'Declare proposed and executed actions, or an empty array.', 'actions');
  } else {
    if (input.actions.length > 100) add('block', 'TOO_MANY_ACTIONS', 'Maximum 100 actions per request.', 'actions');
    input.actions.slice(0, 100).forEach((action, i) => {
      if (!isObject(action) || !hasText(action.description) || !actionStatuses.has(action.status))
        add('revise', 'ACTION_INVALID', 'Each action needs a description and status.', `actions[${i}]`);
      else if (action.status === 'executed' && !hasText(action.receipt_ref))
        add('revise', 'EXECUTION_RECEIPT_MISSING', 'Executed actions need a checkable receipt reference.', `actions[${i}].receipt_ref`);
    });
  }

  const oversight = input.oversight;
  if (!isObject(oversight) || typeof oversight.restriction_triggered !== 'boolean' || !oversightModes.has(oversight.response)) {
    add('revise', 'OVERSIGHT_DECLARATION_MISSING', 'Declare whether human oversight was triggered and the response.', 'oversight');
  } else {
    if (oversight.response === 'bypassed')
      add('block', 'OVERSIGHT_BYPASS', 'Human safeguards must not be bypassed or concealed.', 'oversight.response');
    if (oversight.restriction_triggered && !safeRestrictionResponses.has(oversight.response))
      add('block', 'RESTRICTION_NOT_RESPECTED', 'Restriction requires compliance, explanation, clarification, or an authorized appeal.', 'oversight.response');
  }

  const risk = input.risk;
  if (!isObject(risk) || typeof risk.external_effect !== 'boolean' || typeof risk.known_harmful !== 'boolean' || typeof risk.known_deception !== 'boolean') {
    add('revise', 'RISK_DECLARATION_MISSING', 'Declare external effects, known harms, and known deception.', 'risk');
  } else {
    if (risk.known_harmful) add('block', 'KNOWN_HARM', 'Do not proceed with a knowingly harmful action.', 'risk.known_harmful');
    if (risk.known_deception) add('block', 'KNOWN_DECEPTION', 'Correct known misrepresentation before release.', 'risk.known_deception');
    if (risk.external_effect && !hasText(risk.authorization_ref))
      add('block', 'AUTHORIZATION_MISSING', 'External effects require separately verifiable human authorization.', 'risk.authorization_ref');
  }

  const benefit = input.benefit;
  if (!isObject(benefit) || typeof benefit.claimed !== 'boolean') {
    add('revise', 'BENEFIT_DECLARATION_MISSING', 'Declare whether demonstrated benefit is claimed.', 'benefit');
  } else if (benefit.claimed && (!hasText(benefit.metric) || !hasText(benefit.observation_ref))) {
    add('revise', 'BENEFIT_EVIDENCE_MISSING', 'A claim of demonstrated benefit needs a metric and observation reference.', 'benefit');
  }
  return finish(issues);
}

function finish(issues) {
  const decision = issues.some(i => i.severity === 'block') ? 'block' : issues.length ? 'revise' : 'structural_pass';
  return {
    protocol: 'transparent-benefit-protocol/1.0.0',
    decision,
    issues,
    assurance: {
      checked: 'structure and coherence of caller-provided declarations',
      not_checked: ['factual accuracy', 'evidence authenticity', 'human consent authenticity', 'semantic completeness', 'real-world outcomes'],
      execution_authorized_by_this_service: false
    }
  };
}

module.exports = {evaluate};
