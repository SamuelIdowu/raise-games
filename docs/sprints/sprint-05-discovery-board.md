# Sprint 5 — Discovery & Challenge Board

- Milestone: **M2**
- Stage: 1
- Depends on: Sprint 4 (games, profiles), Sprint 1 (components), Sprint 2 prototype F2.3

## Goal

The Play tab: browse games, see player discovery, and the open challenge board. Stage 1 sorts Free with RECENCY (PRD: stake-band sort appears in Stage 2); the card already carries every Stage 2 field to avoid a re-layout. Player search by game, rank, campus/city per PRD story.

## Features

### F5.1 Challenge board API

- `GET /challenges?game=&status=open&campus=&city=&cursor=` — paginated (cursor, ≤50/page), sorted by created_at desc (recency; Stage 1)
- Response shape per challenge card payload: game+format, time window/expiry, poster profile (avatar/username, per-game rating + provisional flag, W-L record, reputationbadge class), stake block `{amount: 0, currency: 'NGN', display: 'Free'}`, `rating_gap` slot present but null (Stage 2 field — PRD reserved layout)
- Filters: game, campus/city search input on GameProfile; no stake-band filter UI until Stage 2 (PRD); API reserves the param silently

### F5.2 Player discovery/search

- `GET /players/search?game=&rank=&campus=&city=` per PRD "filter players by game, rank, and campus or city" — server-side, cursor-paged, capped results with rank/rating/record/reputation shown per Design §8 risk display
- Rank tier derived for display (Rookie→Champion labels — pending names `[owner decision]` from Design §8 open list, default proposed names)

### F5.3 Play tab UI

- Assembled from prototype F2.3: game filter (switcher-scoped), challenge board feed, player search view, empty states per Design §8 ("No open challenges for this game yet. Create one.")
- Challenge card component finalized (Design §8 row structure + states: default/hover/pressed/expired/mine/featured corner ticks)
- "Create challenge" primary action opens the create sheet (built in Sprint 6; placeholder opens summary-always-free sheet endpoint-ready)

### F5.4 Real-time board freshness

- Board updates via the socket when open challenges change (accepted → disappears; created → appears) with polling fallback per TA (socket built Sprint 7; until then 15–30s polling — acceptable per UX budget; note the switch)
- Needs-your-action banner shows count of expiring/approaching challenges (ties into notification engine, Sprint 11)

### F5.5 Abuse + fairness backend data from day one (PRD §Stake-first controls data model)

- Poster's repeat-pairing counters + rating-gap value computed and stored even when hidden (Stage 2 UI uses it without backfill) — TA risk "in the data model from Stage 1"

## Design compliance

- Card anatomy is doc-specified (§8): row order, reserved collapsed slot, tabular numerals, chip styles
- Colors: never bare status colors on neutral states; needs-action = accent (not dispute) — reseeding per doc §2 reserved colors
- Empty states' next action wired, not decorative

## Files and references

| Ref                                                                                                           | What                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 2 + Stage 2 notes                                                 | Screens, card display, reserved behaviors        |
| `docs/Design System RAISE (Stage 1).md` §8 Challenge card, §7 Status model                                    | The card + status chips                          |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Stake-based discovery", §"Users", §"Stage 1 user stories → Discovery" | Stake-first kindred data + Stage 1 sort behavior |
| `docs/Technical Architecture RAISE.md` §Data model (Play), §Real-time (polling fallback)                      | Challenge table + board transport                |
| `sprints/sprint-02-ux-prototype.md` F2.3                                                                      | Prototype to productize                          |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                          |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Skill | `frontend-design` / `design-taste-frontend`    | Board composition (compiled doc rules over taste skills)                                         |
| Skill | `design-review` / `accessibility`              | Card fidelity, contrast, focus order, SR card summaries                                          |
| Skill | `vercel-react-best-practices`                  | List virtualization/skeletons/infinite scroll perf patterns                                      |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                                    |
| Skill | `webapp-testing`                               | Browser-drive search + filters + card states                                                     |
| Agent | `explore`                                      | Find cursor-pagination + games-module types to reuse                                             |
| Agent | `general`                                      | Research cursor-pagination + board caching in parallel with UI build                             |
| MCP   | `context7`                                     | Nest cursor pagination patterns; Next data fetching/streaming; socket client (ahead of Sprint 7) |
| MCP   | `github`                                       | Issues for tier-name decision; PRs                                                               |
| Tools | `todowrite` F5.1–F5.5                          | Tracking                                                                                         |
| Tools | `bash`, `read`/`write`/`edit`                  | Implementation                                                                                   |

## Testing

- Unit: card payload mapper (stake display → "Free", provisional flag, reputation class); filter builder; repeat-pairing counter increments correctly
- Integration: pagination determinism (no dupes across pages); filter combos (game×campus×live status); expired challenge excluded from default sort or displayed muted per Design card state
- E2E: create user + challenge (fixture) → other user's board sees it live; filter campus works; search-by-rank works; card interactions (hover/press/mine/expired) visually verified via screenshots
- Perf: board 500-char load under 3s 3G; cursor page ≤50

## Audit

- `design-review` + `accessibility` (board + cards)
- Stage-2-proof check: PRD reserved fields exist in payload + DB schema (rating_gap, earning band fields) and front-end slot renders collapsed — zero re-layout contract
- Data-minimization: player search exposes only doc-listed fields (no phone, email, jurisdiction) — check the exported payload
- Rate limits on search/board endpoints documented

## Checklist

- [x] F5.1 Board API with pagination + filters; payload carries Stage 2 reserved fields (stake display "Free")
- [x] F5.2 Player search API per PRD filters; only allowed fields exposed
- [ ] F5.3 Play tab UI done; card states incl. featured ticks/mine/expired; empty states actionable
- [x] F5.4 Board freshness via polling (documented) + needs-action banner counts (socket contract noted for Sprint 7)
- [x] F5.5 Repeat-pairing + rating-gap data computed from day one; no re-layout needed later
- [x] Testing green (unit/integration) — e2e/perf deferred to Sprint 7
- [ ] Audit clean: design-review, accessibility, data-minimization check
- [x] `[owner decision]`: rank tier names confirmed (Rookie→Challenger→Contender→Elite→Champion)
- [ ] `ship` close with PR + CHANGELOG
