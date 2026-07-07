'use strict';

const https = require('https');

const REPO_OWNER = 'Pyth-agoras';
const REPO_NAME = 'tool-foundry-backend';
const BRANCH = 'main';

const ALLOWED_FULL_FILE_PATHS = new Set([
  'package.json',
  'server.js',
  'src/server.js',
  'src/executable_tool_router.js',
  'src/backend_source_inspector.js',
  'src/executable_tool_builder.js',
  'src/tool_installation_validator.js',
  'src/tool_failure_diagnoser.js',
  'src/tool_quality_tester.js',
  'src/tool_registry_auditor.js',
  'src/foundry_operator.js',
  'src/tool_workflow_orchestrator.js',
  'src/tool_call_contract_normalizer.js',
  'src/workflow_dead_end_resolver.js',
  'src/tool_readiness_checker.js'
]);

const DEFAULT_LAYOUT_PATHS = [
  'package.json',
  'server.js',
  'src/server.js',
  'src/executable_tool_router.js'
];

const DEFAULT_SEARCH_TERMS = [
  'package.json',
  'server.js',
  'src/server.js',
  '/tools/list',
  '/tools/execute',
  'EXECUTABLE_HANDLERS',
  'BUILTIN_TOOL_METADATA',
  'app.get',
  'app.post',
  'executeTool',
  'registerTool'
];

const METADATA = {
  tool_id: 'backend_source_inspector',
  name: 'Backend Source Inspector',
  purpose: 'Read-only inspection of approved Tool Foundry backend source files, routes, executable handler registries, and safe patch targets, including strict redacted full-file mode for explicitly requested approved files.',
  status: 'Approved',
  risk_level: 'low',
  version: '0.2.0',
  approval_state: 'approved',
  builtin: false,
  input_schema_description: 'inspect_scope; target_paths; search_terms; max_files; include_file_contents; include_full_file_contents; max_file_chars; redact_secrets.',
  output_schema_description: 'repo_owner; repo_name; branch; detected_entry_files; relevant_files; file_contents; route_locations; handler_registry_location; executable_handlers_found; recommended_patch_targets; warnings; source_summary; next_action.'
};

function cleanPath(value) {
  return String(value || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .join('/')
    .trim();
}

function uniq(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function requestJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('GitHub read failed: ' + res.statusCode));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('GitHub response was not valid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('GitHub read timed out')));
  });
}

async function readRepoFile(path) {
  const safePath = cleanPath(path);
  const headers = {
    'User-Agent': 'tool-foundry-backend-source-inspector',
    'Accept': 'application/vnd.github+json'
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  }
  const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
  const url = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(BRANCH);
  const data = await requestJson(url, headers);
  if (!data || data.type !== 'file' || !data.content) {
    throw new Error('Requested path is not a readable file');
  }
  return Buffer.from(String(data.content).replace(/\n/g, ''), 'base64').toString('utf8');
}

function redactSecretLikeText(text) {
  let output = String(text || '');
  output = output.replace(/(Bearer\s+)[A-Za-z0-9._\-]{12,}/gi, '$1[REDACTED]');
  output = output.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]');
  output = output.replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_API_KEY]');
  output = output.replace(/(https?:\/\/[^\s'\"]*deploy[^\s'\"]*)/gi, '[REDACTED_DEPLOY_HOOK_URL]');
  output = output.replace(/([A-Za-z0-9_]*SECRET[A-Za-z0-9_]*\s*[:=]\s*['\"]?)[^'\"\n,;]+/gi, '$1[REDACTED]');
  output = output.replace(/([A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*[:=]\s*['\"]?)[^'\"\n,;]+/gi, '$1[REDACTED]');
  output = output.replace(/([A-Za-z0-9_]*API[_-]?KEY[A-Za-z0-9_]*\s*[:=]\s*['\"]?)[^'\"\n,;]+/gi, '$1[REDACTED]');
  output = output.replace(/([A-Za-z0-9_]*PASSWORD[A-Za-z0-9_]*\s*[:=]\s*['\"]?)[^'\"\n,;]+/gi, '$1[REDACTED]');
  return output;
}

function summarizePurpose(path) {
  if (path === 'package.json') return 'Node package metadata and start script.';
  if (path === 'server.js') return 'Root runtime entry shim.';
  if (path === 'src/server.js') return 'Express runtime server and HTTP route definitions.';
  if (path === 'src/executable_tool_router.js') return 'Executable tool router, registry metadata, and executable handler wiring.';
  if (path === 'src/backend_source_inspector.js') return 'Read-only backend source inspector handler.';
  if (path === 'src/executable_tool_builder.js') return 'Executable tool builder handler.';
  if (path === 'src/tool_installation_validator.js') return 'Tool installation validator handler.';
  if (path === 'src/tool_failure_diagnoser.js') return 'Tool failure diagnoser handler.';
  if (path === 'src/tool_quality_tester.js') return 'Tool quality tester handler.';
  return 'Approved Tool Foundry backend source file.';
}

function lineOf(content, needle) {
  const lines = String(content || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return null;
}

function sectionHint(content, needle) {
  const line = lineOf(content, needle);
  if (!line) return needle;
  const lines = String(content || '').split('\n');
  return (lines[line - 1] || needle).slice(0, 240);
}

function collectRouteLocations(files) {
  const locations = {};
  const server = files.find(file => file.path === 'src/server.js');
  if (!server || !server.content) return locations;
  ['/health', '/tools/list', '/tools/execute', '/tools/register', '/tools/mission/create', '/tools/evaluate'].forEach(route => {
    const line = lineOf(server.content, route);
    if (line) locations[route] = { file: 'src/server.js', line, section_hint: sectionHint(server.content, route) };
  });
  return locations;
}

function collectHandlers(files) {
  const router = files.find(file => file.path === 'src/executable_tool_router.js');
  const handlers = [];
  if (!router || !router.content) return handlers;
  const content = router.content;
  const known = ['idea_analyzer','tool_mission_generator','foundry_self_healer','foundry_operator','pdf_tool_mission_planner','tool_readiness_checker','backend_source_inspector','executable_tool_builder','tool_failure_diagnoser','tool_quality_tester','tool_installation_validator'];
  known.forEach(id => {
    if (content.includes(id)) {
      handlers.push({
        tool_id: id,
        file: 'src/executable_tool_router.js',
        location_hint: content.includes('EXECUTABLE_HANDLERS') ? 'EXECUTABLE_HANDLERS/router source reference' : 'router source reference',
        metadata_found: content.includes("tool_id: '" + id + "'") || content.includes('tool_id: "' + id + '"') || content.includes(id)
      });
    }
  });
  return handlers;
}

function choosePaths(params) {
  const requested = Array.isArray(params.target_paths) ? params.target_paths.map(cleanPath).filter(Boolean) : [];
  if (requested.length) return requested;
  return DEFAULT_LAYOUT_PATHS.slice();
}

async function execute(input) {
  const params = input || {};
  const warnings = [];
  const includeFileContents = Boolean(params.include_file_contents);
  const includeFullFileContents = Boolean(params.include_full_file_contents);
  const redactSecrets = params.redact_secrets !== false;
  const maxFileChars = Number.isFinite(Number(params.max_file_chars)) ? Math.max(0, Number(params.max_file_chars)) : 20000;
  const maxFiles = Number.isFinite(Number(params.max_files)) ? Math.max(1, Math.min(25, Number(params.max_files))) : 12;
  const searchTerms = uniq((Array.isArray(params.search_terms) ? params.search_terms : []).concat(DEFAULT_SEARCH_TERMS));
  const requestedPaths = choosePaths(params);
  let pathsToRead = uniq(requestedPaths).slice(0, maxFiles);

  if (includeFullFileContents) {
    if (!Array.isArray(params.target_paths) || params.target_paths.length === 0) {
      return {
        repo_owner: REPO_OWNER,
        repo_name: REPO_NAME,
        branch: BRANCH,
        detected_entry_files: [],
        relevant_files: [],
        file_contents: [],
        route_locations: {},
        handler_registry_location: null,
        executable_handlers_found: [],
        recommended_patch_targets: [],
        warnings: ['Full-file mode requires explicit target_paths.'],
        source_summary: 'Full-file inspection was refused because target_paths was not explicit.',
        next_action: 'Provide explicit approved target_paths and a sufficient max_file_chars value.'
      };
    }
    const disallowed = pathsToRead.filter(path => !ALLOWED_FULL_FILE_PATHS.has(path));
    if (disallowed.length) {
      return {
        repo_owner: REPO_OWNER,
        repo_name: REPO_NAME,
        branch: BRANCH,
        detected_entry_files: [],
        relevant_files: [],
        file_contents: [],
        route_locations: {},
        handler_registry_location: null,
        executable_handlers_found: [],
        recommended_patch_targets: [],
        warnings: ['Full-file mode refused disallowed path(s): ' + disallowed.join(', ')],
        source_summary: 'Full-file inspection was refused because one or more requested files are not on the approved allowlist.',
        next_action: 'Request only approved Tool Foundry backend source files in target_paths.'
      };
    }
  }

  const files = [];
  for (const path of pathsToRead) {
    try {
      const raw = await readRepoFile(path);
      const safe = redactSecrets ? redactSecretLikeText(raw) : raw;
      const matchedTerms = searchTerms.filter(term => safe.includes(term));
      const limit = includeFullFileContents ? maxFileChars : Math.min(maxFileChars, 1200);
      const wasTruncated = includeFileContents ? safe.length > limit : false;
      if (wasTruncated) warnings.push(path + ' was truncated at ' + limit + ' characters. Increase max_file_chars to return more content.');
      files.push({
        path,
        content: safe,
        returned_content: includeFileContents ? safe.slice(0, limit) : undefined,
        matched_terms: matchedTerms,
        full_returned: Boolean(includeFileContents && !wasTruncated),
        truncated: Boolean(wasTruncated),
        char_count: safe.length,
        returned_char_count: includeFileContents ? Math.min(safe.length, limit) : 0
      });
    } catch (error) {
      warnings.push('Could not read ' + path + ': ' + error.message);
    }
  }

  const relevant_files = files.map(file => {
    const item = {
      path: file.path,
      purpose: summarizePurpose(file.path),
      matched_terms: file.matched_terms,
      full_returned: file.full_returned,
      truncated: file.truncated,
      char_count: file.char_count,
      returned_char_count: file.returned_char_count
    };
    if (includeFileContents && includeFullFileContents) item.content = file.returned_content;
    else if (includeFileContents) item.excerpt = file.returned_content;
    return item;
  });

  const file_contents = includeFileContents ? files.map(file => ({
    path: file.path,
    content: file.returned_content,
    full_returned: file.full_returned,
    truncated: file.truncated,
    char_count: file.char_count,
    returned_char_count: file.returned_char_count
  })) : [];

  const detected_entry_files = [];
  if (files.some(file => file.path === 'package.json')) detected_entry_files.push({ path: 'package.json', confidence: 'high', reason: 'package.json was readable from the approved repo.' });
  if (files.some(file => file.path === 'server.js')) detected_entry_files.push({ path: 'server.js', confidence: 'high', reason: 'Root server.js was readable from the approved repo.' });
  if (files.some(file => file.path === 'src/server.js')) detected_entry_files.push({ path: 'src/server.js', confidence: 'high', reason: 'Runtime server file was readable from the approved repo.' });

  const routerFile = files.find(file => file.path === 'src/executable_tool_router.js');
  const handlerLine = routerFile ? lineOf(routerFile.content, 'EXECUTABLE_HANDLERS') : null;

  return {
    repo_owner: REPO_OWNER,
    repo_name: REPO_NAME,
    branch: BRANCH,
    inspect_scope: params.inspect_scope || '',
    detected_entry_files,
    relevant_files,
    file_contents,
    route_locations: collectRouteLocations(files),
    handler_registry_location: handlerLine ? { file: 'src/executable_tool_router.js', line: handlerLine, section_hint: sectionHint(routerFile.content, 'EXECUTABLE_HANDLERS') } : null,
    executable_handlers_found: collectHandlers(files),
    recommended_patch_targets: [
      { path: 'src/executable_tool_router.js', reason: 'Primary executable handler registry and built-in metadata location.' },
      { path: 'src/backend_source_inspector.js', reason: 'Current read-only source-inspector executable handler file.' },
      { path: 'src/server.js', reason: 'HTTP route host; change only when route contracts change.' },
      { path: 'package.json', reason: 'Change only if runtime dependencies change.' }
    ],
    warnings,
    source_summary: includeFullFileContents ? 'Strict full-file inspection completed for explicitly requested approved backend files.' : 'Backend source inspection completed with summaries/excerpts.',
    next_action: warnings.length ? 'Review warnings and full_returned/truncated flags before patch generation.' : 'Use returned full_returned/truncated flags to decide whether patch generation is safe.'
  };
}

function install(router) {
  if (!router) return;
  if (Array.isArray(router.BUILTIN_TOOL_METADATA)) {
    const index = router.BUILTIN_TOOL_METADATA.findIndex(tool => tool.tool_id === METADATA.tool_id);
    if (index >= 0) router.BUILTIN_TOOL_METADATA[index] = METADATA;
    else router.BUILTIN_TOOL_METADATA.push(METADATA);
  }
  if (router.EXECUTABLE_HANDLERS) {
    router.EXECUTABLE_HANDLERS[METADATA.tool_id] = execute;
  }
}

module.exports = {
  METADATA,
  metadata: METADATA,
  execute,
  handle: execute,
  install
};
