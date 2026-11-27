# Sprint 17 — Free Public Launch (Nigeria)

- Milestone: **M5** (Delivery Plan week 15)
- Stage: 1 (Founding Players)
- Depends on: Sprint 0 F0.10–F0.12 (staging and production exist), Sprint 15 `[staging]` runs, Sprint 16 beta exit (metrics on track, open S1 = 0)
- Exit criteria (Delivery Plan M5): _launch with seeded local ladders, moderators staffed, and dashboards watching stuck matches, dispute backlog, and notification delivery_

## Goal

Open RAISE to the public in Nigeria without the beta gate, with real local ladders already active, a staffed moderation rota that can hold the dispute SLA, and the alerts and dashboards that tell the team within minutes when the loop breaks. Nothing new is built for players; this sprint is readiness, operations and the switch.

## Features

### F17.1 Production readiness gate

- Every P0 item in `audit-deployability-2026-11-20.md` closed: consent gate, proxy IP, deploy settings, images, release-step migrations, legal pages, merged PR stack, green CI on `main`
- Production provisioned like staging (Sprint 0 F0.11) with its own secrets: managed Postgres with PITR, Redis, private R2 bucket, Cloudflare DNS/WAF/Turnstile, Termii DND sender ID approved, email domain with SPF/DKIM, Sentry, PostHog, VAPID keys, `ALERT_WEBHOOK_URL`, `TRUST_PROXY` set to the real hop count
- Production deploy runs `node dist/db/migrate.js` as a release step before new instances take traffic; rollback = redeploy the previous image (migrations are expand-contract)
- A production smoke after deploy: `/health` green behind Cloudflare, a staff test account signs in with real SMS, `/docs` is not served

### F17.2 Seeded local ladders (real players, not demo data)

- Launch campuses and communities chosen with the owner (from beta cohorts); each gets a campus/city value players pick on their profile so the local leaderboard filter is non-empty on day one
- Ladder activation: campus ambassadors run a launch week of open challenges per game; the board is never empty for a launch campus during peak hours (19:00–23:00 WAT)
- `db:seed:demo` stays a staging tool and is never run against production (fake opponents would mislead players)

### F17.3 Moderation staffing

- Moderator rota covering 08:00–00:00 WAT, sized from beta dispute volume so median resolution stays under 24 h (PRD)
- Each moderator has a staff account with TOTP enrolled, has run the seeded-dispute walkthrough (`e2e-app/admin.spec.ts` flow) on staging, and knows the sanction ladder (decision 0005)
- Escalation path for S1 issues (wrong results, ratings, sanctions, data exposure) to an on-call engineer

### F17.4 Launch dashboards and alerts

- Sprint 15 alert rules live in production and routed to the on-call channel: stuck matches, notification delivery failures, outbox lag, dispute backlog over SLA, ledger imbalance and reconciliation
- `/admin/metrics` (Sprint 16) with the PRD's eight-week targets; the beta cohort filter extended with a "public" cohort for post-launch signups
- Daily launch review for the first two weeks: signups, first-challenge rate, completed matches, auto-confirm rate, dispute rate and median resolution, week-1 retention

### F17.5 Opening signups

- Turn `beta.invite_only` off from `/admin/flags` (existing players are unaffected; Sprint 16 rollback note)
- Launch communications from the owner (campus channels, socials); no casino vocabulary (Design §9)
- Waitlist: invite everyone on it at launch, then let the 90-day purge run as designed

## Design compliance

- No new UI. Any launch copy (banners, emails) follows Design §9: direct, calm, no bet/wager/jackpot/odds, WAT times.

## Files and references

| Ref                                                                | What                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `docs/Delivery Plan RAISE.md` §M5, §Risks (cold start, moderation) | Exit criteria and the two launch risks this sprint addresses  |
| `docs/RAISE PRD v2 Staged Rollout.md` §Stage 1 success metrics     | The eight-week targets the launch dashboards track            |
| `docs/sprints/audit-deployability-2026-11-20.md`                   | P0/P1 items that gate F17.1                                   |
| `docs/beta/beta-runbook.md`                                        | Daily checks and rollback that carry over from the beta       |
| `docs/runbooks/backup-restore.md`                                  | Recovery target and drill, re-run on production before launch |
| `docs/decisions/0005-sanctions-and-escalation.md`                  | Ladder and auto-limits moderators apply                       |

## Testing

- Production smoke (F17.1) recorded with timestamps
- A PITR restore of production into a scratch database, timed, before signups open
- One full loop on production with two staff phones: sign up, add game IDs, challenge, accept, submit, auto-confirm, rating change visible, then the accounts deleted or marked as staff
- Alert fire drill: force one rule (e.g. a stuck test match) and confirm the on-call channel receives it and the "resolved" line follows

## Audit

- `cso` pass on production configuration: secrets only in the manager, `TRUST_PROXY` correct (check that rate-limit keys show real client IPs in logs), mock adapters refused at boot, `/docs` off
- Moderation readiness review with the owner: rota, SLA, escalation, community rules published

## Checklist

- [ ] F17.1 Production provisioned; release-step migration and rollback rehearsed; production smoke recorded
- [ ] F17.2 Launch campuses chosen `[owner]`; ambassadors briefed; boards non-empty at peak in each launch campus
- [ ] F17.3 Moderator rota staffed `[owner]`; every moderator TOTP-enrolled and walkthrough-trained; S1 escalation path written
- [ ] F17.4 Alerts routed to on-call and fire-drilled; metrics dashboard with a public cohort; daily review scheduled
- [ ] F17.5 `beta.invite_only` off; waitlist invited; launch communications sent `[owner]`
- [ ] Testing block: PITR restore timed on production; full loop on production; alert drill
- [ ] Audit block: production `cso` pass; moderation readiness signed off by the owner
- [ ] **Delivery Plan M5 exit met**; eight-week metric tracking started
