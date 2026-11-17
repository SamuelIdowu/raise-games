import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';

import { AppModule } from '../src/app.module';
import { db, schema, pool } from '../src/db/client';
import { redis, redisForBullMQ } from '../src/cache/redis';
import { MatchesService } from '../src/matches/matches.service';
import { ResultsService } from '../src/matches/results.service';
import { MatchDeadlineWorker } from '../src/matches/match-deadline.worker';
import { UploadsService } from '../src/uploads/uploads.service';
import { matchDeadlineQueue } from '../src/matches/match-deadline.queue';
import { challengeExpiryQueue } from '../src/challenges/challenges.queue';
import { differentScreenshot, fakeScreenshot, randomImage } from '../src/test-fixtures/screenshot';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

/**
 * Sprint 8 — result submission, verification, no-show (F8.1–F8.5).
 * Runs against real Postgres, Redis and the S3-compatible store from docker compose.
 */
describe('Sprint 8 - results & verification', () => {
  let moduleRef: TestingModule;
  let matches: MatchesService;
  let results: ResultsService;
  /** Hub view for a participant (MatchesService.getView needs an authed viewer). */
  const viewFor = (userId: string, matchId: string) =>
    matches.getView(matchId, { sub: userId, sid: 'test', role: 'player' });
  let uploads: UploadsService;
  let deadlines: MatchDeadlineWorker;

  let gameId = '';
  let formatId = '';
  const userIds: string[] = [];
  const profileIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let phoneCounter = Math.floor(Math.random() * 1_000_000);

  async function createUser(name: string, role: 'player' | 'moderator' = 'player') {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23490${(phoneCounter++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-6)}`,
      tosVersionAccepted: '1.0',
      role,
    });
    userIds.push(id);
    const profileId = uuidv7();
    await db.insert(schema.gameProfiles).values({
      id: profileId,
      userId: id,
      gameId,
      inGameId: `${name.toLowerCase()}_${id.slice(-6)}`,
      rating: 1000,
    });
    profileIds.push(profileId);
    return { id, profileId };
  }

  /** An accepted match whose agreed start was `startedAgoMs` ago. */
  async function createMatch(startedAgoMs = 60 * 60 * 1000) {
    const poster = await createUser('Poster');
    const acceptor = await createUser('Acceptor');
    const startsAt = new Date(Date.now() - startedAgoMs);
    const challengeId = uuidv7();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: poster.id,
      status: 'accepted',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      acceptanceDeadline: new Date(startsAt.getTime() - 60_000),
      acceptedById: acceptor.id,
      acceptedAt: new Date(startsAt.getTime() - 120_000),
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db.insert(schema.matches).values({ id: matchId, challengeId, status: 'accepted' });
    matchIds.push(matchId);
    await db.insert(schema.matchSides).values([
      {
        id: uuidv7(),
        matchId,
        userId: poster.id,
        gameProfileId: poster.profileId,
        side: 0,
        isPoster: true,
      },
      {
        id: uuidv7(),
        matchId,
        userId: acceptor.id,
        gameProfileId: acceptor.profileId,
        side: 1,
        isAcceptor: true,
      },
    ]);
    return { matchId, a: poster.id, b: acceptor.id };
  }

  /** Full upload: presign → real HTTP PUT to the presigned URL → complete. */
  async function upload(
    userId: string,
    matchId: string,
    bytes?: Buffer,
    purpose: 'result_proof' | 'no_show_proof' = 'result_proof',
  ) {
    const body = bytes ?? (await randomImage());
    const presigned = await uploads.presign(userId, {
      matchId,
      purpose,
      contentType: 'image/jpeg',
      sizeBytes: body.byteLength,
    });
    const put = await fetch(presigned.url, { method: 'PUT', headers: presigned.headers, body });
    expect(put.status, await put.clone().text()).toBe(200);
    return { body, presigned, view: await uploads.complete(userId, presigned.uploadId) };
  }

  /**
   * The sweeper skips rows another transaction holds (SKIP LOCKED) and relies on its next
   * 30s pass; under a parallel test run, retry a few passes the same way.
   */
  async function sweepUntilSettled(matchId: string) {
    for (let i = 0; i < 5; i++) {
      await deadlines.sweep();
      const [m] = await db
        .select({ status: schema.matches.status })
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId));
      if (m?.status !== 'awaiting_confirmation') return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const key = () => uuidv7();
  const goals = (self: number, opponent: number) => ({ self, opponent });

  async function matchRow(matchId: string) {
    const [m] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
    return m!;
  }

  async function outbox(type: string, subjectId: string) {
    return db
      .select()
      .from(schema.outboxEvents)
      .where(and(eq(schema.outboxEvents.type, type), eq(schema.outboxEvents.subjectId, subjectId)));
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    matches = moduleRef.get(MatchesService);
    results = moduleRef.get(ResultsService);
    uploads = moduleRef.get(UploadsService);
    deadlines = moduleRef.get(MatchDeadlineWorker);

    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(and(eq(schema.gameFormats.gameId, game!.id), eq(schema.gameFormats.key, '1v1_duel')));
    gameId = game!.id;
    formatId = format!.id;
  });

  afterAll(async () => {
    if (matchIds.length > 0) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
        const convIds = (
          await tx
            .select({ id: schema.conversations.id })
            .from(schema.conversations)
            .where(inArray(schema.conversations.matchId, matchIds))
        ).map((c) => c.id);
        if (convIds.length)
          await tx.delete(schema.messages).where(inArray(schema.messages.conversationId, convIds));
        await tx
          .delete(schema.conversations)
          .where(inArray(schema.conversations.matchId, matchIds));
        await tx.delete(schema.disputes).where(inArray(schema.disputes.matchId, matchIds));
        await tx
          .delete(schema.resultSubmissions)
          .where(inArray(schema.resultSubmissions.matchId, matchIds));
        await tx.delete(schema.uploads).where(inArray(schema.uploads.ownerId, userIds));
        await tx
          .delete(schema.outboxEvents)
          .where(inArray(schema.outboxEvents.subjectId, [...matchIds, ...userIds]));
        await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
      });
    }
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    if (profileIds.length)
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.id, profileIds));
    if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await moduleRef.close();
    await matchDeadlineQueue.close();
    await challengeExpiryQueue.close();
    redis.disconnect();
    redisForBullMQ.disconnect();
    await pool.end();
  });

  // ------------------------------------------------------------ F8.2 uploads

  describe('F8.2 upload pipeline', () => {
    it('presign → PUT → complete stores an EXIF-free, hashed image readable only via signed URL', async () => {
      const { matchId, a, b } = await createMatch();
      const withExif = await sharp(await fakeScreenshot('9 - 9'))
        .withExif({
          IFD0: { Make: 'LeakyPhone' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '6/1 27/1 0/1' },
        })
        .jpeg()
        .toBuffer();
      const { view } = await upload(a, matchId, withExif);
      expect(view.status).toBe('ready');

      const [row] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, view.id));
      expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.phash).toMatch(/^[0-9a-f]{16}$/);
      expect(row!.storageKey).toBe(`proofs/${view.id}.jpg`);

      // The participant's signed URL serves stripped bytes.
      const signed = await uploads.signedUrl(b, 'player', view.id, 'full');
      const stored = Buffer.from(await (await fetch(signed.url)).arrayBuffer());
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(stored.includes(Buffer.from('LeakyPhone'))).toBe(false);

      // The bucket is private: the same object without a signature is refused.
      const unsigned = signed.url.split('?')[0]!;
      expect((await fetch(unsigned)).status).toBe(403);
      // The quarantine copy is gone.
      expect(
        (await fetch(unsigned.replace(`proofs/${view.id}.jpg`, `quarantine/${view.id}`))).status,
      ).not.toBe(200);
    });

    it('refuses wrong MIME and oversize at presign', async () => {
      const { matchId, a } = await createMatch();
      await expect(
        uploads.presign(a, {
          matchId,
          purpose: 'result_proof',
          contentType: 'image/gif',
          sizeBytes: 1000,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        uploads.presign(a, {
          matchId,
          purpose: 'result_proof',
          contentType: 'application/pdf',
          sizeBytes: 1000,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        uploads.presign(a, {
          matchId,
          purpose: 'result_proof',
          contentType: 'image/jpeg',
          sizeBytes: 2_000_000,
        }),
      ).rejects.toMatchObject({ status: 413 });
    });

    it('presigned URL is bound to the declared type and length', async () => {
      const { matchId, a } = await createMatch();
      const body = await sharp(await fakeScreenshot())
        .jpeg()
        .toBuffer();
      const p = await uploads.presign(a, {
        matchId,
        purpose: 'result_proof',
        contentType: 'image/jpeg',
        sizeBytes: body.byteLength,
      });
      const wrongType = await fetch(p.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body,
      });
      expect(wrongType.status).toBe(403);
      const bigger = Buffer.concat([body, Buffer.alloc(5000)]);
      const wrongLength = await fetch(p.url, { method: 'PUT', headers: p.headers, body: bigger });
      expect(wrongLength.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects bytes that are not an image even if declared as one', async () => {
      const { matchId, a } = await createMatch();
      const fake = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(2000, ' '));
      const p = await uploads.presign(a, {
        matchId,
        purpose: 'result_proof',
        contentType: 'image/jpeg',
        sizeBytes: fake.byteLength,
      });
      await fetch(p.url, { method: 'PUT', headers: p.headers, body: fake });
      await expect(uploads.complete(a, p.uploadId)).rejects.toMatchObject({ status: 422 });
      const [row] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, p.uploadId));
      expect(row!.status).toBe('rejected');
    });

    it('screenshot reuse across two matches fails with a hash flag', async () => {
      const first = await createMatch();
      const second = await createMatch();
      const bytes = await sharp(await fakeScreenshot('4 - 2'))
        .jpeg()
        .toBuffer();
      const original = await upload(first.a, first.matchId, bytes);
      expect(original.view.status).toBe('ready');

      const p = await uploads.presign(second.a, {
        matchId: second.matchId,
        purpose: 'result_proof',
        contentType: 'image/jpeg',
        sizeBytes: bytes.byteLength,
      });
      await fetch(p.url, { method: 'PUT', headers: p.headers, body: bytes });
      await expect(uploads.complete(second.a, p.uploadId)).rejects.toMatchObject({
        status: 409,
        message: 'This screenshot was already used for another match.',
      });
      const [row] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, p.uploadId));
      expect(row!.status).toBe('rejected');
      expect(row!.rejectReason).toBe('reused_screenshot');
      expect(row!.reusedUploadId).toBe(original.view.id);
    });

    it('a re-encoded copy of a used screenshot is accepted but flagged by perceptual hash', async () => {
      const first = await createMatch();
      const second = await createMatch();
      // A structurally unique image: suites share one database and upload look-alike
      // fixture screens, which could tie with the original on pHash distance.
      const png = await sharp(await randomImage()).png().toBuffer();
      const original = await upload(
        first.a,
        first.matchId,
        await sharp(png).jpeg({ quality: 90 }).toBuffer(),
      );
      const recompressed = await sharp(png).resize(1100).jpeg({ quality: 60 }).toBuffer();
      const copy = await upload(second.b, second.matchId, recompressed);
      expect(copy.view.status).toBe('ready');
      expect(copy.view.flagged).toBe(true);
      const [row] = await db
        .select()
        .from(schema.uploads)
        .where(eq(schema.uploads.id, copy.view.id));
      expect(row!.similarUploadId).toBe(original.view.id);
      expect(row!.similarDistance).toBeLessThanOrEqual(6);
    });

    it('signed reads are participant-only (moderators allowed)', async () => {
      const { matchId, a } = await createMatch();
      const outsider = await createUser('Outsider');
      const moderator = await createUser('Mod', 'moderator');
      const { view } = await upload(a, matchId, await differentScreenshot(3));
      await expect(uploads.signedUrl(outsider.id, 'player', view.id, 'full')).rejects.toMatchObject(
        { status: 403 },
      );
      await expect(
        uploads.signedUrl(moderator.id, 'moderator', view.id, 'thumb'),
      ).resolves.toHaveProperty('url');
    });
  });

  // ------------------------------------------------ F8.1 / F8.4 verification

  describe('F8.1 + F8.4 submission and confirmation', () => {
    it('matching win/loss auto-confirms within 5s and hands off to ratings via the outbox', async () => {
      const { matchId, a, b } = await createMatch();
      const proofA = await upload(a, matchId);
      const proofB = await upload(b, matchId);

      const first = await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(3, 1),
        uploadId: proofA.view.id,
        note: 'GG',
        idempotencyKey: key(),
      });
      expect(first.status).toBe('awaiting_confirmation');
      const pending = await matchRow(matchId);
      expect(pending.confirmationDeadline!.getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);
      expect(await outbox('result.submitted', matchId)).toHaveLength(1);

      const started = performance.now();
      const second = await results.submitResult(b, matchId, {
        outcome: 'loss',
        score: goals(1, 3),
        uploadId: proofB.view.id,
        idempotencyKey: key(),
      });
      const elapsed = performance.now() - started;

      expect(second.status).toBe('confirmed');
      const m = await matchRow(matchId);
      expect(m.status).toBe('confirmed');
      expect(m.winnerSide).toBe(0);
      expect(m.decidedVia).toBe('agreement');
      const [event] = await outbox('match.confirmed', matchId);
      expect(event!.payload).toMatchObject({
        winnerUserId: a,
        loserUserId: b,
        draw: false,
        via: 'agreement',
      });
      // PRD: matching submissions auto-confirm (and update ratings) within 5s.
      expect(elapsed).toBeLessThan(5000);
      process.stdout.write(
        `[sprint8] second submission → confirmed + outbox: ${elapsed.toFixed(0)}ms\n`,
      );

      const viewA = await viewFor(a, matchId);
      expect(viewA!.outcomeForViewer).toBe('win');
      expect(viewA!.nextAction).toBe('done');
      expect((await viewFor(b, matchId))!.outcomeForViewer).toBe('loss');
    });

    it('conflicting submissions open a dispute with a chat system message', async () => {
      const { matchId, a, b } = await createMatch();
      await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(2, 1),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      const res = await results.submitResult(b, matchId, {
        outcome: 'win',
        score: goals(3, 2),
        uploadId: (await upload(b, matchId)).view.id,
        idempotencyKey: key(),
      });
      expect(res.status).toBe('disputed');

      const [dispute] = await db
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.matchId, matchId));
      expect(dispute).toMatchObject({
        source: 'auto_conflict',
        reason: 'conflicting_outcomes',
        status: 'open',
        raisedById: null,
      });
      const [conv] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.matchId, matchId));
      const msgs = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conv!.id));
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ kind: 'system', senderId: null });
      expect(await outbox('dispute.opened', dispute!.id)).toHaveLength(1);
      expect((await viewFor(a, matchId))!.nextAction).toBe('disputed');
    });

    it('a wrong-score bluff with matching outcomes is still disputed', async () => {
      const { matchId, a, b } = await createMatch();
      await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(5, 0),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      const res = await results.submitResult(b, matchId, {
        outcome: 'loss',
        score: goals(1, 2),
        uploadId: (await upload(b, matchId)).view.id,
        idempotencyKey: key(),
      });
      expect(res.status).toBe('disputed');
      const [dispute] = await db
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.matchId, matchId));
      expect(dispute!.reason).toBe('conflicting_scores');
    });

    it('the opponent can confirm without uploading their own proof', async () => {
      const { matchId, a, b } = await createMatch();
      await results.submitResult(a, matchId, {
        outcome: 'loss',
        score: goals(0, 2),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      expect((await viewFor(b, matchId))!.nextAction).toBe('confirm_or_submit');
      const res = await results.confirmResult(b, matchId, { idempotencyKey: key() });
      expect(res.status).toBe('confirmed');
      expect((await matchRow(matchId)).winnerSide).toBe(1);
      const subs = await db
        .select()
        .from(schema.resultSubmissions)
        .where(eq(schema.resultSubmissions.matchId, matchId));
      expect(subs.find((s) => s.submitterId === b)).toMatchObject({
        kind: 'confirmation',
        result: 'win',
        score: { self: 2, opponent: 0 },
      });
    });

    it('silent opponent for 24h → auto-confirm via the sweeper (time-travel fixture)', async () => {
      const { matchId, a, b } = await createMatch();
      await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(1, 0),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      // Time travel: the window closed a minute ago.
      await db
        .update(schema.matches)
        .set({ confirmationDeadline: new Date(Date.now() - 60_000) })
        .where(eq(schema.matches.id, matchId));

      const resolved = await deadlines.sweep();
      expect(resolved).toContain(matchId);
      const m = await matchRow(matchId);
      expect(m.status).toBe('confirmed');
      expect(m.decidedVia).toBe('auto_timeout');
      expect(m.winnerSide).toBe(0);
      const [event] = await outbox('match.confirmed', matchId);
      expect(event!.payload).toMatchObject({
        via: 'auto_timeout',
        winnerUserId: a,
        loserUserId: b,
      });

      // A late second submission is refused rather than reopening the match.
      await expect(
        results.submitResult(b, matchId, {
          outcome: 'win',
          score: goals(1, 0),
          uploadId: undefined,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('the sweeper does not touch a match whose window is still open', async () => {
      const { matchId, a } = await createMatch();
      await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(1, 0),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      expect(await deadlines.sweep()).not.toContain(matchId);
      expect((await matchRow(matchId)).status).toBe('awaiting_confirmation');
    });

    it('validates scores, proof, notes and timing', async () => {
      const { matchId, a } = await createMatch();
      const proof = (await upload(a, matchId)).view.id;
      // forced bounds
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(100, 0),
          uploadId: proof,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      // undocumented keys
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: { home: 2, away: 1 },
          uploadId: proof,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      // outcome contradicts score
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(0, 3),
          uploadId: proof,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      // draw not allowed in eFootball 1v1
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'draw',
          score: goals(1, 1),
          uploadId: proof,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      // proof required by the format
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(1, 0),
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      // note content filter
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(1, 0),
          uploadId: proof,
          note: 'you are a shit player',
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      // same filter as chat: contact handles and payment details are refused in notes
      for (const [note, message] of [
        ['whatsapp me on 08031234567', 'Notes cannot include phone numbers or contact handles.'],
        ['send 5k to my opay', 'Notes cannot include payment details.'],
      ] as const) {
        await expect(
          results.submitResult(a, matchId, {
            outcome: 'win',
            score: goals(1, 0),
            uploadId: proof,
            note,
            idempotencyKey: key(),
          }),
        ).rejects.toMatchObject({ status: 400, message });
      }

      const future = await createMatch(-60 * 60 * 1000);
      await expect(
        results.submitResult(future.a, future.matchId, {
          outcome: 'win',
          score: goals(1, 0),
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'This match has not started yet.',
      });
      const late = await createMatch(25 * 60 * 60 * 1000);
      await expect(
        results.submitResult(late.a, late.matchId, {
          outcome: 'win',
          score: goals(1, 0),
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'The 24-hour window to submit a result has closed.',
      });
    });

    it("rejects another player's or another match's screenshot as proof", async () => {
      const { matchId, a, b } = await createMatch();
      const other = await createMatch();
      const bProof = (await upload(b, matchId)).view.id;
      const foreign = (await upload(other.a, other.matchId)).view.id;
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(1, 0),
          uploadId: bProof,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(1, 0),
          uploadId: foreign,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('one active submission per side; retries with the same key are idempotent', async () => {
      const { matchId, a } = await createMatch();
      const proof = (await upload(a, matchId)).view.id;
      const idem = key();
      const first = await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(2, 0),
        uploadId: proof,
        idempotencyKey: idem,
      });
      const retry = await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(2, 0),
        uploadId: proof,
        idempotencyKey: idem,
      });
      expect(retry.submissionId).toBe(first.submissionId);
      await expect(
        results.submitResult(a, matchId, {
          outcome: 'loss',
          score: goals(0, 2),
          uploadId: proof,
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('simultaneous submissions from both sides resolve exactly once', async () => {
      const { matchId, a, b } = await createMatch();
      const [pa, pb] = await Promise.all([upload(a, matchId), upload(b, matchId)]);
      const settled = await Promise.allSettled([
        results.submitResult(a, matchId, {
          outcome: 'win',
          score: goals(2, 1),
          uploadId: pa.view.id,
          idempotencyKey: key(),
        }),
        results.submitResult(b, matchId, {
          outcome: 'loss',
          score: goals(1, 2),
          uploadId: pb.view.id,
          idempotencyKey: key(),
        }),
      ]);
      expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
      expect((await matchRow(matchId)).status).toBe('confirmed');
      expect(await outbox('match.confirmed', matchId)).toHaveLength(1);
    });

    it('ResultSubmission is append-only at the SQL level', async () => {
      const { matchId, a } = await createMatch();
      const res = await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(1, 0),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      // Drizzle wraps the driver error; the trigger's message is on `cause`.
      const pgError = (p: Promise<unknown>) =>
        p.then(
          () => 'no error',
          (e: { cause?: { message?: string } }) => e.cause?.message ?? String(e),
        );
      expect(
        await pgError(
          db.execute(
            sql`UPDATE result_submissions SET result = 'loss' WHERE id = ${res.submissionId}`,
          ),
        ),
      ).toMatch(/append-only \(UPDATE rejected\)/);
      expect(
        await pgError(
          db.execute(sql`DELETE FROM result_submissions WHERE id = ${res.submissionId}`),
        ),
      ).toMatch(/append-only \(DELETE rejected\)/);
      const [still] = await db
        .select()
        .from(schema.resultSubmissions)
        .where(eq(schema.resultSubmissions.id, res.submissionId));
      expect(still!.result).toBe('win');
    });

    it('upload after resolution is refused and leaves no broken state', async () => {
      const { matchId, a, b } = await createMatch();
      await results.submitResult(a, matchId, {
        outcome: 'win',
        score: goals(1, 0),
        uploadId: (await upload(a, matchId)).view.id,
        idempotencyKey: key(),
      });
      await results.confirmResult(b, matchId, { idempotencyKey: key() });
      const before = await db
        .select()
        .from(schema.uploads)
        .where(eq(schema.uploads.matchId, matchId));
      await expect(
        uploads.presign(b, {
          matchId,
          purpose: 'result_proof',
          contentType: 'image/jpeg',
          sizeBytes: 1000,
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'This match is no longer accepting results.',
      });
      const after = await db
        .select()
        .from(schema.uploads)
        .where(eq(schema.uploads.matchId, matchId));
      expect(after).toHaveLength(before.length);
      expect((await matchRow(matchId)).status).toBe('confirmed');
    });
  });

  // ---------------------------------------------------------- F8.5 no-show

  describe('F8.5 no-show and forfeit', () => {
    it('no-show is gated 20 minutes after the agreed start', async () => {
      const { matchId, a } = await createMatch(10 * 60 * 1000);
      const proof = (await upload(a, matchId, undefined, 'no_show_proof')).view.id;
      await expect(
        results.reportNoShow(a, matchId, { uploadId: proof, idempotencyKey: key() }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'You can report a no-show 20 minutes after the agreed start.',
      });
    });

    it('requires proof of attempt (a result-proof upload does not count)', async () => {
      const { matchId, a } = await createMatch();
      const wrongPurpose = (await upload(a, matchId)).view.id;
      await expect(
        results.reportNoShow(a, matchId, { uploadId: wrongPurpose, idempotencyKey: key() }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('uncontested claim → forfeited after the window, with rating and reputation-debt events', async () => {
      const { matchId, a, b } = await createMatch();
      const proof = (await upload(a, matchId, undefined, 'no_show_proof')).view.id;
      const res = await results.reportNoShow(a, matchId, {
        uploadId: proof,
        idempotencyKey: key(),
      });
      expect(res.status).toBe('awaiting_confirmation');
      expect(await outbox('noshow.reported', matchId)).toHaveLength(1);

      await db
        .update(schema.matches)
        .set({ confirmationDeadline: new Date(Date.now() - 1000) })
        .where(eq(schema.matches.id, matchId));
      await sweepUntilSettled(matchId);
      const m = await matchRow(matchId);
      expect(m.status).toBe('forfeited');
      expect(m.winnerSide).toBe(0);
      expect(m.decidedVia).toBe('no_show_timeout');
      const [forfeit] = await outbox('match.forfeited', matchId);
      expect(forfeit!.payload).toMatchObject({ winnerUserId: a, forfeitingUserId: b });
      const [debt] = await outbox('reputation.debt', b);
      expect(debt!.payload).toMatchObject({ userId: b, matchId, reason: 'no_show' });
    });

    it('contested claim → dispute for a moderator forfeit decision', async () => {
      const { matchId, a, b } = await createMatch();
      await results.reportNoShow(a, matchId, {
        uploadId: (await upload(a, matchId, undefined, 'no_show_proof')).view.id,
        idempotencyKey: key(),
      });
      const res = await results.submitResult(b, matchId, {
        outcome: 'win',
        score: goals(3, 0),
        uploadId: (await upload(b, matchId)).view.id,
        idempotencyKey: key(),
      });
      expect(res.status).toBe('disputed');
      const [dispute] = await db
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.matchId, matchId));
      expect(dispute).toMatchObject({ source: 'no_show_contested', reason: 'no_show_contested' });
    });

    it('conceded claim (opponent confirms) → forfeited immediately', async () => {
      const { matchId, a, b } = await createMatch();
      await results.reportNoShow(a, matchId, {
        uploadId: (await upload(a, matchId, undefined, 'no_show_proof')).view.id,
        idempotencyKey: key(),
      });
      const res = await results.confirmResult(b, matchId, { idempotencyKey: key() });
      expect(res.status).toBe('forfeited');
      expect((await matchRow(matchId)).decidedVia).toBe('no_show_conceded');
    });
  });
});
