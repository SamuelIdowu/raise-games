# Product Brief: RAISE

Product name: RAISE, per the product owner. Revised October 30, 2026 for the staged rollout. Status: planning complete, pre-build.

## Problem

Competitive eFootball, Call of Duty Mobile, and PUBG Mobile players in Nigeria arrange matches through WhatsApp and Telegram groups. There is no agreed way to find a fair opponent, settle terms, record a result both sides accept, or carry a reputation from match to match. The result is no-shows, disputes with no referee, and rankings that exist only in people's heads.

## Target user

- Primary: competitive players of eFootball, CODM, and PUBG Mobile in Nigeria, roughly 16 to 30, mostly on mobile browsers.
- Secondary (v1.x): tournament organizers and sponsors who need registration, brackets, and prize delivery.

## Value proposition

A trusted way to compete for rewards. Players find challenges by stake, agree terms, play, submit proof, and get a verified, ranked result. In Stage 1 challenges are free and trust is the product: reputation scores, two-sided result confirmation, a dispute process with real moderators, and an audit trail make a result mean something. Real-money stakes arrive in Stage 2, once that trust exists.

## Key research findings

A short scan in October 2026, not a market report.

- Competitors: Gamr (Lagos-based pan-African esports and tournament platform), Gameziland (concept-stage competitive gaming platform, no evidence of traction), and one-off organizer events such as DECACUP (₦250,000 prize pool). Global references for tournament tooling are Matcherino and Battlefy. I found no always-on, verified challenge ladder for these three games in Nigeria. Treat the gap as plausible, not proven.
- Demand: Nigerians spent over $200 million on mobile gaming in 2023 (Techpoint Africa).
- Legal: per the sources reviewed, a November 2024 Supreme Court decision made gaming regulation a state matter, and the federal gaming bill was not signed. Legal is on a separate track and is not designed in these documents.
- Payments: Paystack treats activities with an entry fee and a prize, including games of skill, as ineligible without prior approval. Monnify lists betting and gaming among supported sectors.

## Positioning

The product owner's staged rollout: Stage 1 Founding Players (free challenges, verification, leaderboards, basic disputes), Stage 2 RAISE Challenges (real-money 1v1 with stakes), Stage 3 RAISE Tournaments, Stage 4 Expansion (teams, community tournaments, sponsorships, more games). Discovery is stake-first, with ratings and history visible so players can judge opponents. No cash moves in Stage 1. The revenue model and fees are not yet defined.

## Stage 1 scope at a glance

In: phone OTP signup, per-game profiles and IDs, player discovery, free open and direct Duel challenges, two-sided result submission with screenshot proof, disputes, Elo ladders and leaderboards, reputation, notifications, match chat, an admin dashboard, and foundations for Stage 2 (zero-stake fields, ledger, provider interface, identity tiers, jurisdiction flags).

Out: real-money stakes and any player-facing wallet, tournaments, Team and Lobby formats, sponsorships, OCR verification, open DMs, restricted DMs (pending owner confirmation), native apps.

## Launch approach

Nigeria first, global later. Stage 1 is free to play. Seed through campuses and communities with local ladders so early players meet people they know. Design for global from day one at low cost: money in minor units with currency codes, per-user timezones, and i18n. Real-money stages are gated on legal, provider, and compliance approval, handled on a separate track.

## Stage 1 success metrics (first 8 weeks after launch)

Starting targets, to revisit after the closed beta.

- 1,000 registered players with at least one game ID
- 35% of registered players create or accept a challenge
- 1,500 completed matches with verified results
- 80% or more of matches auto-confirmed with no admin action
- Dispute rate under 10%, median resolution under 24 hours
- 25% of players who finish a match still active in week 4

## Top risks

- Cold start: a thin ladder feels dead. Seed before launch.
- Verification fraud: fake or reused screenshots. Mitigate with image hashing, disputes, and reputation. The incentive to cheat rises sharply once stakes are real in Stage 2.
- Stake-first matching lets strong players target weak ones. Mitigate with rating-gap warnings, stake caps for new accounts, and repeat-pairing limits.
- Moderation capacity: dispute SLAs need real people.
- Undefined revenue model and fees: needed before Stage 2.
- Publisher terms: confirm rules on game names and logos before using branding.
- Legal, custody, and payment approval: separate track, gates real money only.
