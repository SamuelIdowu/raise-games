# 0003 — UX open decisions (Stage 1)

- Status: **Decided** (2026-11-16), on the owner's instruction to close open items from research
- Closes: Sprint 2 "UX doc 'Open decisions' driven to closure" and the matching list in `UX Flow Spec RAISE (Stage 1).md`
- Every threshold below is a starting value. Revisit each one after the first 4 weeks of launch data (PRD Stage 1 success metrics); none of them is in a migration, so changing one is a config change

## 1. Auto-confirm copy

**Decided, and already shipped in Sprint 8.** It is shown before the player submits (UX Flow 5), in the result sheet's summary line:

> Your opponent has 24 hours to confirm. If they do not respond, the result is confirmed automatically.

No-show variant: "Your opponent has 24 hours to respond. If they do not, they forfeit the match."

Why: it is the Design §8 example almost word for word, it states the rule and the consequence plainly (Design §9 voice), and the "24 hours" comes from the rules config, not hard-coded text. The credits-explanation copy is not needed, because there is no play-credit rehearsal (§6).

## 2. Reputation badge thresholds

The badge design is already built (Design §8: New, Low, Reliable, Trusted; Low uses an alert icon in text-2, never the dispute colour, and never shows raw numbers). Thresholds:

| Badge    | Rule (evaluated over the player's last 50 accepted matches)                                      |
| -------- | ------------------------------------------------------------------------------------------------ |
| New      | Fewer than 5 completed matches                                                                   |
| Trusted  | 20 or more completed, completion rate ≥ 95%, disputes lost ≤ 5%, no sanction in the last 90 days |
| Reliable | Completion rate ≥ 85% and disputes lost ≤ 10%                                                    |
| Low      | Anything below Reliable, or any active sanction                                                  |

- **Completion rate** = matches that reach Confirmed or Resolved ÷ matches accepted. Matches where the _opponent_ no-showed or was ruled at fault do not count against you.
- **Disputes lost** = disputes ruled against the player ÷ completed matches. Opened-but-won disputes do not count, so honest players are not punished for disputing.
- Why a rolling window: reputation should recover after a bad week, and the PRD wants reputation to reward completing matches, not punish one-off incidents.
- Why these numbers: a player who abandons or loses a dispute in more than 1 match in 7 (below 85%) is a real coordination cost to opponents. 95% is "almost always shows up and plays clean". Trusted needs 20 matches so it cannot be earned in a weekend.

Sprint 10 (ratings and reputation) implements this from the `reputation.debt` and match events already in the outbox.

## 3. Leaderboard names

**Usernames only.** Stage 1 never collects real names: signup is phone OTP plus a username. Showing real names would need a new personal-data field, consent and correction flows, all for no product benefit. That runs against data minimisation under Nigeria's Data Protection Act 2023. Usernames are also what players recognise in-game.

## 4. Stage 2 stake-first board

Recorded now so the Stage 1 layout does not change later (the Sprint 5 card already reserves the collapsed rating-gap slot):

- **Rating-gap warning:** shown on a staked challenge when the Elo gap is 200 or more. At 200 the expected score of the stronger player is 1 / (1 + 10^(−200/400)) ≈ 0.76, so the weaker player is 3:1 against.
- **Hard block:** staked challenges cannot be posted or accepted with a gap of 400 or more (expected score ≈ 0.91). Free play is never blocked.
- **Stake bands:** defined with the Stage 2 fee rules (versioned `fee_rules` table), not here. The board filters by band, and a band shows its range, never a "win big" framing.
- **Confirmation wording:** states amounts and fees before the player confirms (Design §9): "You are staking ₦X. Platform fee ₦Y. If you win, you receive ₦Z." The verb is "stake"; never "bet" or "wager".

## 5. Restricted DMs in Stage 1

**Not at launch.** The `restrictedDms` feature flag stays off. Sprint 14 builds restricted DMs (only between players who completed a match together or accepted a friend request) behind the flag, so the owner can turn them on after launch without a release. Why: the PRD lists DMs as "pending confirmation" and outside the owner's Stage 1 list, the match chat already covers coordination, and DMs add a moderation surface before the moderation queue (Sprint 12) is staffed.

## 6. Play-credit rehearsal

**No rehearsal in Stage 1.** The `playCredits` flag stays off. Stage 1 is free play, and play credits would add a currency players can mistake for money. That is the exact casino association Design §1 rules out. The ledger already rehearses money flows on the mock provider (Sprint 13) with no player-facing balance.
