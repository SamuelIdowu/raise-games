import { z } from 'zod';
import gamesJson from '../games.json';

export const gameFormatSchema = z.object({
  key: z.string().min(1),
  name: z.string(),
  resultSchema: z.object({
    outcomeOptions: z.array(z.enum(['win', 'loss', 'draw'])).min(1),
    scoreModel: z.enum(['goals', 'kills', 'placement', 'points']),
    drawAllowed: z.boolean(),
  }),
  requiredProof: z.array(z.enum(['screenshot', 'score', 'none'])).min(1),
  tiebreakRules: z.string().min(1),
});

export type GameFormat = z.infer<typeof gameFormatSchema>;

export const idFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number']),
  required: z.boolean(),
});

export type IdField = z.infer<typeof idFieldSchema>;

export const gameConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['enabled', 'disabled']).default('enabled'),
  idFields: z.array(idFieldSchema).min(1),
  formats: z.array(gameFormatSchema).min(1),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;

export interface GamesJson {
  games: GameConfig[];
}

const parsed = gameConfigSchema.array().safeParse(gamesJson.games);

if (!parsed.success) {
  throw new Error(`Invalid games.json: ${parsed.error.message}`);
}

export const games: GameConfig[] = parsed.data;

export const gamesByKey = new Map(games.map((g) => [g.key, g]));

export interface GameWithFormats extends GameConfig {
  formats: GameFormat[];
}
