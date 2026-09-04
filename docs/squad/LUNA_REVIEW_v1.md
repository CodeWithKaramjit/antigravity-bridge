LUNA REVIEW — v1.0
Project: antigravity-bridge
Input: Mason Progress (pre-audit tree), Aria Blueprint v1.0

## Summary
2 CRITICAL, 3 HIGH, 3 MED, 2 LOW findings.
Overall status: BLOCK (until CRITICAL+HIGH fixed)

## Findings

### CRITICAL — Unrestricted CORS on mutating API
File: server.js, Line: 33
Issue: `app.use(cors())` reflects any Origin and allows browser POST from arbitrary websites.
Risk: A visited page can CSRF `POST /api/feedback` and inject prompts into Antigravity, or `POST /api/stop`.
Fix: Restrict CORS to chrome-extension://, localhost, and 127.0.0.1. Proxy extension submit through background.js so page JS cannot satisfy the allowlist.

### CRITICAL — Server listens on all interfaces
File: server.js, Line: 643
Issue: `app.listen(PORT)` binds 0.0.0.0.
Risk: Any host on the LAN can reach the unauthenticated IDE-injection and shutdown endpoints.
Fix: Default `HOST` to `127.0.0.1`; allow `0.0.0.0` only via env (containers).

### HIGH — Unauthenticated shutdown from any client
File: server.js, Line: 439
Issue: `POST /api/stop` has no origin/loopback check.
Risk: Remote or cross-site callers terminate the bridge.
Fix: Reject non-loopback remote addresses with 403. Keep `require.main === module` exit guard.

### HIGH — Native stop SIGTERM of any listener on :4000
File: bin/native-launcher.js, Line: 115-132
Issue: After PID file, every PID `lsof` reports on :4000 is killed.
Risk: Unrelated local services on 4000 are terminated.
Fix: Only signal the PID-file process, or PIDs whose `ps` command line includes `server.js`.

### HIGH — Content-script page-origin fetch to the bridge
File: chrome-extension/content.js, Line: 1252
Issue: `fetch(http://localhost:4000/api/feedback)` runs in a context where hostile pages can do the same.
Risk: Same as CORS CSRF.
Fix: `chrome.runtime.sendMessage` → background `fetch` to `http://127.0.0.1:4000`.

### MED — Screenshot persist fails closed
File: server.js, Line: 541-543
Issue: mkdir/write errors leave `savedScreenshotPath` null (observed EPERM on brain dir).
Risk: User markings never reach the IDE prompt.
Fix: Fall back to `os.tmpdir()/antigravity-screenshots`. Cap decoded buffer size.

### MED — Environment-coupled tests
File: test/bridge.test.js, Lines: 53-118
Issue: Tests require a live :5173 listener and a justice-for-punjab workspace.
Risk: CI and clean machines fail (4 failures observed).
Fix: Quinn hermetic tests + helper exports.

### MED — 25mb JSON without decoded image cap
File: server.js, Line: 34
Issue: Body parser limit is 25mb; decoded screenshot is written as-is.
Risk: Disk fill / memory spike on localhost.
Fix: Skip write above a documented max byte size.

### LOW — Rate-limit key `unknown` when IP missing
File: server.js, Line: 59
Issue: Shared bucket for missing IPs.
Risk: Cross-client 429 under proxies. Defer to Max unless loopback-only makes it moot.

### LOW — Native host pinned to one extension ID
File: bin/register-native-host.js, Line: 13
Issue: Unpacked IDs change per machine.
Risk: Start-from-popup fails until re-register. Product constraint; no block.

## Blueprint Conformance
- [✓] File structure matches as-is blueprint
- [ ] CORS and listen host do not yet match Aria security ADR — fix required
- [✓] HTTP paths and JSON field names match

## Checklist Verification
- [✗] Alex 2.2 / 2.3 / 4.1 — not met on reviewed tree
- [✓] US-001/002/005/009 happy paths exist in tests

## Handoff Recommendation
- Ready for Quinn (QA): after CRITICAL+HIGH fixes
- Ready for Dep (Deployment): no

## Notes for Quinn (QA)
- Assert 403 on spoofed non-loopback if testable; always assert loopback POSTs still 200/400.
- Cover screenshot tmp fallback and empty workspaces array.
- Do not require :5173 or a named client repo.

## LUNA RE-REVIEW — v1.1
Date: 2026-09-04
Changed files only: server.js, chrome-extension/background.js, content.js, popup.js, bin/native-launcher.js

### Resolved
- CRITICAL CORS: `cors({ origin })` uses `isAllowedOrigin`
- CRITICAL bind-all: `HOST` default `127.0.0.1`
- HIGH stop/feedback: `rejectUnlessLoopback`
- HIGH native stop: `isBridgeServerPid` requires `server.js` in `ps` command
- HIGH content fetch: `submit-feedback` proxied in background.js
- MED screenshot: tmp fallback + `MAX_SCREENSHOT_BYTES`

### Remaining
- MED environment-coupled tests: handed to Quinn rewrite
- LOW rate-limit unknown key, pinned extension ID: deferred

Overall status: PASS WITH CONDITIONS (MED test coupling for Quinn; no open CRITICAL/HIGH)

Ready for Quinn (QA): yes
Ready for Dep (Deployment): after Quinn green
