'use strict';

const crypto = require('node:crypto');

function configuredKey(name) {
  return String(process.env[name] || '').trim();
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function extractCredential(req) {
  const authorization = String(req.get('authorization') || '');
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return String(req.get('x-api-key') || '').trim();
}

function authenticationConfigured() {
  return configuredKey('API_KEY').length >= 16;
}

function maintenanceAuthenticationConfigured() {
  return configuredKey('MAINTENANCE_API_KEY').length >= 24;
}

function requireAuthentication(req, res, next) {
  const expected = configuredKey('API_KEY');
  if (!authenticationConfigured()) {
    return res.status(503).json({ error: 'Backend authentication is not configured.' });
  }
  if (!secureEqual(extractCredential(req), expected)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return next();
}

function requireMaintenanceAuthentication(req, res, next) {
  const expected = configuredKey('MAINTENANCE_API_KEY');
  const supplied = String(req.get('x-tool-foundry-maintenance-key') || '').trim();
  if (!maintenanceAuthenticationConfigured()) {
    return res.status(503).json({ error: 'Maintenance authentication is not configured.' });
  }
  if (!secureEqual(supplied, expected)) {
    return res.status(403).json({ error: 'Maintenance authorization required.' });
  }
  return next();
}

module.exports = {
  authenticationConfigured,
  maintenanceAuthenticationConfigured,
  requireAuthentication,
  requireMaintenanceAuthentication,
  secureEqual
};
