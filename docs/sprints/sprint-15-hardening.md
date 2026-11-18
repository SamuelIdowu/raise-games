# Sprint 15 — Hardening (Performance, Load, Security, Observability, Restore)

- Milestone: **M4** (weeks 11–14, first half)
- Stage: 1
- Depends on: Sprints 7–13 (everything being hardened); Sprint 0 F0.11 (staging) for the staging-only items marked **[staging]**
- Exit (Delivery Plan M4, with Sprint 16): beta metrics on track, **no open severity-1 issues**

## Goal

Prove the PRD acceptance numbers before the closed beta, and make production watchable:

- **Performance (PRD):** p95 API latency under 500 ms at 500 concurrent users; first load under 3 seconds on throttled 3G; signup with a game ID in under 90 seconds median on a low-end Android.
- **Realtime (TA):** WebSocket gateway load-tested with Redis pub/sub at several thousand concurrent connections.
- **Operations (PRD):** alerts fire on stuck matches and failed notifications (TA adds ledger imbalance), and a backup restore has been tested (TA: point-in-time recovery, one-day recovery target).
- **Security:** review pass with no open critical findings.

Items that need real infrastructure are marked **[staging]**. Everything else is built and proven in CI against the local stack, so staging only has to re-run it.

## Features

### F15.1 Performance budgets (web)

- Lighthouse CI on the production build (`next build && next start`) for `/`, `/onboarding/phone`, `/play` and a match room, mobile form factor, throttled to "Regular 3G" (300 ms RTT, 700 kbps down, 4× CPU slowdown)
- Budgets that fail CI: first contentful paint and largest contentful paint under 3 s, total blocking time under 600 ms, first-load JS per route under 200 KB gzipped
- Bundle report per route kept as a CI artifact, so a regression shows which import caused it
- **[staging]** Real low-end Android (2 GB RAM class) on throttled 3G: signup + game ID timed, 10 runs, median under 90 s

### F15.2 API load test

- k6 script covering the hot paths: board list, match room GET, chat send, result submit, notification unread count, with real auth tokens from seeded players
- Thresholds encode the PRD: `http_req_duration p(95) < 500` at 500 virtual users; error rate under 1%
- CI runs a smoke profile (50 VUs, 1 minute) against the local stack so the script stays working; **[staging]** full 500-VU run with results archived

### F15.3 WebSocket gateway load test

- Node load script (socket.io-client): N clients across two API instances, each subscribed to its user room and a shared match room; measures connect time, auth failures and broadcast fan-out latency through the Redis adapter
- Targets: 3,000 concurrent sockets; p95 fan-out under 1 s; no dropped events on a reconnect storm (kill one instance, clients fail over)
- CI runs 200 sockets as a smoke test; **[staging]** full run

### F15.4 Observability

- Structured logs already exist (pino). Add request ids to every log line and response header
- OpenTelemetry tracing for HTTP, Postgres and Redis, exported over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (off otherwise)
- Sentry for API and web errors when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set; PII scrubbed (phone, email, tokens)
- PostHog server-side events tied to the PRD success metrics (signup completed, challenge accepted, result confirmed, dispute opened), when `POSTHOG_KEY` is set
- All three behind adapters (TA §Third-party): no vendor SDK is required to run or test locally

### F15.5 Alerts

- An ops check job (BullMQ, every 5 minutes) evaluates alert rules and emits a structured `alert` log line plus an optional webhook (`ALERT_WEBHOOK_URL`, e.g. Slack): stuck matches (no state change past their deadline), notification delivery failure rate over 5% in 15 minutes, outbox relay lag over 2 minutes, dispute backlog over SLA, ledger imbalance (from Sprint 13's nightly check)
- Each rule has a threshold constant, a test that fires it and a test that it stays quiet
- De-duplication: one alert per rule per hour while it stays firing, plus a "resolved" line

### F15.6 Security review

- `cso` pass over everything shipped since the Sprints 1–11 audit (Sprints 12–14), plus re-check of open audit findings
- Fix audit #8: rate limits currently fail open when Redis is down; fall back to an in-process limiter so OTP verify and webhooks stay bounded
- Security headers on the web app (CSP with nonces, `frame-ancestors 'none'`, HSTS, referrer policy); API already uses helmet, so verify its CSP for the docs route only
- `pnpm audit --prod` and a secret scan (gitleaks) in CI
- Owner-held items stay visible, never silently closed (consent gate, audit #2)

### F15.7 Backup and restore

- Restore drill script: dump the database, restore into a fresh database, run the integrity checks (row counts per table, ledger `checkInvariants`, append-only triggers present, migrations journal matches) and report time taken
- Runbook in `docs/` for point-in-time recovery on the managed host, the one-day recovery target and who does what
- CI runs the drill against the test database on every main-branch build; **[staging]** a real PITR restore on the managed host, timed and recorded

## Design compliance

- No new player-facing screens. Performance work may change loading states, which must keep the Design System's skeleton and copy rules.

## Files and references

| Ref                                                                                                  | What                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Acceptance criteria" (performance, operations)               | The numbers this sprint proves |
| `docs/Technical Architecture RAISE.md` §Observability, §Backups, §Risks (latency, WebSocket scaling) | Targets and tooling            |
| `docs/Delivery Plan RAISE.md` §M4                                                                    | Exit criteria                  |
| `docs/sprints/audit-sprints-01-11.md`                                                                | Open findings to re-check      |
| `docs/decisions/0006-ledger-and-stage2-money-flows.md`                                               | Ledger alert contract          |

## Testing

- Unit: each alert rule fires and stays quiet at its boundary; in-process rate-limit fallback; PII scrubber
- Integration: ops check job end to end against seeded stuck matches and failed deliveries; restore drill green
- CI: Lighthouse budgets, k6 smoke, WebSocket smoke, audit and secret scan all gate the build
- **[staging]** full load, real device, PITR

## Audit

- `cso` + `differential-review` over Sprints 12–14 and this sprint's changes
- Severity-1 list empty, or each item has an owner and date (M4 exit)

## Checklist

- [ ] F15.1 Lighthouse CI budgets on throttled 3G gate the build; **[staging]** real-device signup median under 90 s
- [ ] F15.2 k6 API script with PRD thresholds; CI smoke green; **[staging]** 500-VU run archived
- [ ] F15.3 WebSocket load script; CI smoke green; **[staging]** 3,000-socket run archived
- [ ] F15.4 Request ids, OTel tracing, Sentry and PostHog adapters (env-gated, PII scrubbed)
- [ ] F15.5 Alert rules (stuck matches, notification failures, outbox lag, dispute backlog, ledger imbalance) with tests and de-duplication
- [ ] F15.6 Security pass; rate-limit fallback (audit #8); web security headers; audit and secret scan in CI
- [ ] F15.7 Restore drill script + runbook; CI drill green; **[staging]** PITR restore timed
- [ ] Zero open severity-1 issues (or owner + date for each)
- [ ] `ship` close with PR + CHANGELOG
