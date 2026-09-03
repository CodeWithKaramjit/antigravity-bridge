const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server.js');

describe('Antigravity Bridge Server Test Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Start on ephemeral port for isolated test execution
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('1. GET /health - Returns bridge status and active conversation for Chrome Extension', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'online');
    assert.equal(data.service, 'Antigravity Bridge Server');
    assert.equal(data.version, '2.0.1');
    assert.ok(data.timestamp);
    assert.ok(Array.isArray(data.workspaces));
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
    assert.ok(data.workspaces.length > 0);
  });

  test('4. GET /health?url=http://localhost:5173 - Accurately routes to Rendosa workspace by port 5173', async () => {
    const res = await fetch(`${baseUrl}/health?url=http://localhost:5173/admin/login`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.activeWorkspace, 'rendosa');
    assert.equal(data.matchedBy, 'port:5173');
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

  test('6. POST /api/feedback - Forwards UI feedback to target project chat with plan requirement', async () => {
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
    assert.equal(data.workspaceName, 'rendosa');
    assert.equal(data.matchedBy, 'port:5173');
    assert.ok(data.deliveredVia);
  });

  test('7. POST /api/feedback - Saves base64 annotated screenshot to disk and forwards to IDE', async () => {
    const fs = require('fs');
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
});
