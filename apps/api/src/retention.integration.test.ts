/**
 * Audit B28: retention purge, against the real database. The purge is global, so this file
 * backdates its own rows 400 days and purges with a 365-day period: other suites' fresh
 * data sharing the database is never in range. It emits no outbox events.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from './db/client';
import { RetentionService } from './retention/retention.service';
import type { FileStoragePort } from './storage/file-storage.port';
import { retryOnDeadlock } from './test-fixtures/retry';

const DAY = 86_400_000;
const OLD = new Date(Date.now() - 400 * DAY);

describe('retention purge (audit B28)', () => {
  const deleted: string[] = [];
  const storage = {
    deleteObject: async (key: string) => void deleted.push(key),
  } as unknown as FileStoragePort;
  const retention = new RetentionService(storage);
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let gameId = '';
  let formatId = '';
  let phone = Math.floor(Math.random() * 90_000_000);

  async function player() {
    const id = uuidv7();
    await db
      .insert(schema.users)
      .values({ id, phone: `+23495${(phone++).toString().padStart(8, '0')}` });
    userIds.push(id);
    const profileId = uuidv7();
    await db
      .insert(schema.gameProfiles)
      .values({ id: profileId, userId: id, gameId, inGameId: `ret-${id.slice(-6)}` });
    return { id, profileId };
  }

  /** A match between two new players, its chat locked long ago, one screenshot. */
  async function oldMatch(status: 'confirmed' | 'disputed') {
    const a = await player();
    const b = await player();
    const challengeId = uuidv7();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: a.id,
      status: 'accepted',
      startsAt: OLD,
      endsAt: OLD,
      acceptanceDeadline: OLD,
      acceptedById: b.id,
      acceptedAt: OLD,
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db
      .insert(schema.matches)
      .values({ id: matchId, challengeId, status, winnerSide: status === 'confirmed' ? 0 : null });
    matchIds.push(matchId);
    await db.insert(schema.matchSides).values([
      { id: uuidv7(), matchId, userId: a.id, gameProfileId: a.profileId, side: 0, isPoster: true },
      {
        id: uuidv7(),
        matchId,
        userId: b.id,
        gameProfileId: b.profileId,
        side: 1,
        isAcceptor: true,
      },
    ]);
    const uploadId = uuidv7();
    await db.insert(schema.uploads).values({
      id: uploadId,
      ownerId: a.id,
      matchId,
      purpose: 'result_proof',
      status: 'ready',
      declaredMime: 'image/jpeg',
      declaredSize: 1000,
      quarantineKey: `q/${uploadId}`,
      storageKey: `proofs/${uploadId}.jpg`,
      thumbKey: `proofs/${uploadId}.thumb.jpg`,
      sha256: `sha-${uploadId}`,
      createdAt: OLD,
    });
    const conversationId = uuidv7();
    await db
      .insert(schema.conversations)
      .values({ id: conversationId, scope: 'match', matchId, lockedAt: OLD, createdAt: OLD });
    const plain = uuidv7();
    const reported = uuidv7();
    await db.insert(schema.messages).values([
      { id: plain, conversationId, senderId: a.id, body: 'gg', createdAt: OLD },
      { id: reported, conversationId, senderId: b.id, body: 'reported line', createdAt: OLD },
    ]);
    await db.insert(schema.messageReports).values({
      id: uuidv7(),
      messageId: reported,
      messageCreatedAt: OLD,
      conversationId,
      reporterId: a.id,
      reason: 'abuse',
      bodySnapshot: 'reported line',
    });
    if (status === 'disputed') {
      await db.insert(schema.disputes).values({
        id: uuidv7(),
        matchId,
        raisedById: b.id,
        reason: 'wrong_winner',
        status: 'open',
      });
    }
    return { matchId, uploadId, conversationId, plain, reported };
  }

  beforeAll(async () => {
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(and(eq(schema.gameFormats.gameId, gameId), eq(schema.gameFormats.status, 'enabled')))
      .limit(1);
    formatId = format!.id;
  });

  // Short independent statements, never one long transaction: a long cleanup transaction
  // can hold rows another suite's relay handler waits for (see account.integration.test.ts).
  afterAll(async () => {
    const step = (run: () => Promise<unknown>) => retryOnDeadlock(run);
    if (matchIds.length) {
      await step(() => db.delete(schema.uploads).where(inArray(schema.uploads.matchId, matchIds)));
      await step(() =>
        db.delete(schema.disputes).where(inArray(schema.disputes.matchId, matchIds)),
      );
      await step(() =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
          await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds)); // cascades chat
        }),
      );
    }
    if (challengeIds.length) {
      await step(() =>
        db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds)),
      );
    }
    if (userIds.length) {
      await step(() =>
        db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds)),
      );
      await step(() => db.delete(schema.users).where(inArray(schema.users.id, userIds)));
    }
  });

  it('does nothing while no period is set', async () => {
    const m = await oldMatch('confirmed');
    await expect(retention.purge({ screenshotDays: null, chatDays: null })).resolves.toEqual({
      screenshots: 0,
      messages: 0,
    });
    const [u] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, m.uploadId));
    expect(u!.status).toBe('ready');
  });

  it('purges old evidence of decided matches, keeps hashes, reported messages and disputed matches', async () => {
    const done = await oldMatch('confirmed');
    const disputed = await oldMatch('disputed');

    await retention.purge({ screenshotDays: 365, chatDays: 365 });

    // Decided match: file gone from storage, row and hash kept for reuse detection.
    const [u] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, done.uploadId));
    expect(u).toMatchObject({
      status: 'purged',
      storageKey: null,
      thumbKey: null,
      sha256: `sha-${done.uploadId}`,
    });
    expect(deleted).toEqual(
      expect.arrayContaining([`proofs/${done.uploadId}.jpg`, `proofs/${done.uploadId}.thumb.jpg`]),
    );
    const left = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, done.conversationId));
    expect(left.map((m) => m.id)).toEqual([done.reported]); // the reported one stays as evidence

    // Match in an open dispute: nothing touched.
    const [d] = await db
      .select()
      .from(schema.uploads)
      .where(eq(schema.uploads.id, disputed.uploadId));
    expect(d!.status).toBe('ready');
    expect(deleted).not.toContain(`proofs/${disputed.uploadId}.jpg`);
    const kept = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, disputed.conversationId));
    expect(kept).toHaveLength(2);
  });
});
