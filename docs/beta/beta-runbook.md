# Closed beta — runbook

Sprint 16 (F16.5). Closed beta of 100 to 200 players seeded through a few campuses or communities (Delivery Plan M4). Exit: beta metrics on track toward the 8-week targets, and **no open severity-1 issues**.

## Go / no-go (all must be yes)

| Check                                                                                                                           | Owner         |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Terms of service, privacy policy, community rules and age policy final, and the consent screen points at the final versions     | Owner / legal |
| Moderator rota staffed for the beta hours, so disputes can be resolved within the 24-hour SLA (PRD acceptance)                  | Owner         |
| Sprint 15 alerts on (stuck matches, failed notifications, ledger imbalance) and the restore drill passed                        | Engineering   |
| Cohorts chosen; one invite code per cohort created on `/admin/beta` with sensible max uses (default 50) and an expiry if wanted | Owner         |
| A `redteam` cohort and code for adversarial testers (see the adversarial playbook)                                              | Engineering   |
| `beta.invite_only` **on** (Flags page), and a test signup with a code and one without (the latter lands on the waitlist)        | Engineering   |
| `messaging.dm` set as decided (off unless the owner wants DMs in the beta; decision 0007)                                       | Owner         |
| `/admin/metrics` loads and `/admin/feedback` is empty or triaged                                                                | Engineering   |

## Opening

1. Turn `beta.invite_only` on.
2. Send each cohort lead their code with the invite message ("Join the RAISE beta with invite code …").
3. Watch the first sign-ups on `/admin/metrics` (funnel: signed up → game ID → first challenge → first finished match).

## Daily (beta days)

- `/admin/feedback`: triage everything new, so the untriaged count is zero by end of day. Any **S1** gets an owner and a fix date the same day.
- `/admin` dashboard: unassigned disputes, SLA breaches, stuck matches.
- `/admin/metrics`: dispute rate, auto-confirm share, and the funnel per cohort. A cohort stuck at "added a game ID" usually means an onboarding problem, not a lack of interest.
- `/admin/beta`: codes near max uses; invite from the waitlist if there is room.

## Weekly

- Compare cohorts on `/admin/metrics` and download the CSV.
- Red-team session (see the adversarial playbook); log findings as feedback with `[redteam]`.
- Short retro: what broke, what confused players, which metric moved.

## Closing the beta

- Exit check: every PRD rate metric on track or explained, and **open S1 = 0** on `/admin/metrics`.
- Revisit the PRD targets with the beta numbers (the PRD says "revisit after the closed beta"), and record the decision.
- For launch (Sprint 17): turn `beta.invite_only` off to open signups. Existing accounts are unaffected either way.

## Rollback

- Signups misbehaving: turn `beta.invite_only` off. Invited players already have accounts; nobody is locked out.
- A code leaked: pause it on `/admin/beta`. Accounts already created stay.
- Waitlist phone numbers are deleted automatically after 90 days.
