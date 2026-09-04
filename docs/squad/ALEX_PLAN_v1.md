ALEX PLAN — v1.0
Project: antigravity-bridge
Input: Rex Report v1.0

## Critical Path
REX_REPORT lock → ARIA as-is contract → LUNA review of live tree → Mason HIGH/CRITICAL fixes (if any) → Quinn hermetic AC tests → Dep Docker/CI/.env.example

## Milestones
M1: Spec and blueprint lock — S
  Delivers: versioned Rex/Aria artifacts; no code
M2: Security and reliability gate — M
  Delivers: Luna findings resolved for CRITICAL/HIGH; loopback bind; extension-proxied feedback; safer stop
M3: Hermetic test proof — M
  Delivers: Quinn suite mapping Rex ACs; no hard dependency on :5173 or a named client workspace
M4: Ship-readiness files — S
  Delivers: Dockerfile, .dockerignore, GitHub Actions, .env.example

## Implementation Checklist
Layer: Data
  [x] 1.1 Store squad artifacts under docs/squad — DoD: versioned markdown reports exist — [LOW]

Layer: Logic
  [ ] 2.1 Loopback bind + HOST override — DoD: default listen is 127.0.0.1; Docker can set HOST=0.0.0.0 — [MED] [SEC]
  [ ] 2.2 Restrict CORS to extension and loopback dashboard origins — DoD: arbitrary https origins do not get ACAO * — [HIGH] [SEC]
  [ ] 2.3 Loopback guard on POST /api/feedback and /api/stop — DoD: non-loopback clients receive 403 — [HIGH] [SEC]
  [ ] 2.4 Screenshot write fallback + size cap — DoD: EPERM on brain dir still yields a tmp file; oversized buffers skipped — [MED]
  [ ] 2.5 Native stop only kills bridge PIDs — DoD: SIGTERM only PID-file process or processes whose command includes server.js — [HIGH] [SEC]

Layer: API
  [ ] 3.1 Export test helpers without changing public HTTP shapes — DoD: GET/POST contracts from Aria remain — [LOW]

Layer: UI
  [ ] 4.1 Content script submits via background fetch — DoD: page origin does not CORS-call the bridge — [HIGH] [SEC]

Layer: Infra
  [ ] 5.1 Dockerfile + compose-less local docs in .env.example — DoD: HEALTHCHECK hits /health — [LOW]
  [ ] 5.2 CI lint → test → build → npm audit — DoD: workflow file exists; lint is node --check — [LOW]

## Blocked Items
- None pending Rex. Tests 4/6/8 are [BLOCKED: environment] until Quinn rewrites them.

## Notes for Aria (Architecture)
- Do not invent a new module tree. Record current single-file server + MV3 + bin host.
- Decide how extension-proxied feedback keeps inspecting arbitrary http(s) pages without opening CORS to the world.
- Document HOST vs PORT and AGENTAPI_PATH.

## Notes for Mason (Implementation)
- Smallest diffs only. Do not restyle the annotator or dashboard.
- Prefer 127.0.0.1 in extension fetch URLs (not localhost IPv6 surprises).
- Keep require.main === module exit behavior for /api/stop so tests do not kill the runner.
