# 0005 — Sanction ladder, auto-limits and staff MFA

- Status: **Decided** (2026-11-17), on the owner's instruction to close open items from research
- Closes: Sprint 12 "escalation auto-limits `[owner decision]`" and the reputation-threshold confirmation (thresholds themselves: decision 0003 §2)
- Code: `apps/api/src/moderation/ladder.ts` (every number is a named constant with a test)

## Sanction ladder (PRD "Rules")

| Step | Sanction          | What it stops                                                                                                            |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | Warning           | Nothing. On record only; it counts toward the next step.                                                                 |
| 2    | 7-day suspension  | Creating and accepting challenges. The player can still sign in, see when it ends, and finish matches already under way. |
| 3    | 30-day suspension | Same as step 2.                                                                                                          |
| 4    | Permanent ban     | Everything. Every session is revoked at once and sign-in is refused.                                                     |

- **Next step** = one above the highest un-revoked step in the last **365 days**. A clean year resets the ladder.
- **Who decides:** moderators apply the next step only. Only admins can skip steps (for example straight to a ban for a fraud ring) or sanction staff accounts.
- **Revoking** a sanction (appeal accepted, mistake) removes it from the ladder count and restores play immediately.
- **Why suspensions keep sign-in:** a player who is locked out cannot see why or for how long. Design §9 asks for plain, non-shaming copy, and players should be able to finish matches their opponents are already in.
- **Copy** (sent through the Sprint 11 `sanction_applied` notification): "You cannot create or accept challenges until 24 Nov. You can still finish your current matches." Nothing that names the player as a cheat.

## Auto-limits ("dead-man switch", F12.4)

Any one threshold, counted over the last **30 days** (or since the last moderator clear, whichever is later), pauses **new challenges** until a moderator reviews the account:

| Signal                              | Source                      | Threshold |
| ----------------------------------- | --------------------------- | --------- |
| Reused screenshots rejected         | Sprint 8 exact-hash reuse   | 2         |
| Reports actioned against the player | Sprint 12 report queue      | 3         |
| Disputes the player opened and lost | Sprint 9 incentive guard    | 3         |
| Late cancels and no-show forfeits   | Sprint 6/8 reputation debts | 3         |

- The limit never bans or sanctions on its own. It stops new play, says so plainly ("New challenges are paused on your account while a moderator reviews recent activity."), and lands the account in the moderators' Fraud signals view.
- A moderator **clear** lifts it: signals before the clear stop counting.
- **Why these numbers:** one reused screenshot can be an honest mistake (wrong file from the gallery), two in a month is a pattern. Three upheld reports or three lost self-opened disputes mirror the reputation "Low" boundary in decision 0003. Thresholds are deliberately conservative for launch; revisit with the first month of moderator data.

## Staff MFA (TA §Security "MFA for admins")

- TOTP (RFC 6238, SHA-1, 30 s, 6 digits). Any authenticator app works. Secrets are AES-256-GCM encrypted at rest with `MFA_ENCRYPTION_KEY` (required in production; the API refuses to boot without it).
- Every staff route needs a verified code within **12 hours** on the session's refresh family. Sensitive actions (ruling, sanctions, role changes, phone reveal, flags, game config) need one within **15 minutes**.
- Codes cannot be replayed (a step is accepted once). There are 5 attempts per 5 minutes, and the limiter fails closed.

## Data minimisation

Admin search shows phones masked (`+234 *** *** 1234`) and matches phones only on the full number. Revealing a full number is admin-only, needs a fresh code, requires a reason, and is written to the audit log.
