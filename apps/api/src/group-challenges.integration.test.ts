/**
 * Group challenges: one challenge offered to 2-10 chosen players. Hidden from the public
 * board, listed "for me" for each member, only members can accept, the first to accept
 * plays, a decline removes one member, the last decline closes it, and every member is
 * notified.
 */
process.env.NOTIFICATIONS_JOBS_DISABLED = 'true';
process.env.OUTBOX_RELAY_DISABLED = 'true';
process.env.CHAT_JOBS_DISABLED = 'true';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, or } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { ChallengesService } from './challenges/challenges.service';
import { NotificationsService } from './notifications/notifications.service';
import { createChallengeSchema } from './challenges/challenges.schemas';

describe('Group challenges', () => {
  let moduleRef: TestingModule;
  let challenges: ChallengesService;
  let notifications: NotificationsService;
  let gameKey = '';
  let formatKey = '';
  let gameId = '';
  const userIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);

  async function player(name: string) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23493${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-4)}`,
    });
    userIds.push(id);
    await db
      .insert(schema.consentRecords)
      .values({ id: uuidv7(), userId: id, termsType: 'terms', termsVersion: '1.0' });
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}_${id.slice(-4)}` });
    return id;
  }

  const window = () => ({
    startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
    endsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
  });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    challenges = moduleRef.get(ChallengesService);
    notifications = moduleRef.get(NotificationsService);
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
        const ms = await db
          .select({ id: schema.matches.id })
          .from(schema.matches)
          .where(inArray(schema.matches.challengeId, cids));
        const mids = ms.map((m) => m.id);
        if (mids.length) {
          await db
            .delete(schema.matchParticipants)
            .where(inArray(schema.matchParticipants.matchId, mids));
          await db.delete(schema.matchSides).where(inArray(schema.matchSides.matchId, mids));
          await db.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, mids));
          await db.delete(schema.matches).where(inArray(schema.matches.id, mids));
        }
        await db.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, cids));
        await db.delete(schema.challenges).where(inArray(schema.challenges.id, cids));
      }
      await db
        .delete(schema.pairingCounters)
        .where(
          or(
            inArray(schema.pairingCounters.userAId, userIds),
            inArray(schema.pairingCounters.userBId, userIds),
          ),
        );
      await db.delete(schema.notifications).where(inArray(schema.notifications.userId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.consentRecords).where(inArray(schema.consentRecords.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await moduleRef?.close();
  });

  it('validates the request: unique players, at most 10, not with targetPlayerId', () => {
    const base = { gameKey: 'x', formatKey: 'y', ...window() };
    const a = uuidv7();
    expect(createChallengeSchema.safeParse({ ...base, targetPlayerIds: [a, a] }).success).toBe(
      false,
    );
    expect(
      createChallengeSchema.safeParse({
        ...base,
        targetPlayerIds: Array.from({ length: 11 }, () => uuidv7()),
      }).success,
    ).toBe(false);
    expect(
      createChallengeSchema.safeParse({ ...base, targetPlayerId: a, targetPlayerIds: [uuidv7()] })
        .success,
    ).toBe(false);
    expect(
      createChallengeSchema.safeParse({ ...base, targetPlayerIds: [a, uuidv7()] }).success,
    ).toBe(true);
  });

  it('is private to the group, first member to accept plays, others get 409', async () => {
    const poster = await player('gposter');
    const m1 = await player('gm1');
    const m2 = await player('gm2');
    const m3 = await player('gm3');
    const outsider = await player('gout');

    const { id } = await challenges.createChallenge(poster, {
      gameKey,
      formatKey,
      rules: '',
      ...window(),
      targetPlayerIds: [m1, m2, m3],
    });

    // Not on the public board, listed for each member, not for an outsider.
    const board = await challenges.listBoard(outsider, { status: 'open', limit: 50 });
    expect(board.items.some((c) => c.id === id)).toBe(false);
    for (const m of [m1, m2, m3]) {
      const mine = await challenges.listBoard(m, { status: 'open', forMe: 'true', limit: 50 });
      const card = mine.items.find((c) => c.id === id);
      expect(card?.isForMe).toBe(true);
      expect(card?.audience).toBe('group');
      expect(card?.group?.map((g) => g.userId).sort()).toEqual([m1, m2, m3].sort());
    }
    const outsiders = await challenges.listBoard(outsider, {
      status: 'open',
      forMe: 'true',
      limit: 50,
    });
    expect(outsiders.items.some((c) => c.id === id)).toBe(false);

    // The poster sees the group on their own list.
    const posted = await challenges.listBoard(poster, { status: 'open', mine: 'true', limit: 50 });
    expect(posted.items.find((c) => c.id === id)?.audience).toBe('group');

    await expect(challenges.acceptChallenge(id, outsider)).rejects.toMatchObject({ status: 403 });

    const { matchId } = await challenges.acceptChallenge(id, m2);
    expect(matchId).toBeTruthy();
    await expect(challenges.acceptChallenge(id, m1)).rejects.toMatchObject({ status: 409 });
    // A retry by the winner returns the same match.
    expect((await challenges.acceptChallenge(id, m2)).matchId).toBe(matchId);
  });

  it('a decline removes one member; the last decline closes the challenge', async () => {
    const poster = await player('dposter');
    const a = await player('da');
    const b = await player('db');
    const { id } = await challenges.createChallenge(poster, {
      gameKey,
      formatKey,
      rules: '',
      ...window(),
      targetPlayerIds: [a, b],
    });

    await challenges.declineChallenge(id, a);
    const forA = await challenges.listBoard(a, { status: 'open', forMe: 'true', limit: 50 });
    expect(forA.items.some((c) => c.id === id)).toBe(false);
    await expect(challenges.acceptChallenge(id, a)).rejects.toMatchObject({ status: 409 });
    let [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, id));
    expect(row!.status).toBe('open');

    await challenges.declineChallenge(id, b);
    [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, id));
    expect(row!.status).toBe('cancelled');
    // Retried decline is a no-op.
    await expect(challenges.declineChallenge(id, b)).resolves.toBeUndefined();
  });

  it('one-player group is a direct challenge; self and non-players are refused', async () => {
    const poster = await player('sposter');
    const solo = await player('ssolo');
    const { id } = await challenges.createChallenge(poster, {
      gameKey,
      formatKey,
      rules: '',
      ...window(),
      targetPlayerIds: [solo],
    });
    const [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, id));
    expect(row!.targetPlayerId).toBe(solo);
    const card = await challenges.getChallenge(id, solo);
    expect(card?.audience).toBe('direct');

    await expect(
      challenges.createChallenge(poster, {
        gameKey,
        formatKey,
        rules: '',
        ...window(),
        targetPlayerIds: [solo, poster],
      }),
    ).rejects.toMatchObject({ status: 400 });

    const noProfile = uuidv7();
    await db.insert(schema.users).values({
      id: noProfile,
      phone: `+23493${(phone++).toString().padStart(8, '0')}`,
      displayName: `noprof_${noProfile.slice(-4)}`,
    });
    userIds.push(noProfile);
    await expect(
      challenges.createChallenge(poster, {
        gameKey,
        formatKey,
        rules: '',
        ...window(),
        targetPlayerIds: [solo, noProfile],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('notifies every member of the group', async () => {
    const poster = await player('nposter');
    const x = await player('nx');
    const y = await player('ny');
    const { id } = await challenges.createChallenge(poster, {
      gameKey,
      formatKey,
      rules: '',
      ...window(),
      targetPlayerIds: [x, y],
    });
    const [event] = await db
      .select()
      .from(schema.outboxEvents)
      .where(
        and(
          eq(schema.outboxEvents.subjectId, id),
          eq(schema.outboxEvents.type, 'challenge.created'),
        ),
      );
    const created = await notifications.fromEvent(event!);
    expect(created.map((n) => n.type)).toEqual(['challenge_received', 'challenge_received']);
    const rows = await db
      .select({ userId: schema.notifications.userId })
      .from(schema.notifications)
      .where(inArray(schema.notifications.userId, [x, y]));
    expect(rows.map((r) => r.userId).sort()).toEqual([x, y].sort());
  });
});
