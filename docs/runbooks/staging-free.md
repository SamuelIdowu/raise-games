# Runbook: free staging ($0)

Owner: engineer. Decision: `docs/decisions/0008-hosting.md`. **Staging only.** Nothing here is fit for real players: there is one API instance, no point-in-time recovery, Redis without persistence, and free plans that can restart services at any time. Production follows `deploy.md` on paid hosting.

## What runs where

| Part       | Service                                     | Region       | Free limits that matter                                                      |
| ---------- | ------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| Web        | Render free web service (`render.yaml`)     | Frankfurt    | Sleeps after 15 min idle; 750 h/month per workspace (enough for one service) |
| API        | Koyeb free instance (`apps/api/Dockerfile`) | Frankfurt    | 512 MB RAM, 0.1 vCPU, one per organisation; sleeps after 1 h idle            |
| Redis      | Render free Key Value (`render.yaml`)       | Frankfurt    | 25 MB, 50 connections, no persistence                                        |
| Postgres   | Supabase free                               | eu-central-1 | 500 MB; paused after 1 week idle (the API's constant queries prevent it)     |
| Files      | Supabase Storage, S3-compatible endpoint    | same project | 1 GB; R2 is the production choice but needs a card even on its free tier     |
| SMS        | Twilio trial                                | n/a          | Trial credit; sends only to verified numbers (matches `SMS_ALLOWLIST`)       |
| Bot check  | Cloudflare Turnstile                        | n/a          | Free                                                                         |
| Keep-awake | Cloudflare Worker cron (`infra/keepalive`)  | n/a          | Free plan; pings both services every 10 min                                  |

Why these: Neon's free plan has 100 compute-hours a month and the API queries Postgres every 30 s (expiry sweeper), so it would be suspended around day 16. Aiven's free plan powers off when idle. Vercel's free plan forbids commercial use. Cloudflare Workers cannot run the API (Socket.IO, BullMQ, argon2 and sharp need Node).

## Setup, in order

Each step gives a value that a later step needs. Keep them in a password manager, not in the repo.

### 1. Supabase (Postgres and file storage)

1. Create a project in **eu-central-1 (Frankfurt)**. Save the database password.
2. **Database URL:** Connect → **Session pooler** (IPv4; the direct host is IPv6-only and transaction mode breaks the migration's advisory lock). Use it as `DATABASE_URL` with `?sslmode=no-verify` appended (the pooler certificate is not publicly signed; staging only):
   `postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify`
3. **Storage:** create a **private** bucket `raise-proof-screenshots`. Settings → Storage → S3 connection: enable it and create an access key. Note the endpoint (`https://<ref>.storage.supabase.co/storage/v1/s3`) and region (`eu-central-1`).

### 2. Render (web and Redis)

1. New → Blueprint → this repo. Render reads `render.yaml` and creates `raise-web-staging` and `raise-redis-staging`.
2. Open `raise-redis-staging` → Connect → **External**: copy the `rediss://` URL. This is the API's `REDIS_URL`.
3. Leave the web service's `NEXT_PUBLIC_*` values for step 5: they need the API's URL.

### 3. Cloudflare Turnstile

Turnstile → Add widget → hostname `raise-web-staging.onrender.com`. Note the site key (web) and secret key (API).

### 4. Twilio trial (OTP SMS)

Sign up, get a trial number, and verify each tester's phone under Verified Caller IDs. `SMS_API_KEY` is `ACCOUNT_SID:AUTH_TOKEN`; `SMS_SENDER_ID` is the trial number. Put the same tester numbers in `SMS_ALLOWLIST`. Delivery to Nigerian numbers from a trial account is not guaranteed: if a code does not arrive, check the Twilio message log first.

### 5. Koyeb (API)

Create a Web Service from this GitHub repo:

- Builder: **Dockerfile**, path `apps/api/Dockerfile`, build context `.` (repo root). Branch `main`, auto-deploy on.
- Instance: **Free**, region **Frankfurt**. Port **3001**, HTTP health check path `/health`.
- **Run command override** (migrations before boot; the free plan has no separate release job, and the advisory lock makes a concurrent run wait):
  `sh -c "node dist/db/migrate.js && exec node --require ./dist/instrument.js dist/main.js"`
- Environment (mark the secrets as Koyeb secrets):

| Setting                                        | Value                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                                     | `staging`                                                         |
| `NODE_OPTIONS`                                 | `--max-old-space-size=384` (512 MB instance)                      |
| `PORT`                                         | `3001`                                                            |
| `TRUST_PROXY`                                  | `1` (Koyeb's edge)                                                |
| `DATABASE_URL`                                 | step 1.2                                                          |
| `REDIS_URL`                                    | step 2.2 (`rediss://…`)                                           |
| `JWT_ACCESS_SECRET`                            | `openssl rand -base64 48`                                         |
| `MFA_ENCRYPTION_KEY`                           | `openssl rand -base64 32`                                         |
| `WEB_ORIGIN`, `APP_URL`                        | `https://raise-web-staging.onrender.com`                          |
| `OTP_MOCK_ENABLED`                             | `false`                                                           |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | `twilio`, step 4                                                  |
| `SMS_ALLOWLIST`                                | tester numbers, E.164, comma-separated                            |
| `TURNSTILE_SECRET_KEY`                         | step 3                                                            |
| `STORAGE_ENDPOINT`                             | step 1.3 endpoint                                                 |
| `STORAGE_REGION`                               | `eu-central-1`                                                    |
| `STORAGE_FORCE_PATH_STYLE`                     | `true`                                                            |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`     | step 1.3 access key (the names are the API's; any S3 store works) |
| `R2_BUCKET`                                    | `raise-proof-screenshots`                                         |

Leave unset: `RESEND_API_KEY` (email goes to the logging mock), VAPID keys (push skipped), `MOCK_PROVIDER_WEBHOOK_SECRET`, `OPS_JOBS_DISABLED`, `LEDGER_JOBS_DISABLED`. Optional: `SENTRY_DSN` and `POSTHOG_KEY` (both have free plans).

The API refuses to boot and lists every missing setting if one is wrong: read the first log lines.

### 6. Render web settings, then deploy

On `raise-web-staging` set `NEXT_PUBLIC_API_URL` (the Koyeb URL), `NEXT_PUBLIC_SITE_URL` (`https://raise-web-staging.onrender.com`), `NEXT_PUBLIC_STORAGE_ORIGIN` (`https://<ref>.storage.supabase.co`) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, then trigger a manual deploy. Render passes them to the Docker build as build arguments; the Dockerfile stops the build if any URL is missing or not https, so a wrong value fails loudly instead of shipping.

### 7. Keep-awake Worker

Put the two real URLs in `infra/keepalive/wrangler.toml` (`TARGETS`), then:

```bash
cd infra/keepalive && npx wrangler login && npx wrangler deploy
```

Check Workers → `raise-staging-keepalive` → Logs after 10 minutes: both URLs should answer 200.

## Smoke test

1. `https://<koyeb-app>.koyeb.app/health` returns 200 (503 means Postgres or Redis is unreachable: check the URLs from steps 1–2).
2. Open the web URL and sign up with a verified tester phone. The OTP arrives by SMS.
3. Two testers on two devices: create a challenge, accept it, chat in the match room (WebSockets through Koyeb), submit a result with a screenshot (Supabase Storage).
4. `/docs` on the API shows the route map (staging only; production returns 404).

The screenshot upload is the least certain part of this setup: the browser PUTs straight to a presigned Supabase Storage URL, so it depends on Supabase's S3 endpoint accepting presigned PUTs from the web origin (CORS) with the signed `content-type` and `content-length`. If step 3 fails at the upload, check the browser console for a CORS or signature error.

## Known limits

- The first request after a deploy, or after the keep-awake Worker misses a run, can take up to a minute (Render) or a few seconds (Koyeb).
- 0.1 vCPU makes password and OTP hashing (argon2) slow. Fine for testers, not a performance measurement: Sprint 15 load and latency runs need real staging on paid hosting.
- Keeping free services awake on purpose may conflict with the providers' fair-use terms. If a provider objects, stop the Worker.
- Redis restarts lose queued jobs. The outbox relay and expiry sweeper re-drive them from Postgres; see "Redis loss is survivable" in `deploy.md`.

## Moving to paid hosting (before the closed beta)

The images and settings stay the same. Move the API and Postgres to paid, always-on instances with point-in-time recovery (DigitalOcean Frankfurt measured fastest from Lagos; see 0008), switch storage to R2, delete the keep-awake Worker, and follow `deploy.md`.
