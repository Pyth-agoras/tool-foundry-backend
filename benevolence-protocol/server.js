'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {evaluate} = require('./gate');
const MAX_BYTES = 131072;
const root = __dirname;

const files = {
  '/protocol': ['protocol.json', 'application/json; charset=utf-8'],
  '/rcl': ['rcl-model.json', 'application/json; charset=utf-8'],
  '/openapi.json': ['openapi.json', 'application/json; charset=utf-8'],
  '/integration.txt': ['integration.txt', 'text/plain; charset=utf-8']
};
const respond = (res, code, body, contentType = 'application/json; charset=utf-8') => {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return respond(res, 204, '');
  if (req.method === 'GET' && url.pathname === '/health')
    return respond(res, 200, {status: 'ok', protocol: 'transparent-benefit-protocol/1.0.0'});
  if (req.method === 'GET' && url.pathname === '/')
    return respond(res, 200, {name: 'Transparent Benefit Protocol', version: '1.0.0', endpoints: ['/health', '/protocol', '/rcl', '/openapi.json', '/integration.txt', 'POST /evaluate'], note: 'Structural checks are not proof of honesty or benevolence.'});
  if (req.method === 'GET' && Object.hasOwn(files, url.pathname)) {
    const [filename, type] = files[url.pathname];
    return respond(res, 200, fs.readFileSync(path.join(root, filename), 'utf8'), type);
  }
  if (req.method !== 'POST' || url.pathname !== '/evaluate') return respond(res, 404, {error: 'Not found'});
  if (!(req.headers['content-type'] || '').includes('application/json'))
    return respond(res, 415, {error: 'Expected application/json'});
  let total = 0;
  let chunks = [];
  let overflow = false;
  req.on('data', chunk => {
    total += chunk.length;
    if (total > MAX_BYTES) {
      overflow = true;
      chunks = [];
    } else if (!overflow) chunks.push(chunk);
  });
  req.on('end', () => {
    if (overflow) return respond(res, 413, {error: 'Request exceeds 128 KiB'});
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return respond(res, 400, {error: 'Invalid JSON'}); }
    const result = evaluate(payload);
    return respond(res, 200, result);
  });
  req.on('error', () => { if (!res.headersSent) respond(res, 400, {error: 'Request failed'}); });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(`Transparent Benefit Protocol listening on ${port}`));
}
module.exports = {server};
