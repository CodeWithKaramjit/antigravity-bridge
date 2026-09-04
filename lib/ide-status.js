const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_AGENTAPI = path.join(os.homedir(), '.gemini/antigravity-ide/bin/agentapi');
const APP_BUNDLE = '/Applications/Antigravity IDE.app';

const EXCLUDE_RE = /antigravity-bridge|native-launcher|\bChrome\b|\bChromium\b|Google Chrome/i;
const IDE_RE = /Antigravity IDE\.app|\/Antigravity IDE\.app\/|antigravity-ide(?:\/|\\|\s|$)/i;

function getInstallCandidatePaths() {
  const paths = [DEFAULT_AGENTAPI, APP_BUNDLE];
  if (process.env.AGENTAPI_PATH) {
    paths.unshift(process.env.AGENTAPI_PATH);
  }
  return paths;
}

function isInstalled() {
  return getInstallCandidatePaths().some((p) => {
    try {
      return Boolean(p) && fs.existsSync(p);
    } catch (e) {
      return false;
    }
  });
}

function isIdeProcessLine(command) {
  if (!command || typeof command !== 'string') return false;
  const line = command.trim();
  if (!line) return false;
  if (EXCLUDE_RE.test(line)) return false;
  if (/\bserver\.js\b/.test(line)) return false;
  return IDE_RE.test(line);
}

function listProcessCommands() {
  try {
    const out = execFileSync('ps', ['-ax', '-o', 'command='], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return out.split('\n');
  } catch (e) {
    return [];
  }
}

function isOpen(processLines) {
  const lines = Array.isArray(processLines) ? processLines : listProcessCommands();
  return lines.some((line) => isIdeProcessLine(line));
}

function getIdeStatus(options = {}) {
  const installed = isInstalled();
  const open = installed && isOpen(options.processLines);
  return { installed, open };
}

module.exports = {
  getIdeStatus,
  isInstalled,
  isOpen,
  isIdeProcessLine,
  getInstallCandidatePaths,
  DEFAULT_AGENTAPI,
  APP_BUNDLE
};
