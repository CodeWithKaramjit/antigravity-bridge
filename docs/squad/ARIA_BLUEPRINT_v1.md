ARIA BLUEPRINT — v1.0
Project: antigravity-bridge
Input: Rex Report v1.0, Alex Plan v1.0

## Architecture Decision Record (ADR Summary)
- Pattern: Single-process Express app + Chrome MV3 content/background/popup + native messaging host — Reason: local tool; one Node process is the entire backend.
- DB: None (filesystem: conversation .db names, brain screenshots, PID/log files) — Reason: Antigravity already owns conversation state.
- Auth: Loopback bind + CORS allowlist + loopback check on mutating routes; no user accounts — Reason: developer workstation trust boundary is 127.0.0.1, not the public internet.

## Data Model
Entity: ConversationRef (derived, not stored by the bridge)
  Fields:
    - conversationId: string, from ~/.gemini/antigravity-ide/conversations/*.db
    - workspacePath: string, from agentapi metadata file:// URI
    - workspaceName: string
    - repoName: string
    - mtimeMs: number
    - createdAt: string
  Indexes: none (in-memory cache, TTL 15s)
  Relations: grouped into WorkspaceSummary by workspacePath

Entity: ScreenshotFile
  Fields:
    - path: under ~/.gemini/antigravity-ide/brain/{conversationId}/screenshots or os.tmpdir()/antigravity-screenshots
    - format: png|jpg from data:image header

Entity: RateLimitBucket
  Fields:
    - key: client IP or "unknown"
    - timestamps: number[] sliding 60s window, max 10

## API Contract
GET /health
  Auth: none (read; bind loopback in production default)
  Query: { url?: string }
  Response 200: { status: "online", service: string, version: string, port: number, activeConversationId, activeWorkspace, activeWorkspacePath, matchedBy, workspaces: WorkspaceSummary[], timestamp }

GET /api/workspaces
  Auth: none
  Response 200: { success: true, workspaces: WorkspaceSummary[] }

GET /
  Auth: none
  Response 200: HTML dashboard (workspaceName and paths HTML-escaped)

POST /api/feedback
  Auth: loopback only
  Request: { element?: string, selector?: string, comment: string, pageUrl?: string, conversationId?: string, screenshot?: dataUrl }
  Response 200: { success: true, deliveredVia: "agentapi"|"queued", conversationId?, workspaceName?, workspacePath?, matchedBy?, savedScreenshotPath?, message, notice? }
  Response 400: { success: false, error: string }
  Response 403: { success: false, error: string } — non-loopback
  Response 429: { success: false, error: string }

POST /api/stop
  Auth: loopback only
  Response 200: { success: true, message: string }
  Response 403: { success: false, error: string }

## File Structure
/server.js                 — Express app, routing, agentapi, rate limit, listen
/chrome-extension/manifest.json — MV3 permissions and commands
/chrome-extension/background.js — shortcuts, tab capture, feedback proxy
/chrome-extension/content.js    — inspect + annotate UI (Shadow DOM)
/chrome-extension/popup.html|js — health UI, start/stop, mode triggers
/bin/native-launcher.js|sh      — native host + CLI start/stop/status
/bin/register-native-host.js    — install host outside Downloads (TCC)
/test/bridge.test.js            — HTTP + helper tests
/docs/squad/*                   — squad artifacts
Import rules: extension must not call the bridge with page-origin fetch; only background.js (or curl/loopback tools) may POST mutating routes.

Env:
- PORT — listen port, default 4000
- HOST — listen address, default 127.0.0.1 (0.0.0.0 in containers)
- AGENTAPI_PATH — optional override for agentapi binary

Security-sensitive: .bridge.pid, native host config under ~/.antigravity-bridge, conversation DBs (do not commit).

## Security Notes
- CORS wildcard (pre-fix): any origin could POST feedback — mitigate with allowlist + background proxy
- Bind 0.0.0.0 (pre-fix): LAN exposure — mitigate default HOST=127.0.0.1
- Unauthenticated /api/stop — mitigate loopback-only
- Native host kill-all-on-:4000 — mitigate PID-file + command-line check
- OWASP injection: lsof/agentapi already use execFile with numeric PIDs; keep that
- XSS on dashboard: escapeHtml already applied
- Host permissions http(s)://*/\* remain (inspect any tab); residual, not a server issue

## Notes for Mason (Implementation)
- Keep public JSON field names. Add 403 only for non-loopback mutating routes.
- Export `_test` helpers for Quinn; do not split server.js unless required.

## Notes for Luna (Code Review)
- Confirm listen host, CORS function, loopback guard, screenshot fallback, native stop PID filter, background submit-feedback.
- Do not fail the review on annotator naming or dashboard CSS.

## Open Questions
- Pinning native host to a single unpacked extension ID — blocking: no (existing constraint)
