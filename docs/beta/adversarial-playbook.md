# Closed beta — adversarial playbook

Sprint 16 (F16.4). The Delivery Plan asks us to "run adversarial testing in beta": the incentive to cheat rises in Stage 2, so the defences must be proven while nothing is at stake. This playbook is for the staff and trusted testers who attack RAISE on purpose during the beta.

## Ground rules

- Use **test accounts in a dedicated cohort** (invite code cohort `redteam`), so their numbers can be filtered out of the beta metrics.
- Never attack real beta players: no harassment of real accounts, no reporting them for fun.
- Log every finding through **Send feedback** (kind "Something is broken"), starting the text with `[redteam]`, then triage it on `/admin/feedback` with a severity:
  - **S1:** wrong results, ratings or sanctions; data loss or exposure; a whole flow broken for many players; or a security issue.
  - **S2:** a flow broken for some players, with no workaround.
  - **S3:** broken with a workaround.
  - **S4:** polish.
- A moderator confirms each defence fired (flag, queue item, audit row) and notes where they saw it.

## Attack map

Each line is an attack, the expected defence, and the automated test that already proves it. Live testing checks the same defence through the real UI and on staging infrastructure.

| #   | Attack                                                 | Expected defence                                                                                    | Proven by                                                                                                       |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Submit the same screenshot for two matches             | Rejected; hash flag shown to moderators                                                             | `sprint8.integration` "screenshot reuse across two matches fails with a hash flag"                              |
| 2   | Re-encode or crop a used screenshot                    | Accepted but flagged as a near-duplicate                                                            | `sprint8.integration` "a re-encoded copy … flagged by perceptual hash"                                          |
| 3   | Reuse screenshots repeatedly                           | 2 rejections in 30 days pause new challenges until a moderator clears                               | `sprint16-adversarial.integration` (one is a mistake; two limit; clear lifts)                                   |
| 4   | Both players claim the win                             | The match goes to a dispute; no rating moves until a ruling                                         | `sprint8.integration` "simultaneous submissions from both sides resolve exactly once"; Sprint 9 suite           |
| 5   | Win-trading: farm rating from one friend               | Gains shrink from the 4th match against the same opponent in 7 days (×0.5, ×0.25, ×0)               | `elo.test` and `sprint10.integration` "gains diminish from the 4th match…"                                      |
| 6   | Open disputes you know you'll lose, to stall or harass | 3 lost self-opened disputes in 30 days pause new challenges; disputes against you don't count       | `sprint16-adversarial.integration` (opener only; limits at the threshold)                                       |
| 7   | Appeal again and again                                 | One appeal; the appeal ruling is final                                                              | `sprint9.integration` "allows exactly one appeal…"                                                              |
| 8   | No-show farming (claim the opponent didn't turn up)    | Contestable for 24 h; uncontested claims become forfeits with reputation debts; 3 debts limit       | `sprint8.integration` "uncontested claim → forfeited…"; `sprint12.integration` "debts … limit the account at 3" |
| 9   | Flood or harass by DM (when `messaging.dm` is on)      | Per-pair limits, 5-unanswered cap, block both ways without reveal, report with context              | `sprint14.integration`, e2e `dm.spec`                                                                           |
| 10  | Message strangers                                      | Only friends or players who finished a match together                                               | `sprint14.integration` "strangers and forfeit-only pairs cannot DM…"                                            |
| 11  | Guess or share invite codes                            | 10 wrong codes per IP per hour, then 429; full, paused and expired codes refused with the same copy | `sprint16.integration` "guessing codes is rate-limited per IP", "expired and paused codes…"                     |
| 12  | Many signups racing on one code                        | Never more than the code's max uses; refused signups leave no account                               | `sprint16.integration` "concurrent signups never push a code past max uses"                                     |
| 13  | Lock real players out by turning the gate on           | Existing accounts always sign in                                                                    | `sprint16.integration` "existing accounts always sign in without a code"                                        |
| 14  | Brute-force OTP codes                                  | Atomic 5-attempt budget per code; 30 verifies per IP per 10 min                                     | `sprint3-4.integration` ("20 parallel wrong guesses lock the code")                                             |
| 15  | Staff account takeover                                 | Staff MFA; fresh code for rulings, sanctions, roles, flags, codes                                   | `sprint12.integration` MFA matrix; e2e `admin.spec`                                                             |

## Open findings (to triage at the start of the beta)

- **New-account cooldown is not built.** The PRD lists "new-account cooldowns to slow win-trading and account farming", but nothing limits how soon a brand-new account can play rated matches. Repeat-pairing damping (#5) and the invite gate (#11, #12) slow farming during the beta. Proposed severity **S3** for Stage 1, where there is no money; it must be closed before Stage 2 stakes. Owner decision: cooldown length (for example, the first 3 matches unrated, or 24 hours before rated play).
- **Rated play between invite-mates.** A cohort is often one friend group, so expect more repeat pairings than at launch. Watch the "Repeat pairings" panel on `/admin/signals`.

## Session template

1. Pick attacks from the map, and add new ones you can think of.
2. For each: try it in the UI, note what happened, check the moderator view.
3. If the defence did not fire, or fired on an innocent action: log a finding with a severity.
4. At the end: one line per attack (held / broke / unclear) in the beta retro.
