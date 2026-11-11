# Sprint 7 — Match Room, Real-Time Gateway & Match Chat

- Milestone: **M2**
- Stage: 1
- Depends on: Sprint 6 (matches exist), Sprint 1 (components), Sprint 2 prototype F2.5

## Goal

The match room is the hub (UX Flow 4): timeline, opponent card, deadlines, chat, and a single changing primary action. Adds the WebSocket gateway (one connection: chat + live match state + in-app notifications) with Redis pub/sub and polling fallback per TA.

## Features

### F7.1 WebSocket gateway

- NestJS WS gateway (socket.io) + `RedisIoAdapter`-style adapter for multi-instance fan-out (researched pattern: extend `IoAdapter`, redis pub client + `createAdapter`)
- Auth on connect (JWT handshake); per-connection room = user id + subscribed match rooms
- Payloads: chat message, match-state change, notification — namespaced channels per message type; reconnect + polling fallback when socket drops (TA transport spec)
- Sticky sessions or websocket-only transports documented for deploying multi-instance (socket.io multi-node note)

### F7.2 Match room screen (the hub)

- Per SX UX Flow 4 + Design §8: status timeline (vertical stepper: Accepted → Play → Submit result → Confirm → Done; step states done/current/upcoming/blocked with dispute branch), compact horizontal summary on mobile
- Opponent card (avatar, username, rating, reputation, game ID chip + copy button)
- Rules panel; deadline countdown: relative time, absolute time on tap, user's timezone — ze WAT default (Design §8 timeline)
- Primary CTA swaps with match state (Accept nobody… Submit result / Confirm / Open dispute / await)
- Room code display for custom-room games when set (from F6.5; visible to participants only, hidden until Accepted)

### F7.3 Match chat

- Conversation auto-created on acceptance, participants = the two players (TA messaging module)
- Bubbles per Design §8: radius 4; own right-aligned accent-subtle; others bg-2; system messages centered caption text (text-2)
- Message states: sending, sent, failed + retry; 500-char limit; no link previews; report + block in message overflow menu (enforcement actions land Sprint 12/14; the report row written here)
- Rate limits per user; keyword filter pass (blocklist + baseline terms; overflagged terms → system flag for admin review)
- Chat locks 72h after completion (PRD rule): banner "Chat is closed"; composer removed; set for dispute-window retention

### F7.4 Admin read access (evidence-readiness for Sprint 12)

- Admin/moderator API role can read the match chat (TA "Admins can read match chats as dispute evidence, and the terms must say so")
- Terms note prepared `[legal]` — flags the ToS text amendment stub

### F7.5 Postgres message persistence + partition path

- `Message` table partitioned by time (TA: "partitioned by time"); migration with a partitioning strategy (pg_partman optional `[confirm]`; or manual monthly partitions via custom drizzle migration)
- Conversation model supports scoping: match chat now; DM-pair shape ready (Sprint 14)

## Design compliance

- All §8 match-timeline + chat specs; aria-live respectful announcements for socket-driven updates (doc §10: "announce politely through aria-live")
- State chips grounded in the shared status model (Design §7)
- No color-only status; blocked/dispute states carry icon + text

## Files and references

| Ref                                                                                                        | What                                      |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 4, §"Notifications catalog", Flow 10 (message actions context) | Hub UX                                    |
| `docs/Design System RAISE (Stage 1).md` §8 Match timeline, Match chat, §10 aria-live                       | Component specs                           |
| `docs/Technical Architecture RAISE.md` §Real-time…, §Messaging, §Data model (Messaging/Infra)              | Gateway, scoping, retention, partitioning |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Rules", §"Stage 1 user stories → Notifications and messaging"      | 72h lock, admin read, chat user story     |
| BullMQ/socket.io research note                                                                             | Redis adapter + sticky sessions caution   |
| `sprints/sprint-02-ux-prototype.md` F2.5                                                                   | Prototype                                 |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                 |
| ----- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Skill | `emil-design-eng` / `review-animations`        | Timeline-state transitions + message-send feel (instant, honest states) |
| Skill | `frontend-design` + `design-review`            | Hub fidelity                                                            |
| Skill | `accessibility`                                | aria-live regions, focus management on state flips                      |
| Skill | `verify` / `qa` / `code-review` / `test-audit` | Standard loop                                                           |
| Skill | `webapp-testing`                               | Two-browser chat/state sync harness                                     |
| Skill | `cso`                                          | Chat abuse surface, gateway auth                                        |
| Agent | `explore`                                      | Find transition-guard hooks to reuse for state broadcast triggers       |
| Agent | `general`                                      | Scale-testing scripts (socket.io clients building connections)          |
| MCP   | `context7`                                     | socket.io v4 Nest adapter docs, pg partitioning drizzle patterns        |
| MCP   | `github`                                       | Partitioning strategy `[confirm]` issue; PRs                            |
| Tools | `todowrite` F7.1–F7.5                          | Tracking                                                                |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation; Compose Redis-control for multi-instance tests          |

## Testing

- Unit: keyword filter; 500-char truncation; 72h lock boundary computation; participant-only visibility logic (room code)
- Integration: two-instance gateway via compose: second API container connects — chat fan-out reaches both instances (proves redis adapter); message persistence retry/dedupe (idempotent client ids)
- E2E: accept challenge (from F6.3 e2e) → both players see state change without reload; chat send/receive/retry; lock after completion-time edit (fixture time travel)
- Events: notifications channel receives message event (wire into Sprint 11 later, but event emission now)
- A11y: SR announces "New message politely" with aria-live polite — check; focus not stolen on state change

## Audit

- `cso` on gateway: JWT handshake auth enforcement, room authorization (only participants subscribe), rate-limited message injection path
- Content moderation audit: keyword list source recorded, flagged messages land in admin surface (future Sprint 12 test)
- Term-consistency: admin-read being allowed confirmed reflected in the ToS stub diff `[legal]`
- Message retention: no eager deletion; retention periods open per PRD `[owner decision]` noted

## Checklist

- [ ] F7.1 Gateway with JWT auth + redis-adapter multi-instance; rooms per user + match; polling fallback on socket down
- [ ] F7.2 Match room hub per spec: timeline, opponent card, deadline countdown timezone-aware, primary CTA state swap, room-code display
- [ ] F7.3 Chat live: bubbles/states/500-char/no preview/report+block entries; rate limits + keyword flags; 72h lock banner
- [ ] F7.4 Admin/moderator chat-read endpoint exists + role-check proven; ToS amendment stub filed
- [ ] F7.5 Messages partitioned by time; conversation model supports later DM scoping
- [ ] Two-instance sync e2e green; chaos/socket-down fallback green
- [ ] Testing green; audits clean
- [ ] `ship` close with PR + CHANGELOG
