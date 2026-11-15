# Changelog

All notable changes to RAISE. Grouped by sprint (see `docs/sprints/`). Dates are merge dates.

## Unreleased

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
