/**
 * Seed — Syncs games + game_formats from packages/game-configs/games.json into
 * the DB. Games are configuration, not code: adding a new game here requires
 * zero code changes (test proves it in packages/game-configs/src/index.test.ts).
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { db, schema } from './client';
import { v7 as uuidv7 } from 'uuid';
import { eq, and } from 'drizzle-orm';

interface GameConfig {
  key: string;
  name: string;
  idFields: Record<string, unknown>;
  status?: string;
  formats: Array<{
    key: string;
    name: string;
    resultSchema: Record<string, unknown>;
    requiredProof: string[];
    tiebreakRules?: string;
  }>;
}

interface GamesJson {
  games: GameConfig[];
}

let gamesJsonCache: { default: GamesJson } | null = null;

function loadGamesJson(): GamesJson {
  if (gamesJsonCache) return gamesJsonCache.default;
  const require = createRequire(__filename);
  const filePath = require.resolve('@raise/game-configs/games.json');
  const mod = { default: JSON.parse(readFileSync(filePath, 'utf-8')) as GamesJson };
  gamesJsonCache = mod;
  return mod.default;
}

export async function seed() {
  const gamesJson = loadGamesJson();

  for (const game of gamesJson.games) {
    // Upsert game
    const [upsertedGame] = await db
      .insert(schema.games)
      .values({
        id: uuidv7(),
        key: game.key,
        name: game.name,
        idFields: game.idFields,
        status: game.status ?? 'disabled',
      })
      .onConflictDoUpdate({
        target: schema.games.key,
        set: {
          name: game.name,
          idFields: game.idFields,
          status: game.status ?? 'disabled',
        },
      })
      .returning({ id: schema.games.id });

    const gameId = upsertedGame.id;

    // Upsert formats
    for (const format of game.formats) {
      await db
        .insert(schema.gameFormats)
        .values({
          id: uuidv7(),
          gameId,
          key: format.key,
          name: format.name,
          resultSchema: format.resultSchema,
          requiredProof: format.requiredProof,
          tiebreakRules: format.tiebreakRules,
        })
        .onConflictDoUpdate({
          target: [schema.gameFormats.gameId, schema.gameFormats.key],
          set: {
            name: format.name,
            resultSchema: format.resultSchema,
            requiredProof: format.requiredProof,
            tiebreakRules: format.tiebreakRules,
          },
        });
    }
  }

  // Record seed completion only once (optional: could upsert based on subjectId)
  await db
    .insert(schema.outboxEvents)
    .values({
      id: uuidv7(),
      type: 'seed.completed',
      subjectId: 'bootstrap',
      payload: { gamesSeeded: gamesJson.games.length },
    })
    .onConflictDoNothing();
}

const invokedDirectly = process.argv[1]?.includes('seed');
if (invokedDirectly) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
