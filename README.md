# Rocket AI App Generator

Generate full-stack Next.js apps from natural language prompts using local LLMs (Ollama + deepseek-coder:6.7b by default).

## Features
- Next.js 14 (App Router)
- TailwindCSS (dark mode + enhanced landing page UI)
- Auth with NextAuth (Credentials + JWT)
- Prisma + SQLite
- Prompt -> strict JSON blueprint via local Ollama
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
- Stronger LLM system prompt with explicit JSON schema & rules
- Blueprint normalization (routes, titles, component identifiers, injected imports)
- Component/page/api path sanitization & nested route handling
- Generated components barrel (`components/index.ts`)
- `createdFiles` array returned from `/api/generate` for UI progress
- Enhanced dashboard UI (progress panel, safer preview transformation)
- Session passed from server layout to client provider (fix Unauthorized flashes)
- Dev-only ephemeral NEXTAUTH_SECRET (avoids crashes while prototyping)

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
2. `/api/generate` sends strict system instructions to Ollama.
3. Raw JSON validated (Zod). Normalization adjusts routes, identifiers, imports.
4. Files scaffolded under `generated/<projectId>` (components, pages, api, models.prisma).
5. Response includes `projectId`, `blueprint`, and `createdFiles` summary.
6. UI refreshes file list + allows preview & download.

## API Summary
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/generate | POST | Create project from prompt (rate-limited) |
| /api/preview | GET | Return raw file content (auth + ownership) |
| /api/download | GET | Zip of generated project (auth + ownership) |
| /api/files | GET | Recursive file listing (limit enforced) |
| /api/projects | GET | List user projects (recent first) |

## Runtime Validation & Limits
- Env validation: `src/lib/env.ts` (Zod)
- Rate limit: 10 requests/user/min (in-memory, `X-Rate-Remaining`)
- File list cap: 300; ZIP file count limit: 200
- Ownership checks on all project file endpoints

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

## Security Checklist (Planned)
- Replace in-memory limiter with distributed backend
- Add CSRF protection for non-NextAuth POST routes
- Structured logging + audit trail
- Harden blueprint parsing (size & complexity budget)

## Roadmap
- Streaming generation progress
- Full sandboxed multi-file preview (module graph)
- Template packs & user-defined blueprints
- Postgres + migrations for production
- CLI bootstrap (`npx rocket-gen <prompt>`) interface
- Vercel deploy guide + edge optimizations

## Deployment (Vercel)
- Switch to Postgres (Neon/Supabase): update `DATABASE_URL`
- Set `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `OLLAMA_*` (if remote model gateway)
- Add build flag for disabling dev secret fallback

## Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| JWT_SESSION_ERROR | Secret rotated | Set stable `NEXTAUTH_SECRET`, restart, re-login |
| 422 schema mismatch | Model produced invalid JSON | Regenerate; refine prompt; upgrade model |
| Unexpected token '<' | Non-JSON body to /api/generate | Ensure valid JSON request payload |
| ENOENT on preview | Stale path or unsanitized name | Regenerate after recent normalization updates |

## License
MIT
