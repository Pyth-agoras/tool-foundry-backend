#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || process.cwd());
const backup = path.join(repo, '.recovery-backup-foundation-security');
for (const [name, target] of [
  ['server.js.before', path.join(repo, 'src', 'server.js')],
  ['executable_tool_router.js.before', path.join(repo, 'src', 'executable_tool_router.js')]
]) {
  const source = path.join(backup, name);
  if (!fs.existsSync(source)) {
    console.error(`Missing rollback file: ${source}`);
    process.exit(1);
  }
  fs.copyFileSync(source, target);
}
console.log('Rollback restored the exact pre-repair server and router files.');
