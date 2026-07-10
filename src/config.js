'use strict';
module.exports = {
  service: 'tool-foundry-backend',
  version: '2.0.0',
  commit: process.env.COMMIT_SHA || 'development',
  deploymentId: process.env.DEPLOYMENT_ID || 'development',
  apiKey: String(process.env.API_KEY || ''),
  approvalSigningSecret: String(process.env.APPROVAL_SIGNING_SECRET || ''),
  githubRepository: String(process.env.GITHUB_REPOSITORY || ''),
  githubDefaultBranch: String(process.env.GITHUB_DEFAULT_BRANCH || 'main'),
  githubToken: String(process.env.GITHUB_TOKEN || ''),
  renderDeployHookUrl: String(process.env.RENDER_DEPLOY_HOOK_URL || ''),
  serviceBaseUrl: String(process.env.SERVICE_BASE_URL || ''),
  workspaceRoot: String(process.env.TOOL_FOUNDRY_WORKSPACE_ROOT || ''),
  toolBranchPrefix: String(process.env.TOOL_BRANCH_PREFIX || 'repair'),
  port: Number(process.env.PORT || 3000)
};
