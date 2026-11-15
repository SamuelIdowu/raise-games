import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export type RoomCodeMode = 'none' | 'optional' | 'required';

let cache: Map<string, RoomCodeMode> | null = null;

/**
 * Per-game room-code exchange from games.json (Sprint 6 F6.5). Read from the JSON file
 * rather than the `@raise/game-configs` package root: the root imports games.json as an
 * ES module, which the compiled CommonJS API cannot load (same approach as db/seed.ts).
 */
export function roomCodeModeFor(gameKey: string): RoomCodeMode {
  if (!cache) {
    const require = createRequire(__filename);
    const file = require.resolve('@raise/game-configs/games.json');
    const json = JSON.parse(readFileSync(file, 'utf-8')) as {
      games: Array<{ key: string; roomCode?: RoomCodeMode }>;
    };
    cache = new Map(json.games.map((g) => [g.key, g.roomCode ?? 'none']));
  }
  return cache.get(gameKey) ?? 'none';
}
