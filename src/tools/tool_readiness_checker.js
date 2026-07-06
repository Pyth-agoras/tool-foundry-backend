'use strict';

const TOOL_READINESS_CHECKER_METADATA = {
  tool_id: 'tool_readiness_checker',
  name: 'Tool Readiness Checker',
  purpose: 'Given a proposed tool idea, check whether the Tool Foundry already has the needed capabilities, whether a new tool is needed, what risk level it has, whether it requires approval, and what the next action should be.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.1.0',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'raw_idea; optional context; optional desired_tool_type; optional risk_level; optional user_constraints; optional registry_snapshot.',
  output_schema_description: 'existing_capability_match; new_tool_needed; recommended_tool_id; risk_level; approval_required; reason; next_action; registry_check_summary; owner_level_decision_needed.'
};

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  const stop = new Set(['a','an','and','are','as','at','be','by','for','from','given','has','have','in','into','is','it','new','of','on','or','that','the','to','tool','tools','with','whether','what','when','where','who','why']);
  return normalize(value).split(' ').filter((word) => word && word.length > 2 && !stop.has(word));
}

function hasAny(text, terms) {
  const normalized = normalize(text);
  return terms.some((term) => normalized.includes(term));
}

function inferRequestedCapability(input) {
  const combined = [input.raw_idea, input.context, input.desired_tool_type, input.user_constraints].filter(Boolean).join(' ');
  return {
    text: combined,
    tokens: tokenize(combined)
  };
}

function scoreToolMatch(request, tool) {
  if (!tool || normalize(tool.status) !== 'approved') return null;
  const haystack = normalize([tool.tool_id, tool.name, tool.purpose, tool.input_schema_description, tool.output_schema_description].filter(Boolean).join(' '));
  const requestText = normalize(request.text);
  const requestTokens = new Set(request.tokens);
  let overlap = 0;
  for (const token of requestTokens) {
    if (haystack.includes(token)) overlap += 1;
  }

  const id = normalize(tool.tool_id);
  let fit = 'none';
  let reason = '';

  const startupIdeaRequest = hasAny(requestText, ['startup idea', 'startup ideas', 'analyzes startup', 'analyze startup', 'raw ideas', 'idea analysis', 'risk level and next action']);
  if (id === 'idea_analyzer' && startupIdeaRequest) {
    fit = 'strong';
    reason = 'The approved idea_analyzer already analyzes raw ideas and returns risk level and next action.';
  } else if (id === 'tool_mission_generator' && hasAny(requestText, ['mission', 'codex-ready', 'tool mission', 'implementation mission'])) {
    fit = 'strong';
    reason = 'The approved tool_mission_generator already creates complete tool missions.';
  } else if (id === 'pdf_tool_mission_planner' && hasAny(requestText, ['pdf', 'document', 'invoice extractor', 'page reference', 'ocr'])) {
    fit = 'strong';
    reason = 'The approved pdf_tool_mission_planner already plans PDF/document analysis tool missions.';
  } else if (id === 'tool_readiness_checker' && hasAny(requestText, ['tool readiness', 'already has', 'new tool needed', 'approval required', 'registry check'])) {
    fit = 'strong';
    reason = 'This tool is designed to check registry fit, new-tool need, risk, approval, and next action.';
  } else if (requestTokens.size > 0 && overlap >= Math.max(3, Math.ceil(requestTokens.size * 0.35))) {
    fit = 'strong';
    reason = 'The approved tool purpose substantially overlaps with the proposed capability.';
  } else if (overlap >= 2) {
    fit = 'partial';
    reason = 'The approved tool overlaps with part of the requested capability but may not cover the full request.';
  }

  if (fit === 'none') return null;
  return {
    tool_id: tool.tool_id,
    name: tool.name,
    fit_level: fit,
    reason,
    score: overlap
  };
}

function inferApproval(input, text) {
  const approvalRules = [
    ['public deployment', ['public deploy', 'public deployment', 'make public', 'public website', 'public api']],
    ['paid API or paid service usage', ['paid api', 'paid service', 'api credits', 'billing', 'charge', 'subscription']],
    ['personal or sensitive data storage', ['store personal', 'store sensitive', 'save personal', 'save sensitive', 'database of users', 'medical records', 'financial records', 'identity documents']],
    ['sending emails or messages', ['send email', 'send emails', 'send message', 'send messages', 'sms', 'dm customers', 'email customers']],
    ['publishing content', ['publish', 'post publicly', 'social media', 'upload publicly']],
    ['external account access', ['connect account', 'external account', 'gmail', 'slack', 'google drive', 'github access', 'oauth']],
    ['real-world action', ['purchase', 'book', 'cancel', 'delete files', 'change settings', 'real-world action', 'execute trade']],
    ['increased permissions', ['admin permission', 'higher permission', 'increase permission', 'root access']],
    ['autonomous scheduled action', ['autonomous', 'schedule automatically', 'scheduled automation', 'cron', 'run every', 'without approval']]
  ];
  const reasons = [];
  for (const [label, terms] of approvalRules) {
    if (hasAny(text, terms)) reasons.push(label);
  }
  if (normalize(input.user_constraints).includes('approval')) {
    // User constraints can mention approval as a restriction; do not add a trigger by itself.
  }
  return reasons;
}

function inferRisk(input, approvalReasons, text) {
  const suppliedRisk = normalize(input.risk_level);
  if (['low','medium','high'].includes(suppliedRisk)) return suppliedRisk;
  const highTerms = ['financial advice', 'medical advice', 'legal advice', 'surveillance', 'spyware', 'delete data', 'destructive', 'execute trade', 'payments', 'identity verification', 'sensitive data at scale'];
  if (hasAny(text, highTerms)) return 'high';
  if (approvalReasons.length > 0) return 'medium';
  return 'low';
}

function buildRecommendedToolId(input) {
  const base = normalize(input.desired_tool_type || input.raw_idea || 'new_tool')
    .replace(/[^a-z0-9\s_]/g, ' ')
    .split(' ')
    .filter((word) => word && word.length > 2 && !['build','create','tool','backend','that','with','for','and','the'].includes(word))
    .slice(0, 5)
    .join('_');
  return (base || 'new_tool') + '_tool';
}

function toolReadinessChecker(input = {}, registry = []) {
  const rawIdea = typeof input.raw_idea === 'string' ? input.raw_idea.trim() : '';
  if (!rawIdea) {
    return {
      ok: false,
      error: 'input.raw_idea is required.',
      existing_capability_match: null,
      new_tool_needed: false,
      recommended_tool_id: null,
      risk_level: 'low',
      approval_required: false,
      reason: 'No proposed tool idea was provided to evaluate.',
      next_action: 'Provide a proposed tool idea in input.raw_idea before checking readiness.',
      registry_check_summary: 'Registry was not checked because the required idea text was missing.',
      owner_level_decision_needed: false
    };
  }

  const request = inferRequestedCapability(input);
  const registrySnapshot = Array.isArray(input.registry_snapshot) && input.registry_snapshot.length > 0 ? input.registry_snapshot : registry;
  const matches = registrySnapshot
    .map((tool) => scoreToolMatch(request, tool))
    .filter(Boolean)
    .sort((a, b) => {
      const rank = { strong: 2, partial: 1, none: 0 };
      return (rank[b.fit_level] - rank[a.fit_level]) || (b.score - a.score);
    });

  const best = matches.find((match) => match.fit_level === 'strong') || matches[0] || null;
  const combinedText = [input.raw_idea, input.context, input.desired_tool_type, input.user_constraints].filter(Boolean).join(' ');
  const approvalReasons = inferApproval(input, combinedText);
  const riskLevel = inferRisk(input, approvalReasons, combinedText);
  const ownerDecisionNeeded = approvalReasons.length > 0 || riskLevel === 'high';
  const strongExisting = best && best.fit_level === 'strong';
  const newToolNeeded = !strongExisting;
  const recommendedToolId = strongExisting ? best.tool_id : buildRecommendedToolId(input);

  let reason;
  let nextAction;
  if (strongExisting) {
    reason = best.reason;
    nextAction = ownerDecisionNeeded
      ? `Use the existing ${best.tool_id} capability only after owner approval for: ${approvalReasons.join(', ')}.`
      : `Use the existing approved ${best.tool_id} capability instead of building a duplicate tool.`;
  } else if (best && best.fit_level === 'partial') {
    reason = `A partial match exists (${best.tool_id}), but it does not fully cover the proposed capability.`;
    nextAction = ownerDecisionNeeded
      ? 'Get owner approval for the flagged risk/permission items before creating or expanding a tool.'
      : 'Create or revise a tool using the partial match as context.';
  } else {
    reason = 'No approved existing capability in the registry appears to fully satisfy the proposed tool idea.';
    nextAction = ownerDecisionNeeded
      ? 'Get owner approval for the flagged risk/permission items before creating the new tool.'
      : 'Create a new tool mission or implementation plan for the missing capability.';
  }

  return {
    existing_capability_match: best ? {
      tool_id: best.tool_id,
      name: best.name,
      fit_level: best.fit_level,
      reason: best.reason
    } : null,
    new_tool_needed: newToolNeeded,
    recommended_tool_id: recommendedToolId,
    risk_level: riskLevel,
    approval_required: ownerDecisionNeeded,
    reason,
    next_action: nextAction,
    registry_check_summary: matches.length > 0
      ? `Checked ${registrySnapshot.length} registry tools and found ${matches.length} relevant match(es). Best match: ${best.tool_id} (${best.fit_level}).`
      : `Checked ${registrySnapshot.length} registry tools and found no approved capability match.`,
    owner_level_decision_needed: ownerDecisionNeeded
  };
}

module.exports = {
  metadata: TOOL_READINESS_CHECKER_METADATA,
  execute: toolReadinessChecker,
  toolReadinessChecker
};
