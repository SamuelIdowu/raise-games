# 0004 — Elo parameters and the repeat-opponent rule

- Status: **Decided** (2026-11-17), on the owner's instruction to close open items from research
- Closes: Sprint 10 "`[owner decision]`: Elo numeric parameters + reputation thresholds"; reputation thresholds were already decided in 0003 §2
- Code: `apps/api/src/ratings/elo.ts` (every number below is a named constant with a test)

## Decision

| Parameter                               | Value                                                              | Source                                                                 |
| --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Starting rating                         | 1000                                                               | PRD "Rules"                                                            |
| K factor                                | 32 for a player's first 20 rated matches in a game, then 20        | PRD "Rules"                                                            |
| Expected score                          | 1 / (1 + 10^((opponent − player) / 400))                           | standard Elo, 400 scale                                                |
| Rounding                                | `Math.round` on the final delta                                    | deterministic, so the log replays exactly                              |
| Provisional                             | until 10 rated matches in that game                                | Design §8, decision 0003                                               |
| Repeat-opponent window                  | 7 days                                                             | PRD "Rules"                                                            |
| Repeat-opponent multiplier on **gains** | matches 1–3: ×1; 4th: ×0.5; 5th: ×0.25; 6th and later: ×0          | PRD says "gains diminish after 3 matches"; the steps are this decision |
| Losses in repeat matches                | never reduced                                                      | this decision                                                          |
| Draws                                   | score 0.5 each; only where the format allows draws                 | PRD formats                                                            |
| Forfeit                                 | rated as a win for the claimant and a loss for the forfeiting side | Sprint 8 spec §6                                                       |
| Void                                    | no rating change; voiding a rated match reverses it exactly        | Sprint 9 `ratingAction`                                                |
| Ratings scope                           | one rating per player per game                                     | PRD                                                                    |

## Why the repeat-opponent rule is shaped this way

The rule exists to stop win trading: two accounts farming rating off each other. Halving, then quartering, then zeroing gains makes the 4th to 6th matches in a week progressively worthless to the winner. Leaving losses at full value means a pair that alternates wins loses rating overall, so trading becomes self-defeating, while genuine rivals who play often lose nothing beyond diminished gains. The window counts earlier rated results for the pair in the same game whose decision time is within 7 days, including results later reversed by an appeal, so a ruling cannot reset the counter.

## Reproducibility (PRD acceptance criterion)

Every application writes two rows to the append-only `rating_events` log with its inputs (score, decision time, opponent) and outputs (K, expected, multiplier, delta, rating before and after). `replay()` recomputes every delta from the log alone. `pnpm --filter @raise/api ratings:verify` runs it against a live database and exits non-zero on any difference. Tests run the same check over 10,000 simulated events and through the real consumer.

## Revisit

After 4 weeks of launch data: whether 20 matches is the right K drop for players who play every day, and whether repeat-opponent flags (Sprint 12 collusion signals) show trading that the multiplier does not catch.
