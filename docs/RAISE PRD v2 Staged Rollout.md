# RAISE PRD v2: Staged Rollout

Revised October 30, 2026 for the product owner's staged RAISE direction. Supersedes v1. The Product Brief, Technical Architecture, UX Flow Spec, and Delivery Plan still reflect v1 and need aligning.

## Product and business model

RAISE connects gamers who want to compete for financial rewards. Players find or create challenges primarily by the amount they are willing to stake. Skill ratings and match history stay visible so players can judge opponents, but they do not drive discovery.

Revenue model: not yet defined by the product owner. The likely shape is a platform fee on each staked challenge pot and on tournament entries. Stage 1 earns nothing by design. Decisions needed before Stage 2: fee percentage, who pays it, minimum and maximum stake, fee treatment on voided or refunded matches, and withdrawal fees.

## Staged rollout and gates

The stages are the owner's proposed roadmap, not a final specification. Gates are proposed conditions and need legal and owner review.

| Stage                | Scope                                                                                                                  | Gate before launch                                                                                                                                                                                                  | Rough effort                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Founding Players  | Registration, profiles, game IDs, player discovery, free challenges, result verification, leaderboards, basic disputes | Acceptance criteria below met and closed beta healthy                                                                                                                                                               | About 44 engineer-weeks, about 15 calendar weeks with 3 engineers           |
| 2. RAISE Challenges  | Real-money 1v1 challenges with agreed stakes, secure payments, refunds, payouts, platform fees                         | Legal sign-off on custody and operating states, written provider approval, KYC and age checks live, ledger reviewed, Stage 1 dispute and fraud rates within target, responsible-gaming controls and terms published | About 30 to 42 engineer-weeks, plus external legal, provider, and KYC costs |
| 3. RAISE Tournaments | Registration, rules, brackets, result verification, standings, prize distribution                                      | Stage 2 payout success and dispute rates stable, bracket engine and no-show rules proven in a small pilot                                                                                                           | About 16 to 30 engineer-weeks                                               |
| 4. Expansion         | Team competitions, Lobby format, community-hosted tournaments, sponsorships, more games, advanced features             | Stage 3 stable, each item scoped separately                                                                                                                                                                         | Scoped per item                                                             |

Effort figures are rough estimates, about plus or minus 30 percent, not quotes.

## Stake-based discovery and fairness controls

Discovery is stake-first. The challenge board sorts and filters by stake band, then shows each poster's rating, record, streak, and reputation on the card. In Stage 1 every stake is zero, so the board shows Free and sorts by recency. The stake filter appears when Stage 2 opens.

Stake-first matching lets strong players target weak ones for money. Proposed controls, to confirm with the owner:

- A rating-gap indicator on every card, and a confirmation step on accept when the gap is large (threshold to be set).
- An optional rating range when creating a challenge.
- Stake caps by trust tier: new accounts start low and rise with completed, clean matches.
- Repeat-pairing limits and new-account cooldowns to slow win-trading and account farming.
- Ratings labeled provisional until enough matches are played.

## Goals

- Players complete the full loop (challenge, play, submit, verify, rank) without admin help in most matches.
- Players trust the ladder enough to come back.
- Payments can be added later by swapping an adapter, not rebuilding. No real money moves in Stage 1.

## Stage 1 success metrics (first 8 weeks after launch)

Starting targets, revisit after the closed beta.

- 1,000 registered players with at least one game ID
- 35% of registered players create or accept a challenge
- 1,500 completed matches with verified results
- 80% or more of matches auto-confirmed with no admin action
- Dispute rate under 10%, median resolution under 24 hours
- 25% of players who finish a match still active in week 4

## Users

- Player: finds opponents, plays, submits results.
- Captain (Stage 4): a player who leads a Team match.
- Moderator: resolves disputes and reports.
- Admin: manages users, games, flags, and roles.

## Games and match formats

Games are configuration, not code. Each game record defines its ID fields, supported formats, result schema, required proof, and tiebreak rules, so adding a game means adding a config entry plus any game-specific verification rules.

- Duel (1v1): Stage 1.
- Team (NvN with fixed rosters, captain-confirmed): Stage 4.
- Lobby (battle royale scrims, placement and kills points table): Stage 4. The data model supports all three formats from day one.

Launch each game with one or two formats only. Proposed: eFootball Duel; CODM Duel; PUBG Mobile Duel in custom rooms. Confirm per game before build.

## Stage 1 user stories

### Accounts and profiles

- As a visitor, I can sign up and log in with phone OTP, so accounts map to real phones.
- As a player, I can choose games and add an in-game ID per game, so opponents can find me in the game.
- As a player, I can see my rating, record, streak, and reputation per game.

### Discovery

- As a player, I can browse games and filter players by game, rank, and campus or city.
- As a player, I can view an open challenge board sorted and filtered by stake band first, with each poster's rating, record, and reputation on the card. In Stage 1 all stakes are zero, so the board shows Free.

### Challenges

- As a player, I can create an open or direct challenge with game, format, rules, time window, and stake. The stake is fixed at zero in Stage 1 but is stored on every challenge.
- As a player, I can accept, decline, or cancel a challenge. Late cancellation after acceptance costs reputation.
- As a player, I am told when a challenge expires.

### Results and verification

- As a player, I can submit outcome, score, and screenshot proof after a match.
- As an opponent, I can confirm or dispute. Matching submissions auto-confirm.
- As a player, I can report a no-show and get a forfeit decision.

### Disputes

- As a player, I can open a dispute with a reason and evidence, and see its status.
- As a moderator, I can review both submissions and the match chat, record a ruling with a reason, and have ratings and credit holds update.
- As a player, I can appeal a ruling once.

### Ratings and leaderboards

- As a player, my Elo rating per game updates after each confirmed match.
- As a player, I can view per-game leaderboards with filters and see my rank change.

### Ledger foundation (no player wallet)

- As the platform, every challenge stores a stake amount, currency, and fee-schedule version, and the ledger and payment-provider interface run on a mock adapter. There is no player-facing wallet in Stage 1.
- Open decision: whether to rehearse stake-first discovery with play credits before Stage 2.

### Notifications and messaging

- As a player, I get in-app notifications for key match events, with email as fallback and per-type preferences.
- As a player, I get a chat per match, locked a set time after completion.
- As a player, I can DM only players I have completed a match with or accepted as friends, and I can block, mute, and report. Not in the owner's Stage 1 list: owner to confirm or defer.

### Admin

- As an admin, I can search users and apply the sanctions ladder.
- As a moderator, I work a dispute queue with assignment, an SLA clock, an evidence viewer, and decision templates.
- As an admin, I can review reports and chat flags, view the audit log, manage game and format config, and toggle feature flags.

## Rules (proposed defaults, confirm before build)

- Challenge acceptance window: 48 hours, then it expires.
- Result submission: within 24 hours of the agreed start.
- Confirmation window: 24 hours. If the opponent is silent and has not disputed, the result auto-confirms.
- No-show claim: allowed 20 minutes after agreed start, with proof of attempt.
- Elo: start at 1000, K-factor 32 for the first 20 matches then 20. Gains diminish after 3 matches against the same opponent within 7 days.
- Stakes: fixed at zero in Stage 1. Stake bands, limits, fees, and payout rules are defined for Stage 2.
- Sanctions ladder: warning, 7-day suspension, 30-day suspension, permanent ban.
- Match chat locks 72 hours after completion and is retained through the dispute window.

## In scope

Phone OTP auth, game profiles, discovery, free Duel challenges, result verification and disputes, Elo and leaderboards, reputation and sanctions, notifications, match chat, admin dashboard, feature flags, and the foundations listed below (zero-stake fields, ledger, provider interface, identity tiers, jurisdiction field).

## Out of scope for v1

Real-money stakes, deposits, withdrawals, and any player-facing wallet; tournaments (Stage 3); Team and Lobby formats, sponsorships, and community-hosted tournaments (Stage 4); OCR or replay verification; open DMs; native mobile apps.

## Early technical foundations

Build these in Stage 1 because retrofitting them after money moves is expensive. Everything else waits for its stage.

- Stake amount, currency, and pot on every challenge (zero in Stage 1), plus a versioned fee-rule table.
- Double-entry ledger with holds and idempotent entries on a mock provider, with webhook signature checks, idempotency, and a reconciliation job.
- Identity tiers: verified phone, KYC status, age-verification field, and stake limits by tier.
- User jurisdiction (state) and per-jurisdiction feature flags, because gaming rules are state-level.
- A nullable competition id on matches, so tournaments plug in without a schema rewrite.
- Fraud signal collection from day one: device, IP, repeat pairings, and screenshot hashes.
- Consent records for terms versions, and fields for responsible-gaming limits and self-exclusion.
- Audit log, admin roles with MFA, and feature flags per stage.
- Designed but not built until Stage 2: withdrawal, refund, and payout state machines.

## Stage 1 acceptance criteria

Proposed and testable. Thresholds are starting values to confirm with the owner.

- Signup: a new user completes phone OTP signup and adds a game ID in under 90 seconds median, on a low-end Android over throttled 3G.
- Challenge: two players cannot both accept the same challenge (concurrency test), and the match room appears within 2 seconds of acceptance.
- Verification: matching result submissions auto-confirm and update ratings within 5 seconds. Conflicting submissions open a dispute automatically.
- Disputes: a moderator can review both submissions and the match chat and record a ruling with a reason, and every change is in the audit log.
- Timers: expiry and forfeit deadlines fire within 1 minute, including after a Redis restart.
- Ratings: recomputing from the rating event log reproduces every current rating exactly. Leaderboards count confirmed matches only.
- Foundations: every challenge stores a zero stake, currency, and fee-schedule version. The ledger check shows all accounts netting to zero. Replayed mock provider webhooks cause no duplicate entries.
- Abuse controls: reused screenshots are flagged by hash, uploads are validated, rate limits apply, and admin accounts require MFA.
- Performance: p95 API latency under 500 ms at 500 concurrent users, and first load under 3 seconds on throttled 3G.
- Operations: alerts fire on stuck matches and failed notifications, and a backup restore has been tested.

## Stage 1 milestones

Assumes 3 engineers, 1 designer, and part-time QA and moderation. Dropping Team matches and the wallet screens, and deferring DMs if the owner agrees, saves about 4 engineer-weeks, so the earlier 16-week plan becomes about 15.

- M0, weeks 1 to 2: foundations (repo, CI, environments, auth skeleton, schema, design tokens).
- M1, weeks 1 to 4: prototype of the Stage 1 flows, tested with 8 to 10 players.
- M2, weeks 3 to 8: core loop (accounts, game config, free challenges, state machine, results, ratings, notifications, match chat).
- M3, weeks 8 to 11: trust and operations (admin and dispute queue, reputation and sanctions, fraud signals, leaderboards, ledger and provider foundations).
- M4, weeks 11 to 14: hardening, security review, load test, and a closed beta of 100 to 200 players.
- M5, week 15: free public launch in Nigeria.
- Stage 2 starts only when its gate is met. Its legal, provider, and custody decisions should start now so they are not on the critical path.

## Estimated costs

Rough planning figures, not quotes. Labor cost is effort times your team's rates, which I do not have.

- Stage 1 labor: about 44 engineer-weeks, about 6 designer-weeks, about 6 QA-weeks, plus moderators from beta onward. Multiply by your weekly rates.
- Stage 1 running costs: about $150 to $400 per month for hosting, managed Postgres, Redis, storage, email, and monitoring at beta scale. Approximate, based on typical published pricing and not verified for this setup.
- OTP SMS: roughly $0.006 to $0.015 per message on Nigerian routes, per vendor pricing pages seen in search results and not verified, so about $20 to $45 for 3,000 messages.
- Stage 2 external costs: legal counsel, licensing where required, payment provider fees, KYC per-check fees, and a security review. These depend on the legal track and cannot be estimated yet.
- Stage 3: engineering only, plus moderation and prize-operations staffing.

## Open decisions

- Revenue model: fee percentage, who pays, stake limits, refund and void treatment, withdrawal fees (owner).
- Whether Stage 1 rehearses stakes with play credits, or stays fully stake-free.
- Whether restricted DMs stay in Stage 1.
- Formats per game.
- Minimum age, custody model, licensing, and operating states, which sit with the legal track.
- Payment provider and KYC provider.
- Confirmation of the proposed rule numbers above and the acceptance thresholds below.
- SMS/OTP provider.
