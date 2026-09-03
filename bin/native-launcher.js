#!/usr/bin/env node

/**
 * Antigravity Bridge - Chrome Native Messaging Host & CLI Controller
 * Allows starting, stopping, and inspecting the Bridge Server directly from Chrome Extension or CLI.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

let PROJECT_DIR = path.resolve(__dirname, '..');
try {
  const cfgFile = path.join(__dirname, 'config.json');
  if (fs.existsSync(cfgFile)) {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    if (cfg.projectDir) PROJECT_DIR = cfg.projectDir;
  }
} catch (e) {}

const PID_FILE = path.join(PROJECT_DIR, '.bridge.pid');
const LOG_FILE = path.join(PROJECT_DIR, '.bridge.log');
const DEBUG_LOG = '/tmp/antigravity-native-host.log';

function logDebug(msg) {
  try {
    fs.appendFileSync(DEBUG_LOG, `[Node ${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

process.on('uncaughtException', (err) => {
  logDebug(`UNCAUGHT EXCEPTION: ${err.stack || err.message}`);
  process.exit(1);
});

logDebug(`Started with argv: ${JSON.stringify(process.argv)}`);

// Extended PATH so spawned node server can locate lsof (/usr/sbin), git, agentapi, etc.
const EXTENDED_PATH = [
  path.dirname(process.execPath),
  path.join(os.homedir(), '.gemini/antigravity-ide/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
].join(':');

// Check if bridge server (port 4000) is running
function isPort4000Running() {
  try {
    const out = execSync('lsof -i :4000 -sTCP:LISTEN -n -P -F p', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
      env: { ...process.env, PATH: EXTENDED_PATH }
    });
    return out.includes('p');
  } catch (e) {
    return false;
  }
}

// Start bridge server
function startBridge() {
  if (isPort4000Running()) {
    return { success: true, status: 'already_running', port: 4000 };
  }

  const outLog = fs.openSync(LOG_FILE, 'a');
  const nodeBin = process.execPath;
  const child = spawn(nodeBin, [path.join(PROJECT_DIR, 'server.js')], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', outLog, outLog],
    env: {
      ...process.env,
      PATH: EXTENDED_PATH + (process.env.PATH ? `:${process.env.PATH}` : '')
    }
  });

  child.unref();
  fs.closeSync(outLog);
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');

  return { success: true, status: 'started', pid: child.pid, port: 4000 };
}

// Stop bridge server
function stopBridge() {
  let stopped = false;
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        process.kill(pid, 'SIGTERM');
        stopped = true;
      }
    } catch (e) {}
    try { fs.unlinkSync(PID_FILE); } catch (e) {}
  }

  // Also kill any remaining process listening on 4000
  try {
    const lsofOut = execSync('lsof -i :4000 -sTCP:LISTEN -n -P -F p', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
      env: { ...process.env, PATH: EXTENDED_PATH }
    });
    const pids = lsofOut.split('\n')
      .filter(l => l.startsWith('p'))
      .map(l => l.slice(1).trim());
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGTERM');
        stopped = true;
      } catch (e) {}
    }
  } catch (e) {}

  return { success: true, status: 'stopped', wasRunning: stopped };
}

function getStatus() {
  return {
    success: true,
    running: isPort4000Running(),
    port: 4000
  };
}

// Helper to send length-prefixed JSON response back to Chrome on stdout and exit cleanly
function sendNativeResponse(obj, callback) {
  const jsonStr = JSON.stringify(obj);
  const buffer = Buffer.from(jsonStr, 'utf8');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(buffer.length, 0);

  process.stdout.write(lenBuffer);
  process.stdout.write(buffer, () => {
    if (callback) callback();
  });
}

// If invoked from CLI directly: node native-launcher.js [start|stop|status]
const cliArg = process.argv[2];
if (cliArg && !cliArg.startsWith('chrome-extension://')) {
  if (cliArg === 'start') {
    const res = startBridge();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.success ? 0 : 1);
  } else if (cliArg === 'stop') {
    const res = stopBridge();
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  } else if (cliArg === 'status') {
    const res = getStatus();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.running ? 0 : 1);
  }
}

// Otherwise, handle Chrome Native Messaging over stdin/stdout
let inputChunks = [];
let expectedLength = null;

process.stdin.on('end', () => {
  logDebug('process.stdin stream ended');
});

process.stdin.on('data', (chunk) => {
  logDebug(`stdin chunk received: ${chunk.length} bytes`);
  inputChunks.push(chunk);

  while (true) {
    const totalBuffer = Buffer.concat(inputChunks);

    if (expectedLength === null) {
      if (totalBuffer.length >= 4) {
        expectedLength = totalBuffer.readUInt32LE(0);
        logDebug(`expectedLength: ${expectedLength}`);
        inputChunks = [totalBuffer.subarray(4)];
      } else {
        break;
      }
    }

    if (expectedLength !== null) {
      const currentBuf = Buffer.concat(inputChunks);
      if (currentBuf.length >= expectedLength) {
        const msgBytes = currentBuf.subarray(0, expectedLength);
        inputChunks = [currentBuf.subarray(expectedLength)];
        expectedLength = null;

        try {
          const req = JSON.parse(msgBytes.toString('utf8'));
          logDebug(`Parsed action: ${req.action}`);
          let res = { error: 'Unknown action' };
          if (req.action === 'start') {
            res = startBridge();
          } else if (req.action === 'stop') {
            res = stopBridge();
          } else if (req.action === 'status') {
            res = getStatus();
          }
          logDebug(`Result: ${JSON.stringify(res)}`);
          sendNativeResponse(res, () => {
            logDebug('Response sent to stdout, scheduling exit(0)');
            setTimeout(() => {
              logDebug('Calling process.exit(0)');
              process.exit(0);
            }, 30);
          });
        } catch (err) {
          logDebug(`Error processing msg: ${err.message}`);
          sendNativeResponse({ error: err.message }, () => {
            setTimeout(() => {
              process.exit(1);
            }, 30);
          });
        }
      } else {
        break;
      }
    }
  }
});
