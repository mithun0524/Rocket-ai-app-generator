# Rocket AI App Generator

Generate full-stack Next.js apps from natural language prompts using local LLMs (Ollama + deepseek-coder:6.7b by default).

## Features
- Next.js 14 (App Router)
- TailwindCSS (dark mode + enhanced landing page UI)
- Auth with NextAuth (Credentials + JWT)
- Prisma + SQLite
- Multi-phase Plan V2 (entities, roles, features, routes, components, API contracts, prisma models)
- Incremental streamed planning & artifact generation events (SSE)
- Prompt -> strict JSON blueprint via local Ollama or Gemini
- Handlebars-based code scaffolding (template fallbacks)
- Safe file/name normalization (sanitized routes & identifiers)
- Barrel export for generated components
- Live preview (inline React srcDoc for index + raw file viewer)
- Created files progress list (returned by /api/generate)
- File explorer & code viewer
- Download ZIP per project (/api/download?projectId=...)
- Project history page (/projects)
- Dev ephemeral NEXTAUTH_SECRET fallback (stable secret recommended)
- Deploy to Vercel (planned)

## Recent Improvements
- Plan V2 incremental planner with per-section timing metrics persisted to run history
- Blueprint versioning (version field added for future migrations)
- Fallback unified blueprint generation when planning fails (guaranteed at least one Home page)
- Stronger LLM system prompt with explicit JSON schema & rules
- Blueprint normalization (routes, titles, component identifiers, injected imports)
- Component/page/api path sanitization & nested route handling
- Generated components barrel (`components/index.ts`)
- `createdFiles` array returned from `/api/generate` for UI progress
- Enhanced dashboard UI (progress panel, safer preview transformation)
- Session passed from server layout to client provider (fix Unauthorized flashes)
- Dev-only ephemeral NEXTAUTH_SECRET (avoids crashes while prototyping)
- Operation logging (OpLog) with pre/post snapshots for rollback
- Selective rollback (post or pre snapshot) & selective file restore UI
- Structural blueprint diff (hash-based, whitespace-normalized) with per-item hashes
- Ops metrics (filesTouched, bytesWritten, durationMs) surfaced in UI
- Audit trail (AuditEvent) with pagination & type filtering API
- Dependency install queue with persistence & status polling endpoints
- Secure CSRF token system for mutating endpoints
- Rate limiter buckets with optional Redis backend

## Prerequisites
- Node.js 18+
- [Ollama](https://ollama.com/) installed locally
- Pulled model (example): `ollama pull deepseek-coder:6.7b`

## Setup
```bash
cp .env.example .env
# Set at minimum:
# OLLAMA_MODEL="deepseek-coder:6.7b"
# NEXTAUTH_SECRET=<long_random_hex>
npm install
npx prisma migrate dev --name init
npm run dev
```
Visit http://localhost:3000

Generate a secure secret (PowerShell / Bash):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Environment Variables (core)
| Variable | Required | Notes |
|----------|----------|-------|
| DATABASE_URL | yes | SQLite dev default ok | 
| OLLAMA_MODEL | yes | e.g. deepseek-coder:6.7b |
| OLLAMA_BASE_URL | no | defaults http://localhost:11434 |
| NEXTAUTH_SECRET | yes (prod) | 32+ bytes hex recommended |
| NEXTAUTH_URL | prod deploy | Vercel / site URL |

## Ollama Model Test
```bash
curl -X POST http://localhost:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-coder:6.7b","prompt":"Say hi","stream":false}'
```

## Generation Flow
1. User submits prompt via dashboard.
2. `/api/generate` starts streaming: step events + plan-v2-part snapshots (routes early) and plan-v2 final.
3. Plan section timings collected; on failure falls back to unified blueprint.
4. Artifacts generated sequentially, each file streamed (file-start / file-chunk / file-complete events).
5. Files scaffolded under `generated/<projectId>` (pages, components, api, prisma models).
6. Final blueprint (with optional `planV2`) persisted; run metrics (steps + planSections) saved.
7. UI updates artifact progress, plan panels, diff metrics, and history list.

## API Summary
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/generate | POST (SSE) | Generate project; streams planning + artifact events |
| /api/generate/continue | POST (SSE) | Continue / selective regeneration starting at a pipeline step |
| /api/ops | POST | Apply freeform op-* tagged edits (LLM mediated) |
| /api/ops/logs | GET | Recent operation logs (snapshot + metrics) |
| /api/ops/diff | GET | Blueprint diff for a specific op (pre/post) |
| /api/ops/rollback | POST | Rollback to pre or post snapshot (optional selective files) |
| /api/deps/install | POST | Queue dependency install (npm install) |
| /api/deps/status | GET | Dependency install job status |
| /api/audit | GET | Paginated audit events (cursor, type filter) |
| /api/csrf | GET | Issue CSRF token cookie + JSON token |
| /api/preview | GET | Return raw file content (auth + ownership) |
| /api/download | GET | Zip of generated project (auth + ownership) |
| /api/files | GET | Recursive file listing (limit enforced) |
| /api/projects | GET | List user projects (recent first) |
| /api/runs | GET | Recent generation runs + metrics |

### SSE Event Types (generate)
| Event | Data Fields | Notes |
|-------|-------------|-------|
| step | { id, status, label? } | Pipeline step status updates |
| event | { type:"plan-v2-part", section, ms, size } | Section timing partial |
| event | { type:"plan-v2" , plan } | Final plan object |
| event | { type:"plan-v2-metrics", timings } | Array of section timings |
| event | { type:"artifact-total", total } | Total artifacts planned |
| event | { type:"artifact-start", kind, ref } | Artifact generation start |
| event | { type:"artifact-complete", kind, ref, ms, placeholder? } | Success (placeholder when fallback) |
| file-start | { relativePath, type, size? } | Begin streaming file code |
| file-chunk | { relativePath, chunk } | Incremental code text |
| file-complete | { relativePath } | File done |
| blueprint | { ... } | Final blueprint snapshot |
| complete | { projectId } | Terminal marker |

## Runtime Validation & Limits
- Env validation: `src/lib/env.ts` (Zod)
- Rate limit buckets (in-memory or Redis): generate (5/min), ops (15/min), preview (30/min)
- File list cap: 300; ZIP file count limit: 200
- Ownership checks on all project file endpoints
- Ops safety: path traversal blocked, 150KB per write cap, unclosed tag detection
- CSRF protection: generate & ops endpoints require matching X-CSRF-Token header

## Error Codes
- 400 Invalid / missing body
- 401 Unauthorized (no/invalid session)
- 413 Prompt too long / file limits
- 422 LLM JSON parse/schema mismatch
- 429 Rate limit exceeded
- 500 Internal / upstream failure

## Development Notes
- Handlebars only used for simple fallback templates (warnings about `require.extensions` are cosmetic)
- Consider adding Redis/Upstash for persistent rate limiting
- Multi-file live preview bundling (esbuild/WASM) is a future enhancement
- Improve auth flows (password reset, email verification) before production
- Add project deletion / rename endpoints
- Strengthen model prompt to encourage cohesive component reuse

## Testing
```bash
npm test
```
Add tests under `src/**/__tests__/*` (unit + future integration tests).

### Existing Coverage Highlights
- Plan V2 planner (indirectly via generation flow)
- Rate limiter unit test
- op-* tag parser & actions tests

## Operation Tags (op-*)
The `/api/ops` endpoint accepts an LLM-generated response consisting ONLY of operation tags:

| Tag | Purpose | Notes |
|-----|---------|-------|
| `<op-write path="PATH" description="...">...content...</op-write>` | Create/replace file | Must include full file content (no partial diffs) |
| `<op-rename from="OLD" to="NEW"></op-rename>` | Rename a file | Skips silently if source missing |
| `<op-delete path="PATH" />` | Delete a file | Self-closing or paired form allowed |
| `<op-add-dependency packages="pkg1 pkg2" />` | Add dependencies | Version wildcard `*` inserted if absent |
| `<op-summary>...</op-summary>` | Human-readable summary | Optional |

Constraints:
- No markdown backticks inside tags.
- Multiple writes allowed; order not guaranteed.
- Parser tolerates accidental fenced code blocks (strips them).

Client should treat operations as idempotent attempts; success/failure per file is returned.

## Security & Observability
## Security Checklist
- Distributed rate limiter (Redis/Upstash supported)
- CSRF protection for all mutating endpoints
- Structured logging + audit trail (AuditEvent)
- Blueprint parsing hardened (size, complexity, input sanitization)
- Path and file size sanitization for all generated artifacts
- CSRF protection on mutating endpoints (token + cookie)
- Operation audit trail (type + meta JSON)
- Rate limiting buckets (memory/Redis) with clear limits
- File write caps (150KB per op-write tag)
- Path traversal prevention & sanitization
- Blueprint snapshotting for rollback safety nets
- Dependency install output truncated & stored
- Hash-based diff reduces noisy whitespace-only changes

## Roadmap
Short-term (complete):
- AST-aware diff & semantic change classification
- Rollback dry-run preview (show file hash delta before apply)
- Install queue concurrency + cancellation API
- UI pagination & filters for audit panel
- Project deletion / rename endpoints

Medium-term (future):
- Sandboxed multi-file preview bundler (esbuild / SWC)
- Template packs & user-defined blueprint extensions
- Postgres production profile & migration helpers
- CLI bootstrap (`npx rocket-gen <prompt>`)

Long-term:
- Model adaptation / fine-tuning hooks
- Plugin system for custom artifact generators
- Multi-agent planning refinement layer

## Deployment (Vercel)
## Deployment (Vercel & Local)
- For Vercel: Set all required environment variables in dashboard
- Use Postgres (Neon/Supabase) for production: update `DATABASE_URL`
- Set `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `OLLAMA_*` (if remote model gateway)
- Add build flag for disabling dev secret fallback
- Run `npx prisma migrate deploy` on Vercel build
- (Optional) Add Redis/Upstash for distributed rate limiting
- For local: Use SQLite by default, run `npm run dev` and access http://localhost:3000

## Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| JWT_SESSION_ERROR | Secret rotated | Set stable `NEXTAUTH_SECRET`, restart, re-login |
| 422 schema mismatch | Model produced invalid JSON | Regenerate; refine prompt; upgrade model |
| Unexpected token '<' | Non-JSON body to /api/generate | Ensure valid JSON request payload |
| ENOENT on preview | Stale path or unsanitized name | Regenerate after recent normalization updates |

## License
MIT
