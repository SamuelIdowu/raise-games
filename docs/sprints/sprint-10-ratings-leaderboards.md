# Sprint 10 — Elo Ratings, Leaderboards & Profile Stats

- Milestone: **M2**
- Stage: 1
- Depends on: Sprint 8 (confirmed results event), Sprint 9 (dispute resolutions), Sprint 4 (profile stats)

## Goal

Per-game Elo with an append-only event log as source of truth, leaderboards per PRD/design spec, and the profile stat grid going live. Acceptance criterion: recomputing from the event log reproduces every rating exactly.

## Features

### F10.1 Rating engine (pure + property-tested)

- Per TA: `RatingEvent` append-only log (match id, player, delta, reason: result/forfeit/ruling), current rating materialized and recomputable
- Math per PRD "Rules": start 1000; K = 32 for first 20 rated matches, then 20; gains diminish after 3 matches vs the same opponent within 7 days (diminishment policy table — `[owner decision]` confirm the numbers; PRD-proposed implementation: diminishing K factor below)
- Provisional until 10 rated matches (threshold `[owner decision]` default 10); provisional players excluded/flagged on leaderboard per Design badge
- One rating per (player, game) — cross-game isolation (rating per game, not platform-wide)

### F10.2 Event flow

- `match.confirmed` (F8.4) + `dispute.ruled` (F9.3) events land in the rating consumer (outbox-driven); forfeits/rulings map to program events `match.forfeited` produce rating events with policy flags (void → no rating change, from F9.3 splits)
- Ratings update within the 5s auto-confirm acceptance budget — measured + tested (F8.4 criterion continues here)
- Optimistic update served from events; materialized rating stored on GameProfile (upsert + delta cache)

### F10.3 Leaderboards

- Per-game (bugged rank via switcher), confirm-only matches counted (PRD acceptance criterion), provisional players excluded or flagged (chosen default: flagged, doc-faithful to badge style)
- Filters: campus, city (PRD UX Flow 8), all-time; season-period filter placeholder (later)
- Rank change notification path exists (event→notification in Sprint 11 catalog)
- API: cursor-paged, cache-friendly (leaderboard version stamp for 5s-fresh check)

### F10.4 Leaderboard UI (Design §8)

- Row at 56px mobile: rank, avatar+username, rating (tabular), W-L, trend arrow; viewer's own row pinned at bottom when outside the viewport; sticky filters (game, campus/city, period placeholder); top-3 accent notch
- Rank tier badges (chamfered, notches 1–5, tier 5 glow) + provisional marker hollow version
- Profile stat grid current: rank, rating, record, streak, reputation badge updates (reputation badge reads F4.5/F9 data)

## Design compliance

- All Design §8 leaderboards/player-profile header specs; numerals tabular everywhere; color rules (no dispute hue for neutral; tier = accent only)
- a11y: SR labels with provisional wording explicitly (doc example "Rating 1,284, provisional")
- Count-up signature moment goes live on confirmed summary (with reduced-motion off)

## Files and references

| Ref                                                                                                                                                                                   | What                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Rules" (Elo), §"Stake-first controls" (provisional labeling), §"Stage 1 acceptance criteria" (rating recompute + leaderboards confirmed-only) | Math + criteria                    |
| `docs/Technical Architecture RAISE.md` §Data model (Ratings)                                                                                                                          | Event log approach                 |
| `docs/Design System RAISE (Stage 1).md` §8 Rating/rank/reputation badges, Leaderboard row, Player profile header                                                                      | UI                                 |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 8                                                                                                                                         | Screens                            |
| `packages/types`                                                                                                                                                                      | Match-state + rating-reason unions |
| `sprints/sprint-08`/`-09` files                                                                                                                                                       | Event contracts consumed           |

## Skills, agents, MCP and tools

| Kind  | Resource                                       | Use for                                                                                                              |
| ----- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Skill | `supabase-postgres-best-practices`             | RatingEvent table + leaderboard query indexes (per game + period)                                                    |
| Skill | `senior-architect`                             | ADR: materialized rating vs view recomputation strategy                                                              |
| Skill | `verify` / `qa` / `test-audit` / `code-review` | Standard loop                                                                                                        |
| Skill | `emil-design-eng` / `review-animations`        | Count-up implementation review (must be 240–400ms, reduced-motion off)                                               |
| Skill | `accessibility`                                | Leaderboard SR announcements, trend semantics (icon + label, never color)                                            |
| Skill | `frontend-design` + `design-review`            | Board badge fidelity                                                                                                 |
| Agent | `explore`                                      | Outbox consumer patterns from Sprints 8/9 to extend                                                                  |
| Agent | `general`                                      | Eval Elo libraries vs hand-rolled pure module (prefer own pure TS: small math; library only as cross-test reference) |
| MCP   | `context7`                                     | Drizzle aggregations/windows; BullMQ repeatable recompute job; SWR revalidation on tab                               |
| MCP   | `github`                                       | `[owner decision]`: diminishing rule numbers turn; PRs                                                               |
| Tools | `todowrite` F10.1–F10.4                        | Tracking                                                                                                             |
| Tools | `bash`, `read`/`write`/`edit`, `question`      | Implementation + decision                                                                                            |

## Testing

- Property/quickcheck: the recompute-from-events equals materialized for random histories (fuzz N=10k events) — the PRD acceptance criterion as a test
- Unit: K transitions at match 20; same-opponent 7-day graying; provisional boundary at 10; void produces no delta; draw/tie behavior per game config
- Integration: `match.confirmed` → rating event → profile rating visible (path through outbox); `dispute.ruled` void-win correctly zero-deltas
- E2E: two-browser match → confirmed summary shows delta per player; leaderboard reflects new ratings, confirmed matches only ( sabotage: pending/disputed matches excluded)
- UI: pinned own-row behavior at various list positions; filters actually change results; provisional display behavior

## Audit

- `review` on rating math (recheck published PRD rules verbatim in tests) — a wrong K or wrong window is an acceptance-killer issue
- Fairness audit: opponent-relative deltas symmetric; forfeit penalty equivalent for both sides of riddance symmetric policies documented
- Snapshot safety: rating changes logged in audit trail for disputes intake (Sprint 12 evidence view needs them)

## Checklist

- [ ] F10.1 RatingEvent log + pure Elo module with PRD rules implemented; provisional marking; per-game isolation
- [ ] F10.2 Events from confirmed results/rulings/forfeits all produce correct rating events; 5s budget measured
- [ ] F10.3 Leaderboard API: per-game, confirmed-only, campus/city filters, cursor paging, cache-fresh
- [ ] F10.4 UI per Design §8: rows, pinned own row, top-3 notches, badges, profile stat grid, count-up live with reduced-motion respect
- [ ] Recompute-equality property test green (fuzz + spot archives) — acceptance criterion met
- [ ] `[owner decision]`: Elo numeric parameters + reputation thresholds (or working-default per PRD with issue)
- [ ] Testing green; audits clean
- [ ] `ship` close with PR + CHANGELOG
