# 0007 — Restricted DMs: build now, ship dark

- Status: **Decided** (2026-11-17) by the owner: "Build full scope", behind the stage-1 flag `messaging.dm`, off by default
- Closes: PRD "Stage 1 user stories → Notifications and messaging" DM story (`[owner decision]`, "owner to confirm or defer"); UX "Open UX decisions" DM gate; Sprint 14 hard gate (F14.1)
- Code: `apps/api/src/dm/` (rules in `dm.rules.ts`, every number a named constant with a test), `apps/web/src/features/dm/`, `apps/web/src/app/messages/`

## Decision

Build the full Sprint 14 scope now (friend requests, DMs, Inbox Messages tab, block, mute, report) and ship it **off**. Turning it on is an admin flag toggle on `/admin/flags` (step-up MFA, audited). Turning it off again hides everything at once. Conversations and messages are kept, so the feature can come back without losing history.

Why build rather than defer: the conversation model was DM-ready from Sprint 7, so the extra cost was mostly UI and enforcement. Having the enforcement (block, report context, flood limits) finished and tested before anyone can use DMs is safer than building it under pressure later.

## Who can message whom (TA §Messaging)

| Pair                                                | DM? |
| --------------------------------------------------- | --- |
| Either player blocked the other                     | No  |
| Accepted friends                                    | Yes |
| Finished a match together (confirmed or resolved)   | Yes |
| Only a forfeit, void, cancel or expiry between them | No  |
| Anyone else                                         | No  |

- Eligibility is checked on every send, so a block or unfriend applies to the next message.
- There is no stranger search: friend requests start from a player's profile only. Open DMs stay out of scope (PRD "Out of scope").

## Friend requests

- Pending → accepted, declined or cancelled; accepted → removed (unfriend, or a block).
- Asking someone who already asked you is a yes.
- **Declines are silent.** The requester is not notified and cannot ask the same player again for **30 days**. The player who declined can still ask at any time.
- At most **20** pending outgoing requests per player, and 20 new requests a day.

## Block, mute, report (F14.4)

- **Block** (from a profile or a conversation) stops DMs and friend requests both ways and ends any friendship or pending request. Match chat stays usable so a live match can be finished and reported. Messages are never deleted: they remain report and dispute evidence.
- **No reveal.** A blocked player sees exactly what a stranger sees: no Message button, and in an old conversation the neutral "You can't send messages in this conversation." The blocker sees "You blocked …" and can unblock from Blocked players (the "blocked by mistake" path). Unblocking does not restore a friendship.
- **Mute** stops notifications and the unread dot for that conversation only.
- **Report** goes to the same moderator queue as match-chat reports, with the 10 messages before and 5 after frozen at report time, so later blocks, mutes or retention cannot change the evidence.
- Block, unblock, mute, unmute and report each write an audit row.
- **Suspensions pause messaging.** A suspended or banned player cannot send DMs, open conversations or send friend requests until the sanction ends or is revoked (decision 0005's suspensions otherwise only stop challenges). The other player can still write and report. Auto-limits do not pause DMs, because they are a signal for review, not a finding.

## Flood limits

Per pair, on top of the match-chat per-player limits (8 per 10 s, 300 per hour):

- 5 messages per 10 seconds and 60 per hour to one conversation.
- **5 unanswered messages in a row**, then "Wait for a reply before sending more messages." This targets the commonest harassment pattern: one player flooding someone who is not answering.

Keyword-filter hits (profanity, moving off RAISE, payments) are stored as flags and now appear in the moderator reports queue for both match chat and DMs.

## Flag-off guarantee

While `messaging.dm` is off, every `/dm/*` endpoint returns 404 (not 403), `/messages/*` pages render not-found, and no DM, friend or block-list control renders on profiles or in the inbox. An e2e test checks each of these.

## Revisit

After the first month with the flag on: friend-request volume and decline rates, block and report rates per 1,000 DMs, and how often the unanswered cap fires. Tune the constants in `dm.rules.ts`.
