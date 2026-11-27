# Frontend audit — 2026-11-25

## Status after the fixes (same day)

Commits `1612b93`..`8c02617` on `feat/frontend-overhaul`. "After" screenshots are in `after/`. Every app page was checked at 390px with no horizontal overflow; the landing page's only off-screen element is the scrolling game marquee, which is clipped by design.

| Item                                                        | Status                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| F1 `/` landing outside the app shell; signed-in redirect    | Done: `(marketing)`, `(onboarding)` and `(app)` route groups                                                             |
| F2 App frame with rail; mobile overflow                     | Done: `AppPage` and rail widgets; grids use `minmax(0,1fr)`                                                              |
| F3 Dashboard                                                | Done: standing, up next with countdown and checklist, challenges for me, open board, results, activity                   |
| F4 Board scoped to header game, location filter, grid       | Done                                                                                                                     |
| F5 Accept, then match room                                  | Already worked: the stall I saw was the slow dev compile. No confirmation step added                                     |
| F6 Direct challenge                                         | Already existed on `/play` (Players tab). Now also on `/profile/[id]`, where the button did nothing                      |
| F7 Matches tabs                                             | Done                                                                                                                     |
| F8 Match room controls                                      | Already existed (`RoomCodePanel`, `DeadlineCountdown`, no-show in `ResultActions`), gated by state and format. No change |
| F9 Profile per game and sparkline                           | Done. The sparkline is rebuilt from `ratingDelta`; no endpoint needed                                                    |
| F10 Leaderboard "you" row and paging                        | Already existed. Added podium, location column and header-game sync                                                      |
| F11 Realtime                                                | The shared lists now refresh on socket events                                                                            |
| F12 Onboarding consent order                                | Fixed (OTP goes to consent)                                                                                              |
| F13 Copy (`$` coins, play credits, "win")                   | Done                                                                                                                     |
| Found during the fixes: parallel 401s signed the player out | Fixed in `api-client` (single-flight refresh)                                                                            |

**Corrections to the findings below**

- "The web never sends `targetPlayerId`" was wrong. My grep used `\|` with `-E`, so it matched nothing. Direct challenges already existed.
- "`/onboarding/game-ids` also renders the game picker" was wrong. That was the previous route kept mounted but hidden by Next 16 (`<Activity>`); nothing is visible.
- The opponent "game ID" showing their username is demo seed data, not a UI bug.

**Still open**

- Admin restyle (OVERHAUL_PLAN §1.9). Admin pages could not be screenshotted without 2FA.
- Rating history beyond the last 20 matches needs an API endpoint.
- A confirmation step before accepting (spec'd for Stage 2 rating gaps).
- Leaderboard season filter (seasons are not built).

Branch `feat/frontend-overhaul` at `a820d82`, plus another agent's uncommitted edits to the shell, landing page and most app pages. Screenshots are in this folder and were taken at 1440×900 and 390×844, signed in as a seeded local player.

Sources checked: `docs/UX Flow Spec RAISE (Stage 1).md`, `docs/RAISE PRD v2 Staged Rollout.md`, `OVERHAUL_PLAN.md` (locked decisions §1).

## 1. Route model

| Route               | Spec (OVERHAUL_PLAN §1.3) | Today                                                                                                                                                                                                   |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | Public landing page       | Rendered inside the app shell: app nav (Home/Play/Matches/Inbox/Profile), game switcher, "Create challenge" and, in the earlier shell, "Sign out", all shown to logged-out visitors (`01`, `01b`, `64`) |
| `/home`             | Signed-in dashboard       | Exists, but it's thin (see §3)                                                                                                                                                                          |
| `/` while signed in | Redirect to `/home`       | Never fires: `app/page.tsx` checks a `raise_access` cookie, but tokens are stored in `localStorage` (`api-client/src/fetch.ts`)                                                                         |

**Fix:** split the layout into a `(marketing)` route group (public header and footer, no app nav) and an `(app)` group (the shell). Signed-in redirect uses the real auth state.

## 2. Layout: the blank space

| Cause                                                                                                                                                      | Where                                      | Evidence                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| Content is capped at ~880px and centred on a 1440px screen, leaving ~280px empty on each side. There is no second column at desktop widths                 | home, profile, matches, inbox, leaderboard | `10`, `12`, `13`, `14`, `15` |
| Play board is a single column about 510px wide, even on desktop                                                                                            | `/play`                                    | `11`                         |
| Each page has one empty-state card and nothing else around it                                                                                              | matches, inbox                             | `12`, `13`                   |
| Page widths differ: the match room is full width while every other page is capped                                                                          | `/matches/[id]`                            | `31`                         |
| Mobile overflows horizontally: the page renders about 626px wide in a 390px viewport, "Create challenge" is clipped, and the header has two game switchers | all app pages                              | `60`–`63`                    |
| On mobile, each of the 3 stat cards takes its own full-height row                                                                                          | home, profile                              | `60`                         |
| The bottom nav sits over the content and the Next.js dev badge                                                                                             | mobile                                     | `60`                         |

**Fix:** one app layout with `max-w-[1280px]`, and a 12-column grid at `lg`: main area 8 columns, rail 4 columns. Every page gets a right rail (see §3). On mobile the stats sit in a single 3-up row. Fix the header overflow and use one game switcher.

## 3. Page by page: what's missing compared with the docs

### `/home` dashboard (UX spec: Shell, Flow 2, 5, 8)

- **Missing: needs-your-action banner.** `NeedsActionBanner.tsx` exists but nothing showed with an accepted match awaiting play.
- **Bug:** "Your open challenges" lists other players' PUBG challenges. They aren't mine, and they aren't the selected game (eFootball). The rows have no action.
- **Missing:** next-match card with a deadline countdown and a primary action.
- **Missing:** a "Recommended challenges" block for the current game, with an Accept button.
- **Missing:** my leaderboard rank and the players around me, plus the rating change from my last match.
- **Missing:** recent activity (notifications preview).
- **Copy:** pixel `$` coins in the promo banner, and the footer says "Play credits only". Both break locked decision §1.5 and decision 0003 (no play credits).

### `/play` (Flow 2)

- **Bug:** the game filter shows "All games" while the header switcher says eFootball. The global game scope isn't applied.
- **Missing filters:** format, city or campus, rating range, and sort. The PRD calls for stake band first, then game, then local filters.
- **Missing:** the players tab needs search plus "Challenge this player". The API supports direct challenges through `targetPlayerId`, but the web never sends it.
- **Missing:** a confirmation step on accept. The spec says to show a summary before sending.
- **Bug:** after Accept, the toast says "Opening the match room" but the page stays on `/play`.
- **Layout:** use a 2–3 column card grid on desktop, and a rail with "Create challenge" and "My open challenges".

### `/matches` (Flow 4, 5)

- **Missing:** Active / Needs action / History tabs or filters.
- **Missing on rows:** deadline, next required action, and the result with rating change.
- **Missing:** pending incoming and outgoing challenges, including direct challenges.

### `/matches/[id]` match room (Flow 4–6)

- **Missing:** agreed start time and a countdown to start. "Submit result" is disabled with no time shown.
- **Missing:** a room-code field. `PUT /matches/:id/room-code` exists, so this needs checking.
- **Not visible:** "Report no-show" (allowed 20 minutes after start).
- **Bug:** the opponent's "game ID" shows their username (`demo_efoo_69438_0`). This may come from the seed data; needs checking.
- **Not checked:** the confirmed-summary screen (rating and rank change), the dispute tracker and the appeal. No match reached those states in this pass.

### `/profile` and `/profile/[userId]` (Flow 8)

- The "Game IDs" tab repeats what's already on the overview.
- **Missing:** a per-game switcher (I have 2 games), recent matches, a rating-history sparkline, and head-to-head stats on other players' profiles.
- **Missing:** a "Challenge" / "Message" (DM is behind a flag) / "Report" action row on other players' profiles.
- **Bug:** both game IDs show "Verified" straight after entry, with no verification step.

### `/leaderboard` (Flow 8)

- Works, and it's the fullest page.
- **Missing:** highlighting my own row, or a "your rank" bar pinned at the bottom.
- **Missing:** pagination or "load more"; only 24 rows show.
- **Missing:** a season filter.

### `/inbox` (Flow 10)

- Empty state only.
- **Bug:** accepting a challenge should notify the poster. Needs checking from the poster's side.
- The tab row has a stray scroll widget (`13`).

### Onboarding (Flow 1)

- **Bug:** username led to games and skipped consent. "Finish setup" then fails silently because the profile API returns 403 "Accept the current terms".
- **Bug:** `/onboarding/game-ids` also renders the game-picker cards and a second set of "Continue" buttons below the form.
- Inputs filled before hydration are lost (phone and OTP). Low priority.

### Admin (Flow 11)

- Every admin route shows only "Set up two-factor authentication" until 2FA is set up. That is correct behaviour, so the content was not screenshotted.
- The planned admin restyle is still owed (OVERHAUL_PLAN §1.9).

### Public pages

- The landing page is improving (`01b`) but still has app chrome and `$` coins. There is also a stray "Play and win" eyebrow, while the copy rules say no "win big".
- Legal, status and community-rules pages need the marketing layout, not the app shell.

## 4. Features to build for a working frontend (Stage 1 only)

Ranked by how much they make the app feel populated and usable. All of these use existing API endpoints. No backend changes are needed unless a row says so.

| #   | Feature                                                                                                                       | Pages                        | API                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| F1  | Marketing / app route groups, signed-in redirect, public header                                                               | `/`, legal pages             | none                                                                |
| F2  | App grid with a right rail ("what to do next", my rank, my open challenges)                                                   | all app pages                | existing                                                            |
| F3  | Dashboard rebuild: action banner, next match, recommended challenges, rank snapshot, activity                                 | `/home`                      | challenges, matches, leaderboards, notifications                    |
| F4  | Board filters and sort, scoped to the global game, plus a desktop grid                                                        | `/play`                      | `GET /challenges` query params (needs checking)                     |
| F5  | Accept confirmation sheet, and navigate to the match room afterwards                                                          | `/play`, `/challenges/:id`   | `PATCH accept`                                                      |
| F6  | Direct challenge from player search and profiles                                                                              | players tab, `/profile/[id]` | `POST /challenges` + `targetPlayerId`                               |
| F7  | Matches tabs plus incoming and outgoing challenges                                                                            | `/matches`                   | `GET /matches?filter`, challenges                                   |
| F8  | Match room: start time, countdown, room code, no-show, state-driven primary button                                            | `/matches/[id]`              | `room-code`, `no-show`                                              |
| F9  | Profile: per-game switcher, recent matches, rating sparkline, action row                                                      | profiles                     | rating history needs an endpoint; none is visible in the web client |
| F10 | Leaderboard "you" row, pagination                                                                                             | `/leaderboard`               | `GET /leaderboards/:gameKey`                                        |
| F11 | Realtime updates through the existing `lib/realtime.ts` (socket.io) in place of 20-second polling, on home and the match room | home, room, inbox            | gateway exists                                                      |
| F12 | Onboarding fixes: consent order, game-ids page, error surfacing                                                               | onboarding                   | none                                                                |
| F13 | Copy compliance pass: no `$` coins, no "play credits", no "win"                                                               | global                       | none                                                                |
