# Sprint 0 — Foundations & Setup

- Milestone: **M0** (Delivery Plan weeks 1–2)
- Stage: 1 (Founding Players)
- Depends on: nothing
- Exit criteria (Delivery Plan M0): _a deployed hello-world with login on staging_

## Goal

Stand up the monorepo, environments, CI, and staging deployment so every following sprint has a stable base. The implementing agent executes `docs/Setup Guide RAISE (M0).md` end to end — that file is the detailed runbook for this sprint. This sprint file adds scoping, references, audit, testing, and the checklist.

## Features

### F0.1 Toolchain and repo skeleton

Per Setup Guide §1–§2:

- Required tools installed and versioned (Node 22 LTS, pnpm 10, Docker Desktop + WSL2, Git)
- pnpm + Turborepo monorepo: `apps/web`, `apps/api`, `packages/*` (tokens, schemas, types, api-client, game-configs stubs)
- Root tsconfig, Prettier, ESLint, simple-git-hooks + lint-staged, .gitignore
- GitHub private repo `raise-games` created via **github MCP**; branch pushed

### F0.2 Local data services

Per Setup Guide §3:

- `docker-compose.yml` with Postgres 17 + Redis 7, healthchecks, named volumes
- `pnpm db:up` verified; both containers report `healthy`

### F0.3 API hello-world with OpenAPI

Per Setup Guide §4:

- NestJS 11 on Fastify; CORS from `WEB_ORIGIN`; graceful shutdown hooks
- `/docs/openapi.json` spec published (`@nestjs/swagger` DocumentBuilder)
- pino structured logging (JSON in prod-like envs, pretty locally)
- Env parsing with Zod at startup, fail-fast

### F0.4 Web hello-world shell

Per Setup Guide §6:

- Next.js 15 App Router + Tailwind + ESLint scaffold inside monorepo
- Reachable at `http://localhost:3000`; page fetches API health and renders it
- Minimal PWA `manifest.ts` (design system doc: PWA shell; expand later)

### F0.5 Environment variables contract

Per Setup Guide §5:

- `.env.example` committed with every documented variable
- Zod env schema in the API rejects incomplete startup env

### F0.6 Shared packages bootstrapped

Per Setup Guide §7 — 5 packages, all buildable via Turbo:

- `packages/tokens`: `tokens.json` (seed now, completed in Sprint 1)
- `packages/schemas`: Zod phone normalization (+234) + shared DTO stubs
- `packages/types`: match state union, roles, identity tier union (TA + Design §7)
- `packages/api-client`: pipeline stub (generation wiring, real gen in Sprint 0.8/CI)
- `packages/game-configs`: JSON shape defined, empty games (Sprint 4 fills)

### F0.7 Auth skeleton (stub-level)

Per Setup Guide §4.6 and TA §Security:

- `SmsOtpPort` interface + `MockSmsAdapter` (dev only, `OTP_MOCK_ENABLED`)
- JWT access (15 min) + rotating refresh persisted in `sessions`
- Roles column + auth guard; argon2id available for admin secrets
- MFA placeholder noted (delivered in Sprint 12)

### F0.8 Day-one schema (first migration)

Per Setup Guide §4.5 and PRD "Early technical foundations":

- Tables: `users`, `sessions`, `audit_log`, `outbox_events`, `feature_flags`, `ledger_accounts`, `ledger_entries`, `fee_rules`, `games`, `game_formats`, `consent_records`
- UUIDv7 app-generated ids; timestamptz; money in minor units (integer) + currency code
- Drizzle-kit generate + migrate workflow proven locally

### F0.9 CI pipeline and branch protection

Per Setup Guide §9:

- GitHub Actions: install → lint → typecheck → build → test on every PR + push to main
- Branch protection on `main` (required CI checks, 1 approval, no force push) via **github MCP**
- OpenAPI client regeneration job keyed to API changes

### F0.10 Hosting region decision (Lagos latency probe)

Per Setup Guide §10.2 — `[owner decision]` on provider:

- Deploy stub API to 2–3 candidate regions; measure p95 from a Lagos connection
- Record numbers in a decision note; pick one; tear down others
- Choices documented like a mini-ADR (`senior-architect` skill optional)

### F0.11 Staging deployment

Per Setup Guide §8/§10.3:

- Provision managed Postgres (PITR on), Redis, secrets manager, domain, Cloudflare edge
- Deploy API + web to staging from `main` automatically
- Turnstile keys wired; Sentry + PostHog initialized; ToS/privacy stub pages exist
- `OTP_MOCK_ENABLED=false` asserted in staging/prod startup

### F0.12 M0 exit proof

- Staging: API `/health` returns ok behind the Cloudflare edge; web shell loads; a test phone number completes mock-OTP login against **staging** end to end

## Design compliance

- `packages/tokens` source of truth is `docs/Design System RAISE (Stage 1).md` §2–§5 (color, typography, spacing, motion). Sprint 1 completes values; Sprint 0 only establishes the emission pipeline.
- Landing/ToS stubs use the text wordmark placeholder (Design §13): display face weight 700, no logo.

## Files and references

| Ref                                                                        | What                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------- |
| `docs/Setup Guide RAISE (M0).md` §§1–13                                    | Primary runbook — implement everything it specifies |
| `docs/Technical Architecture RAISE.md` §Stack, §Data model, §Conventions   | Stack decisions + table conventions                 |
| `docs/Delivery Plan RAISE.md` §M0, §Project setup checklist                | Scope bullets mirrored here                         |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Early technical foundations"       | Day-one schema list                                 |
| `docs/Design System RAISE (Stage 1).md` §12 Implementation, §13 Governance | Token emission + wordmark placeholder               |

## Skills, agents, MCP and tools

| Kind  | Resource                           | Use for                                                                                                |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Skill | `gstack`                           | Session start: machine checks (ports, Docker, Node) before starting                                    |
| Skill | `supabase-postgres-best-practices` | Load BEFORE writing F0.8 schema (types, constraints, idempotency, indexing)                            |
| Skill | `verify`                           | After each feature block: build/test loop green                                                        |
| Skill | `senior-architect`                 | ADR notes for hosting-region + ORM decisions                                                           |
| Skill | `cso` / `differential-review`      | Audit of initial CI/deploy/secrets wiring                                                              |
| Skill | `health`                           | End-of-sprint quality dashboard baseline                                                               |
| Skill | `learn`                            | Persist hosting + setup learnings for later sprints                                                    |
| Agent | `explore`                          | N/A this sprint (no legacy code) — use `general` for parallel provisioning commands                    |
| Agent | `general`                          | Structure-independent tasks: region latency probes, secrets wiring steps run in parallel               |
| MCP   | `github`                           | Create repo, protect `main`, open issues for `[owner decision]` items, first PRs                       |
| MCP   | `context7`                         | Next.js 15, NestJS 11, Drizzle, Turborepo current docs before first code write                         |
| Tools | `todowrite` F0.1–F0.12 in order    | Work tracking                                                                                          |
| Tools | `bash`                             | pnpm/docker/deploy commands; `read`/`write`/`edit` for files; `question` for provider/region decisions |

## Testing

- Local gate (Setup Guide §10.1): `pnpm db:up`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all green; spec reachable at `:3001/docs/openapi.json`
- Unit: Zod env schema rejects partial env; phone normalization table-driven tests (+234, leading zero local form) in `packages/schemas`
- Integration: Drizzle migration runs on a clean compose Postgres and is re-runnable (idempotent)
- Smoke (`webapp-testing` skill): open web shell in Chromium, assert health text renders; capture screenshot
- CI: green required checks on the first `main` merge; then a deliberate red build to prove checks block merge, reverted immediately

## Audit

- `cso`: review secrets handling (nothing in repo, secrets-manager-sourced staging envs), turnstile enforced flags
- `best-practices`: dependency hygiene, CSP/CORS defaults, security headers on the web shell
- `differential-review` on the auth-skeleton PR (the only security-sensitive diff this sprint)
- Verify no `.env` files exist in git history (`git log -p -- .env` + GitHub secret scanning via **github MCP** `run_secret_scanning` on the early commit diffs)

## Checklist

- [x] F0.1 Tools verified (`node -v`/`pnpm -v`/`docker --version` output captured); monorepo scaffolded; repo pushed to GitHub
- [x] F0.2 Compose up; both services healthy (command output captured)
- [x] F0.3 API boots Fastify; spec served at `/docs/openapi.json`; invalid env fails startup with readable error
- [x] F0.4 Web shell renders API health at `:3000`; PWA manifest present
- [x] F0.5 `.env.example` complete and committed; no real secrets in repo
- [x] F0.6 Five packages each `build` via Turbo; tokens/schemas/types importable from web and api
- [x] F0.7 Sign-in endpoint creates user + session via mock OTP; refresh rotation works
- [x] F0.8 First migration created + applied; all 11 day-one tables exist with UUIDv7/timestamptz/minor-units conventions
- [ ] F0.9 CI green on `main`; branch protection enforced (github MCP screenshot/dashboard proof)
- [ ] F0.10 Region latency numbers recorded; hosting provider chosen `[owner decision]` issue closed
- [ ] F0.11 Staging deployed; Turnstile/Sentry/PostHog/ToS stub live; secrets from manager; OTP mock asserted off
- [ ] F0.12 M0 exit proof recorded (staging login walkthrough) → **Delivery Plan M0 exit met**
- [ ] Sprint audit pass: cso + differential-review findings fixed or filed
- [ ] `learn` run: setup learnings persisted for future sprints
