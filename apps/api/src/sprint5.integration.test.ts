import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { inArray } from 'drizzle-orm';

import { AppModule } from '../src/app.module';
import { ChallengesService } from '../src/challenges/challenges.service';
import { PlayersService } from '../src/players/players.service';
import { canonicalPair } from '../src/challenges/pairing';
import { db, schema, pool } from '../src/db/client';
import { redis } from '../src/cache/redis';

describe('Sprint 5 - Discovery board & player search', () => {
  let moduleRef: TestingModule;
  let challenges: ChallengesService;
  let players: PlayersService;

  let efootballId = '';
  let efootballFormatId = '';
  let codmId = '';
  let codmFormatId = '';

  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const gameProfileIds: string[] = [];
  let phoneCounter = 0;

  function uniquePhone(): string {
    return `+23481${(phoneCounter++).toString().padStart(8, '0')}`;
  }

  async function createUser(
    name: string,
    gameId: string,
    rating: number,
    extra: { campus?: string; city?: string } = {},
  ): Promise<string> {
    const userId = uuidv7();
    await db.insert(schema.users).values({
      id: userId,
      phone: uniquePhone(),
      displayName: name,
      tosVersionAccepted: '1.0',
    });
    userIds.push(userId);

    const profileId = uuidv7();
    await db.insert(schema.gameProfiles).values({
      id: profileId,
      userId,
      gameId,
      inGameId: `${name.toLowerCase()}_id`,
      rating,
      campus: extra.campus ?? null,
      city: extra.city ?? null,
      provisional: true,
    });
    gameProfileIds.push(profileId);
    return userId;
  }

  async function createChallenge(input: {
    posterId: string;
    gameId: string;
    formatId: string;
    createdAt: Date;
    acceptanceDeadline?: Date;
    status?: 'open' | 'accepted';
    targetPlayerId?: string | null;
  }): Promise<string> {
    const id = uuidv7();
    const now = input.createdAt.getTime();
    await db.insert(schema.challenges).values({
      id,
      gameId: input.gameId,
      formatId: input.formatId,
      posterId: input.posterId,
      targetPlayerId: input.targetPlayerId ?? null,
      status: input.status ?? 'open',
      rules: 'Best of one. No pausing.',
      startsAt: new Date(now + 60 * 60 * 1000),
      endsAt: new Date(now + 4 * 60 * 60 * 1000),
      acceptanceDeadline: input.acceptanceDeadline ?? new Date(now + 48 * 60 * 60 * 1000),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
    challengeIds.push(id);
    return id;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    challenges = moduleRef.get(ChallengesService);
    players = moduleRef.get(PlayersService);

    const gameRows = await db.select().from(schema.games);
    const efootball = gameRows.find((g) => g.key === 'efootball');
    const codm = gameRows.find((g) => g.key === 'codm');
    if (!efootball || !codm) throw new Error('Expected seeded games efootball and codm');

    efootballId = efootball.id;
    codmId = codm.id;

    const formatRows = await db.select().from(schema.gameFormats);
    const efootballFormat = formatRows.find(
      (f) => f.gameId === efootballId && f.key === '1v1_duel',
    );
    const codmFormat = formatRows.find((f) => f.gameId === codmId && f.key === 'mp_duel');
    if (!efootballFormat || !codmFormat) throw new Error('Expected seeded formats');

    efootballFormatId = efootballFormat.id;
    codmFormatId = codmFormat.id;
  }, 30000);

  afterAll(async () => {
    if (challengeIds.length > 0) {
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    }
    if (gameProfileIds.length > 0) {
      await db
        .delete(schema.pairingCounters)
        .where(inArray(schema.pairingCounters.userAId, userIds));
      await db
        .delete(schema.pairingCounters)
        .where(inArray(schema.pairingCounters.userBId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.id, gameProfileIds));
    }
    if (userIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await moduleRef.close();
    redis.disconnect();
    await pool.end();
  }, 30000);

  it('paginates deterministically without duplicates or gaps', async () => {
    const poster = await createUser('Pager', efootballId, 1100);
    const base = Date.now() - 60 * 60 * 1000;
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      created.push(
        await createChallenge({
          posterId: poster,
          gameId: efootballId,
          formatId: efootballFormatId,
          createdAt: new Date(base + i * 60 * 1000),
        }),
      );
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await challenges.listBoard(poster, {
        mine: 'true',
        status: 'all',
        limit: 2,
        cursor,
      });
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(created.length);
    expect(new Set(seen).size).toBe(created.length);
    expect(seen).toEqual([...created].reverse());
  });

  it('filters the board by game', async () => {
    const poster = await createUser('GameFilter', efootballId, 1200);
    await createChallenge({
      posterId: poster,
      gameId: efootballId,
      formatId: efootballFormatId,
      createdAt: new Date(),
    });
    await createChallenge({
      posterId: poster,
      gameId: codmId,
      formatId: codmFormatId,
      createdAt: new Date(),
    });

    const result = await challenges.listBoard(poster, {
      game: 'efootball',
      status: 'open',
      limit: 50,
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.game.key === 'efootball')).toBe(true);
  });

  it('filters the board by campus and city', async () => {
    const poster = await createUser('CampusPoster', efootballId, 1050, {
      campus: 'UNILAG',
      city: 'Lagos',
    });
    await createChallenge({
      posterId: poster,
      gameId: efootballId,
      formatId: efootballFormatId,
      createdAt: new Date(),
    });

    const byCampus = await challenges.listBoard(poster, {
      campus: 'unilag',
      status: 'open',
      limit: 50,
    });
    expect(byCampus.items.some((item) => item.poster.userId === poster)).toBe(true);

    const byCity = await challenges.listBoard(poster, {
      city: 'lagos',
      status: 'open',
      limit: 50,
    });
    expect(byCity.items.some((item) => item.poster.userId === poster)).toBe(true);

    const miss = await challenges.listBoard(poster, {
      campus: 'ABUJA',
      status: 'open',
      limit: 50,
    });
    expect(miss.items.some((item) => item.poster.userId === poster)).toBe(false);
  });

  it('excludes overdue challenges from the open board and shows them as expired in all', async () => {
    const poster = await createUser('OverduePoster', efootballId, 1000);
    const overdue = await createChallenge({
      posterId: poster,
      gameId: efootballId,
      formatId: efootballFormatId,
      createdAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
      acceptanceDeadline: new Date(Date.now() - 60 * 60 * 1000),
    });

    const open = await challenges.listBoard(poster, {
      status: 'open',
      limit: 50,
    });
    expect(open.items.some((item) => item.id === overdue)).toBe(false);

    const all = await challenges.listBoard(poster, {
      status: 'all',
      limit: 50,
    });
    const found = all.items.find((item) => item.id === overdue);
    expect(found?.status).toBe('expired');
  });

  it('hides direct challenges from the public board but shows them to the poster', async () => {
    const poster = await createUser('DirectPoster', efootballId, 1000);
    const target = await createUser('DirectTarget', efootballId, 1000);
    const direct = await createChallenge({
      posterId: poster,
      gameId: efootballId,
      formatId: efootballFormatId,
      createdAt: new Date(),
      targetPlayerId: target,
    });

    const publicBoard = await challenges.listBoard(target, {
      status: 'open',
      limit: 50,
    });
    expect(publicBoard.items.some((item) => item.id === direct)).toBe(false);

    const mine = await challenges.listBoard(poster, {
      mine: 'true',
      status: 'all',
      limit: 50,
    });
    expect(mine.items.some((item) => item.id === direct)).toBe(true);
  });

  it('counts my challenges expiring within 24 hours for the needs-action banner', async () => {
    const poster = await createUser('BannerPoster', efootballId, 1000);
    const now = Date.now();
    await createChallenge({
      posterId: poster,
      gameId: efootballId,
      formatId: efootballFormatId,
      createdAt: new Date(now - 60 * 60 * 1000),
      acceptanceDeadline: new Date(now + 2 * 60 * 60 * 1000),
    });
    await createChallenge({
      posterId: poster,
      gameId: efootballId,
      formatId: efootballFormatId,
      createdAt: new Date(now - 60 * 60 * 1000),
      acceptanceDeadline: new Date(now + 48 * 60 * 60 * 1000),
    });

    const result = await challenges.listBoard(poster, {
      mine: 'true',
      status: 'all',
      limit: 50,
    });
    expect(result.needsActionCount).toBe(1);
  });

  it('searches players by game without exposing private fields', async () => {
    const viewer = await createUser('SearchViewer', efootballId, 1000);
    await createUser('SearchTarget', efootballId, 1320, { campus: 'UNILAG', city: 'Lagos' });

    const result = await players.search(viewer, { game: 'efootball', limit: 50 });
    const target = result.items.find((item) => item.username === 'SearchTarget');
    expect(target).toBeDefined();

    const allowed = [
      'campus',
      'city',
      'draws',
      'game',
      'inGameId',
      'losses',
      'provisional',
      'rankLabel',
      'rankTier',
      'rating',
      'record',
      'reputation',
      'streak',
      'userId',
      'username',
      'wins',
    ];
    expect(Object.keys(target!).sort()).toEqual(allowed);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('jurisdiction');
    expect(serialized).not.toContain('email');
  });

  it('filters player search by rank tier', async () => {
    const viewer = await createUser('RankViewer', efootballId, 1000);
    await createUser('EliteOne', efootballId, 1310);
    await createUser('RookieOne', efootballId, 900);

    const result = await players.search(viewer, {
      game: 'efootball',
      rank: 'elite',
      limit: 50,
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.rating >= 1300 && item.rating <= 1449)).toBe(true);
  });

  it('computes repeat-pairing and rating-gap signals from stored counters', async () => {
    const poster = await createUser('FairPoster', efootballId, 1250);
    const opponent = await createUser('FairOpponent', efootballId, 1000);
    const { userAId, userBId } = canonicalPair(poster, opponent);

    await db
      .insert(schema.pairingCounters)
      .values({
        id: uuidv7(),
        gameId: efootballId,
        userAId,
        userBId,
        count: 3,
        lastPairingAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.pairingCounters.gameId,
          schema.pairingCounters.userAId,
          schema.pairingCounters.userBId,
        ],
        set: { count: 3, lastPairingAt: new Date() },
      });

    const signals = await challenges.computeFairnessSignals({
      gameId: efootballId,
      posterId: poster,
      opponentId: opponent,
      posterRating: 1250,
      opponentRating: 1000,
    });

    expect(signals).toEqual({ ratingGap: 250, repeatPairCount: 3 });
  });
});
