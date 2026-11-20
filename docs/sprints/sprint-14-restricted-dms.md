# Sprint 14 — Restricted DMs (gated on owner) + Messaging Enforcement

- Milestone: **M3**
- Stage: 1 (conditional)
- Depends on: Sprint 7 (conversations/message model), Sprint 12 (enforcement surfaces)
- **Hard gate**: PRD lists DMs as "not in the owner's Stage 1 list and pending confirmation" (`[owner decision]`). Do not build if the owner defers; in that case this sprint's output is a decision memo + the shipped state of the flag and the sprint ends.

## Goal

If confirmed: DMs limited to players who completed a match together or accepted a friend request, block/mute/report, and the Inbox Messages tab. Everything ships behind the stage-1 feature flag so a no can turn into a clean deferred build.

## Features

### F14.1 Decision record + flag default

- `[owner decision]` resolved in writing (PRD + issue): build now / defer / reduce scope
- Feature flag `messaging.dm` default off; all F14 work invisible when off (flag assert test)

### F14.2 Conversation scoping rules (TA)

- A DM conversation opens only via: (a) an accepted friend request, or (b) after Match completion between participants
- Friend requests: request/accept/decline; notifications catalog entry ("friend request" exists in PRD catalog); no stranger search-link (invite links are from profile only)
- Blocked pairs can't reopen; report surfaces available per Design

### F14.3 DM UX

- Inbox Messages tab builds off F11.3 stub: conversations list, unread dot, open chat reusing F7.3 message components/rules (500-char limit, report/block overflow, no link previews)
- DM entry points visible only for eligible pairs + timestamps (per UX doc: "DM entry points appear only for players you completed a match with or accepted as friends")
- Rate limits per pair; keyword filter reuse; hard-content flags land in admin (F12 queue)

### F14.4 Block / mute / report enforcement

- Block: from messages + profile only; cut surface audits list; blocked pairs can't send; appeal path for accidental blocks (info page)
- Mute: per-conversation muted state (client-friendly unread suppression)
- Report: full flow into the F12 queue with context snapshot (same as match chat reports)
- All enforcement has audit rows; block visibility rules per Design simplified (never bare "You are blocked" reveal beyond needed copy? — brief neutral copy doc-written)

## Design compliance

- UX doc Flow 10 checkout has DM screens; Design §8 messages tabs; warning copy rules (no casino-tracking words irrelevant here)
- Every entry point collapses when flag off — regression test verifies tab hidden + 404 + no exposure via deep links

## Files and references

| Ref                                                                                                                                                                     | What                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Stage 1 user stories → Notifications and messaging" (DM story flagged "pending owner confirmation"), §"Out of scope" (open DMs) | Rules + gate                      |
| `docs/Technical Architecture RAISE.md` §Messaging ("DMs only between players who completed a match together or accepted a friend request")                              | Scoping rules                     |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 10 + "Open UX decisions"                                                                                                    | Screens + gate note               |
| `docs/Design System RAISE (Stage 1).md` §8 Match chat (reuse), §9 content                                                                                               | Component + voice                 |
| `sprints/sprint-07` F7.3/F7.5, `sprint-11` F11.3                                                                                                                        | Reused conversation/message parts |
| `sprints/sprint-12` F12.4                                                                                                                                               | Enforcement queue                 |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                  |
| ----- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Skill | `spec`                                         | Conversation-eligibility matrix before code (friend graph + match history intersections) |
| Skill | `cso` + `differential-review`                  | DM abuse-surface audit (harassment vectors, report integrity, block bypass hunting)      |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                            |
| Skill | `accessibility`                                | Messages tab + conversation list semantics                                               |
| Skill | `webapp-testing`                               | DM/block/mute/report e2e                                                                 |
| Agent | `explore`                                      | Confirm conversation model shapes from F7.5 (already DM-ready)                           |
| Agent | `general`                                      | Feature-flag deep-leak check research (404 vs redirect surfaces)                         |
| MCP   | `context7`                                     | None critical (reused stack)                                                             |
| MCP   | `github`                                       | File the owner-decision gate issue; PRs; flag-toggle deployment notes                    |
| Tools | `question`                                     | The owner gate first                                                                     |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation                                                                           |

## Testing

- Unit: eligibility (match history + friendship graph composition), block/mute state transitions, flag assertion
- Integration: throttled message spam per pair; report queue receives flags; blocked pair history is still stored (legal/dispute evidence) but UI-restricted
- E2E: completed-match pair can DM; strangers can't; block interplay; flag-off hides all tab entries and deep-linked chat is 404
- Friend request lifecycle: request → accept → notify → DM eligible; decline + re-ask behavior

## Audit

- `cso`: harassment-mitigation review — rate limits, block response paths, report handling chain
- Flag-off regression audit: zero player-visible affordances when disabled
- Audit-log check: blocks/mutes/reports log with reason categories

## Checklist

- [x] F14.1 Decision memo written; `messaging.dm` flag shipped default-off (even when building)
- [x] F14.2 Eligibility scoping live (match-completed pair / friend request only); friend requests w/ notifications
- [x] F14.3 Messages tab + conversation screens reusing F7.3 rules; rate limits + keyword flags connected to F12 queue
- [x] F14.4 Block/mute/report all enforced + audited; admin sees handler actions
- [x] Flag-off regression test green (tab hidden/deep links 404/no entry points) (`e2e-app/dm.spec.ts`, CI run 44303272643 on `1648ac0`)
- [x] Testing green; cso/audits pass (unit, integration and two-browser e2e green in CI run 44303272643; self-audit above)
- [ ] `ship` close with PR + CHANGELOG (sprint file shows outcome if deferred)

## Outcome (2026-11-17)

Owner decision: **build full scope, ship dark** (decision 0007). Everything is behind `messaging.dm`, seeded **off** by migration 0015. An admin turns it on from `/admin/flags`.

## Implementation notes

- **Gate (F14.1):** `DmEnabledGuard` reads the flag on every request (no cache, so a toggle applies at once) and answers **404** while it is off. The web reads `GET /dm/status` (404 → off) through `useDmEnabled()`; `/messages/*` pages call `notFound()`. The static `FEATURE_FLAGS.restrictedDms` constant is gone.
- **Model:** no change to the Sprint 7 conversation model (`scope = 'dm'`, sorted `dm_pair_key`, `muted_at`). New tables in `apps/api/src/db/schema-social.ts` (merged into the Drizzle schema in `db/client.ts`): `friend_requests` (one live row per pair, partial unique index) and `message_report_contexts` (frozen context per report).
- **Eligibility (F14.2):** `dm.rules.ts` is the matrix: a block beats everything; then friends, or a **confirmed or resolved** match together. Forfeits, voids, cancels and expiries do not count. It is re-checked on every send.
- **Friend requests:** request from a profile only; asking back is a yes; declines are silent with a 30-day re-ask cooldown for the requester; 20 pending and 20 a day. Notifications `friend_request` and `friend_accepted`.
- **DM UX (F14.3):** `/messages/[id]` reuses `MatchChat` (now takes heading, copy and a report callback), so the 500-character rule, delivery states, report/block overflow and no link previews are identical. Live over the shared socket (`dm:message` to both user rooms), with polling fallback. The Inbox Messages tab adds friend requests, Direct messages and a Blocked players link above match chats only when the flag is on. `new_direct_message` notifications never carry message text.
- **Limits:** per-player match-chat limits, plus per pair 5 per 10 s and 60 per hour, plus a cap of **5 unanswered messages** in a row. Keyword-filter hits are stored as `chat_flags` and now appear in the moderator reports queue as "DM keyword flag" or "Chat keyword flag", resolvable like reports.
- **Enforcement (F14.4):** block from a profile, a conversation or the message menu ends friendships and pending requests, writes `user.blocked` to the audit log, and keeps every message. Unblock (`DELETE /blocks/:id`) is audited, and `GET /blocks` lists only your own blocks. Mute (`dm.muted`/`dm.unmuted`) suppresses notifications and the unread dot. Reports (`dm.reported`) reach the F12 queue with 10 messages before and 5 after. Moderators see the type, the context and "Open record" for the reported player.
- **Suspensions pause DMs:** a suspended or banned player cannot send, open or request (decision 0007).

## Audit (2026-11-17, self-review)

Harassment and abuse surface:

- **Block bypass:** checked on send, open, friend request and accept. A block also cancels pending requests, so an old request cannot be accepted after a block. A new conversation cannot be opened (403), and old ones refuse sends both ways.
- **Block reveal:** the blocked side gets the same responses as a stranger: no Message button, `friend: 'none'`, neutral "can't send" copy, and `blockedByMe: false`. Residual: a friend request to someone who blocked you returns the same 403 as a declined-request cooldown, so a determined player can tell "blocked or recently declined" apart from "never interacted". Accepted: the alternative (fake success) would contradict the profile state.
- **Probing:** conversations, messages, mute and report return **404** to non-participants. Friend-request actions return 404 to anyone outside the pair.
- **Floods:** per-pair windows plus the unanswered cap, with an in-memory fallback when Redis is down (never "no limit").
- **Report integrity:** the body snapshot and conversation context are frozen at report time. One report per reporter per message, and you cannot report your own message.
- **Data kept:** blocks never delete messages (evidence). Users deleted at the account level cascade their friend requests.
- **Flag-off:** API 404 on every `/dm/*` route; no profile, inbox or block-list affordance; deep links not found (e2e `dm.spec.ts`).

Tests: `dm.rules.test.ts` (matrix, transitions, cooldown, unanswered cap); `sprint14.integration.test.ts` (flag gate, eligibility incl. forfeit-only pairs, friend lifecycle and notifications, dedupe, unanswered cap and pair burst, keyword flag in the queue, block both ways without reveal plus history and audit, suspension pause, mute suppression, report context); e2e `dm.spec.ts` (flag-off sweep, two-browser live DM, stranger refused, block/unblock, friend request → DM).

## Audit (2026-11-20)

The "Testing green" tick rests on one green CI run. The suite was flaky: run 44712981487 on `0cbbb28` failed on a cleanup deadlock with the outbox relay (`sprint14.integration`). Every suite now retries its cleanup (`a273e10`); re-confirm with three consecutive green runs (A11, B3; see `audit-deployability-2026-11-20.md`).
