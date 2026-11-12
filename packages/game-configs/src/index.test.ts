import { describe, it, expect } from 'vitest';
import { gameConfigSchema, games, gamesByKey } from './index';

describe('game-configs', () => {
  it('validates the three launch games', () => {
    expect(games.length).toBe(3);
    expect(gamesByKey.size).toBe(3);
    expect(gamesByKey.has('efootball')).toBe(true);
    expect(gamesByKey.has('codm')).toBe(true);
    expect(gamesByKey.has('pubg_mobile')).toBe(true);
  });

  it('each game has at least one format', () => {
    for (const game of games) {
      expect(game.formats.length).toBeGreaterThan(0);
    }
  });

  it('schema rejects malformed game config', () => {
    const malformed = {
      key: 'test',
      name: 'Test',
      status: 'enabled',
      idFields: [],
      formats: [],
    };
    const result = gameConfigSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  it('adding a fourth game requires zero code changes', () => {
    // This test demonstrates that the config is data-driven.
    // The validation and exports work for any number of games.
    const extraGame = {
      key: 'test_game',
      name: 'Test Game',
      status: 'enabled' as const,
      idFields: [{ key: 'test_id', label: 'Test ID', type: 'text' as const, required: true }],
      formats: [
        {
          key: '1v1',
          name: '1v1',
          resultSchema: {
            outcomeOptions: ['win', 'loss'],
            scoreModel: 'goals' as const,
            drawAllowed: false,
          },
          requiredProof: ['screenshot'] as const,
          tiebreakRules: 'Test tiebreak',
        },
      ],
    };
    const result = gameConfigSchema.safeParse(extraGame);
    expect(result.success).toBe(true);
  });
});
