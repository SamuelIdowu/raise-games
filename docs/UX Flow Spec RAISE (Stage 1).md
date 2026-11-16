# UX Flow Spec: RAISE (Stage 1)

Revised October 30, 2026 to align with RAISE PRD v2. Covers Stage 1 screens, with Stage 2 and later screens marked. Wireframe-level: purpose and content of each screen, not pixel detail.

## Shell and principles

- Mobile-first, responsive up to desktop. Bottom navigation on mobile: Home, Play, Matches, Inbox, Profile. Sidebar on desktop.
- A game switcher at the top scopes boards, ladders, and profiles to one game.
- A persistent needs-your-action banner surfaces pending confirmations and expiring challenges.
- Every status shown to a player is a view of the match state: Open, Accepted, In progress, Awaiting result, Awaiting confirmation, Confirmed, Disputed, Resolved, plus Cancelled, Expired, Forfeited, Voided.
- Performance budget: usable on a low-end Android over throttled 3G. Small bundle, client-side image compression, resumable uploads.
- Every empty state offers the next action.

## Flow 1: Onboarding

Screens: landing, phone entry and OTP, username, pick games, add game IDs (optional profile screenshot), Home.

- Goal: under 90 seconds to Home.
- Proposed: ask for state of residence in plain language. It is stored for jurisdiction flags that enable real-money features later.

## Flow 2: Find and challenge

Screens: Play tab (game filter, open challenge board, player search), player profile, challenge sheet, pending state.

- Challenge cards show game, format, time window, stake, and the poster's rating, record, and reputation badge. Stake leads the card. In Stage 1 it reads Free.
- The sheet collects format, rules, time window, and stake (Free in Stage 1), then shows a summary before sending.
- The open board is sorted and filtered by stake band first (visible from Stage 2), then by game, with local filters by campus or city.
- Stage 2: a rating-gap indicator on cards, a confirmation step on accept when the gap is large, and an optional rating range when creating a challenge.

## Flow 3: Accept

Screens: notification, challenge detail, Accept or Decline, match room.

- Accepting creates the match room and its chat. From Stage 2, the stake is held and shown as held.

## Flow 4: Match room (the hub)

Content: status timeline, opponent card with reputation, game ID with copy button, rules, deadline countdown, chat, Report no-show, Submit result.

- The next required action is a single primary button that changes with state.

## Flow 5: Submit and confirm result

Screens: submit result (outcome, score, screenshot upload with preview), waiting state, opponent confirm or dispute, confirmed summary.

- Confirmed summary shows rating change, rank change, and, from Stage 2, the payout after fees.
- Auto-confirm is explained in plain language before the user submits.

## Flow 6: Dispute

Screens: open dispute (reason, extra evidence), status tracker, ruling view inside the match room, appeal.

- Both sides see the same status. The ruling shows the moderator's reason.

## Flow 7 (Stage 4, not in Stage 1): Team match

Screens: build roster (invite linked teammates), challenge another captain, roster confirmation, match room, captain submit and confirm.

- Teammates get notifications and can accept or leave a roster. Each player sees their own rating change.

## Flow 8: Leaderboards and profile

Screens: per-game leaderboard (filters: campus, city, all-time, season later), player profile.

- Profile shows rank, rating, record, streak, reputation, game IDs, and recent matches.

## Flow 9 (Stage 2): Wallet

Screens: balance, holds, history.

- Not built in Stage 1. Stage 2 adds deposit, balance, holds, history, and withdrawal with review states, designed around the chosen payment provider.
- Open decision: whether Stage 1 shows a play-credit rehearsal wallet. If yes, a persistent banner must say play credits, not cash, with no deposit or withdraw actions.

## Flow 10: Inbox

Screens: Notifications tab, Messages tab (match chats and allowed DMs), notification preferences.

- DM entry points appear only for players you completed a match with or accepted as friends. DMs are pending owner confirmation for Stage 1.
- Message actions: block, mute, report.

## Flow 11: Admin

Screens: dashboard (queues and SLA clocks), dispute queue, dispute detail, users, reports, matches, game and format config, feature flags, audit log.

- Dispute detail shows both submissions side by side, screenshots with hash match flags, the match chat, player history, decision templates, and a sanctions action.
- Moderator speed sets the dispute SLA, so this gets real design time.

Stage 2 adds: a payout and withdrawal review queue, refunds, KYC review, fee configuration, and stake-limit settings.

## Notifications catalog

Challenge received, challenge accepted or declined, challenge expiring, result submitted and needs confirmation, result auto-confirmed, dispute opened, dispute ruled, no-show reported, roster invite, friend request, new message, sanction applied. Stage 2 adds: stake held, payout sent, withdrawal status, and KYC result.

## UX decisions (resolved 2026-11-16)

All previously open UX decisions are closed in [decisions/0003-ux-open-decisions.md](decisions/0003-ux-open-decisions.md):

- Auto-confirm copy: "Your opponent has 24 hours to confirm. If they do not respond, the result is confirmed automatically." No credits copy (no play-credit rehearsal).
- Reputation badge: New, Low, Reliable, Trusted, with thresholds on completion and dispute-loss rates over the last 50 matches.
- Leaderboards: usernames only.
- Stage 2 stake-first board: rating-gap warning at 200 Elo, block at 400 for staked play, amounts and fees stated before confirm.
- Restricted DMs: not at launch; built behind the flag in Sprint 14.
