# Changelog

All notable changes to RAISE. Grouped by sprint (see `docs/sprints/`). Dates are merge dates.

## Unreleased

### Sprint 14 — Restricted DMs (behind the `messaging.dm` flag, off by default)

- Direct messages between players who finished a match together or accepted a friend request. Nobody else can start one.
- Friend requests from a player's profile, with notifications. Declining is silent; the same player can ask again after 30 days.
- Inbox Messages tab lists friend requests and direct messages alongside match chats; conversations reuse the match chat (500 characters, no link previews, report and block on each message).
- Block from a profile or a conversation: neither side can message or send requests, any friendship ends, and the blocked player is never told. Messages are kept as evidence. Unblock from Blocked players.
- Mute a conversation to stop its notifications. Floods are throttled per pair, including a cap on unanswered messages.
- Reported DMs reach the moderator queue with the surrounding conversation frozen at report time; keyword-filter hits now appear in the queue too.
- With the flag off, every DM screen and endpoint is a 404 and no DM button appears anywhere.

### Sprint 13 — Stage 2 foundations (no player-facing change)

- Double-entry ledger with holds: immutable entries, idempotent postings, row locking, and the database itself refusing unbalanced transactions. A nightly check confirms the books net to zero.
- Wallet provider port with a mock provider. Every challenge already runs through it with a zero stake, so Stage 2 is an adapter swap plus a flag.
- Signed, replay-safe provider webhooks.
- Stake limits by identity tier (and zero for fraud-limited or self-excluded players) as data; real-money flags per state, all off.
- Responsible-gaming limits and self-exclusion stored, behind a flag until Stage 2.
- Matches carry an optional competition id for Stage 3; withdrawal, refund and payout flows designed (decision 0006).

### Sprint 12 — Trust & operations

- Moderator console at `/admin`: dashboard (queue, SLA, stuck matches, success metrics), dispute queue with claiming and a 24-hour SLA clock, and a dispute viewer with screenshots, hash flags, chat transcript, player history, reason templates and a confirm-before-apply ruling.
- Staff accounts need two-factor (authenticator app); sensitive actions ask for a fresh code.
- Sanction ladder: warning → 7-day → 30-day suspension → permanent ban. Suspended players keep their account but cannot start new challenges; a ban signs them out everywhere. Players are told in plain language.
- Fraud signals: reused and near-duplicate screenshots, win-trading risk, shared devices, repeat pairings. Repeated late cancels, reused screenshots, upheld reports or lost disputes pause new challenges until a moderator reviews.
- Reports queue with bulk actions; player records with masked phones; feature flags, game format pausing and an audit log viewer.

### Sprint 11 — Notifications & Inbox

- Every Stage 1 notification type is live: challenges (received, accepted, declined, expiring),
  results (needs confirmation, auto-confirmed), no-shows, disputes (opened, ruled), new messages
  (batched per chat) and account actions.
- Delivered in-app instantly to every open tab, plus web push and email by preference, with
  retries, quiet hours, and critical types that always get through.
- Inbox: notifications grouped by day with unread dots and deep links; match chats in Messages;
  a preferences screen for channels, quiet hours, email and push on this device.
- Real badges: Inbox unread and Matches needing your action, kept in sync live; the needs-action
  banner now shows real matches.

### Sprint 10 — Elo ratings, leaderboards & profile stats

- Per-game Elo per the PRD: start 1000, K 32 then 20 after 20 matches, provisional until 10, and diminishing gains after 3 matches against the same opponent in 7 days (decision 0004).
- Append-only rating event log; every rating is recomputable from it (`pnpm --filter @raise/api ratings:verify`), proven by 10,000-event fuzz tests.
- Ratings update from confirmed results, forfeits and dispute rulings, including exact reversal when an appeal changes or voids a result, within the 5-second budget.
- Leaderboards per game: confirmed results only, campus and city filters, your own row pinned, top-three notch, 7-day trend.
- Profiles show rank tier, rating with the provisional marker, record, streak and a live reputation badge; the confirmed summary counts up the real rating change.

### Audit fixes — Sprints 0–8 (2026-11-16)

- Security: `fastify` raised to ^5.12.8 (auth and validation-bypass advisories) and `@fastify/static` to ^10.1.11 (path traversal); `pnpm audit --prod` is clean. The web app now sends a Content-Security-Policy and standard security headers.
- OTP delivery: Termii now sends on the DND (transactional) route instead of the promotional route, which DND-registered Nigerian numbers never received. Staging can restrict real SMS to an allow-list.
- Launch formats follow the PRD: one Duel per game (eFootball 1v1, CODM Multiplayer 1v1, PUBG Mobile 1v1 TDM). Removed formats are disabled, not deleted.
- Outbox: each consumer tracks its own deliveries, with retries and dead-lettering, so ratings and notifications will see every event.
- Match chat: staff live reads are audited; socket connects and subscribes are rate-limited; the 72h lock is atomic.
- One keyword filter for chat and result notes; notes also refuse contact handles and payment details.
- Matches list loads in 4 queries instead of about 5 per match; idempotent result retries are safe under concurrency; uploads capped per match; the screenshot-reuse check is race-free.
- Accessibility and design fixes: working profile game tabs with ARIA tab semantics; 44px labelled copy buttons; labelled leaderboard filters; no backdrop blur; no pill shapes in the match timeline.
- Decisions recorded: SMS vendor (0001), launch formats (0002), UX open decisions (0003).

### Sprint 9 — Disputes (player side)

- Open a dispute from the match room while the opponent's result waits for confirmation:
  reason, detail and a screenshot; it stops the 24-hour auto-confirm.
- Both players see the same dispute tracker, live; add up to 3 pieces of evidence each.
- Rulings show the moderator's reason and any action taken; one appeal per dispute, and the
  appeal ruling is final. Void rulings void the match.
- `dispute.ruled` event contract for ratings and future holds; chat evidence snapshot with a
  digest stored on each ruling; dispute-rate and resolution-time metrics.
- Rulings, evidence and appeals are append-only in the database.

### Sprint 8 — Result submission & verification

- Submit result, report no-show and one-tap confirm from the match room; result sheet with
  outcome, score steppers driven by the game config, screenshot proof and note.
- Screenshot uploads: client compression, presigned upload to a private bucket, server-side type
  sniffing, EXIF stripping, exact and perceptual hashing to catch reused screenshots, signed reads.
- Matching results confirm in seconds; conflicting results open a dispute with a chat system
  message; a silent opponent auto-confirms after 24 hours (BullMQ + sweeper).
- No-show claims open 20 minutes after the start, need proof of attempt, and forfeit after the
  window unless contested.
- Result submissions are append-only at the database level.
- Sprint 7 and 8 share one match view; the match room hosts the result actions.

### Sprint 7 — Match room, real-time gateway & match chat

- One WebSocket per user (socket.io, WebSocket-only) for chat, live match state and in-app
  notifications; Redis adapter fans out across API instances; HTTP polling fallback.
- Socket auth reuses the HTTP session checks; connected sockets are re-checked every minute.
- Outbox relay: events written with each change are pushed to both players live.
- Match room at `/matches/[id]`: timeline, opponent card with game ID copy, deadline countdown in
  the player's timezone, room code (share/copy/change for room-code games), rules, chat, and a
  primary action that follows the match state.
- Match chat: delivery states with retry, 500-character limit, rate limits, report and block,
  keyword flags for moderators (never blocks), locks 72 hours after the final outcome (disputes
  stay open), monthly-partitioned message storage.
- Moderators can read match chats as dispute evidence; every read is audited. ToS amendment draft.

### Sprint 6 — Challenge lifecycle & match state machine

- Match and challenge state machines: one transition table in `@raise/types`, enforced in the
  services and by database triggers (raw SQL cannot skip a step).
- Atomic accept in one transaction: concurrent accepts produce exactly one match (100-way race
  test); the winner's retry returns the same match.
- Late cancel ends the match and records reputation debt; cancel is refused once results are in.
- Challenges expire at 48h via BullMQ plus a database sweeper that keeps working with Redis down
  (chaos test); matches move to in progress at their agreed start.
- Direct challenges: "Challenges for you" on the Play tab; decline closes them.
- Play tab: working create sheet (game, format, time window, rules, free stake, summary step),
  challenge detail with rules, explicit cancel confirmation, report action, Challenge button in
  player search; accepting opens the match room.
- Generic reports (`POST /reports`) for challenges and players.
- Fixed: accept could revive a cancelled challenge; half-created matches on failure; duplicate
  idempotency keys returning 500; parallel OTP verification of a new phone returning 500.

## Sprint 5 — Discovery & challenge board (2026-11-13)

- Challenge board with cursor pagination and filters; player search; rank tiers; fairness signals.

## Sprints 3–4 — Auth, identity, games & profiles (2026-11-13)

- Phone OTP auth, JWT access + rotating refresh tokens, sessions, consent; game config and profiles.

## Sprints 0–2 — Foundations, design system, UX prototype

- Monorepo, CI, database schema, design tokens and components, clickable prototype.
