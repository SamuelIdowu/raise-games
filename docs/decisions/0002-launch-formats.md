# 0002 — Launch formats per game

- Status: **Decided** (2026-11-16), on the owner's instruction to close open items from research
- Closes: Sprint 4 "format decisions recorded `[owner decision]`"

## Decision

Stage 1 launches **one Duel (1v1) format per game**:

| Game                 | Format key | Name                     | Score model | Room                        |
| -------------------- | ---------- | ------------------------ | ----------- | --------------------------- |
| eFootball            | `1v1_duel` | 1v1 Duel                 | goals       | none (in-game friend match) |
| Call of Duty: Mobile | `mp_duel`  | Multiplayer 1v1 Duel     | kills       | optional private match code |
| PUBG Mobile          | `tdm_duel` | 1v1 Team Deathmatch Duel | kills       | optional custom room code   |

## Why

The PRD ("Games and match formats") sets the scope:

- "Duel (1v1): Stage 1. Team (NvN…): Stage 4. Lobby (battle royale scrims…): Stage 4."
- "Launch each game with one or two formats only. Proposed: eFootball Duel; CODM Duel; PUBG Mobile Duel in custom rooms."

The config that shipped in Sprint 4 did not follow this. It offered CODM "Battle Royale Duo" and PUBG "Battle Royale Solo" and "Battle Royale Duo". "Duo" is a two-player team, which is Team play, Stage 4. Battle royale placement is a 100-player Lobby, also Stage 4. PUBG also had no Duel at all. A placement comparison inside a public lobby is weak evidence too: the two players are not playing each other, and a lobby screenshot shows one player's placement, not the outcome between them.

A 1v1 Team Deathmatch is the PRD's "Duel in custom rooms": both players are in the same match, and the end screen shows both kill counts, which is exactly what two-sided verification compares. There are two ways to play it:

- **In-lobby 1v1 Arena challenge** (added in v3.8): challenge the other player from the lobby; played on Arena – Warehouse, first to 5 eliminations. No room card needed.
- **Custom TDM room**: hosting needs a room card (from levelling, the Royale Pass, the clan shop or UC). That is a cost barrier, so the room code is `optional`, not `required`.

Sources: [Sportskeeda — custom rooms and room cards](https://www.sportskeeda.com/esports/pubg-mobile-custom-room-creation), [GuruGamer — creating a custom room](https://gurugamer.com/mobile-games/how-to-create-custom-room-in-pubg-mobile-9613), [r/PUBGMobile mirror — v3.8 1v1 Arena challenge](https://reddit.birdcat.cafe/r/pubgmobile). Re-check the in-game menus at launch, since modes change between seasons.

## Consequences (done in this change)

- `packages/game-configs/games.json` now has one Duel per game, per the table above.
- `game_formats.status` added (`enabled` | `disabled`). The seed disables formats that leave the config instead of deleting them, so past challenges still resolve their format while new challenges and the games list only offer enabled ones.
- Two-format launches stay possible later by adding a config entry (the "4th game, zero code changes" test still holds).
