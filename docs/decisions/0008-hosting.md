# 0008 — Hosting provider and region

- Status: **Pending owner decision.** This record holds the requirements and the measurement method; fill in the results and the choice.
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

_Pending: paste the probe output here, one table per network, with the date, operator and connection type._

## Decision

_Pending._ Record: provider, region, why (latency, managed Postgres with PITR, cost at beta scale of about $150–400 a month per the PRD), and what was ruled out.

## After deciding

1. Provision staging, then production (audit B11), using the settings list in `docs/runbooks/deploy.md`.
2. Add the deploy step to CI (audit B12): build both images on `main`, run the release job, roll out.
3. Run the M0 exit walkthrough (audit B12a) and the Sprint 15 staging runs (audit B12b).
