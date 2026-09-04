DEP DEPLOYMENT PACKAGE — v1.0
Project: antigravity-bridge
Target: self-hosted / local Docker (macOS native remains the primary run path)
Input: Quinn Test Report v1.0

## Files Generated
- Dockerfile
- .dockerignore
- .github/workflows/ci.yml
- .env.example
- package.json lint script

No docker-compose (no dependent DB/cache). No Kubernetes.

## Environment Variables Required
| Variable       | Description                         | Example                                      | Secret? |
|----------------|-------------------------------------|----------------------------------------------|---------|
| HOST           | Listen address                      | 127.0.0.1                                    | no      |
| PORT           | HTTP server port                    | 4000                                         | no      |
| AGENTAPI_PATH  | Optional agentapi binary override   | /Users/you/.gemini/antigravity-ide/bin/agentapi | no (path) |

## CI/CD Pipeline Stages
1. lint (`npm run lint`) → 2. test (`npm test`) → 3. build (`npm ci`) → 4. security-scan (`npm audit --audit-level=high`)

No deploy stage: this is a local IDE companion, not a cloud app. Adding deploy would ship a localhost-only tool to a remote host without user consent.

## Deployment Verification Checklist
- [ ] GET http://127.0.0.1:4000/health → 200
- [ ] npm test → 13/13
- [ ] Extension popup shows Bridge Connected
- [ ] Inspect + screenshot still send via background proxy
- [ ] Docker (optional): `docker build -t antigravity-bridge .` then run with `-e HOST=0.0.0.0 -p 4000:4000` — agentapi and conversation files will be missing unless those paths are mounted

## Rollback Procedure
1. Stop the container or `npm run launcher:stop` / POST /api/stop from loopback.
2. `git checkout --` the last known good commit of server.js and chrome-extension.
3. Reload the unpacked extension at chrome://extensions.
4. Confirm GET /health.

## Open Questions
- Publishing the Chrome extension to the Web Store (would require updating native host allowed_origins) — not in this package
