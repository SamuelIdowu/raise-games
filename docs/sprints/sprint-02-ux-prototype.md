# Sprint 2 — UX Prototype (Stage 1 Flows)

- Milestone: **M1** (Delivery Plan weeks 1–4; runs parallel with Sprints 0–1)
- Stage: 1
- Depends on: Sprint 1 components (can start on scaffolding and swap components in as they land)
- Exit criteria (Delivery Plan M1): clickable prototype passing testing with **8–10 real players** on the challenge, result-submission, and dispute flows; open UX decisions closed

## Goal

Assemble the Stage 1 screens from the design system components into a clickable prototype that covers every flow in `docs/UX Flow Spec RAISE (Stage 1).md` **except** Team and Wallet. Prototype-first: happy-path flows may be mocked (no real backend needed); the backend wiring arrives Sprints 3–11.

## Features

### F2.1 App shell

Per UX "Shell and principles":

- Mobile bottom nav: Home, Play, Matches, Inbox, Profile — 56px + safe-area inset, 24px icons with always-visible 12px labels, active = accent icon + 2px top bar; badge behaviors per Design §8 (dot or ≤99+ count; Matches badge counts items needing action)
- Desktop: 240px left sidebar collapsing to 72px icons at breakpoints
- Game switcher at top scoping boards/ladders/profiles per UX
- Persistent needs-your-action banner surfacing pending confirmations/expiring challenges (accent, persists until resolved)
- Every screen has one obvious primary action (Design principle); every empty state offers the next action

### F2.2 Onboarding flow (UX Flow 1)

Screens: landing → phone entry + OTP → username → pick games → add game IDs (optional profile screenshot) → Home

- Target-under-90s flow shape (per PRD acceptance criterion); state-of-residence ask in plain language (stored for jurisdiction flags)
- Uses F1.4 OTP cells + Input; game picker driven by `packages/game-configs` stub titles

### F2.3 Find and challenge (UX Flow 2)

- Play tab: game filter, open challenge board, player search
- Challenge card per Design §8: Row 1 game+format chip left / stake slot right (**reads "Free" in Stage 1**), Row 2 poster avatar+username+rating+record+reputation, reserved collapsed rating-gap slot between rows 2–3 (Stage 2 ready — layout must not shift later), Row 3 time window+expiry, Row 4 Accept (primary md) + Details (ghost)
- Card states: default, desktop hover (border-strong), pressed (bg-3), expired (muted + disabled reason), mine ("Your challenge" + Cancel)
- Challenge sheet collects format/rules/time window/stake then shows summary before send

### F2.4 Accept flow (UX Flow 3)

- Notification → challenge detail → Accept/Decline → match room appears; Stage 2 held-stake shown as designed placeholder

### F2.5 Match room prototype (UX Flow 4)

- Status timeline (vertical stepper per Design §8: steps Accepted/Play/Submit result/Confirm/Done; done=current=upcoming=blocked states + dispute branch inline), compact horizontal summary on mobile
- Opponent card with reputation, game ID chip + copy button, rules, deadline countdown (relative time, absolute on tap, user's timezone — WAT default)
- Report no-show and Submit result affordances; the primary button changes with match state

### F2.6 Result submission + confirmation (UX Flow 5)

- Submit sheet per Design §8: outcome selector (won/lost/draw-if-allowed/no-show), score steppers from game config, screenshot upload UI (compression + retry states simulated offline), optional 200-char note, summary line with the plain-language auto-confirm copy
- Confirmed summary: rating change, rank change + the **count-up signature moment** stub; payout view reserved for Stage 2

### F2.7 Dispute flow (UX Flow 6)

- Open dispute (reason + extra evidence), status tracker (both sides same view), ruling view with moderator reason, single-appeal affordance

### F2.8 Leaderboards + profile (UX Flow 8)

- Leaderboard row per Design §8 (56px mobile, tabular numerals, own-row pinned, top-3 accent notch, sticky filters: game, campus/city, period placeholder)
- Player profile header per Design §8 (64 avatar, username, game ID chips + copy toast, per-game tabs, stat grid: rank/rating/record/streak/reputation, recent matches; sticky Challenge button on mobile)

### F2.9 Inbox (UX Flow 10)

- Notifications tab grouped by day (icon/body-sm 600 title/caption time/unread dot), taps open the related object; Messages tab stub (enabled only if DMs confirmed — see F2.10); notification preferences screen
- Simulate the Stage 1 notification catalog categories for realism

### F2.10 Owner-decision gates

- `[owner decision]` restricted DMs in Stage 1: prototype the Messages tab minimally; hidden behind a flag disabled by default until confirmed
- `[owner decision]` play-credit rehearsal: if yes, prototype the credits wallet screen with the persistent "play credits, not cash" banner (UX Flow 9); leave out otherwise

### F2.11 Player testing harness

- Deploy prototype to staging URL (phone-first: e.g. Vercel preview staging path)
- Run 8–10 test sessions (recruit per Delivery Plan: players of the three games, mobile-first, on-device)
- Capture: task success on challenge → result-submission → dispute paths; 90-second onboarding reality check; comprehension of auto-confirm copy; stuck points
- Findings become issues; open UX decisions (UX doc §Open decisions) driven to resolution: auto-confirm exact copy, reputation badge design, leaderboard name display, Stage 2 stake-first design notes, DM decision

## Design compliance

- Strict fidelity to Design §8 component specs + §9 content rules (voice: direct/calm/confident; preferred words challenge/match/result/dispute/rating; **avoid bet/wager/jackpot/odds**; WAT timezone format; `Sat 7 Nov, 6:30 pm` dates; thousands separators)
- Local flavor (light Pidgin) only in optional non-critical copy behind i18n — never in rules/disputes/payments (doc §9)

## Files and references

| Ref                                                                                           | What                                                                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `docs/UX Flow Spec RAISE (Stage 1).md`                                                        | Every flow above; the "Open UX decisions" list is this sprint's owner-questionnaire |
| `docs/Design System RAISE (Stage 1).md` §§1–14                                                | Components, content voice, a11y, perf                                               |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Stage 1 user stories", §"Stage 1 acceptance criteria" | Story + acceptance alignment for the prototype; onboarding 90s criterion            |
| `docs/Delivery Plan RAISE.md` §M1                                                             | Exit criteria + player-testing approach                                             |
| `sprints/sprint-01-design-system.md`                                                          | Where components come from                                                          |

## Skills, agents, MCP and tools

| Kind  | Resource                                    | Use for                                                                                                        |
| ----- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Skill | `frontend-design` / `design-taste-frontend` | Keep assembled screens sharp, not templated; audit-first per existing components                               |
| Skill | `design-review`                             | Fidelity + slop pass on assembled screens                                                                      |
| Skill | `webapp-testing`                            | Drive the prototype in a real browser for self-QA: click-through each flow, screenshots, console error capture |
| Skill | `accessibility`                             | Onboarding + match room keyboard/screen-reader pass                                                            |
| Skill | `vercel-react-best-practices`               | Client bundle discipline early (prototype must already honor the 3G budget instinct)                           |
| Skill | `qa`                                        | Bug sweep before player testing                                                                                |
| Skill | `spec`                                      | Where a flow is ambiguous, distill before building                                                             |
| Skill | `investigate`                               | Root-cause any repeated tester stumble before redesign                                                         |
| Skill | `learn` / `retro`                           | Persist testing findings + process notes                                                                       |
| Agent | `explore`                                   | Locate all reusable Sprint 1 components; find duplicated screen-level styles                                   |
| Agent | `general`                                   | Build parallel screens (onboarding, board, match room) simultaneously                                          |
| MCP   | `context7`                                  | Next.js App Router patterns, navigation/shell patterns, safe-area/web in PWA                                   |
| MCP   | `github`                                    | Issues per flow; player-testing findings as labeled issues; PRs                                                |
| Tools | `todowrite` F2.1–F2.11                      | Tracking                                                                                                       |
| Tools | `question`                                  | The owner-decision gates in F2.10 (DMs, credits)                                                               |
| Tools | `bash`, `read`/`write`/`edit`               | Implementation; deploys via bash                                                                               |

## Testing

- Self-QA: Playwright click-through of every flow; zero console errors; screenshots archived per screen (dark default)
- Device realism: test on low-end Android profile — throttled 3G, 360px width, bright-light contrast assumption (Design principle)
- Player testing: logged sessions per participant (task, time, blockers); aggregate pass rates for the three target flows; 90s onboarding median check
- A11y: axe + manual SR on one flow end-to-end
- Prototype performance spot-check: first load < 3s throttled 3G on the main route

## Audit

- `design-review` on every screen (drift vs Design §7/§8 tables)
- `accessibility` pass on assembled flows (not just components)
- Content audit vs Design §9: no casino vocabulary anywhere; tense/tone check; WAT formats
- Feature-flag audit: DM + credits features confirmed hidden unless owner says yes
- Session findings reviewed with the owner → each closed into: doc amendment (PRD/UX/Design), issue, or accepted-as-is note

## Checklist

- [x] F2.1 Shell complete: 5-item bottom nav with badges, sidebar, switcher, needs-action banner, one-primary-action rule
- [x] F2.2 Onboarding flow clickable end-to-end incl. OTP cells, game IDs, state-of-residence ask
- [x] F2.3 Play tab + challenge board + cards with all states incl. reserved rating-gap slot (collapsed, zero layout shift) + challenge sheet with summary
- [x] F2.4 Accept → match room transition works
- [x] F2.5 Match room with timeline/states/countdowns + no-show + submit affordances
- [x] F2.6 Submit sheet incl. upload states + confirmed summary with count-up stub
- [x] F2.7 Dispute flow: open → tracker → ruling → appeal, single appeal affordance
- [x] F2.8 Leaderboard + profile per spec (pinned own row, sticky filters)
- [x] F2.9 Inbox with catalog simulation + preferences; Messages tab behind disabled flag
- [x] F2.10 Owner answers recorded: restricted DMs `[decision: disabled]` / play-credit rehearsal `[decision: disabled]` (feature flags added)
- [ ] F2.11 8–10 player sessions run; findings filed as issues; three target flows pass testing
- [ ] UX doc "Open decisions" driven to closure (auto-confirm copy, reputation badge, leaderboard names, Stage 2 board notes)
- [~] Testing block complete incl. player-session summaries (Storybook visual + a11y tests pass; Next.js route testing requires dev server setup)
- [ ] Audit block done; zero design drift findings open
- [ ] Sprint closed via `ship` → **Delivery Plan M1 exit met**
