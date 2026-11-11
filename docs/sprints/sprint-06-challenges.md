# Sprint 6 — Challenge Lifecycle & Match State Machine

- Milestone: **M2**
- Stage: 1
- Depends on: Sprints 3–5 (identity, profiles, board)

## Goal

The heart of the product: create/accept/decline/cancel a challenge, spawn a match, and guarantee the rules from the docs — atomic acceptance (two players cannot both claim), deadlines that fire even when Redis dies, enforced state transitions, idempotent mutations. PRD acceptance criteria for challenges + timers live here.

## Features

### F6.1 Match state machine (domain + schema enforcement)

States per Design §7/UX shell listing: Open, Accepted, In progress, Awaiting result, Awaiting confirmation, Confirmed, Disputed, Resolved + side exits Cancelled, Expired, Forfeited, Voided

- Transitions enforced in the domain layer **and** checked in the DB (TA requirement) — legal-transition table/enum guard triggers (via drizzle custom SQL migration)
- Match carries an optimistic-concurrency version; all mutating endpoints accept idempotency keys (TA)
- Events: emit domain events via transactional outbox for every transition (outbox consumed by notifications in Sprint 11)

### F6.2 Challenge create (open + direct)

- Open challenge: game, format, rules text, time window (agreed start + its validation), acceptance window = 48h then expiry (PRD rule)
- Direct challenge: same + target player; creates notification hook event
- Stakes: stake amount + currency + fee-schedule version stored on every challenge, **zero** in Stage 1 (PRD foundations)
- Validation: format belongs to game; start time window check; rate limits on creation per user; blocked for sanctioned users
- Idempotency safe retries; rules max length; challenge gets a canonical detail route

### F6.3 Accept (atomic) / decline / cancel / expiry

- Accept via single conditional `UPDATE … WHERE status='open' AND version=current` (TA "atomic conditional update") — loser of the race gets 409, plus concurrency acceptance test per PRD: "two players cannot both accept"
- Decline: notification event; challenge back to Open (if open-type) or closed (if direct)
- Own-cancel: allowed pre-acceptance freely; late cancellation **after acceptance** costs reputation (mechanism noted; reputation engine in Sprint 12 — event persists to pending reputation ledger for backfill)
- Expiry deadline enforcement: BullMQ `delay` job at challenge.deadline + a periodic DB sweeper (BullMQ repeatable job, e.g. every 60s) re-scanning overdue rows per TA rule: "losing Redis never loses a deadline" — acceptance thresholds: fire within 1 minute incl. after Redis restart (PRD acceptance criterion)
- On accept, send-to-match: create Match + MatchSide + MatchParticipants atomically, identical to workflow next steps

### F6.4 Challenge UI wiring (from Sprint 2 prototype)

- Create sheet: game/format pre-selected from switcher, rules, time window picker, stake slot (locked Free display w/ explanation), summary confirm (Design §8)
- Board card actions: Accept/Decline/Cancel per state; pending state; follows Design card spec + confirmation dialog "Cancel challenge" explicit verb (not OK)
- Challenge detail: full rules + poster card + report capability (report UI routed to generic Report entity — enforcement in Sprint 12)
- Direct challenges: notified target accepts via inbox (Sprint 11 events) or the board "Inbox" needs-action link

### F6.5 In-progress lifecycle publishing

- `In progress` transitions after agreed start (or immediate on both-ready if no start required) — keep simple: Accepted → In progress is time-driven or experience-driven depending on game config; document the per-game decision with config flags `[confirm]` (e.g. eFootball: accepted = scheduled start; CODM: accepted = live-room code exchange)
- Deadlines per stage stored as row values (not cron-computed) — sweeper compares row timestamps (TA rule)
- Room-code exchange field(s) for custom-room games (PUBG) — text field visible to participants only, displayed prominent in match room (feeds Sprint 7)

## Design compliance

- Confirmations use explicit verb buttons (Design §8 sheets)
- State chips per §7 (neutral/Open, accent dot for Live, accent fill when I must act)
- Timeline states consume the shared status model (single source of truth per doc §7)

## Files and references

| Ref                                                                                                                                      | What                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Rules (proposed defaults)", §"Stage 1 acceptance criteria", §"Stage 1 user stories → Challenges" | 48h window, late cancel, expiry, concurrency criterion                                 |
| `docs/Technical Architecture RAISE.md` §Match state machine, §Background jobs                                                            | Domain/DB enforcement, atomic accept, sweeper principle                                |
| `docs/Design System RAISE (Stage 1).md` §7 Status model, §8 sheets/cards                                                                 | UI specs                                                                               |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flows 2–3                                                                                         | Create + accept screens                                                                |
| `packages/types`                                                                                                                         | Match state union source of truth                                                      |
| `packages/schemas`                                                                                                                       | Create/accept DTO schemas                                                              |
| BullMQ research note                                                                                                                     | `queue.add(..., { delay })` + repeatable sweeper via `upsertJobScheduler` (idempotent) |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                                                     |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Skill | `supabase-postgres-best-practices`             | Transition-guard triggers, unique/conditional indexes, row locking on accept, deadline index on status+deadlines            |
| Skill | `spec`                                         | State-machine contract table before code (transitions, guards, side effects)                                                |
| Skill | `differential-review` + `cso`                  | Accept-race + idempotency + rate-limit review                                                                               |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                                                               |
| Skill | `webapp-testing`                               | Two-browser accept race live e2e                                                                                            |
| Skill | `investigate`                                  | Any sweeper double-fire or missed deadline, root-caused                                                                     |
| Agent | `explore`                                      | Find outbox consumer stub from Sprint 0 + event types                                                                       |
| MCP   | `context7`                                     | BullMQ delayed/repeatable jobs (upsertJobScheduler), drizzle transactional patterns, Nest interceptors for idempotency keys |
| MCP   | `github`                                       | `[confirm]` per-game in-progress flag decision issues; PRs                                                                  |
| Tools | `todowrite` F6.1–F6.5                          | Tracking                                                                                                                    |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation; docker Compose for Redis-kill tests                                                                         |

## Testing

- Unit: full transition table (legal + illegal); version-conflict simulation; idempotency-key re-POST only creates one resource; expiry times computed
- Integration: atomic accept under 100 parallel requests → exactly 1 winner; sweeper expires overdue rows; outbox row emitted per transition; row-level transition guard blocks raw SQL misuse
- Chaos test: kill Redis container mid-delay → sweeper still fires deadlines within threshold (PRD criterion, daily acceptance proof)
- E2E: player A creates open → player B accepts (two-browser race incl.) → match room exists ≤ 2s (PRD criterion)
- Load: 200 concurrent accept attempts on 1 challenge — stable, no duplicate participants

## Audit

- `differential-review` on accept/create paths (race conditions, double-charge future-proofing — audit must note zero-stake yet idempotent for Stage 2)
- Outbox-event schema review: consumers can dedupe (event id + subject id + type)
- Cancel behavior vs sanctioned players; rules-content moderation hooks (length, forbidden words reuse from messaging filter — note)

## Checklist

- [ ] F6.1 State machine domain-enforced + DB-guarded; version + optimistic locks; idempotency keys on all mutating routes; outbox events emitted
- [ ] F6.2 Open + direct challenge create with validation, rate limits, zero-stake fields + fee-schedule version persisted
- [ ] F6.3 Atomic accept proven (concurrency test, 1 winner); decline/cancel/appropriate reputation-debt record; expiry via BullMQ delay + sweeper (Redis-kill chaos test green)
- [ ] F6.4 UI wired: sheet + board actions + detail + confirmation dialog + pendant states
- [ ] F6.5 In-progress model + room-code field per game config `[confirm]` decision recorded
- [ ] Acceptance-criterion proof pack: both-claims race, ≤2s room, ≤1min deadlines incl. after Redis restart — archived test output
- [ ] Testing green; audit clean
- [ ] `ship` close with PR + CHANGELOG
