const { execFileSync } = require('child_process');
const { isIdeProcessLine } = require('./ide-status');

const LS_ENV_KEY = 'ANTIGRAVITY_LS_ADDRESS';
const CSRF_ENV_KEY = 'ANTIGRAVITY_CSRF_TOKEN';

function parseLsAddressFromEnvText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(?:^|[\s\0])ANTIGRAVITY_LS_ADDRESS=([^\s\0]+)/);
  if (!match || !match[1]) return null;
  const value = match[1].trim();
  return value || null;
}

function parseCsrfTokenFromEnvText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(?:^|[\s\0])ANTIGRAVITY_CSRF_TOKEN=([^\s\0]+)/);
  if (!match || !match[1]) return null;
  const value = match[1].trim();
  return value || null;
}

function parseCsrfTokenFromCommand(command) {
  if (!command || typeof command !== 'string') return null;
  const match = command.match(/--csrf_token(?:=|\s+)([^\s]+)/i);
  return match && match[1] ? match[1].trim() : null;
}

function listIdePidsFromPsTable(tableText) {
  if (!tableText) return [];
  const mainLsPids = [];
  const workerLsPids = [];
  const otherIdePids = [];

  for (const raw of tableText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const space = line.search(/\s+/);
    if (space <= 0) continue;
    const pid = line.slice(0, space);
    const command = line.slice(space).trim();
    if (!/^\d+$/.test(pid)) continue;
    if (!isIdeProcessLine(command)) continue;

    if (/language_server/i.test(command)) {
      if (!command.includes('--enable_lsp')) {
        mainLsPids.push(pid);
      } else {
        workerLsPids.push(pid);
      }
    } else {
      otherIdePids.push(pid);
    }
  }
  return [...mainLsPids, ...workerLsPids, ...otherIdePids];
}

function defaultListPsTable() {
  try {
    return execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (e) {
    return '';
  }
}

function defaultListIdePids() {
  return listIdePidsFromPsTable(defaultListPsTable());
}

function defaultReadPidEnv(pid) {
  try {
    return execFileSync('ps', ['eww', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (e) {
    return '';
  }
}

function parseLsofNameField(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.replace(/^\s*n/, '').trim();
  if (!trimmed) return null;
  const tcp = trimmed.match(/^(?:127\.0\.0\.1|localhost|\[::1\]|::1):(\d+)/i);
  if (tcp) return `127.0.0.1:${tcp[1]}`;
  const any = trimmed.match(/^(?:\*|0\.0\.0\.0|\[::\]):(\d+)/);
  if (any && any[1] !== '4000') return `127.0.0.1:${any[1]}`;
  if (trimmed.startsWith('/') && !trimmed.includes('antigravity-bridge')) {
    return trimmed.split(' ')[0];
  }
  return null;
}

function parseLsofListenOutput(text) {
  if (!text) return [];
  const tcpFound = [];
  const unixFound = [];
  const hasFieldFormat = /(^|\n)n/m.test(text);
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (hasFieldFormat && !line.startsWith('n')) continue;
    const name = line.startsWith('n') ? line.slice(1) : line;
    const candidate = parseLsofNameField(name);
    if (!candidate) continue;
    if (candidate.startsWith('/')) {
      if (!unixFound.includes(candidate)) unixFound.push(candidate);
    } else {
      if (!tcpFound.includes(candidate)) tcpFound.push(candidate);
    }
  }
  // Sort TCP ports descending: higher port is typically the gRPC service port
  tcpFound.sort((a, b) => {
    const portA = parseInt(a.split(':')[1] || '0', 10);
    const portB = parseInt(b.split(':')[1] || '0', 10);
    return portB - portA;
  });
  return [...tcpFound, ...unixFound];
}

function defaultReadPidListen(pid) {
  const chunks = [];
  try {
    chunks.push(execFileSync('lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-n', '-P', '-F', 'n'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    }));
  } catch (e) {}
  try {
    chunks.push(execFileSync('lsof', ['-a', '-p', String(pid), '-U', '-n', '-F', 'n'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    }));
  } catch (e) {}
  return chunks.join('\n');
}

function listListenCandidates(options = {}) {
  const pids = Array.isArray(options.idePids) ? options.idePids : defaultListIdePids();
  const readPidListen = typeof options.readPidListen === 'function' ? options.readPidListen : defaultReadPidListen;
  const found = [];
  for (const pid of pids) {
    for (const candidate of parseLsofListenOutput(readPidListen(pid))) {
      if (!found.includes(candidate)) found.push(candidate);
    }
  }
  return found;
}

function collectLsCandidates(options = {}) {
  const log = options.log ? (...args) => console.log('[Antigravity Bridge][LS]', ...args) : () => {};
  const fromEnv = resolveLsAddress({ ...options, log: false });
  const fromListen = Array.isArray(options.listenCandidates)
    ? options.listenCandidates
    : listListenCandidates(options);
  const candidates = [];
  if (fromEnv) candidates.push(fromEnv);
  for (const item of fromListen) {
    if (item && !candidates.includes(item)) candidates.push(item);
  }
  log('LS candidates:', candidates.length);
  return candidates;
}

function resolveCsrfToken(options = {}) {
  const log = options.log ? (...args) => console.log('[Antigravity Bridge][CSRF]', ...args) : () => {};
  const env = options.env || process.env;
  if (env && env[CSRF_ENV_KEY]) {
    const fromEnv = String(env[CSRF_ENV_KEY]).trim();
    if (fromEnv) {
      log('using process.env.ANTIGRAVITY_CSRF_TOKEN (already set)');
      return fromEnv;
    }
  }

  const tableText = typeof options.psTable === 'string' ? options.psTable : defaultListPsTable();
  let fallbackToken = null;
  for (const raw of tableText.split('\n')) {
    const line = raw.trim();
    if (!line || !line.includes('--csrf_token')) continue;
    const token = parseCsrfTokenFromCommand(line);
    if (!token) continue;
    if (isIdeProcessLine(line) && /language_server/i.test(line) && !line.includes('--enable_lsp')) {
      log('resolved CSRF token from main language server process');
      return token;
    }
    if (!fallbackToken) fallbackToken = token;
  }
  if (fallbackToken) {
    log('resolved fallback CSRF token from language server process');
    return fallbackToken;
  }
  log('could not resolve CSRF token from process list');
  return null;
}

function resolveLsAddress(options = {}) {
  const log = options.log ? (...args) => console.log('[Antigravity Bridge][LS]', ...args) : () => {};
  const env = options.env || process.env;
  const fromEnv = env && env[LS_ENV_KEY] ? String(env[LS_ENV_KEY]).trim() : '';
  if (fromEnv) {
    log('using process.env.ANTIGRAVITY_LS_ADDRESS (already set)');
    return fromEnv;
  }
  log('process.env.ANTIGRAVITY_LS_ADDRESS is not set on the bridge');

  const pids = Array.isArray(options.idePids) ? options.idePids : defaultListIdePids();
  log('Antigravity IDE process count:', pids.length, pids.length ? `(pids: ${pids.join(', ')})` : '(IDE not matched in process list)');
  const readPidEnv = typeof options.readPidEnv === 'function' ? options.readPidEnv : defaultReadPidEnv;

  for (const pid of pids) {
    const envText = readPidEnv(pid) || '';
    const hasKey = envText.includes('ANTIGRAVITY_LS_ADDRESS=');
    log(`pid ${pid}: env bytes=${envText.length}, contains ANTIGRAVITY_LS_ADDRESS=${hasKey}`);
    const address = parseLsAddressFromEnvText(envText);
    if (address) {
      log('resolved language-server address from IDE process', pid);
      return address;
    }
  }
  log('could not resolve language-server address (macOS often hides other apps env from ps eww)');
  return null;
}

function sanitizeFeedbackTitle(raw) {
  const cleaned = String(raw || 'UI-Feedback')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || 'UI-Feedback';
}

function buildAgentApiEnv(candidate, baseEnv = process.env, options = {}) {
  const env = { ...baseEnv };
  if (!candidate) {
    const defaultAddr = resolveLsAddress(options);
    if (defaultAddr) env[LS_ENV_KEY] = defaultAddr;
    const defaultCsrf = resolveCsrfToken(options);
    if (defaultCsrf) env[CSRF_ENV_KEY] = defaultCsrf;
    return env;
  }

  if (typeof candidate === 'string') {
    env[LS_ENV_KEY] = candidate;
    if (!env[CSRF_ENV_KEY]) {
      const token = resolveCsrfToken(options);
      if (token) env[CSRF_ENV_KEY] = token;
    }
    return env;
  }

  if (typeof candidate === 'object') {
    const addr = candidate.address || candidate.lsAddress;
    if (addr) env[LS_ENV_KEY] = addr;
    const token = candidate.csrfToken || resolveCsrfToken(options);
    if (token) env[CSRF_ENV_KEY] = token;
    return env;
  }

  return env;
}

module.exports = {
  LS_ENV_KEY,
  CSRF_ENV_KEY,
  parseLsAddressFromEnvText,
  parseCsrfTokenFromEnvText,
  parseCsrfTokenFromCommand,
  listIdePidsFromPsTable,
  parseLsofListenOutput,
  listListenCandidates,
  collectLsCandidates,
  resolveCsrfToken,
  resolveLsAddress,
  sanitizeFeedbackTitle,
  buildAgentApiEnv
};
