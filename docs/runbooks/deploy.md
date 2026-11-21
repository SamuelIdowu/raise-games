# Runbook: deploy

Owner: on-call engineer. Host-agnostic: the hosting provider and region are still an owner decision (Sprint 0 F0.10). This page lists what any container host must provide and the order of a release. Fill in the host-specific commands once it is chosen.

## What runs

| Component   | Image                                        | Port          | Health check  | Instances                                                                                                    |
| ----------- | -------------------------------------------- | ------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| API         | `apps/api/Dockerfile`                        | `PORT` (3001) | `GET /health` | 2 or more; WebSocket fan-out goes through Redis, so no sticky sessions are needed (WebSocket-only transport) |
| Web         | `apps/web/Dockerfile`                        | 3000          | `GET /`       | 1 or more                                                                                                    |
| Release job | API image, command `node dist/db/migrate.js` | none          | exit code     | once per deploy                                                                                              |

Managed services: Postgres 17 with point-in-time recovery, Redis 7, a private R2 bucket. See `backup-restore.md` for recovery.

Both images run as the unprivileged `node` user and declare a Docker `HEALTHCHECK`. Point the host's own health check at the same paths.

## Building images

The API image is environment-independent. The web image is **not**: `NEXT_PUBLIC_*` values are compiled into the bundle and the Content Security Policy, so build one web image per environment.

```bash
docker build -f apps/api/Dockerfile -t raise/api:$SHA .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.<domain> \
  --build-arg NEXT_PUBLIC_STORAGE_ORIGIN=https://<account>.r2.cloudflarestorage.com \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key> \
  --build-arg NEXT_PUBLIC_POSTHOG_KEY=<key> \
  --build-arg NEXT_PUBLIC_RELEASE_SHA=$SHA \
  -t raise/web:$SHA-<env> .
```

CI builds both images on every PR and smoke-runs the API image (it must load, refuse to boot without settings, and not run as root).

## Release order

1. **Build** both images from the merged commit on `main`.
2. **Migrate**: run the release job (`node dist/db/migrate.js`) with only `DATABASE_URL`. It takes an advisory lock, so an accidental second run waits instead of racing. Migrations are expand-then-contract, so the running version keeps working against the new schema.
3. **Roll out the API**, then the web. Wait for health checks before moving traffic.
4. **Smoke**: `/health` behind Cloudflare; a staff account signs in; `/docs` returns 404 in production.
5. **Rollback**: redeploy the previous image tags. Do not roll migrations back; the next release contracts them if needed.

## API environment

Staging and production refuse to boot when a required setting is missing, and list every missing one in the error.

| Setting                                                                                          | Required outside dev/test                | Notes                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                       | yes                                      | `staging` or `production`                                                                                                                                                                                                              |
| `DATABASE_URL`, `REDIS_URL`                                                                      | yes                                      |                                                                                                                                                                                                                                        |
| `JWT_ACCESS_SECRET`                                                                              | yes                                      | 32+ characters, from the secrets manager                                                                                                                                                                                               |
| `MFA_ENCRYPTION_KEY`                                                                             | yes                                      | 32-byte base64; encrypts staff TOTP secrets                                                                                                                                                                                            |
| `WEB_ORIGIN`, `APP_URL`                                                                          | yes                                      | production: https and not localhost; `WEB_ORIGIN` may be a comma list                                                                                                                                                                  |
| `TRUST_PROXY`                                                                                    | set it                                   | number of proxies in front of the API: 1 for a host load balancer, 2 for Cloudflare plus a load balancer. Wrong values break per-IP rate limits (too low: every player shares the proxy's limit; too high: clients can forge their IP) |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`                                                   | yes (not `mock`)                         | Termii on the DND route (decision 0001). `SMS_ALLOWLIST` restricts staging to test phones; leave it empty in production                                                                                                                |
| `OTP_MOCK_ENABLED`                                                                               | must be `false`                          | refused at boot otherwise                                                                                                                                                                                                              |
| `TURNSTILE_SECRET_KEY`                                                                           | yes                                      | signup bot check                                                                                                                                                                                                                       |
| `R2_ACCOUNT_ID` (or `STORAGE_ENDPOINT`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | yes                                      | private bucket                                                                                                                                                                                                                         |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                   | optional until the email vendor decision | unset: email goes to a logging mock                                                                                                                                                                                                    |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                         | optional                                 | unset: web push is skipped                                                                                                                                                                                                             |
| `MOCK_PROVIDER_WEBHOOK_SECRET`                                                                   | must be unset in production              | refused at boot                                                                                                                                                                                                                        |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `RELEASE_SHA`                                                | recommended                              | error reporting, PII scrubbed                                                                                                                                                                                                          |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`                                               | optional                                 | tracing; the image already preloads `instrument.js`                                                                                                                                                                                    |
| `POSTHOG_KEY`, `POSTHOG_HOST`                                                                    | recommended                              | success-metric events                                                                                                                                                                                                                  |
| `ALERT_WEBHOOK_URL`                                                                              | yes for production                       | where ops alerts go (stuck matches, notification failures, outbox lag, dispute backlog, ledger imbalance and reconciliation)                                                                                                           |
| `WS_CONNECT_LIMIT_PER_MIN`                                                                       | optional                                 | default 60 per IP; raise for load-test generators only                                                                                                                                                                                 |
| `OPS_JOBS_DISABLED`, `LEDGER_JOBS_DISABLED`                                                      | leave unset                              | tests only                                                                                                                                                                                                                             |

## Process behaviour the host must handle

- **Unhandled promise rejections crash the process on purpose** (`main.ts`). A half-broken API that keeps serving is worse than a fast restart. The host must restart crashed containers automatically, and Sentry records the error when `SENTRY_DSN` is set (otherwise only the logs have it). A crash loop shows up as failing health checks; check Sentry and the last log lines.
- **Redis loss is survivable**: rate limits fall back to in-process limits, job schedulers re-register at boot, the outbox relay re-drives undelivered events from Postgres, and the expiry sweeper catches missed deadlines. Restore Redis, then confirm the outbox-lag alert resolves.
- **Graceful shutdown**: the API closes on SIGTERM (Nest shutdown hooks). Give containers at least 10 seconds to stop.

## Never in production

- `db:seed:demo` (demo ladders) and `scripts/load-seed.ts` (load players): both refuse to run unless explicitly allowed, and neither belongs in production data.
- The mock OTP, mock SMS and mock wallet webhook settings: the API refuses to boot with them.
