# Sprint 16 — Closed Beta (Invites, Metrics, Feedback, Adversarial Testing)

- Milestone: **M4** (weeks 11–14, second half)
- Stage: 1
- Depends on: Sprints 3–14 (the product under test), Sprint 12 (admin console, flags, audit), Sprint 15 (hardening; runs in parallel and owns alerts, load and restore)
- Exit (Delivery Plan M4): **beta metrics on track toward the 8-week targets, no open severity-1 issues**
- Before beta opens `[owner/legal]`: terms of service, privacy policy, community rules and age policy final (Delivery Plan "From the legal track … must exist before beta"); moderator rota staffed

## Goal

Run a closed beta of **100 to 200 players** seeded through a few campuses or communities (Delivery Plan M4), and make its health visible:

- Only invited players can create accounts while the beta is closed, and each invite belongs to a cohort (campus or community) so results can be compared.
- The PRD's Stage 1 success metrics are live in the admin console, per cohort, against their targets.
- Players can report bugs from inside the app; staff triage them by severity, and the exit gate (no open severity-1) is a number on the dashboard.
- The trust and verification defences are attacked on purpose, with a scripted adversarial pack and a playbook for live sessions.

## Features

### F16.1 Beta access: invite codes, cohorts, waitlist

- Flag `beta.invite_only` (stage 1), seeded **off** so dev, CI and e2e are unaffected; an admin turns it on to close signups.
- While on, a **new** phone number needs a valid invite code to create an account. Existing accounts always sign in. The code is checked at OTP request (no SMS cost for a bad code) and redeemed atomically when the account is created.
- Invite codes: cohort name (campus or community), optional city or campus, max uses (default 50), optional expiry, active switch. Codes are 8 characters from an unambiguous alphabet (no 0/O/1/I). Redemptions record the cohort on the user.
- Brute force: wrong codes are rate-limited per IP and per phone; responses never say whether a code exists but is full or expired versus never existed beyond "This invite code is not valid."
- Waitlist: someone without a code can leave their phone number and campus or city; admins see the list and can invite from it. Phone numbers on the waitlist are deleted after 90 days.
- Admin `/admin/beta`: create codes, pause them, see uses per code and cohort sizes; waitlist with "invite".

### F16.2 Beta metrics dashboard

`/admin/metrics`, filterable by cohort and window (default: since the beta opened, max 8 weeks). Each PRD metric shows the value, the target and a plain on-track / behind marker (never colour alone):

| PRD metric (Stage 1, 8 weeks)                            | Definition used                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1,000 registered players with a game ID                  | Accounts (not deleted) with at least one game profile                                                                      |
| 35% create or accept a challenge                         | Of those, the share who posted or accepted at least one challenge                                                          |
| 1,500 completed matches with verified results            | Matches `confirmed` or `resolved`                                                                                          |
| ≥ 80% auto-confirmed with no admin action                | Of completed matches, the share `confirmed` (two-sided or timeout) and never disputed                                      |
| Dispute rate < 10%, median resolution < 24 h             | Disputes opened ÷ matches decided; median ruled − opened (reuses Sprint 9 metrics)                                         |
| 25% of players who finish a match still active in week 4 | Players whose first completed match was 28+ days ago and who created, accepted or completed a match in days 22–28 after it |

- Count targets are the 8-week launch targets, judged against the **pace for the weeks elapsed** (target × weeks ÷ 8). The beta is far smaller than launch, so counts read "behind" by design and the rates are the real signal; the PRD says to revisit the targets after the closed beta. Rate targets apply as is.
- Daily series for signups, challenges and completed matches; a funnel (signed up → game ID → first challenge → first completed match).
- CSV export for the retro.

### F16.3 In-app feedback and severity triage

- "Send feedback" from the account menu and from error screens: bug / idea / something else, free text (2,000 characters), page and app version attached automatically. Rate-limited.
- Admin `/admin/feedback`: queue with severity (S1–S4), status (new → triaged → fixed / won't fix / duplicate), owner note, and a link to the reporter's record. Every change is audited.
- Severity definitions (in the doc and on the triage screen): **S1** = wrong results, ratings or sanctions; data loss or exposure; a whole flow broken for many players; security. **S2** = a flow broken for some players with no workaround. **S3** = broken with a workaround, or cosmetic in a key flow. **S4** = polish or ideas.
- The dashboard shows open S1 and S2 counts: the M4 exit is "open S1 = 0".

### F16.4 Adversarial test pack

Automated scenarios proving each defence holds, plus a playbook for live attempts during the beta (Delivery Plan risk: "Run adversarial testing in beta"):

- Verification gaming: the same screenshot submitted for two matches (exact hash), a re-encoded copy (near-duplicate), a winner claimed by both sides → dispute.
- Win-trading and farming: repeat pairings past the rated-games cap stop moving ratings; new-account cooldowns.
- Dispute abuse: lost self-opened disputes count toward auto-limits; one appeal only.
- Harassment: DM flood caps, block both ways, report context (Sprint 14).
- Beta gate: invite code guessing is rate-limited; full or expired codes cannot be used; existing accounts are never locked out by the gate.
- Playbook `docs/beta/adversarial-playbook.md`: who attacks what, how to log a finding as feedback with severity, and how moderators confirm the defence fired.

### F16.5 Beta operations

- `docs/beta/beta-runbook.md`: go/no-go checklist (legal docs live, flags set, cohorts and codes created, moderator rota, Sprint 15 alerts on), daily checks (metrics, S1/S2, dispute SLA), weekly cohort review, and the retro template.
- Rollback: turning `beta.invite_only` off opens signups; it never affects existing players.

## Design compliance

- Design §8 tables and forms for admin screens; §9 voice for player copy (plain, no blame: "This invite code is not valid. Check it, or join the waitlist.").
- Accessibility: invite field labelled, errors announced, 44px targets; metrics markers carry text, not colour alone.

## Files and references

| Ref                                                                | What                               |
| ------------------------------------------------------------------ | ---------------------------------- |
| `docs/Delivery Plan RAISE.md` §M4, §Risks                          | Beta size, exit, adversarial tests |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Stage 1 success metrics"   | Metric definitions and targets     |
| `sprints/sprint-03` (OTP), `sprint-12` (admin, flags), `sprint-14` | Reused surfaces                    |
| `sprints/sprint-15-hardening.md`                                   | Alerts, load, restore (not here)   |

## Testing

- Unit: invite code format and validation, metric definitions on fixed data, severity rules.
- Integration: gate on/off (new phone needs a code, existing phone does not), atomic redemption at max uses under concurrency, expiry, rate limit on bad codes, waitlist retention; metrics on seeded data; feedback lifecycle and audit; the adversarial scenarios.
- E2E: invited signup through the real onboarding with the gate on; uninvited player lands on the waitlist; staff create a code and see it used; feedback sent and triaged.

## Audit

- Gate bypass hunt: every account-creating path checks the invite (OTP verify is the only one).
- Privacy: waitlist phones minimised and expired; metrics are aggregates only (no per-player export beyond what admin records already show).

## Checklist

- [x] F16.1 Invite-only gate (flag, default off), codes per cohort, atomic redemption, waitlist, admin screen
- [x] F16.2 Metrics dashboard with the six PRD metrics per cohort, funnel, daily series, CSV
- [x] F16.3 In-app feedback, severity triage, open-S1 count on the dashboard
- [ ] F16.4 Adversarial pack green; playbook written
- [x] F16.5 Beta runbook and go/no-go checklist
- [ ] `[owner/legal]` Legal documents final and linked from onboarding
- [ ] `[owner]` Cohorts chosen, codes issued, moderator rota staffed; beta opened
- [ ] Testing green; audits pass
- [ ] Exit: metrics on track, open S1 = 0 (after the beta has run)

## Implementation notes (2026-11-18)

- **Gate (F16.1):** `apps/api/src/beta/invites.ts` (pure functions, no Nest DI, so `AuthService` uses them without a module cycle). `AuthService.inviteRequiredFor()` applies only when `beta.invite_only` is on **and** the number has no account. The code is checked at OTP request (before any SMS) and again at verify (before the OTP code is spent), then redeemed with a conditional `uses + 1 … WHERE uses < max_uses` **inside the transaction that creates the user**, so a code that runs out rolls the account back. Errors carry `invite_required` / `invite_invalid`; wrong codes are limited to 10 per IP per hour. The existing OTP limits (atomic attempt budget, per-IP verify cap) are untouched.
- **Tables** (`apps/api/src/db/schema-beta.ts`, migration 0016, which also seeds `beta.invite_only` **off**): `invite_codes`, `invite_redemptions` (cohort per account), `beta_waitlist` (phones purged after 90 days on every write and list, masked for staff), `feedback`.
- **Test seam:** `AuthService.gate()` wraps the flag read so the integration test turns the gate on for its own module instance. Flipping the shared flag row would break other test files that sign up in parallel. E2E (one worker) toggles the real flag.
- **Metrics (F16.2):** `GET /admin/metrics?cohort&since` computes the six PRD metrics in one query (definitions in the table above), plus funnel, daily series and open feedback by severity. Targets and the on-track rule are in `beta/metrics.rules.ts` (unit-tested). `/admin/metrics` shows text markers (never colour alone) and exports CSV. The window defaults to the first invite redemption, or 56 days back.
- **Feedback (F16.3):** "Send feedback" in the sidebar and mobile menu → `/feedback` (page and app version attached). `/admin/feedback` triages severity and status; leaving "new" requires a severity; every change is audited. Open S1–S4 counts appear on the metrics page as the exit gate.
- **Adversarial (F16.4):** `docs/beta/adversarial-playbook.md` maps 15 attacks to the tests that prove each defence. New: `sprint16-adversarial.integration.test.ts` drives the reused-screenshot and lost-self-opened-dispute auto-limits end to end, the two no earlier suite covered. Open finding: **no new-account cooldown** (PRD mitigation), proposed S3 for Stage 1 and an owner decision before Stage 2.
- **Runbook (F16.5):** `docs/beta/beta-runbook.md`: go/no-go, opening, daily and weekly checks, closing, rollback.
