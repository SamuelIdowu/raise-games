# Sprint 4 — Games, Game Config & Player Profiles

- Milestone: **M2**
- Stage: 1
- Depends on: Sprint 3 (authed users), Sprint 1 (components)

## Goal

Games are configuration, not code (PRD): each game record defines its ID fields, formats, result schema, required proof, and tiebreak rules. This sprint builds the games module + profiles module so players get per-game identities with IDs, ratings (provisioned), and stats — and ends the sprint ready for the discovery board (Sprint 5) to consume real GameProfiles.

## Features

### F4.1 game-configs package content

- JSON config per launch game: eFootball, CODM, PUBG Mobile (custom rooms) — `[owner decision]` further formats (PRD: propose Duel each; confirm before build)
- Config fields (PRD "Games and match formats"): id fields list, supported formats, result schema (outcome options, score model, draw allowed?), required proof type (screenshot), tiebreak rules
- Zod validation of config shape; API validates incoming results against the game's schema (GameFormat JSONB — TA data model)

### F4.2 Games module (API + admin-ready config)

- Tables: `games`, `game_formats` (per TA data model) seeded from `packages/game-configs` via seed script (Setup Guide §10.3 mentions demo-ladder seeds; games seed here)
- Read endpoints (public): list games, get game + formats; no config-edit endpoints yet beyond admin generic (Sprint 12)
- Futureproofing: formats reference result schema validated in code (TA explicit); scaffold for game-specific verification rules (OCR explicitly out of scope)

### F4.3 Profiles module — GameProfile

- Table per TA: user, game, in-game ID, rating (default 1000), stats (record W-L-D, streak, provisional flag)
- CRUD: add/edit in-game ID per game; uniqueness per (user, game); optional profile screenshot upload (owned-upload path reused from Sprint 8's presign approach or basic direct upload with validation — choose fastest, note `[confirm]`)
- City/campus field on profile (feeds Discovery filters + local ladders, PRD)
- Ratings read: current rating + provisional state (provisional until 10 rated matches — proposed threshold `[owner decision]` default 10)

### F4.4 Profile UI

- Own profile + other-player profile per Design §8 "Player profile header": 64 avatar, username, game ID chips with copy button (confirm toast), per-game tabs, stat grid (rank, rating, record, streak, reputation placeholder→Sprint 12), recent matches list (data: confirmed matches, delivered real once results exist in Sprint 8 — stub empty state until then)
- Sticky Challenge button on mobile (profile → Challenge opens Sprint 5/6 sheet, wired when challenge sheet lands)
- Game switcher integration: profile tabs scoped by switched game

### F4.5 Reputation placeholder

- Column + read path exist; badge "New" for everyone initially (design §8 reputation badge variants); real engine in Sprint 12

## Design compliance

- Profile header/table/details per Design §8; stat numerals tabular (stat-lg/stat-md tokens)
- Game identity = text labels + neutral monograms (publisher branding ban — Design §6, Delivery Plan risk "Use text names until confirmed")
- Copy-game-ID toast per doc ("confirm with a toast")

## Files and references

| Ref                                                                                                               | What                               |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `docs/RAISE PRD v2 Staged Rollout.md` §"Games and match formats", §"Stage 1 user stories → Accounts and profiles" | Config-first games, ID user story  |
| `docs/Technical Architecture RAISE.md` §Data model (Games), §Modules                                              | Game/GameFormat/GameProfile tables |
| `docs/Design System RAISE (Stage 1).md` §8 Player profile header, §6 imagery, §3 tabular numerals                 | UI specs                           |
| `docs/UX Flow Spec RAISE (Stage 1).md` Flow 8                                                                     | Profile screens                    |
| `sprints/sprint-02-ux-prototype.md` F2.8                                                                          | Prototype profile to productize    |
| `packages/game-configs`                                                                                           | Config source                      |

## Skills, agents, MCP and tools

| Kind  | Resource                                                      | Use for                                                                                 |
| ----- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Skill | `spec`                                                        | Distill the game-config JSON contract before coding (result-schema shape decisions)     |
| Skill | `supabase-postgres-best-practices`                            | Schema for games/formats/profiles (constraints, unique (user,game), indexes)            |
| Skill | `frontend-design` / `design-taste-frontend` + `design-review` | Profile UI fidelity                                                                     |
| Skill | `verify` / `qa` / `test-audit` / `code-review`                | Standard loop                                                                           |
| Skill | `accessibility`                                               | Tabs, copy buttons, stat grid SR labels ("Rating 1,284, provisional" — doc §10 example) |
| Agent | `explore`                                                     | Find existing seeded-table pattern + upload helpers                                     |
| MCP   | `context7`                                                    | Zod JSONB validation patterns, Drizzle seeds                                            |
| MCP   | `github`                                                      | Per-game format confirmation `[owner decision]` issues; PRs                             |
| Tools | `todowrite` F4.1–F4.5                                         | Tracking                                                                                |
| Tools | `bash`, `read`/`write`/`edit`, `question`                     | Implementation + format decision                                                        |

## Testing

- Unit: config schema validation rejects a malformed game; rating/provisional defaults; uniqueness enforcement
- Integration: seed script runs on clean DB; profiles CRUD as authed user; game switcher queries scope correctly
- E2E: complete onboarding → add eFootball ID → profile shows ID chip + copy toast + "New" reputation + provisional rating
- Edge: adding the same in-game ID as another user (allowed? document decision: in-game IDs are not unique globally — pick + record); screenshot of profile screenshot feature (if included: type/size validation)

## Audit

- `code-review` ritual; config-driven-check: adding a dummy 4th game config must work end-to-end with zero code changes (the PRD's whole point) — test proving it
- A11y on tabs/copy/stat grid
- Check the formats proposal matches PRD "Launch each game with one or two formats only" — backfill decision record

## Checklist

- [x] F4.1 Config JSONs for the three games validated by Zod; schema covers id fields/formats/result schema/proof/tiebreak
- [x] F4.2 games + game_formats tables seeded; public read endpoints (GET /games, /games/:key); adding a 4th game requires zero code edits
- [x] F4.3 GameProfiles CRUD live; unique per (user, game); rating/stats/provisional defaults correct; city/campus settable
- [x] F4.4 Profile UI per Design §8 incl. copy toast, tabs, stat grid, recent matches empty state, sticky Challenge (public profile page wired to API with displayName join)
- [x] F4.5 Reputation placeholder shows "New" for all users (enum + DTO field present)
- [ ] Testing block green (seed, CRUD, e2e, config-extensibility)
- [ ] Audit block clean; format decisions recorded `[owner decision]`
- [ ] `ship` close with PR + CHANGELOG
