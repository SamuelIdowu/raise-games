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

- [ ] F14.1 Decision memo written; `messaging.dm` flag shipped default-off (even when building)
- [ ] F14.2 Eligibility scoping live (match-completed pair / friend request only); friend requests w/ notifications
- [ ] F14.3 Messages tab + conversation screens reusing F7.3 rules; rate limits + keyword flags connected to F12 queue
- [ ] F14.4 Block/mute/report all enforced + audited; admin sees handler actions
- [ ] Flag-off regression test green (tab hidden/deep links 404/no entry points)
- [ ] Testing green; cso/audits pass
- [ ] `ship` close with PR + CHANGELOG (sprint file shows outcome if deferred)
