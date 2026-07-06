'use strict';

// This file documents the required source integration for the backend maintainer/operator.
// It is intentionally executable JavaScript so it can be imported by a Node backend if desired.
// Required source integration:
// 1. Import the handler:
//    const toolReadinessChecker = require('./tools/tool_readiness_checker');
// 2. Add toolReadinessChecker.metadata to the backend's tool registry/list returned by /tools/list.
// 3. In the /tools/execute handler map or switch, route tool_id === 'tool_readiness_checker'
//    to toolReadinessChecker.execute(input, tools).
// 4. Return the handler result as { tool_id: 'tool_readiness_checker', result }.

const toolReadinessChecker = require('./tools/tool_readiness_checker');

module.exports = toolReadinessChecker;
