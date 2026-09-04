REX REPORT — v1.0
Project: antigravity-bridge
Date: 2026-09-04

## Summary
Antigravity Bridge is a local macOS developer tool: a Chrome Manifest V3 extension (inspect + Lightshot-style annotate) plus an Express 5 server on port 4000 that routes visual feedback into the user’s Google Antigravity IDE chat via `agentapi`. Target users are developers running localhost (or Herd/Valet/custom-domain) web apps who want DOM or annotated-screenshot feedback delivered with a mandatory plan-before-execution instruction. This report reverse-specs shipped v2.0.2 behavior only.

## Feature List (MoSCoW)
Must Have:
- Bridge health and workspace status — extension and humans need to know the server is up and which chat is targeted
- DOM inspect with disabled-element hit-testing — core inspect path
- Screenshot capture and annotation (box, arrow, pen, text) — core markup path
- POST feedback with required instructions — only valid requests reach the IDE
- Workspace routing (port / file / Herd-Valet / slug / recent fallback) — feedback must land in the right project
- Plan-before-execution prompt text — product protocol
- CWD guard (never treat `/` or `$HOME` as a workspace match) — prevents false routing
- Shadow DOM isolation for extension UI — no host-page CSS collision

Should Have:
- Native messaging start/stop of the bridge from the popup
- Dashboard HTML at GET `/`
- Screenshot persistence under Antigravity brain (or tmp fallback)
- Rate limit on feedback (10 / minute / IP)
- Keyboard shortcuts Option+A / Option+S
- Grouped workspace list API

Nice to Have:
- Color palette and undo/clear in annotator
- One-click Start Bridge.command / Stop Bridge.command
- Conversation cache TTL (15s)

Out of Scope:
- New product features, multi-user SaaS, remote hosting, Windows/Linux first-class support
- Rewriting the extension or server for cleanliness
- Max-style refactors

## User Stories
Epic: Bridge server
  US-001: As a developer, I want GET /health to report online status and version so that the extension can show connected state.
    AC: Given the server is running, when I GET /health, then status is 200 and body includes status=online, service name, version, timestamp, and a workspaces array.
  US-002: As a developer, I want GET / to show a dashboard so that I can confirm the bridge is active.
    AC: Given the server is running, when I GET /, then the HTML contains “Antigravity Bridge Server” and “BRIDGE ACTIVE”.
  US-003: As a developer, I want GET /api/workspaces to list detected Antigravity workspaces so that I can see routing targets.
    AC: Given the server is running, when I GET /api/workspaces, then success is true and workspaces is an array.
  US-004: As a developer, I want health to accept ?url= so that the target workspace is resolved from the page I am inspecting.
    AC: Given a page URL, when I GET /health?url=…, then the response includes activeWorkspace and a matchedBy strategy string.
  US-005: As a developer, I want empty instructions rejected so that the IDE is not sent blank prompts.
    AC: Given a POST /api/feedback without comment, when the request is processed, then HTTP 400 and success=false.
  US-006: As a developer, I want valid feedback forwarded or queued so that Antigravity receives the plan-first prompt.
    AC: Given a POST /api/feedback with comment and pageUrl, when processed, then HTTP 200 and success=true and deliveredVia is set when a conversation exists (or queued message when none).
  US-007: As a developer, I want annotated screenshots saved so that the IDE prompt can reference the image.
    AC: Given a valid data:image PNG/JPEG body, when feedback is posted, then a file is written and savedScreenshotPath is returned (tmpdir fallback if brain dir is not writable).
  US-008: As a developer, I want / and $HOME never treated as process CWD matches so that routing does not attach to the whole disk.
    AC: Given health resolution, when a process CWD would be / or homedir, then that path is not used as activeWorkspacePath.
  US-009: As a developer, I want POST /api/stop to confirm shutdown so that the popup can stop the server.
    AC: Given the app is imported as a module (tests) or running as main, when I POST /api/stop, then HTTP 200 and a shutting-down message (process exit only when require.main === module).

Epic: Extension
  US-010: As a developer, I want inspect and screenshot modes from popup or shortcuts so that I can mark UI without leaving the page.
    AC: Given an unrestricted tab, when I trigger inspect or screenshot, then the content script overlay starts; chrome:// and similar URLs are ignored.
  US-011: As a developer, I want feedback submitted via the extension so that page JavaScript on arbitrary sites cannot CORS-post to the bridge.
    AC: Given the inspector modal, when I send feedback, then the request is proxied by the extension background worker to 127.0.0.1:4000.

## Constraints
- Platform: macOS + Google Chrome + Google Antigravity IDE
- Tech stack: Node.js 18+, Express 5, CommonJS, Chrome MV3, native messaging host com.antigravity.bridge
- Integrations: agentapi CLI, lsof for port→cwd, ~/.gemini/antigravity-ide conversations and brain
- Compliance: local developer tool; no GDPR product surface beyond screenshots/HTML snippets stored on disk

## Edge Cases & Risk Flags
- Open CORS + bind-all-interfaces: any website or LAN client can hit /api/feedback and /api/stop
- Broad extension host_permissions (http(s)://*/\*)
- agentapi execFile with conversation IDs from local metadata (not raw user path)
- 25mb JSON body: large screenshot DoS
- Screenshot write to brain dir may EPERM; needs tmp fallback
- Tests 4/6/8 assume a live :5173 listener and a “justice-for-punjab” workspace — environment-coupled
- Native launcher SIGTERM of any PID on :4000
- Rate limiter key is req.ip (undefined coalesces to “unknown”)
- Native host allowed_origins pinned to a single extension ID

## Open Questions
- Should inspecting non-localhost production URLs remain a first-class path? — blocking: no (current product does)
- Windows/Linux native host? — blocking: no (out of scope)
