# Technical Architecture: RAISE

Revised October 30, 2026 to align with RAISE PRD v2 and the staged rollout.

## Summary

A TypeScript modular monolith with hexagonal boundaries at the seams that will change. One deployable API serves the Next.js web app now and a React Native app later. Postgres is the source of truth. Redis and a worker handle queues, timers, and fan-out. The ledger, payment-provider interface, and identity tiers are built in Stage 1 on a mock adapter, so Stage 2 real-money payments arrive by swapping an adapter and enabling a per-jurisdiction flag. No real money moves in Stage 1.

## Stack

- Web: Next.js (presentation only), PWA shell, Tailwind.
- API: NestJS, REST with OpenAPI and a generated typed client. No Python, Go, or Rust at MVP: the workload is I/O-bound CRUD, notifications, and small calculations. Python enters later as a separate OCR or anti-cheat worker behind a queue.
- Data: Postgres (managed, point-in-time recovery), Redis (BullMQ queues, rate limits, pub/sub, caching).
- Storage: S3-compatible private bucket (Cloudflare R2) for proof screenshots and attachments.
- Edge and hosting: Cloudflare (DNS, WAF, Turnstile), containers on a managed host. Pick region after measuring latency from Lagos.
- Monorepo: pnpm and Turborepo with apps/web, apps/api, and shared packages for types, Zod schemas, API client, and game configs.

## Architecture style

Modular monolith. Modules: identity, profiles, games, challenges and matches, verification and disputes, ratings, wallet, messaging, notifications, moderation, admin. Rules:

- Each module owns its tables. No cross-module table access.
- Modules communicate through interfaces and domain events using the transactional outbox pattern. Events are at-least-once and consumers dedupe.
- Ports and adapters only where change is expected: payment provider (mock adapter now), notification channels, file storage, SMS/OTP, and per-game rule plugins.
- Plain CRUD modules (profiles, admin lists) stay simple. No ceremony.

## Data model (high level)

- Identity: User (with jurisdiction state, KYC status, age-verification status, identity tier), Session, Device (push tokens), Role, Sanction, Report, AuditLog, ConsentRecord (terms versions), LimitSetting (responsible-gaming limits, self-exclusion).
- Games: Game, GameFormat (JSONB result schema, validated in code), GameProfile (user, game, in-game ID, rating, stats).
- Play: Challenge (stake amount, currency, fee-schedule version; stake is zero in Stage 1), Match (with a nullable competition id for Stage 3), MatchSide, MatchParticipant, ResultSubmission (append-only), Dispute, Ruling.
- Ratings: RatingEvent (append-only log), current rating materialized and recomputable.
- Messaging: Conversation (scoped to a match or a DM pair), Message, Block, Mute.
- Notifications: Notification, NotificationPreference, DeliveryAttempt.
- Wallet: LedgerAccount, LedgerEntry (immutable, double-entry), Hold, FeeRule (versioned). Payout, withdrawal, and refund records are designed in Stage 1 and built in Stage 2.
- Infra: Upload (with image hash), OutboxEvent, FeatureFlag (per stage and per jurisdiction).

Conventions: UUIDv7 ids, timestamptz everywhere, money in minor units with a currency code, soft deletes only where history matters.

## Match state machine

Open, Accepted, In progress, Awaiting result, Awaiting confirmation, then Confirmed, or Disputed followed by Resolved. Side exits: Cancelled, Expired, Forfeited, Voided.

- Transitions are enforced in the domain layer and backed by a database check.
- Accepting a challenge is an atomic conditional update, so two players cannot both claim it.
- Matches carry a version for optimistic concurrency. All mutating endpoints take idempotency keys.
- Deadlines are stored on the row. Delayed jobs enforce them, and a periodic sweeper re-checks the database so losing Redis never loses a deadline.

## Ledger and mock provider

- Double-entry, immutable entries, idempotency keys, row locking on balance changes, holds modeled as entries.
- Stage 1: the ledger runs on a mock provider with no player-facing wallet and no deposits or withdrawals. Every challenge stores a zero stake, currency, and fee-schedule version. A play-credit rehearsal is an open product decision.
- Stage 2 flow: hold the stake on acceptance, release to the winner minus the platform fee on confirmation, refund on cancel or void. Provider webhooks are signature-verified, idempotent, and reconciled daily.
- Withdrawals, refunds, and payouts get explicit state machines with review holds and limits, designed in Stage 1 and built in Stage 2.
- Custody (provider-held funds versus platform-held balances) comes from the legal track and shapes the adapter. Working assumption: a licensed provider holds funds.
- A WalletProvider port, with a feature flag per stage and jurisdiction gating any real provider. A nightly check confirms all ledger accounts net to zero.

## Real-time, notifications, and messaging

- Transport: WebSockets through a NestJS gateway, with Redis pub/sub for multiple instances. One connection carries chat, live match state, and in-app notifications. Polling fallback when the socket drops.
- Notifications: domain events flow through the outbox to a notification service that writes a row and fans out by user preference to in-app, web push, and email. WhatsApp and SMS come later behind the same channel interface. Dedupe, retries, batching, and quiet hours. iOS web push needs an installed PWA, so email is the reliable fallback.
- Messaging: conversations are scoped. A match chat is created on acceptance and locked 72 hours after completion. DMs only between players who completed a match together or accepted a friend request. DMs are not on the owner's Stage 1 list and are pending confirmation. Messages live in Postgres, partitioned by time. Block, mute, report, rate limits, and a keyword filter. Admins can read match chats as dispute evidence, and the terms must say so.

## Background jobs

BullMQ workers for expiry and forfeit timers, notification delivery, rating recomputation, image hashing, ledger checks, and the sweeper. All jobs are idempotent.

## Security

- Auth: phone OTP, short-lived JWT access tokens, rotating refresh tokens, device sessions. Token-based so mobile reuses it. MFA for admins. argon2id for any password-like secrets.
- Authorization: roles (player, moderator, admin) plus ownership checks in the domain layer. Every admin action is audited.
- Abuse: rate limiting, Turnstile on signup, duplicate-account signals (phone, device, IP), reputation scoring, and collusion signals (repeat pairings, shared device, win-trading) collected from day one.
- Uploads: presigned URLs, type and size checks, EXIF stripping, private bucket with signed reads, and image hashing to catch the same screenshot reused across matches.
- Baseline: Zod validation at the edge, CSP and CSRF protection, secrets manager, dependency scanning, minimal PII in logs.

## Integrations and vendors

SMS/OTP (Termii is Nigerian-built, or Twilio), email (Resend or SES), web push, R2, Sentry, PostHog, Cloudflare. Each sits behind an adapter interface.

## Infrastructure and delivery

- Environments: local Docker Compose (Postgres, Redis), staging, production.
- CI with preview deploys, expand-and-contract migrations, seed scripts for demo ladders.
- Observability: structured logs, OpenTelemetry tracing, Sentry, PostHog tied to the success metrics. Alerts on stuck matches, failed notification delivery, and ledger imbalance.
- Tests where they matter most: state machine, ledger invariants, rating math, and a Playwright path from challenge to verified result.
- Backups: point-in-time recovery, one-day recovery target.

## Stage 2 readiness

Built or designed in Stage 1 so real money does not force a rebuild.

- Jurisdiction: each user stores a state, and flags enable real-money features per jurisdiction, because gaming rules are state-level.
- Identity tiers and a KYC provider port, with stake limits by tier. New accounts start with low caps.
- Versioned fee rules and stake bands as data, not code.
- Fraud signals collected from day one: device, IP, repeat pairings, screenshot hashes.
- Responsible-gaming fields (limits, self-exclusion) and consent records for each terms version.
- Tournament readiness: matches carry a nullable competition id, so brackets and prize distribution plug in at Stage 3 without a schema rewrite.

## Risks to derisk early

- Verification fraud: fake or reused screenshots, with a much larger incentive once stakes are real. Build hashing and the dispute workflow first and test with adversarial users in beta.
- Latency and bandwidth: measure Lagos latency to candidate regions. Test on a low-end Android over throttled 3G. Compress images client-side and use resumable uploads.
- Ledger correctness: property-test the invariants and reconcile against provider statements before anything touches real money.
- WebSocket scaling: load-test the gateway with Redis pub/sub at several thousand concurrent connections.
- Timer reliability: kill Redis in staging and confirm deadlines still fire via the sweeper.
- Stake-first matching abuse: strong players can farm novices. Rating-gap checks, stake caps by tier, and repeat-pairing limits need to be in the data model from Stage 1.

## Pending decisions

- Hosting provider and region.
- OTP and email vendors.
- Payment provider, KYC provider, and custody model (legal track).
- Revenue model and fee rules (owner).
- Data retention periods for screenshots and chat, with the legal track.
- Elo parameters and stake-tier limits.
