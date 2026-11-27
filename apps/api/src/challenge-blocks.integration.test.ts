/**
 * Blocks and deleted accounts in challenges (pre-deploy audit 2026-11-27, H3): a player with
 * a block either way cannot be sent a direct or group challenge, gets the same "not found"
 * answer as a missing player, and is not offered by player search. Deleted accounts cannot be
 * challenged either.
 */
process.env.NOTIFICATIONS_JOBS_DISABLED = 'true';
process.env.OUTBOX_RELAY_DISABLED = 'true';
process.env.CHAT_JOBS_DISABLED = 'true';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, or } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { ChallengesService } from './challenges/challenges.service';
import { PlayersService } from './players/players.service';
import type { PlayerSearchQuery } from './players/players.schemas';

describe('Challenges respect blocks and deleted accounts', () => {
  let moduleRef: TestingModule;
  let challenges: ChallengesService;
  let players: PlayersService;
  let gameKey = '';
  let formatKey = '';
  let gameId = '';
  const userIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);
  const tag = uuidv7().slice(-4);

  async function player(name: string) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23494${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}${tag}`,
    });
    userIds.push(id);
    await db
      .insert(schema.consentRecords)
      .values({ id: uuidv7(), userId: id, termsType: 'terms', termsVersion: '1.0' });
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}${tag}` });
    return id;
  }

  const block = (blockerId: string, blockedId: string) =>
    db.insert(schema.userBlocks).values({ blockerId, blockedId });

  const challenge = (posterId: string, targets: string[]) =>
    challenges.createChallenge(posterId, {
      gameKey,
      formatKey,
      rules: '',
      startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      ...(targets.length === 1 ? { targetPlayerId: targets[0] } : { targetPlayerIds: targets }),
    });

  const searchNames = async (viewerId: string) => {
    const res = await players.search(viewerId, {
      game: gameKey,
      q: tag,
      limit: 50,
    } as PlayerSearchQuery);
    return res.items.map((p) => p.userId);
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    challenges = moduleRef.get(ChallengesService);
    players = moduleRef.get(PlayersService);
    const [game] = await db.select().from(schema.games).limit(1);
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(and(eq(schema.gameFormats.gameId, game!.id), eq(schema.gameFormats.status, 'enabled')))
      .limit(1);
    gameId = game!.id;
    gameKey = game!.key;
    formatKey = format!.key;
  });

  afterAll(async () => {
    if (userIds.length) {
      const owned = await db
        .select({ id: schema.challenges.id })
        .from(schema.challenges)
        .where(inArray(schema.challenges.posterId, userIds));
      const cids = owned.map((c) => c.id);
      if (cids.length) {
        await db.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, cids));
        await db.delete(schema.challenges).where(inArray(schema.challenges.id, cids));
      }
      await db
        .delete(schema.userBlocks)
        .where(
          or(
            inArray(schema.userBlocks.blockerId, userIds),
            inArray(schema.userBlocks.blockedId, userIds),
          ),
        );
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.consentRecords).where(inArray(schema.consentRecords.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await moduleRef?.close();
  });

  it('refuses a direct challenge when the target blocked the poster, as "not found"', async () => {
    const poster = await player('bkp');
    const target = await player('bkt');
    await block(target, poster);
    const err = await challenge(poster, [target]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as Error).message).toBe('Target player not found');
  });

  it('refuses a direct challenge when the poster blocked the target', async () => {
    const poster = await player('bkq');
    const target = await player('bku');
    await block(poster, target);
    await expect(challenge(poster, [target])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a group challenge that includes someone with a block', async () => {
    const poster = await player('bkr');
    const ok = await player('bkv');
    const blocker = await player('bkw');
    await block(blocker, poster);
    const err = await challenge(poster, [ok, blocker]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as Error).message).toBe('Some players were not found');
    // Without the blocker the same group is fine.
    const third = await player('bkx');
    await expect(challenge(poster, [ok, third])).resolves.toHaveProperty('id');
  });

  it('refuses a deleted account as a target', async () => {
    const poster = await player('bks');
    const gone = await player('bky');
    await db.update(schema.users).set({ deletedAt: new Date() }).where(eq(schema.users.id, gone));
    await expect(challenge(poster, [gone])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('player search hides players with a block either way', async () => {
    const viewer = await player('bkz');
    const blockedByViewer = await player('bka');
    const blockedViewer = await player('bkb');
    const neutral = await player('bkc');
    await block(viewer, blockedByViewer);
    await block(blockedViewer, viewer);
    const seen = await searchNames(viewer);
    expect(seen).toContain(neutral);
    expect(seen).not.toContain(blockedByViewer);
    expect(seen).not.toContain(blockedViewer);
    // The block does not hide them from everyone else.
    expect(await searchNames(neutral)).toEqual(
      expect.arrayContaining([viewer, blockedByViewer, blockedViewer]),
    );
  });
});
