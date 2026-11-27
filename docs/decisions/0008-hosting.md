# 0008 — Hosting provider and region

- Status: **Staging decided (2026-11-27): free hosting, $0. Production and closed-beta hosting still pending** (re-decide before the beta, after the evening-peak probe below).
- Closes: Sprint 0 F0.10 (`[owner decision]`), audit B10; unblocks B11, B12, B12a, B12b, B19, B23 and B24 (`docs/sprints/audit-deployability-2026-11-20.md`)
- Inputs: TA §Infrastructure ("Pick region after measuring latency from Lagos"), PRD acceptance criteria (p95 API under 500 ms at 500 users; first load under 3 s on throttled 3G), `docs/runbooks/deploy.md`

## What the host must provide

From the code as built (`docs/runbooks/deploy.md`):

| Need                                                                              | Why                                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Containers from our two Dockerfiles, 2+ API instances, automatic restart on crash | The API restarts on unhandled rejections by design; WebSocket fan-out is via Redis, so no sticky sessions |
| WebSocket support through the load balancer                                       | Live match room, chat and board (websocket-only transport)                                                |
| A one-off release job before rollout                                              | `node dist/db/migrate.js`                                                                                 |
| Managed Postgres 17 with point-in-time recovery                                   | TA §Backups, one-day recovery target                                                                      |
| Managed Redis 7                                                                   | Queues, rate limits, socket fan-out                                                                       |
| Secrets manager                                                                   | JWT, MFA key, SMS, Turnstile, R2                                                                          |
| Health checks on `/health` (API) and `/` (web)                                    | Rollouts and restarts                                                                                     |
| Region close to Lagos                                                             | p95 latency (below); Cloudflare sits in front regardless                                                  |
| Billing that works from Nigeria                                                   | Card or invoice acceptance                                                                                |

Cloudflare (DNS, WAF, Turnstile) and R2 storage are fixed choices and independent of the host.

## How to measure

Run from Lagos, on the networks players use (at least one mobile operator and one fixed line), during peak evening hours (19:00–23:00 WAT):

```bash
ROUNDS=50 node infra/latency-probe.mjs
```

It times fresh HTTPS requests (DNS, TCP, TLS, first byte) to public endpoints inside each candidate region and prints the table below. Run it on each network and paste each table.

## Results

### 2026-11-27, first signal (not the full method)

8 rounds per region, 14:31 UTC (afternoon in Lagos, not the evening peak), one machine, network not recorded. Each figure is a fresh connection including DNS and TLS, so compare regions with each other; a warm API call is much faster.

| Provider     | Region                       | p50 (ms) | p95 (ms) | Failed |
| ------------ | ---------------------------- | -------: | -------: | -----: |
| DigitalOcean | fra1 (Frankfurt)             |      527 |      717 |    0/8 |
| DigitalOcean | ams3 (Amsterdam)             |      519 |      744 |    0/8 |
| AWS          | eu-west-2 (London)           |      608 |    1,214 |    0/8 |
| Google Cloud | europe-west1 (Belgium)       |    1,016 |    1,982 |    0/8 |
| DigitalOcean | lon1 (London)                |      789 |    1,998 |    0/8 |
| AWS          | eu-west-1 (Ireland)          |    1,314 |    2,136 |    0/8 |
| Google Cloud | europe-west2 (London)        |      937 |    2,171 |    0/8 |
| AWS          | eu-south-2 (Spain)           |      690 |    2,208 |    0/8 |
| AWS          | af-south-1 (Cape Town)       |    1,528 |    2,485 |    0/8 |
| Google Cloud | africa-south1 (Johannesburg) |    2,323 |    3,203 |    0/8 |
| AWS          | eu-central-1 (Frankfurt)     |      758 |    3,491 |    0/8 |

Reading: the African regions are the slowest from Lagos (traffic reaches Europe first), and Frankfurt/Amsterdam lead. Still to do before the production choice: `ROUNDS=50` at 19:00–23:00 WAT on one mobile and one fixed network.

## Decision

### Staging: free hosting, $0 (owner, 2026-11-27)

Web on Render free, API on Koyeb free, Redis on Render free Key Value, Postgres on Neon free, file storage on Supabase free, all in Frankfurt; a Cloudflare cron Worker keeps the sleeping services awake. Setup and limits: `docs/runbooks/staging-free.md`.

**Postgres on Neon, with a known limit (owner's choice, 2026-11-27).** Neon's free plan has 100 compute-hours a month, and the API queries Postgres every 30 s (expiry sweeper), so the compute never suspends and the database stops around day 16 until the monthly reset. Accepted for staging; the runbook lists the workarounds. Supabase's free Postgres (no compute-hour cap) is the fallback.

Ruled out for free staging, against current free-tier limits and the code:

- **Aiven free:** powers off after inactivity.
- **Vercel Hobby:** non-commercial use only.
- **Cloudflare Workers for the API:** not Node; Socket.IO, BullMQ, argon2 and sharp would all need replacing (a rewrite). For the web, the free plan's 3 MiB Worker size and 10 ms CPU per request are too small for server-rendered Next.js.
- **Render alone:** 750 free hours a month cover one always-on service, not both web and API.

Free staging is not fit for players: one API instance, no point-in-time recovery, Redis without persistence, 0.1 vCPU. It cannot run the Sprint 15 load and latency checks (B12b).

### Production and closed beta: pending

Requirements are unchanged (top of this record). Leading candidate from the first probe: DigitalOcean Frankfurt or Amsterdam (App Platform, managed Postgres with PITR, managed Redis), roughly $100–150 a month at beta scale. Confirm with the evening-peak probe and that the provider bills Nigerian cards, then record it here.

## After deciding

1. Provision staging, then production (audit B11), using the settings list in `docs/runbooks/deploy.md`.
2. Add the deploy step to CI (audit B12): build both images on `main`, run the release job, roll out.
3. Run the M0 exit walkthrough (audit B12a) and the Sprint 15 staging runs (audit B12b).
