# Delivery Plan: RAISE

Revised October 30, 2026 to align with RAISE PRD v2. Stage 1 is planned in detail. Stages 2 to 4 are outlined and gated.

## Assumptions

No team size or date has been given. This plan assumes 3 engineers (1 frontend, 2 backend), 1 designer, and part-time QA and moderation, for about 15 weeks to the public launch of Stage 1. Scale the dates if the team differs. Legal, custody, and payment approval run on a separate track and gate Stage 2, not Stage 1, because Stage 1 moves no real money. That track should start now so it is not on the critical path.

## Milestones

### M0: Foundations (weeks 1 to 2)

Monorepo, CI with preview deploys, environments, auth skeleton, base schema, design tokens.

Exit: a deployed hello-world with login on staging.

### M1: Design and prototype (weeks 1 to 4)

The Stage 1 UX flows (all except Team and Wallet) as a clickable prototype, tested with 8 to 10 real players.

Exit: the prototype passes testing on the challenge, result submission, and dispute flows, and the open UX decisions are closed.

### M2: Core loop (weeks 3 to 8)

Accounts and game profiles, game config, free challenges with a zero-stake field, match state machine, result submission and verification, disputes (basic), Elo ratings, notifications (in-app and email), match chat.

Exit: two real players complete a verified match end to end on staging.

### M3: Trust and operations (weeks 8 to 11)

Admin dashboard and dispute queue, reputation and sanctions, fraud signals and image hashing, leaderboards, and the Stage 2 foundations: ledger with holds on a mock provider, identity tiers and KYC port, jurisdiction flags, and fee-rule and stake-band tables. Restricted DMs only if the owner confirms them.

Exit: a moderator can resolve a seeded dispute inside the SLA, and the ledger invariant check passes.

### M4: Hardening and closed beta (weeks 11 to 14)

Performance on a low-end Android over throttled 3G, observability and alerts, security review, load test of the WebSocket gateway, then a closed beta of 100 to 200 players seeded through a few campuses or communities.

Exit: beta metrics are on track toward the 8-week targets, with no open severity-1 issues.

### M5: Free public launch in Nigeria (week 15)

Launch with seeded local ladders, moderators staffed, and dashboards watching stuck matches, dispute backlog, and notification delivery.

## Build sequence notes

- Leaderboards sit inside M3 because the ladder is core, not an extra.
- Payments are a mock in Stage 1. The ledger, provider interface, identity tiers, and jurisdiction flags ship now, so Stage 2 is an adapter swap plus a flag.
- The order follows the owner's roadmap: real-money challenges (Stage 2) come before tournaments (Stage 3), which reverses the earlier plan.
- Team format, wallet screens, and (pending owner) DMs are out of Stage 1, which saves about 4 engineer-weeks.

## Stages 2 to 4 (after launch)

- Stage 2, RAISE Challenges: real-money 1v1 with stakes, payments, refunds, payouts, platform fees, KYC, and responsible-gaming controls. About 30 to 42 engineer-weeks. Gate: legal sign-off on custody and states, written provider approval, ledger review, and Stage 1 dispute and fraud rates within target.
- Stage 3, RAISE Tournaments: registration, rules, brackets, standings, and prize distribution. About 16 to 30 engineer-weeks. Gate: Stage 2 payouts and disputes stable, bracket engine piloted.
- Stage 4, Expansion: teams, Lobby format, community-hosted tournaments, sponsorships, more games, push and WhatsApp notifications, seasons and badges.
- React Native apps on the same API, with timing set after Stage 2.

## Project setup checklist

- Repo: pnpm and Turborepo monorepo (apps/web, apps/api, packages for types, schemas, API client, game configs). Branch protection and required CI checks.
- Environments: local Docker Compose (Postgres, Redis), staging, production.
- Services to provision: managed Postgres with point-in-time recovery, Redis, R2 bucket, Cloudflare (DNS, WAF, Turnstile), email provider, SMS/OTP provider, Sentry, PostHog, secrets manager, domain.
- Day-one code: feature flags, audit log, admin accounts with MFA, seed scripts for demo ladders, zero-stake fields, a ledger on a mock provider, and the jurisdiction field.
- Hosting: choose the container host and region after measuring latency from Lagos to candidates.
- From the legal track: terms of service, privacy policy, community rules, and the age policy. These must exist before beta.

## Risks and mitigations

- Cold start: a thin ladder feels dead. Plan campus and community seeding before launch, with local ladders and filters.
- Verification gaming: image hashing, two-sided confirmation, reputation, and a staffed dispute queue. The incentive to cheat rises in Stage 2. Run adversarial testing in beta.
- Moderation capacity: staff moderators for the SLA before launch, not after.
- Publisher terms: confirm rules on game names and logos. Use text names until confirmed.
- Network conditions: budget for slow, metered data from M1 onward, not at the end.
- Scope creep: Team, tournaments, Lobby, and open DMs stay out until the M5 metrics are met and the Stage 2 gate is cleared.
- Stage 2 critical path: legal, custody, provider approval, and KYC lead times are unknown and could outlast Stage 1. Start that track now.
- Undefined revenue model: fees and stake limits must be decided before Stage 2 design starts.

## Pending decisions

- Team size and target launch date, which set the real schedule.
- Revenue model: fee percentage, stake limits, and fee treatment on voids (owner).
- Whether Stage 1 rehearses stakes with play credits or stays stake-free.
- Whether restricted DMs stay in Stage 1.
- Formats per game.
- Elo parameters and the proposed rule numbers in the PRD.
- Minimum age, custody model, licensing, and operating states (legal track).
- Hosting provider and region, plus OTP, email, payment, and KYC vendors.
- Retention periods for screenshots and chat.
