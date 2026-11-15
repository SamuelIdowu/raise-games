# Changelog

All notable changes to RAISE. Grouped by sprint (see `docs/sprints/`). Dates are merge dates.

## Unreleased

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
