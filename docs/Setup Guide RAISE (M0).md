# Setup Guide: RAISE (M0 Foundations)

Draft of November 9, 2026. Companion to the Delivery Plan. This guide takes a machine and a repo from zero to the M0 exit criteria: a deployed hello-world with login on staging, backed by Postgres and Redis, with CI and preview deploys working.

Everything here implements decisions already made in the Technical Architecture and Design System docs. Where those docs leave a choice open, this guide picks a concrete default and marks it `[confirm]`.

---

## 0. Reference documents

Read these first, in this order:

1. `Product Brief RAISE.md` — what and why
2. `RAISE PRD v2 Staged Rollout.md` — source of truth for scope
3. `Technical Architecture RAISE.md` — the stack and rules this guide implements
4. `Delivery Plan RAISE.md` — the M0/M1/M2... sequence
5. `Design System RAISE (Stage 1).md` — referenced in step 8 (tokens)

---

## 1. Machine setup (prerequisites)

### 1.1 Required tools

| Tool                | Version                            | Why                                                              | Install                                                                              |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Node.js             | 22 LTS                             | Next.js 15 and NestJS 11 require Node 20+; 22 is the current LTS | https://nodejs.org (or `nvm` on macOS/Linux)                                         |
| pnpm                | 10.x                               | The monorepo package manager                                     | `corepack enable` then `corepack prepare pnpm@latest --activate`, or `npm i -g pnpm` |
| Docker Desktop      | latest with WSL2 backend (Windows) | Local Postgres + Redis                                           | https://www.docker.com/products/docker-desktop                                       |
| Git                 | latest                             | Version control                                                  | https://git-scm.com                                                                  |
| VS Code (or Cursor) | latest                             | Recommended extensions below                                     | —                                                                                    |

### 1.2 Windows-specific notes

- Enable **long path support** (node_modules get deep): `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -Force` (admin shell), or just keep the repo shallow (`C:\dev\raise`, not `Documents\...`).
- Docker Desktop: install with the **WSL2 backend** option checked. Run `wsl --install` first if WSL is not enabled.
- If `pnpm` scripts are blocked, run: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 1.3 Verify the toolchain

```powershell
node -v          # v22.x
pnpm -v          # 10.x
docker --version # Docker version 27+
docker compose version
git --version
```

### 1.4 VS Code extensions

- ESLint (dbaeumer.vscode-eslint)
- Prettier (esbenp.prettier-vscode)
- Tailwind CSS IntelliSense (bradlc.vscode-tailwindcss)
- EditorConfig (editorconfig.editorconfig)
- Vitest (vitest.explorer) and Playwright (ms-playwright.playwright)

---

## 2. Create the repo and monorepo skeleton

Target layout (from the architecture doc):

```
raise-games/
  apps/
    web/        Next.js 15 (App Router, PWA shell, Tailwind) — presentation only
    api/        NestJS 11 (Fastify) — REST + OpenAPI + WebSocket gateway
  packages/
    tokens/     Design tokens JSON -> CSS variables + TS constants (build step)
    schemas/    Zod schemas shared by web and api
    types/      Shared TS types (match states, modules)
    api-client/ Generated typed client from the OpenAPI spec
    game-configs/ Per-game configuration (eFootball, CODM, PUBG Mobile)
  docker-compose.yml
  pnpm-workspace.yaml
  turbo.json
  .env.example
  .github/workflows/ci.yml
```

### 2.1 Initialize

```powershell
mkdir raise-games; cd raise-games
git init
pnpm init
```

### 2.2 Workspace and Turbo

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Install Turbo and create `turbo.json`:

```powershell
pnpm add -Dw turbo@latest
```

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "db:migrate": { "cache": false },
    "db:seed": { "cache": false }
  }
}
```

### 2.3 Root scripts and tooling

`package.json` (root) — add scripts:

```json
{
  "name": "raise",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:up": "docker compose up -d",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:seed": "pnpm --filter api db:seed",
    "e2e": "pnpm --filter web e2e"
  }
}
```

Install shared root tooling:

```powershell
pnpm add -Dw typescript@latest prettier eslint eslint-config-prettier simple-git-hooks lint-staged
```

Root `tsconfig.base.json` (shared by everything):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "noUncheckedIndexedAccess": true
  }
}
```

`.prettierrc`:

```json
{ "semi": true, "singleQuote": true, "printWidth": 100, "trailingComma": "all" }
```

`.gitignore` (minimum):

```
node_modules/
dist/
.next/
coverage/
.env
.env.*
!.env.example
.turbo/
playwright-report/
test-results/
```

Add to root `package.json`:

```json
"simple-git-hooks": { "pre-commit": "pnpm lint-staged" },
"lint-staged": { "*.{ts,tsx,js,jsx,json,md}": ["prettier --write"] }
```

Then `pnpm simple-git-hooks` to activate.

### 2.4 Decide and record

- Repo host: GitHub, private. Branch protection on `main`: 1 approval, all required CI checks green, no force-push.
- Naming: repo `raise-games` (or the name the owner prefers).

---

## 3. Local data services (Docker Compose)

Create `docker-compose.yml` in the repo root:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: raise-pg
    environment:
      POSTGRES_USER: raise
      POSTGRES_PASSWORD: raise
      POSTGRES_DB: raise
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U raise']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: raise-redis
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data
    command: ['redis-server', '--appendonly', 'yes']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  redisdata:
```

Notes:

- **UUIDv7**: Postgres 17 has no native UUIDv7. Generate UUIDv7 **in application code** (`uuid` npm package v9+ supports `uuid()`/`v7()`). The production managed Postgres choice (4.1) can be revisited alongside this; app-side generation works everywhere.
- Never run migrations from docker; migrations live in `apps/api`.

Bring it up:

```powershell
pnpm db:up
docker compose ps   # both services "healthy"
```

---

## 4. apps/api — NestJS

### 4.1 Scaffold

```powershell
cd apps
pnpm dlx @nestjs/cli@latest new api --package-manager pnpm --skip-git --strict
cd ..
```

The CLI creates `apps/api/` with its own `package.json` — remove any nested `apps/api/.git` if present.

Switch to Fastify and install the core dependency set:

```powershell
pnpm --filter api remove @nestjs/platform-express
pnpm --filter api add @nestjs/platform-fastify @nestjs/config @nestjs/jwt @nestjs/swagger zod drizzle-orm pg drivine ioredis bullmq uuid nestjs-pino pino-pretty argon2
pnpm --filter api add -D drizzle-kit @types/pg tsx vitest @testcontainers/postgresql
```

`@nestjs/swagger` works with Fastify and emits OpenAPI 3.1. The generated typed client comes from that spec (step 6.2).

### 4.2 Configure Fastify + WebSocket

`src/main.ts` — key points:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggerModule } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }), // behind Cloudflare/headless monitoring: trust X-Forwarded-For
  );
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? [], credentials: true });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('RAISE API')
    .setVersion('0.1')
    .addSecurity('bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  SwaggerModule.setup('docs/openapi.json', app, config); // spec URL only; the UI is optional

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
```

- pino: structured JSON logs in staging/prod, pretty-print locally (`pino-itty` style config via `nestjs-pino`).
- The WebSocket gateway (chat, live match state, in-app notifications on one connection) arrives in M2 with `@nestjs/websockets` + `@nestjs/platform-socket.io` and Redis pub/sub. Note it in the module tree now so it is not an afterthought.

### 4.3 Drizzle ORM + migrations `[confirm: ORM choice — Drizzle is TS-first and fits the expand-and-contract convention; Prisma is the alternative if the team prefers it]`

Structure in `apps/api/src/`:

```
src/
  config/          env parsing with Zod (fail-fast startup)
  db/              schema files, drizzle client, migrations
  modules/         domain modules (4.4)
  shared/          ports & adapters: PaymentProvider, FileStorage, SmsOtp, Email, NotificationChannel
```

Install the drizzle config in `apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`package.json` (apps/api) scripts:

```json
{
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "db:migrate": "drizzle-kit migrate",
    "db:generate": "drizzle-kit generate"
  }
}
```

### 4.4 Module tree from the architecture doc

One folder per module under `src/modules/`, with the rule that each module owns its tables and communicates only through interfaces + the outbox:

```
modules/
  identity/          User, Session, Device, Role, Sanction, Report, AuditLog,
                     ConsentRecord, LimitSetting, jurisdiction/KYC/age fields
  profiles/          GameProfile
  games/             Game, GameFormat, game-config loader
  matches/           Challenge, Match, MatchSide, MatchParticipant (state machine lives here)
  verification/      ResultSubmission, Dispute, Ruling, image hashing
  ratings/           RatingEvent + Elo math (pure, property-tested)
  wallet/            LedgerAccount, LedgerEntry (double-entry, immutable), Hold,
                     FeeRule + WalletProvider port + MockProviderAdapter
  messaging/         Conversation, Message, Block, Mute
  notifications/     Notification, NotificationPreference, DeliveryAttempt + channel adapters
  moderation/        admin dispute queue
  admin/             admin endpoints, feature flags
```

For M0, only scaffold `identity` (auth skeleton) and `db` schema foundations; the rest are stub folders with a README each.

### 4.5 Day-one schema (M0 scope)

Per the PRD "Early technical foundations" — even before the full modules exist, create these tables via the first migration:

- `users` — id (uuid v7, app-generated), phone (unique), display_name, jurisdiction_state, kyc_status, age_verification_status, identity_tier, role, created_at/updated_at (timestamptz), soft-delete where relevant
- `sessions` — rotating refresh tokens, device metadata
- `audit_log` — actor, action, object id, before/after JSON, ip, created_at
- `outbox_events` — id, type, payload JSON, created_at, processed_at nullable
- `feature_flags` — key, stage, jurisdiction nullable, enabled
- `ledger_accounts` / `ledger_entries` — double-entry shape per the architecture doc (immutable, idempotency key unique index)
- `fee_rules` — versioned table
- `games` / `game_formats` — seeded from `packages/game-configs`
- `consent_records` — user, terms_version, accepted_at

Conventions (architecture doc): UUIDv7 ids, `timestamptz` everywhere, money in **minor units with currency code** (never floats), soft deletes only where history matters.

### 4.6 Auth skeleton (M0 exits on "hello-world with login")

Implement minimal but real, not throwaway:

1. **Phone OTP sign-in** — request OTP, verify, create user + session. Strategies:
   - `SmsOtpPort` (Nest provider, injected). Two adapters: `MockSmsAdapter` (dev: logs the code, or returns it in the response with a flag) and production stub.
   - Dev-only convenience: a fixed code `000000` is acceptable; never wire that into prod builds. `[confirm vendor: Termii vs Twilio, per PRD open decisions]`
2. **Token pair** — 15-minute JWT access token (`@nestjs/jwt`), rotating refresh tokens persisted in `sessions` with device metadata. Token-based so the React Native app reuses it later (architecture doc).
3. **argon2id** for any password-like secrets (via the `argon2` package, default = argon2id). Passwords only exist for the admin portal — player auth is OTP-only.
4. **Admin MFA placeholder** — role column now; TOTP (`otplib`) in M3 when the admin dashboard lands. `[confirm]`
5. **Zod at the edge** — validate every request body before it reaches a service (a small `ZodValidationPipe`).

### 4.7 Run and verify

```powershell
pnpm db:up
pnpm --filter api dev        # http://localhost:3001
# spec: http://localhost:3001/docs/openapi.json
```

---

## 5. Environment variables

`.env.example` at root — every var every environment needs, documented:

```bash
# ---- Core ----
NODE_ENV=development
PORT=3001
WEB_ORIGIN=http://localhost:3000

# ---- Database (Postgres) ----
DATABASE_URL=postgres://raise:raise@localhost:5432/raise

# ---- Redis ----
REDIS_URL=redis://localhost:6379

# ---- Auth ----
JWT_ACCESS_SECRET=change-me-32-bytes-min
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
OTP_MOCK_ENABLED=true            # dev only
SMS_PROVIDER=termii              # termii | twilio | mock
SMS_API_KEY=
SMS_SENDER_ID=

# ---- Email (fallback channel, per architecture doc) ----
EMAIL_PROVIDER=mock              # mock | resend | ses
EMAIL_API_KEY=
EMAIL_FROM="RAISE <hello@yourdomain.com>"

# ---- File storage (R2, S3-compatible) ----
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=raise-proof-screenshots
R2_PUBLIC_BASE_URL=

# ---- Cloudflare Turnstile ----
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# ---- Observability ----
SENTRY_DSN=
SENTRY_ENVIRONMENT=staging
POSTHOG_KEY=
POSTHOG_HOST=https://eu.i.posthog.com

# ---- Web (apps/web/.env.local) ----
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

Rules:

- `.env` is git-ignored; `.env.example` is committed.
- Production secrets live in a secrets manager (4.1), never in the repo.
- Zod-parse every env at API startup and fail fast with a readable message.

---

## 6. apps/web — Next.js

### 6.1 Scaffold

```powershell
pnpm dlx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

Design system implementation notes (from `Design System RAISE (Stage 1).md`):

- shadcn/ui on top: `pnpm --filter web dl shadcn@latest init` — then map CSS variables per the doc's §12 mapping table (`--background` -> `bg-0`, `--primary` -> `accent`, `--destructive` -> `loss`, `--radius` -> 4px).
- Override the Tailwind radius scale to 2 / 4 / 6px; no pill shapes.
- Dark default via `data-theme` attribute + system preference option, stored on the profile (doc §12).
- Turnstile in the signup form (stage: Turnstile JS widget + server-side verify in the API).
- PWA shell: add a minimal manifest now (`apps/web/src/app/manifest.ts`) — full PWA polish can wait, but web push via the installed PWA is the iOS path, so the manifest should be real early.

### 6.2 Typed API client

Generated, never hand-written (architecture doc):

1. The API publishes its OpenAPI spec at `/docs/openapi.json`.
2. `packages/api-client` uses `openapi-typescript` to emit types:

```powershell
pnpm --filter api-client dl openapi-typescript http://localhost:3001/docs/openapi.json -o ./src/schema.d.ts
```

then a thin wrapper (fetch-based) exposing typed calls. Web never constructs a raw `fetch` to the API without it.

3. A `generate:api` CI job re-runs this on every API deploy so client and server cannot drift.

### 6.3 Run and verify

```powershell
pnpm --filter web dev       # http://localhost:3000
```

---

## 7. Shared packages

Minimal, buildable packages. Every one needs `package.json` (name `@raise/<pkg>`), `src/index.ts`, and a `build` (tsc) script so Turbo can chain.

| Package        | Contents (M0)                                                                                                                                                                                                                                           | Notes                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens`       | `tokens.json` as the single source of truth (the Design System doc's entire token section: colors from §2, type scale from §3, spacing from §4, motion durations from §5) + a tiny build script emitting (a) `:root` CSS for Tailwind, (b) TS constants | Add unit tests that assert the dark/light tables in the doc match `tokens.json`                                                          |
| `schemas`      | Zod schemas shared by web + api: phone numbers (with +234 normalization), OTP, challenge create/update, result submit, dispute, report                                                                                                                  | The phone-normalization decision is open in the docs — start with the doc's proposal (accept local leading-zero, normalize to `+234...`) |
| `types`        | Match state enum mirroring the state machine (Open, Accepted, In progress, Awaiting result, Awaiting confirmation, Confirmed, Disputed, Resolved, Cancelled, Expired, Forfeited, Voided); roles; identity tiers                                         | API and web must both import this; never redeclare a state string                                                                        |
| `api-client`   | Generated in step 6.2                                                                                                                                                                                                                                   | —                                                                                                                                        |
| `game-configs` | JSON per game: id fields, supported formats, result schema, required proof, tiebreak rules (PRD: "Games are configuration, not code")                                                                                                                   | Seed the `games`/`game_formats` tables from this in the seed script                                                                      |

---

## 8. Service provisioning (staging / production)

Pick one vendor per row now; the costs table in the PRD assumes roughly $150–400/month at beta scale. `[confirm]` on each.

| Service                               | Candidates                                       | Notes                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed Postgres, **PITR required**   | Neon, Supabase, AWS RDS/Cloud SQL                | PITR is a stated risk-control (one-day recovery target). Archive `wal` before choosing.                                                                                                                                               |
| Redis                                 | Upstash, Redis Cloud, ElastiCache                | Used for BullMQ, pub/sub, rate limits. Managed; get persistence on.                                                                                                                                                                   |
| Container hosting `[confirm: region]` | Fly.io, Railway, AWS ECS, GCP Cloud Run          | **Deploy to a measured candidate then run the latency test (step 10.2) before committing.** Data-center region must serve Lagos < ~150ms ideally: EU/US are fine at this stage, Africa-adjacent (Frankfurt, Cape Town) worth testing. |
| Object storage                        | Cloudflare R2                                    | Private bucket + signed reads. M0: runtime config + credentials; screenshots arrive in M2.                                                                                                                                            |
| DNS / WAF / Turnstile                 | Cloudflare                                       | Tunnel or serve HTTP behind the edge. Turnstile keys free.                                                                                                                                                                            |
| Email                                 | Resend or AWS SES                                | Needed for notification fallback, not day-1. Provision now, integrate in M2.                                                                                                                                                          |
| SMS / OTP                             | Termii (Nigeria-built) or Twilio                 | Cost matters at OTP-per-signup scale; see PRD estimates. Same adapter interface either way.                                                                                                                                           |
| Sentry                                | SaaS                                             | Error tracking, both apps + mobile later.                                                                                                                                                                                             |
| PostHog                               | SaaS (EU)                                        | Product analytics, tied to the Stage 1 success metrics.                                                                                                                                                                               |
| Secrets manager                       | Doppler, GCP Secret Manager, AWS Secrets Manager | Never in the repo. Wire Docker/host secrets from here.                                                                                                                                                                                |
| Domain                                | —                                                | e.g., raise.ng — with the ownership/legal check. `[confirm]`                                                                                                                                                                          |

Provision staging (and lock production provisioning until M3). Record credentials in the secrets manager; seed `.env` values into the hosting platform.

---

## 9. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` — runs on every PR; required checks on `main`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm test
```

Preview deploys — options `[confirm]`:

- **Fly.io / Railway**: preview environments per PR, or a shared `staging` environment that auto-deploys `main`.
- The DB is not a dependency for this CI job (unit/integration only). Playwright e2e (M2+) runs against a services container or the staging environment.

Deployment anatomy (staging):

- Two containers from one monorepo build: `apps/api` (dist), `apps/web` (Next).
- `db:migrate` runs as a release step (backward-compatible/expand-contract only: never `drop` before code that no longer reads it is gone).
- Env vars come from the secrets manager.

**M0 exit = staging returns a "hello" JSON from the API, the web shell loads, and a test phone number can sign in via mock OTP end-to-end.**

---

## 10. Verification checklist

### 10.1 Local (must all pass)

```powershell
pnpm db:up         # Postgres + Redis healthy
pnpm build         # turbo: tokens, schemas, types, api-client, web, api build clean
pnpm lint
pnpm typecheck
pnpm test          # tokens tests, phone-normalization tests, smoke tests
curl http://localhost:3001/docs/openapi.json   # spec exists
```

### 10.2 Lagos latency probe `[confirm: hosting region]`

From a Nigerian connection (or ask a seed user), compare candidate regions:

- Hosting provider choice is listed as a pending decision; decide after the probe.
- A practical early test: deploy the staging API to 2–3 candidate regions and `ab`/`hey` from Lagos for p95 latency. Record the numbers in the delivery plan, then pick and shut the others down.

### 10.3 Deploy checklist (staging)

- [ ] Postgres: PITR enabled, backups verified
- [ ] Redis: persistence on
- [ ] Secrets: all from the secrets manager, none in the repo
- [ ] Turnstile: site + secret keys wired (signup uses it)
- [ ] Sentry: API + web DSNs live, errors arrive
- [ ] PostHog: capture one test event
- [ ] Rewrite/redirects: web served at the apex domain, API on `api.<domain>`
- [ ] ToS / privacy policy pages exist as stubs (legal track requirement before any beta, per Delivery Plan)
- [ ] Branch protection: required checks configured
- [ ] Seed data: a demo ladder visible

---

## 11. Common setup pitfalls

| Symptom                                   | Cause / fix                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-gyp` / build errors on Windows      | Some deps (e.g., `pg` fallback native) need build tools — prefer the WSL2-era pure-JS `pg`; or install VS Build Tools if any dep demands it |
| Next.js build OOM in Turbo                | Memory contention on Windows + Docker; `setx NODE_OPTIONS --max-old-space-size=4096`                                                        |
| `pnpm` hangs importing `.workspace`       | Ensure `pnpm-workspace.yaml` exists at root                                                                                                 |
| Docker Desktop won't start (Windows)      | Enable WSL2: `wsl --install`, reboot, then Docker Desktop -> Settings -> "Use the WSL2 based engine"                                        |
| Postgres port 5432 busy                   | A local Postgres is already installed; stop the service (services.msc) or remap the container port                                          |
| Argon2 native build fails on Windows      | Use `pnpm reset`-style reinstall; or swap to `@node-rs/argon2` (prebuilt binaries) `[confirm]`                                              |
| `Exec policy` errors during build scripts | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`                                                                                       |
| OTP mock leaks to staging                 | The `OTP_MOCK_ENABLED` flag must be false in staging/prod envs and asserted at startup                                                      |

---

## 12. Suggested first-week schedule mapping

Mapping the guide sections onto the Delivery Plan's M0 (weeks 1–2):

| Day(s) | Work                                                              | Section |
| ------ | ----------------------------------------------------------------- | ------- |
| 1      | Toolchain, repo init, monorepo skeleton                           | 2       |
| 2      | Docker Compose + env vars                                         | 3, 5    |
| 3–4    | NestJS scaffold, Drizzle, first migration with the day-one tables | 4       |
| 4–5    | Next.js scaffold + tokens package + shadcn theme wiring           | 6, 7    |
| 6      | Auth skeleton end-to-end (mock OTP)                               | 4.6     |
| 7–8    | CI, staging deploy, secrets manager, domain                       | 9, 8    |
| 9–10   | Latency probe, hosting decision, harden, verify checklist         | 10      |

Everything in Weeks 3–4 (prototype testing per M1) is out of scope for this guide.

---

## 13. Open items carried into M0 execution

These block nothing day-1 but need answers before M3:

- Revenue model / fee rules (owner) — needed for the fee-rule seed data shape
- Play-credit rehearsal: yes/no (product decision)
- Restricted DMs in Stage 1 (owner)
- OTP vendor (Termii vs Twilio)
- Hosting provider + region (after step 10.2)
- Minimum age, custody model, licensing, operating states (legal track — start now, not with M0 code)
- Screenshot/chat retention periods (legal track)
- Elo parameters (K-factor, provisional threshold)
- Reputation thresholds
