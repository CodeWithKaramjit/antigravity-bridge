const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const os = require('os');
const path = require('node:path');
const app = require('../server.js');
const {
  getPortFromUrl,
  escapeHtml,
  isAllowedOrigin,
  isLoopbackAddress,
  MAX_SCREENSHOT_BYTES,
  getIdeStatus,
  sanitizeFeedbackTitle,
  setFeedbackDeps,
  resetFeedbackDeps
} = app._test;
const { isIdeProcessLine } = require('../lib/ide-status');

describe('Antigravity Bridge Server Test Suite', () => {
  let server;
  let baseUrl;
  let lastAgentApiCall;
  let inboxRoot;

  function successAgentApi(args, options, callback) {
    lastAgentApiCall = { args, options };
    process.nextTick(() => callback(null, '{}', ''));
  }

  function restoreFeedbackDeps(overrides = {}) {
    setFeedbackDeps({
      listLsCandidates: () => ['127.0.0.1:9'],
      resolveTarget: undefined,
      getInboxDir: (conversationId) => path.join(inboxRoot, conversationId, 'inbox'),
      runAgentApi: successAgentApi,
      ...overrides
    });
  }

  before(async () => {
    inboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-inbox-'));
    restoreFeedbackDeps();
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    resetFeedbackDeps();
    try {
      fs.rmSync(inboxRoot, { recursive: true, force: true });
    } catch (e) {}
    await new Promise((resolve) => server.close(resolve));
  });

  test('1. GET /health - Returns bridge status and active conversation for Chrome Extension', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'online');
    assert.equal(data.service, 'Antigravity Bridge Server');
    assert.equal(data.version, '2.0.2');
    assert.ok(data.timestamp);
    assert.ok(Array.isArray(data.workspaces));
    assert.ok(typeof data.matchedBy === 'string');
    assert.ok(data.activeWorkspace);
    assert.ok(data.antigravity);
    assert.equal(typeof data.antigravity.installed, 'boolean');
    assert.equal(typeof data.antigravity.open, 'boolean');
  });

  test('2. GET / - Serves Bridge Server status dashboard', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Antigravity Bridge Server'));
    assert.ok(html.includes('BRIDGE ACTIVE'));
  });

  test('3. GET /api/workspaces - Returns detected Antigravity workspaces', async () => {
    const res = await fetch(`${baseUrl}/api/workspaces`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.workspaces));
  });

  test('4. GET /health?url= - Resolves a target using a declared match strategy', async () => {
    const res = await fetch(`${baseUrl}/health?url=${encodeURIComponent('http://localhost:5173/admin/login')}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.activeWorkspace);
    const allowed = ['explicit', 'file', 'herd/valet', 'recent', 'none'];
    assert.ok(
      allowed.includes(data.matchedBy) ||
        data.matchedBy.startsWith('port:') ||
        data.matchedBy.startsWith('slug:'),
      `unexpected matchedBy: ${data.matchedBy}`
    );
  });

  test('5. POST /api/feedback - Validates required instructions (HTTP 400 on empty)', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ element: '<button>Test</button>' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes('required'));
  });

  test('5b. POST /api/feedback - Rejects whitespace-only instructions', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: '   ' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  test('6. POST /api/feedback - Accepts valid instructions from loopback', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageUrl: 'http://localhost:5173/login',
        selector: 'button.login-btn',
        element: '<button class="login-btn">Log In</button>',
        comment: 'Change login button background to #2563eb and padding to 14px'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.deliveredVia, 'agentapi');
    assert.ok(data.message);
    assert.ok(lastAgentApiCall);
    assert.equal(lastAgentApiCall.options.env.ANTIGRAVITY_LS_ADDRESS, '127.0.0.1:9');
    assert.ok(lastAgentApiCall.args[1].startsWith('--title='));
    assert.equal(lastAgentApiCall.args[1].includes(' '), false);
    assert.equal(lastAgentApiCall.args[1].includes('>'), false);
  });

  test('7. POST /api/feedback - Saves base64 annotated screenshot to disk and forwards to IDE', async () => {
    const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageUrl: 'http://localhost:5173/login',
        comment: 'User drew red boxes on logo & input and arrow to title',
        screenshot: samplePng
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.savedScreenshotPath);
    assert.ok(fs.existsSync(data.savedScreenshotPath));
  });

  test('8. GET /health dashboard escapes HTML in workspace fields (XSS)', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.ok(html.includes('escapeHtml') === false);
    assert.ok(typeof escapeHtml('<b>x</b>') === 'string');
    assert.equal(escapeHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  });

  test('9. CWD Guard - Never matches root / or user home directory as workspace CWD', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.notEqual(data.activeWorkspacePath, '/');
    assert.notEqual(data.activeWorkspacePath, os.homedir());
  });

  test('10. POST /api/stop - Responds with shutdown confirmation', async () => {
    const res = await fetch(`${baseUrl}/api/stop`, { method: 'POST' });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.message.includes('shutting down'));
  });

  test('11. Helpers - port parse, CORS allowlist, loopback, screenshot cap', () => {
    assert.equal(getPortFromUrl('http://localhost:5173/admin'), 5173);
    assert.equal(getPortFromUrl('not-a-url'), null);
    assert.equal(isAllowedOrigin(undefined), true);
    assert.equal(isAllowedOrigin('chrome-extension://abc/'), true);
    assert.equal(isAllowedOrigin('http://localhost:5173'), true);
    assert.equal(isAllowedOrigin('http://127.0.0.1:4000'), true);
    assert.equal(isAllowedOrigin('https://evil.example'), false);
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('::1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLoopbackAddress('10.0.0.8'), false);
    assert.ok(MAX_SCREENSHOT_BYTES > 0);
  });

  test('12. CORS preflight from an arbitrary website is not allowlisted', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST'
      }
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    assert.notEqual(allowOrigin, 'https://evil.example');
    assert.notEqual(allowOrigin, '*');
  });

  test('13. IDE status helper - shape and exclude-list', () => {
    const status = getIdeStatus({ processLines: ['/usr/bin/node /tmp/antigravity-bridge/server.js'] });
    assert.equal(typeof status.installed, 'boolean');
    assert.equal(typeof status.open, 'boolean');
    if (status.installed) {
      assert.equal(status.open, false);
    }

    assert.equal(isIdeProcessLine('node /Users/me/antigravity-bridge/server.js'), false);
    assert.equal(isIdeProcessLine('/path/bin/native-launcher.js'), false);
    assert.equal(isIdeProcessLine('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), false);
    assert.equal(isIdeProcessLine('/Applications/Antigravity IDE.app/Contents/MacOS/Antigravity IDE'), true);
  });

  test('14. Title sanitizer strips spaces and selectors', () => {
    assert.equal(sanitizeFeedbackTitle('UI Feedback: main#main > section'), 'UI-Feedback-main-main-section');
    assert.ok(!sanitizeFeedbackTitle('a > b').includes('>'));
    assert.ok(!sanitizeFeedbackTitle('UI Feedback').includes(' '));
  });

  test('15. POST /api/feedback - no LS candidates and mock fail writes inbox', async () => {
    restoreFeedbackDeps({
      listLsCandidates: () => [],
      runAgentApi: (args, options, callback) => {
        process.nextTick(() => callback(new Error('ANTIGRAVITY_LS_ADDRESS is not set')));
      }
    });
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Please change the header' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.deliveredVia, 'inbox');
    assert.ok(data.inboxPath);
    assert.ok(fs.existsSync(data.inboxPath));
    assert.ok(fs.readFileSync(data.inboxPath, 'utf8').includes('Please change the header'));
    restoreFeedbackDeps();
  });

  test('16. POST /api/feedback - agentapi failure writes inbox fallback', async () => {
    restoreFeedbackDeps({
      runAgentApi: (args, options, callback) => {
        process.nextTick(() => callback(new Error('ANTIGRAVITY_LS_ADDRESS is not set')));
      }
    });
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Please change the header' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.deliveredVia, 'inbox');
    assert.ok(fs.existsSync(data.inboxPath));
    restoreFeedbackDeps();
  });

  test('17. POST /api/feedback - No chat opens a new conversation', async () => {
    restoreFeedbackDeps({
      resolveTarget: () => ({
        conversationId: null,
        workspaceName: 'None',
        workspacePath: '',
        matchedBy: 'none'
      })
    });
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Start a new chat for this UI change' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.deliveredVia, 'new-conversation');
    assert.equal(lastAgentApiCall.args[0], 'new-conversation');
    restoreFeedbackDeps();
  });

  test('18. POST /api/feedback - second LS candidate succeeds after first send fails', async () => {
    restoreFeedbackDeps({
      listLsCandidates: () => ['127.0.0.1:1', '127.0.0.1:2'],
      runAgentApi: (args, options, callback) => {
        lastAgentApiCall = { args, options };
        const address = options.env && options.env.ANTIGRAVITY_LS_ADDRESS;
        if (address === '127.0.0.1:1') {
          process.nextTick(() => callback(new Error('wrong port')));
          return;
        }
        process.nextTick(() => callback(null, '{}', ''));
      }
    });
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Retry on the next listen port' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.deliveredVia, 'agentapi');
    assert.equal(lastAgentApiCall.options.env.ANTIGRAVITY_LS_ADDRESS, '127.0.0.1:2');
    restoreFeedbackDeps();
  });
});
