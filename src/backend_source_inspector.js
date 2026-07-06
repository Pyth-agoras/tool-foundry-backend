'use strict';

const TOOL_ID = 'backend_source_inspector';
const TOOL_STATUS = 'Testing';
const APPROVAL_STATE = 'pending_execution_test';

const METADATA = {
  tool_id: TOOL_ID,
  name: 'Backend Source Inspector',
  purpose: 'Read-only inspection of the approved Tool Foundry backend GitHub repo source structure to locate runtime entry files, routes, executable handler registries, built-in handlers, and safe patch targets.',
  status: TOOL_STATUS,
  risk_level: 'low',
  version: '0.1.0',
  approval_state: APPROVAL_STATE,
  builtin: false,
  input_schema_description: 'inspect_scope; target_paths; search_terms; max_files; include_file_contents; include_summary.',
  output_schema_description: 'repo_owner; repo_name; branch; detected_entry_files; relevant_files; route_locations; handler_registry_location; executable_handlers_found; recommended_patch_targets; warnings; source_summary; next_action.'
};

function clean(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampMaxFiles(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 150);
}

function redactSecrets(value) {
  let text = String(value || '');
  const replacements = [
    [/ghp_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]'],
    [/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]'],
    [/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]'],
    [/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]'],
    [/Authorization\s*:\s*['"`][^'"`]+['"`]/gi, 'Authorization: [REDACTED]'],
    [/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]'],
    [/(api[_-]?key|token|secret|password|passwd|credential|cookie)\s*[:=]\s*['"`][^'"`\n]+['"`]/gi, '$1: [REDACTED]'],
    [/(process\.env\.[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|COOKIE)[A-Z0-9_]*)\s*\|\|\s*['"`][^'"`\n]+['"`]/g, '$1 || [REDACTED]'],
    [/(mongodb|postgres|mysql|redis):\/\/[^\s'"`]+/gi, '[REDACTED_CONNECTION_STRING]']
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text;
}

function looksLikeBackendSource(path) {
  return /\.(js|cjs|mjs|ts|json)$/i.test(path) &&
    !/(^|\/)(node_modules|\.git|dist|build|coverage|test-results)\//i.test(path);
}

function purposeForPath(path) {
  if (path === 'package.json') return 'Node package metadata and start script.';
  if (path === 'server.js') return 'Root runtime entry shim.';
  if (path === 'src/server.js') return 'Express runtime server and HTTP route definitions.';
  if (path.includes('executable_tool_router')) return 'Executable tool router, registry metadata, and built-in handlers.';
  if (path.includes('backend_source_inspector')) return 'Read-only backend source inspector handler.';
  if (/handler|tool|registry/i.test(path)) return 'Possible tool handler or registry-related source file.';
  return 'Relevant backend source file.';
}

function findLine(content, term) {
  const lines = String(content || '').split(/\r?\n/);
  const needle = String(term || '').toLowerCase();
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase().includes(needle)) {
      return { line: index + 1, match: redactSecrets(lines[index].trim().slice(0, 240)) };
    }
  }
  return null;
}

function parsePackageEntry(content) {
  try {
    const parsed = JSON.parse(content);
    return {
      main: parsed.main || null,
      start_script: parsed.scripts && parsed.scripts.start ? parsed.scripts.start : null
    };
  } catch {
    return { main: null, start_script: null };
  }
}

function excerptFor(content, terms) {
  const lines = String(content || '').split(/\r?\n/);
  const lowered = terms.map((term) => String(term).toLowerCase()).filter(Boolean);
  let hit = lines.findIndex((line) => lowered.some((term) => line.toLowerCase().includes(term)));
  if (hit < 0) hit = 0;
  const start = Math.max(0, hit - 2);
  const end = Math.min(lines.length, hit + 3);
  return redactSecrets(lines.slice(start, end).join('\n')).slice(0, 1500);
}

function extractHandlers(content, path) {
  const text = String(content || '');
  const start = text.indexOf('const EXECUTABLE_HANDLERS');
  if (start < 0) return [];
  let end = text.indexOf('async function executeTool', start);
  if (end < 0) end = text.indexOf('function executeTool', start);
  if (end < 0) end = Math.min(text.length, start + 3000);
  const block = text.slice(start, end);
  const seen = new Set();
  const handlers = [];
  for (const match of block.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
    const tool_id = match[1];
    if (!seen.has(tool_id) && tool_id !== 'const') {
      seen.add(tool_id);
      handlers.push({ tool_id, file: path, location_hint: 'EXECUTABLE_HANDLERS map' });
    }
  }
  return handlers;
}

function extractMetadataIds(content, path) {
  const found = [];
  const seen = new Set();
  for (const match of String(content || '').matchAll(/tool_id\s*:\s*['"]([^'"]+)['"]/g)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      found.push({ tool_id: match[1], file: path, location_hint: 'registry metadata' });
    }
  }
  return found;
}

async function githubJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`GitHub read failed: ${response.status}`);
    error.statusCode = response.status;
    error.details = redactSecrets(text).slice(0, 500);
    throw error;
  }
  return JSON.parse(text);
}

async function githubText(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`GitHub file read failed: ${response.status}`);
    error.statusCode = response.status;
    error.details = redactSecrets(text).slice(0, 500);
    throw error;
  }
  return text;
}

async function readFile(owner, repo, branch, path, headers) {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${safePath}?ref=${encodeURIComponent(branch)}`;
  const data = await githubJson(url, headers);
  if (data.type !== 'file') return null;
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  if (data.download_url) return githubText(data.download_url, headers);
  return null;
}

async function backendSourceInspector(input = {}) {
  const warnings = [];
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'master';
  const token = process.env.GITHUB_TOKEN;

  const base = {
    repo_owner: owner || null,
    repo_name: repo || null,
    branch,
    detected_entry_files: [],
    relevant_files: [],
    route_locations: {},
    handler_registry_location: null,
    executable_handlers_found: [],
    recommended_patch_targets: [],
    warnings,
    source_summary: '',
    next_action: ''
  };

  if (!owner || !repo || !branch || !token) {
    warnings.push('GitHub source inspection is unavailable because one or more required GitHub environment settings are missing.');
    return {
      ...base,
      source_summary: 'Source inspection did not run because the approved GitHub repository configuration is incomplete.',
      next_action: 'Configure GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, and GITHUB_TOKEN before inspecting source.'
    };
  }

  const includeFileContents = input.include_file_contents === true;
  const includeSummary = input.include_summary !== false;
  const maxFiles = clampMaxFiles(input.max_files);
  const targetPaths = Array.isArray(input.target_paths) ? input.target_paths.map(String).filter(Boolean) : [];
  const inspectScope = String(input.inspect_scope || 'standard');
  const userTerms = Array.isArray(input.search_terms) ? input.search_terms.map(String).filter(Boolean) : [];
  const defaultTerms = [
    'package.json',
    'server.js',
    'src/server.js',
    'EXECUTABLE_HANDLERS',
    '/tools/list',
    '/tools/execute',
    'tool handlers',
    'registry metadata',
    'BUILTIN_TOOL_METADATA',
    'app.get',
    'app.post',
    'executeTool',
    'registerTool'
  ];
  const searchTerms = Array.from(new Set([...userTerms, ...defaultTerms, inspectScope].filter(Boolean)));
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'tool-foundry-backend',
    Authorization: `Bearer ${token}`
  };

  let treeFiles = [];
  try {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const tree = await githubJson(treeUrl, headers);
    treeFiles = Array.isArray(tree.tree)
      ? tree.tree.filter((item) => item && item.type === 'blob' && looksLikeBackendSource(item.path)).map((item) => item.path)
      : [];
  } catch (error) {
    warnings.push(`Could not read repository tree for configured branch: ${error.message}.`);
  }

  const selected = new Set(['package.json', 'server.js', 'src/server.js', 'src/executable_tool_router.js', 'src/backend_source_inspector.js', ...targetPaths]);
  const normalizedTerms = searchTerms.map(clean).filter(Boolean);
  for (const path of treeFiles) {
    const pathText = clean(path);
    if (
      normalizedTerms.some((term) => pathText.includes(term)) ||
      /(^|\/)(server|app|index)\.(js|cjs|mjs|ts)$/i.test(path) ||
      /router|handler|registry|tool/i.test(path)
    ) {
      selected.add(path);
    }
  }

  const files = {};
  for (const path of Array.from(selected).filter(looksLikeBackendSource).slice(0, maxFiles)) {
    try {
      const content = await readFile(owner, repo, branch, path, headers);
      if (typeof content === 'string') files[path] = content;
    } catch (error) {
      warnings.push(`Could not read ${path}: ${error.message}.`);
    }
  }

  const detectedEntryFiles = [];
  if (files['package.json']) {
    const entry = parsePackageEntry(files['package.json']);
    detectedEntryFiles.push({
      path: 'package.json',
      confidence: entry.main || entry.start_script ? 'high' : 'medium',
      reason: `package.json declares main=${entry.main || 'not set'} and start=${entry.start_script || 'not set'}.`
    });
    if (entry.main && files[entry.main]) {
      detectedEntryFiles.push({ path: entry.main, confidence: 'high', reason: 'Referenced by package.json main field.' });
    }
  }
  if (files['server.js']) {
    detectedEntryFiles.push({
      path: 'server.js',
      confidence: /require\(['"]\.\/src\/server['"]\)/.test(files['server.js']) ? 'high' : 'medium',
      reason: /require\(['"]\.\/src\/server['"]\)/.test(files['server.js'])
        ? 'Root entry file delegates to ./src/server.'
        : 'Root server file exists and may be an entry file.'
    });
  }
  if (files['src/server.js']) {
    detectedEntryFiles.push({
      path: 'src/server.js',
      confidence: /express\(/.test(files['src/server.js']) && /listen\(/.test(files['src/server.js']) ? 'high' : 'medium',
      reason: 'Contains the Express app/runtime server implementation.'
    });
  }

  const routeLocations = {};
  let handlerRegistryLocation = null;
  let handlers = [];
  const relevantFiles = [];

  for (const [path, content] of Object.entries(files)) {
    const matches = searchTerms.filter((term) => clean(path).includes(clean(term)) || clean(content).includes(clean(term)));
    const isAlwaysRelevant = ['package.json', 'server.js', 'src/server.js', 'src/executable_tool_router.js', 'src/backend_source_inspector.js'].includes(path);
    if (matches.length || isAlwaysRelevant) {
      const record = {
        path,
        purpose: purposeForPath(path),
        matched_terms: matches.slice(0, 12)
      };
      if (includeFileContents) record.excerpt = excerptFor(content, searchTerms);
      relevantFiles.push(record);
    }

    for (const route of ['/health', '/tools/list', '/tools/execute', '/tools/register', '/tools/mission/create', '/tools/evaluate']) {
      const location = findLine(content, route);
      if (location) {
        const priority = path === 'src/server.js' ? 3 : /app\.(get|post|put|patch|delete)\s*\(/.test(location.match) ? 2 : 1;
        const previous = routeLocations[route];
        if (!previous || priority > previous.priority) {
          routeLocations[route] = { file: path, line: location.line, section_hint: location.match, priority };
        }
      }
    }

    const registry = findLine(content, 'EXECUTABLE_HANDLERS');
    if (registry && !handlerRegistryLocation) {
      handlerRegistryLocation = {
        file: path,
        line: registry.line,
        section_hint: registry.match,
        exported: /module\.exports[\s\S]*EXECUTABLE_HANDLERS/.test(content)
      };
    }

    handlers = handlers.concat(extractHandlers(content, path));
  }

  if (!handlers.some((handler) => handler.tool_id === TOOL_ID)) {
    handlers.push({ tool_id: TOOL_ID, file: 'src/backend_source_inspector.js', location_hint: 'Installed into router.EXECUTABLE_HANDLERS by backend_source_inspector.install' });
  }

  const metadata = new Map(Object.entries(files).flatMap(([path, content]) => extractMetadataIds(content, path)).map((item) => [item.tool_id, item]));
  const executableHandlersFound = handlers.map((handler) => ({ ...handler, metadata_found: metadata.has(handler.tool_id) || handler.tool_id === TOOL_ID }));

  for (const route of Object.keys(routeLocations)) {
    delete routeLocations[route].priority;
  }

  const routerFile = handlerRegistryLocation ? handlerRegistryLocation.file : 'src/executable_tool_router.js';
  const serverFile = routeLocations['/tools/execute'] ? routeLocations['/tools/execute'].file : 'src/server.js';
  const recommendedPatchTargets = [
    { path: routerFile, reason: 'Primary executable handler registry and built-in metadata location.' },
    { path: 'src/backend_source_inspector.js', reason: 'Current read-only source-inspector executable handler file.' }
  ];
  if (serverFile !== routerFile) recommendedPatchTargets.push({ path: serverFile, reason: 'HTTP route host; change only when route contracts change or when bootstrapping external handler modules.' });
  if (files['package.json']) recommendedPatchTargets.push({ path: 'package.json', reason: 'Change only if a tool requires new runtime dependencies.' });

  if (!handlerRegistryLocation) warnings.push('EXECUTABLE_HANDLERS was not found in inspected files.');
  if (!routeLocations['/tools/list']) warnings.push('/tools/list route was not found in inspected files.');
  if (!routeLocations['/tools/execute']) warnings.push('/tools/execute route was not found in inspected files.');
  if (!files['src/server.js']) warnings.push('Expected runtime server file src/server.js was not readable on the configured branch.');
  if (!files['src/executable_tool_router.js']) warnings.push('Expected router file src/executable_tool_router.js was not readable on the configured branch.');

  const architectureMatches =
    Boolean(files['src/server.js']) &&
    Boolean(handlerRegistryLocation) &&
    Boolean(routeLocations['/tools/list']) &&
    Boolean(routeLocations['/tools/execute']) &&
    executableHandlersFound.length > 0;

  return {
    repo_owner: owner,
    repo_name: repo,
    branch,
    detected_entry_files: detectedEntryFiles,
    relevant_files: relevantFiles,
    route_locations: routeLocations,
    handler_registry_location: handlerRegistryLocation,
    executable_handlers_found: executableHandlersFound,
    recommended_patch_targets: recommendedPatchTargets,
    warnings,
    source_summary: includeSummary
      ? architectureMatches
        ? 'The backend source matches the expected Tool Foundry executable router architecture: package/runtime entry files delegate to src/server.js, HTTP routes call the executable router, and EXECUTABLE_HANDLERS defines installed tool handlers.'
        : 'The backend source was inspected, but one or more expected executable router architecture pieces were missing or low confidence.'
      : '',
    next_action: architectureMatches
      ? 'For future executable tools, update executable-router metadata, provide a real handler, and route through EXECUTABLE_HANDLERS; do not add fragile custom branches to /tools/execute.'
      : 'Review warnings before applying backend updates.'
  };
}

function install(router) {
  if (!router || !router.EXECUTABLE_HANDLERS || typeof router.registerTool !== 'function') {
    throw new Error('backend_source_inspector requires the executable tool router exports.');
  }
  router.EXECUTABLE_HANDLERS[TOOL_ID] = backendSourceInspector;
  router.registerTool(METADATA);
}

module.exports = {
  TOOL_ID,
  METADATA,
  install,
  backendSourceInspector
};
