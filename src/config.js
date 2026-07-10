'use strict';
module.exports = {
  service: 'tool-foundry-backend',
  version: '2.0.0',
  commit: process.env.COMMIT_SHA || 'development',
  deploymentId: process.env.DEPLOYMENT_ID || 'development',
  apiKey: String(process.env.API_KEY || ''),
  port: Number(process.env.PORT || 3000)
};
