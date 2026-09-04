const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 4000;
const VERSION = '2.0.2';
const AGENTAPI_PATH = process.env.AGENTAPI_PATH || path.join(os.homedir(), '.gemini/antigravity-ide/bin/agentapi');

app.use(cors());
app.use(express.json({ limit: '25mb' }));

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * In-memory rate limiter for abuse prevention
 * Tracks request timestamps per IP with sliding window
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window

function isRateLimited(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, [now]);
    return false;
  }
  const timestamps = rateLimitMap.get(key).filter(t => t > now - RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

// Periodic cleanup: remove stale entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const active = timestamps.filter(t => t > now - RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}, 300000).unref();

// Cache for conversation metadata to ensure fast sub-millisecond responses
let conversationCache = {
  data: [],
  timestamp: 0
};
const CACHE_TTL_MS = 15000; // 15 seconds

/**
 * Extract port number from URL string
 */
function getPortFromUrl(urlStr) {
  if (!urlStr) return null;
  try {
    const url = new URL(urlStr);
    if (url.port) return parseInt(url.port, 10);
    if (url.protocol === 'http:') return 80;
    if (url.protocol === 'https:') return 443;
  } catch (e) {
    const match = urlStr.match(/:([0-9]{2,5})/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Extract workspace path from a file:// URL
 */
function getPathFromFileUrl(urlStr) {
  if (!urlStr) return null;
  try {
    const url = new URL(urlStr);
    if (url.protocol === 'file:') {
      return decodeURIComponent(url.pathname);
    }
  } catch (e) {}
  return null;
}

/**
 * Detect Laravel Herd / Valet workspace from hostname
 * Scans Herd and Valet config directories for site symlinks
 */
function getWorkspaceFromHerdValet(hostname) {
  if (!hostname) return null;
  // Strip .test / .local TLD commonly used by Herd/Valet
  const siteName = hostname.replace(/\.(test|local|localhost)$/i, '');
  if (!siteName) return null;

  const possibleDirs = [
    path.join(os.homedir(), '.config/herd/config/valet/Sites'),
    path.join(os.homedir(), '.valet/Sites'),
    path.join(os.homedir(), '.config/valet/Sites')
  ];

  for (const dir of possibleDirs) {
    try {
      const sitePath = path.join(dir, siteName);
      if (fs.existsSync(sitePath)) {
        const resolved = fs.realpathSync(sitePath);
        return resolved;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Find the process cwd listening on a specific TCP port
 */
function getCwdForPort(port) {
  if (!port) return null;
  const safePort = String(parseInt(port, 10));
  if (safePort === 'NaN') return null;

  try {
    const lsofPids = execFileSync('lsof', ['-i', `:${safePort}`, '-sTCP:LISTEN', '-n', '-P', '-F', 'p'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const pids = lsofPids.split('\n')
      .filter(line => line.startsWith('p'))
      .map(line => line.slice(1).trim())
      .filter(p => /^\d+$/.test(p));

    for (const pid of pids) {
      try {
        const cwdOut = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['ignore', 'pipe', 'ignore']
        });
        const cwdLine = cwdOut.split('\n').find(l => l.startsWith('n'));
        if (cwdLine) {
          return cwdLine.slice(1).trim();
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

/**
 * Reads all Antigravity conversations and inspects their workspace metadata
 */
function getConversationsWithWorkspaces() {
  const now = Date.now();
  if (conversationCache.data.length > 0 && (now - conversationCache.timestamp < CACHE_TTL_MS)) {
    return conversationCache.data;
  }

  const convDir = path.join(os.homedir(), '.gemini/antigravity-ide/conversations');
  if (!fs.existsSync(convDir)) return [];

  const dbFiles = fs.readdirSync(convDir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const id = f.replace('.db', '');
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(path.join(convDir, f)).mtimeMs;
      } catch (e) {}
      return { id, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const results = [];
  for (const item of dbFiles) {
    let workspacePath = '';
    let repoName = '';
    let createdAt = '';

    try {
      const out = execFileSync(AGENTAPI_PATH, ['get-conversation-metadata', item.id], {
        timeout: 2000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const parsed = JSON.parse(out);
      const meta = parsed?.response?.conversationMetadata?.metadata;
      if (meta) {
        const workspaceUri = meta.workspaces?.[0]?.workspaceFolderAbsoluteUri || meta.workspaceUris?.[0] || '';
        if (workspaceUri.startsWith('file://')) {
          try {
            workspacePath = decodeURIComponent(new URL(workspaceUri).pathname);
          } catch (e) {
            workspacePath = workspaceUri.replace('file://', '');
          }
        }
        repoName = meta.workspaces?.[0]?.repository?.computedName || '';
        createdAt = meta.createdAt || '';
      }
    } catch (e) {}

    const workspaceName = workspacePath ? path.basename(workspacePath) : 'General';
    results.push({
      conversationId: item.id,
      mtimeMs: item.mtimeMs,
      workspacePath,
      workspaceName,
      repoName,
      createdAt
    });
  }

  conversationCache = {
    data: results,
    timestamp: now
  };
  return results;
}

/**
 * Returns grouped list of open/known workspaces
 */
function getWorkspacesSummary() {
  const convs = getConversationsWithWorkspaces();
  const map = new Map();

  for (const c of convs) {
    const key = c.workspacePath || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        workspaceName: c.workspaceName,
        workspacePath: c.workspacePath,
        repoName: c.repoName,
        latestConversationId: c.conversationId,
        latestActivityMs: c.mtimeMs,
        conversationCount: 1
      });
    } else {
      const entry = map.get(key);
      entry.conversationCount += 1;
      if (c.mtimeMs > entry.latestActivityMs) {
        entry.latestConversationId = c.conversationId;
        entry.latestActivityMs = c.mtimeMs;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.latestActivityMs - a.latestActivityMs);
}

/**
 * Smart target resolution:
 * 1. Explicit conversationId
 * 2. Matches website port to running process cwd -> Antigravity workspace
 * 3. Fallback to newest conversation overall
 */
function resolveTarget(pageUrl, conversationId) {
  const convs = getConversationsWithWorkspaces();

  if (conversationId) {
    const found = convs.find(c => c.conversationId === conversationId);
    if (found) {
      return {
        conversationId: found.conversationId,
        workspaceName: found.workspaceName,
        workspacePath: found.workspacePath,
        matchedBy: 'explicit'
      };
    }
  }

  // Helper: match a resolved cwd/path against known workspaces
  function matchCwdToWorkspace(resolvedPath, matchLabel) {
    if (!resolvedPath) return null;
    const normalizedCwd = path.resolve(resolvedPath);
    const matchingConvs = convs.filter(c => {
      if (!c.workspacePath) return false;
      const normalizedWs = path.resolve(c.workspacePath);
      return normalizedCwd.startsWith(normalizedWs) || normalizedWs.startsWith(normalizedCwd);
    }).sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (matchingConvs.length > 0) {
      const topMatch = matchingConvs[0];
      return {
        conversationId: topMatch.conversationId,
        workspaceName: topMatch.workspaceName,
        workspacePath: topMatch.workspacePath,
        matchedBy: matchLabel
      };
    }
    return null;
  }

  // Strategy 1: Port-based resolution (works for Node, React, PHP artisan serve, Django, Rails, etc.)
  const port = getPortFromUrl(pageUrl);
  if (port) {
    const portCwd = getCwdForPort(port);
    const portMatch = matchCwdToWorkspace(portCwd, `port:${port}`);
    if (portMatch) return portMatch;
  }

  // Strategy 2: file:// URL path extraction (static HTML opened directly)
  const filePath = getPathFromFileUrl(pageUrl);
  if (filePath) {
    const fileDir = path.dirname(filePath);
    const fileMatch = matchCwdToWorkspace(fileDir, 'file');
    if (fileMatch) return fileMatch;
  }

  // Strategy 3: Laravel Herd / Valet hostname resolution
  try {
    if (pageUrl) {
      const parsedUrl = new URL(pageUrl);
      const herdPath = getWorkspaceFromHerdValet(parsedUrl.hostname);
      const herdMatch = matchCwdToWorkspace(herdPath, 'herd/valet');
      if (herdMatch) return herdMatch;
    }
  } catch (e) {}

  // Strategy 4: Domain & Path Slug Matching (Docker, Lando, DDEV, Apache, MAMP, XAMPP, custom domains, subfolders)
  try {
    if (pageUrl) {
      const parsedUrl = new URL(pageUrl);
      const cleanHost = parsedUrl.hostname.replace(/\.(test|local|localhost|site|dev|internal)$/i, '');
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      const ignoredTokens = new Set(['localhost', '127001', 'admin', 'login', 'index', 'public', 'api', 'home', 'app', 'dashboard', 'auth', 'user', 'v1', 'v2']);
      const candidateTokens = [cleanHost, ...pathSegments]
        .map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter(s => s.length >= 3 && !ignoredTokens.has(s));

      for (const token of candidateTokens) {
        const slugMatch = convs.find(c => {
          const wsBasename = c.workspacePath ? path.basename(c.workspacePath).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
          const wsName = c.workspaceName ? c.workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
          const repoName = c.repoName ? c.repoName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

          return (
            (wsBasename && (wsBasename === token || wsBasename.includes(token) || token.includes(wsBasename))) ||
            (wsName && (wsName === token || wsName.includes(token) || token.includes(wsName))) ||
            (repoName && (repoName === token || repoName.includes(token) || token.includes(repoName)))
          );
        });

        if (slugMatch) {
          return {
            conversationId: slugMatch.conversationId,
            workspaceName: slugMatch.workspaceName,
            workspacePath: slugMatch.workspacePath,
            matchedBy: `slug:${token}`
          };
        }
      }
    }
  } catch (e) {}

  // Fallback to most recently updated conversation
  if (convs.length > 0) {
    const latest = convs[0];
    return {
      conversationId: latest.conversationId,
      workspaceName: latest.workspaceName,
      workspacePath: latest.workspacePath,
      matchedBy: 'recent'
    };
  }

  return {
    conversationId: null,
    workspaceName: 'None',
    workspacePath: '',
    matchedBy: 'none'
  };
}

// Health & Status Endpoint
app.get('/health', (req, res) => {
  const pageUrl = req.query.url || '';
  const target = resolveTarget(pageUrl);
  const workspaces = getWorkspacesSummary();

  res.json({
    status: 'online',
    service: 'Antigravity Bridge Server',
    version: VERSION,
    port: PORT,
    activeConversationId: target.conversationId,
    activeWorkspace: target.workspaceName,
    activeWorkspacePath: target.workspacePath,
    matchedBy: target.matchedBy,
    workspaces,
    timestamp: new Date().toISOString()
  });
});

// List all active workspaces & conversations
app.get('/api/workspaces', (req, res) => {
  const workspaces = getWorkspacesSummary();
  res.json({
    success: true,
    workspaces
  });
});

// Graceful shutdown endpoint
app.post('/api/stop', (req, res) => {
  res.json({ success: true, message: 'Antigravity Bridge Server shutting down.' });
  if (require.main === module) {
    setTimeout(() => {
      console.log('[Antigravity Bridge] Server stopped via API request.');
      process.exit(0);
    }, 100);
  }
});

app.get('/', (req, res) => {
  const workspaces = getWorkspacesSummary();
  const defaultTarget = resolveTarget();

  const workspaceListHtml = workspaces.map(w => `
    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; margin-top: 8px; text-align: left;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <b style="color: #38bdf8; font-size: 14px;">${escapeHtml(w.workspaceName)}</b>
        <span style="font-size: 11px; color: #10b981; background: rgba(16,185,129,0.15); padding: 2px 6px; border-radius: 4px;">Active</span>
      </div>
      <div style="font-size: 11px; color: #94a3b8; font-family: monospace; margin-top: 4px; word-break: break-all;">
        ${escapeHtml(w.workspacePath)}
      </div>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Antigravity Bridge • Running</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .card { background: #111827; border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 16px; padding: 36px; max-width: 520px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); text-align: center; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: inline-block; margin-right: 6px; box-shadow: 0 0 10px #10b981; }
        h1 { font-size: 20px; margin-top: 12px; margin-bottom: 8px; color: #e2e8f0; display: flex; align-items: center; justify-content: center; gap: 8px; }
        p { font-size: 14px; color: #94a3b8; line-height: 1.5; }
        code { background: #1f2937; padding: 3px 8px; border-radius: 4px; color: #38bdf8; font-family: monospace; font-size: 13px; }
        .info { margin-top: 16px; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px; font-size: 12px; color: #a5b4fc; text-align: left; }
        .badge { font-size: 11px; background: rgba(99, 102, 241, 0.25); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.4); padding: 2px 7px; border-radius: 9999px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div><span class="dot"></span><span style="font-size: 13px; font-weight: 600; color: #10b981;">BRIDGE ACTIVE</span></div>
        <h1>Antigravity Bridge Server <span class="badge">v${VERSION}</span></h1>
        <p>Listening on <code>http://localhost:${PORT}</code></p>
        <div class="info">
          <b>Primary Target Workspace:</b> ${escapeHtml(defaultTarget.workspaceName)}<br/>
          <b>Active Session ID:</b> <code>${escapeHtml(defaultTarget.conversationId) || 'Detecting...'}</code>
        </div>
        <div style="margin-top: 20px;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Connected Workspaces</h3>
          ${workspaceListHtml}
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #64748b;">
          Use the <b>Antigravity Chrome Extension</b> on any localhost project to send visual feedback directly into your project's chat!
        </p>
      </div>
    </body>
    </html>
  `);
});

// Primary Endpoint: Receives Visual UI Feedback from Chrome Extension / Browser
app.post('/api/feedback', (req, res) => {
  // Rate limiting: prevent abuse from malicious pages
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please wait before sending more feedback.' });
  }

  const { element, selector, comment, pageUrl, conversationId, screenshot } = req.body || {};

  if (!comment || !comment.trim()) {
    return res.status(400).json({ success: false, error: 'Comment / instructions are required.' });
  }

  const target = resolveTarget(pageUrl, conversationId);
  const targetConvId = target.conversationId;

  // Process and save annotated screenshot if provided
  let savedScreenshotPath = null;
  if (screenshot && typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
    try {
      // Memory-efficient base64 parsing: avoid regex capture group duplication
      const commaIdx = screenshot.indexOf(',');
      const headerPart = commaIdx > 0 ? screenshot.substring(0, commaIdx) : '';
      const mimeMatch = headerPart.match(/^data:image\/([a-zA-Z0-9]+);base64$/);
      if (mimeMatch && commaIdx > 0) {
        const ext = mimeMatch[1] === 'jpeg' ? 'jpg' : 'png';
        const buffer = Buffer.from(screenshot.substring(commaIdx + 1), 'base64');
        const targetDir = targetConvId
          ? path.join(os.homedir(), '.gemini/antigravity-ide/brain', targetConvId, 'screenshots')
          : path.join(os.tmpdir(), 'antigravity-screenshots');

        fs.mkdirSync(targetDir, { recursive: true });
        const fileName = `screenshot_${Date.now()}.${ext}`;
        savedScreenshotPath = path.join(targetDir, fileName);
        fs.writeFileSync(savedScreenshotPath, buffer);
        console.log(`[Antigravity Bridge] Saved annotated screenshot to: ${savedScreenshotPath}`);
      }
    } catch (saveErr) {
      console.warn('[Antigravity Bridge] Warning: Could not save screenshot to disk:', saveErr.message);
    }
  }

  // Construct structured engineering prompt for Antigravity IDE
  const promptLines = [
    '## 🎯 Visual UI Feedback & Screenshot Received from Browser',
    `**Target Project:** ${target.workspaceName} (${target.workspacePath || 'Default Workspace'})`,
    `**Page URL:** ${pageUrl || 'Local Webpage'}`
  ];

  if (selector) {
    promptLines.push(`**Target Selector:** \`${selector}\``);
  }

  if (savedScreenshotPath) {
    promptLines.push(
      '',
      '**Annotated Screenshot with User Markings (Lightshot Mode):**',
      `![User UI Markings](${savedScreenshotPath})`,
      `*(Image file saved at: \`${savedScreenshotPath}\`)*`
    );
  }

  if (element) {
    promptLines.push(
      '',
      '**Target Element HTML:**',
      '```html',
      element,
      '```'
    );
  }

  promptLines.push(
    '',
    '**User Requested Change / Instructions:**',
    comment.trim(),
    '',
    '--------------------------------------------------',
    '### 🚨 MANDATORY PROTOCOL (Plan Before Execution):',
    savedScreenshotPath
      ? '1. **Analyze Screenshot Markings**: Inspect the red boxes, arrows, and visual annotations in the screenshot image above to pinpoint the exact changes.'
      : '1. **Inspect First**: Locate the component, template, or CSS rule matching this selector/HTML snippet in this workspace.',
    '2. **Create Implementation Plan**: Since this is a visual UI change, create a structured implementation plan (`implementation_plan.md`) with phases and verification steps, and set `request_feedback = true` so the user can review and approve it before code edits.',
    '3. **Execute Only After Approval**: Wait for user approval before making actual code changes.',
    '4. **Verify**: Ensure zero TypeScript, styling, or runtime regressions.'
  );

  const prompt = promptLines.join('\n');

  console.log('\n[Antigravity Bridge] Visual feedback received:');
  console.log(`- Page: ${pageUrl}`);
  console.log(`- Target Workspace: ${target.workspaceName} (${target.matchedBy})`);
  console.log(`- Target Conversation ID: ${targetConvId || '(auto)'}`);
  if (savedScreenshotPath) console.log(`- Screenshot: ${savedScreenshotPath}`);
  if (selector) console.log(`- Selector: ${selector}`);
  console.log(`- Instructions: ${comment}\n`);

  if (!targetConvId) {
    return res.status(200).json({
      success: true,
      deliveredVia: 'queued',
      savedScreenshotPath,
      message: 'Feedback received, but no active Antigravity IDE conversation was found. Please keep Antigravity open.'
    });
  }

  const titlePrefix = savedScreenshotPath ? 'UI Screenshot' : 'UI Feedback';
  const title = `${titlePrefix}: ${(selector || 'Annotation').slice(0, 25)}`;
  const args = ['send-message', `--title=${title}`, targetConvId, prompt];

  execFile(AGENTAPI_PATH, args, (error, stdout, stderr) => {
    if (error) {
      console.warn('[Antigravity Bridge] agentapi execution warning:', error.message);
      return res.status(200).json({
        success: true,
        deliveredVia: 'queued',
        conversationId: targetConvId,
        workspaceName: target.workspaceName,
        savedScreenshotPath,
        message: 'Feedback received and queued for Antigravity IDE.',
        notice: error.message
      });
    }

    console.log(`[Antigravity Bridge] Successfully forwarded to ${target.workspaceName} (${targetConvId})!`);
    return res.status(200).json({
      success: true,
      deliveredVia: 'agentapi',
      conversationId: targetConvId,
      workspaceName: target.workspaceName,
      workspacePath: target.workspacePath,
      matchedBy: target.matchedBy,
      savedScreenshotPath,
      message: `Visual feedback & screenshot successfully sent to Antigravity (${target.workspaceName}) chat!`
    });
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Antigravity Bridge Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;