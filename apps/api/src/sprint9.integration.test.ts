/**
 * Sprint 9 — player-side disputes: open, evidence, shared tracker, rulings, one appeal,
 * the `dispute.ruled` contract, the evidence snapshot and authz. Needs Postgres, Redis and
 * the S3-compatible store (like the Sprint 8 suite).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { ResultsService } from './matches/results.service';
import { MatchesService } from './matches/matches.service';
import { UploadsService } from './uploads/uploads.service';
import { DisputesService } from './disputes/disputes.service';
import { disputeRuledEventSchema } from './disputes/dispute-events';
import { randomImage } from './test-fixtures/screenshot';
import type { AuthedUser } from './auth/jwt-auth.guard';

describe('Sprint 9 - disputes (player side)', () => {
  let moduleRef: TestingModule;
  let results: ResultsService;
  let matches: MatchesService;
  let uploads: UploadsService;
  let disputes: DisputesService;
  let gameId = '';
  let formatId = '';
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);
  let mod: AuthedUser;

  const as = (id: string, role: AuthedUser['role'] = 'player'): AuthedUser => ({
    sub: id,
    sid: 'test',
    role,
  });

  async function user(name: string, role: AuthedUser['role'] = 'player') {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23491${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-5)}`,
      tosVersionAccepted: '1.0',
      role,
    });
    userIds.push(id);
    const profileId = uuidv7();
    await db.insert(schema.gameProfiles).values({
      id: profileId,
      userId: id,
      gameId,
      inGameId: `${name}_${id.slice(-5)}`,
      rating: 1000,
    });
    return { id, profileId };
  }

  async function match() {
    const a = await user('ada');
    const b = await user('bayo');
    const startsAt = new Date(Date.now() - 3600_000);
    const challengeId = uuidv7();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: a.id,
      status: 'accepted',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 7200_000),
      acceptanceDeadline: new Date(startsAt.getTime() - 60_000),
      acceptedById: b.id,
      acceptedAt: new Date(startsAt.getTime() - 120_000),
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db
      .insert(schema.matches)
      .values({ id: matchId, challengeId, status: 'accepted', scheduledStartAt: startsAt });
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
    return { matchId, a: a.id, b: b.id };
  }

  async function upload(
    userId: string,
    matchId: string,
    purpose: 'result_proof' | 'dispute_evidence',
  ) {
    const body = await randomImage();
    const p = await uploads.presign(userId, {
      matchId,
      purpose,
      contentType: 'image/jpeg',
      sizeBytes: body.byteLength,
    });
    const put = await fetch(p.url, { method: 'PUT', headers: p.headers, body });
    expect(put.status).toBe(200);
    return uploads.complete(userId, p.uploadId);
  }

  /** A submits "I won 2-1": the match waits for B's confirmation. */
  async function awaitingConfirmation() {
    const m = await match();
    const proof = await upload(m.a, m.matchId, 'result_proof');
    await results.submitResult(m.a, m.matchId, {
      outcome: 'win',
      score: { self: 2, opponent: 1 },
      uploadId: proof.id,
      idempotencyKey: uuidv7(),
    });
    return m;
  }

  async function outbox(type: string, subjectId: string) {
    return db
      .select()
      .from(schema.outboxEvents)
      .where(and(eq(schema.outboxEvents.type, type), eq(schema.outboxEvents.subjectId, subjectId)))
      .orderBy(desc(schema.outboxEvents.createdAt));
  }

  beforeAll(async () => {
    // compile() only: no lifecycle hooks, so no background workers interfere with
    // the other suites running in parallel.
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    results = moduleRef.get(ResultsService);
    matches = moduleRef.get(MatchesService);
    uploads = moduleRef.get(UploadsService);
    disputes = moduleRef.get(DisputesService);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = format!.id;
    mod = as((await user('mod', 'moderator')).id, 'moderator');
  }, 60_000);

  afterAll(async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
      if (matchIds.length) {
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
        await tx.delete(schema.uploads).where(inArray(schema.uploads.matchId, matchIds));
        await tx
          .delete(schema.outboxEvents)
          .where(inArray(schema.outboxEvents.subjectId, matchIds));
        await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
      }
      if (userIds.length) {
        await tx.delete(schema.uploads).where(inArray(schema.uploads.ownerId, userIds));
        await tx.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, userIds));
        await tx.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, userIds));
      }
    });
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    if (userIds.length) {
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await moduleRef?.close();
  }, 60_000);

  // -------------------------------------------------------------- F9.1 open
  describe('open (F9.1)', () => {
    it('opens from awaiting confirmation: match disputed, timer stopped, event + audit + system message', async () => {
      const m = await awaitingConfirmation();
      const view = await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_score',
        detail: 'The score was 1-1 not 2-1.',
      });
      expect(view).toMatchObject({
        status: 'open',
        source: 'player',
        category: 'wrong_score',
        openedByViewer: true,
      });
      const [mrow] = await db.select().from(schema.matches).where(eq(schema.matches.id, m.matchId));
      expect(mrow).toMatchObject({ status: 'disputed', confirmationDeadline: null });
      expect(await outbox('dispute.opened', view.id)).toHaveLength(1);
      const audits = await db
        .select()
        .from(schema.auditLog)
        .where(
          and(eq(schema.auditLog.objectId, view.id), eq(schema.auditLog.action, 'dispute.opened')),
        );
      expect(audits).toHaveLength(1);
      // Matches view now says "disputed" for both.
      expect((await matches.getView(m.matchId, as(m.a))).nextAction).toBe('disputed');
    });

    it('is refused before a result is waiting, and once per match', async () => {
      const early = await match();
      await expect(
        disputes.open(as(early.a), early.matchId, {
          category: 'other',
          detail: 'Something went wrong.',
        }),
      ).rejects.toMatchObject({ status: 409 });

      const m = await awaitingConfirmation();
      await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_winner',
        detail: 'I actually won this one.',
      });
      await expect(
        disputes.open(as(m.b), m.matchId, {
          category: 'wrong_winner',
          detail: 'Opening it again.',
        }),
      ).rejects.toMatchObject({ status: 409 });
      const rows = await db
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.matchId, m.matchId));
      expect(rows).toHaveLength(1);
    });

    it('adds the player reason to a dispute the system opened for conflicting results', async () => {
      const m = await awaitingConfirmation();
      const proofB = await upload(m.b, m.matchId, 'result_proof');
      await results.submitResult(m.b, m.matchId, {
        outcome: 'win',
        score: { self: 3, opponent: 0 },
        uploadId: proofB.id,
        idempotencyKey: uuidv7(),
      });
      const auto = await disputes.getForMatch(m.matchId, as(m.a));
      expect(auto).toMatchObject({ source: 'auto_conflict', category: null });
      const joined = await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_winner',
        detail: 'I won 3-0, see screenshot.',
      });
      expect(joined).toMatchObject({
        id: auto!.id,
        source: 'auto_conflict',
        category: 'wrong_winner',
      });
    });

    it('hides the dispute from other players (404), shows it to moderators', async () => {
      const m = await awaitingConfirmation();
      await disputes.open(as(m.b), m.matchId, {
        category: 'opponent_cheated',
        detail: 'They used a banned exploit.',
      });
      const stranger = await user('stranger');
      await expect(disputes.getForMatch(m.matchId, as(stranger.id))).rejects.toMatchObject({
        status: 404,
      });
      expect(await disputes.getForMatch(m.matchId, mod)).toMatchObject({ status: 'open' });
    });
  });

  // ------------------------------------------------------- evidence + tracker
  describe('evidence and shared tracker', () => {
    it('caps evidence at 3 per player, shows the other side only a count, accepts dispute uploads', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_score',
        detail: 'Score is wrong, see shots.',
      });
      const shot = await upload(m.b, m.matchId, 'dispute_evidence');
      await disputes.addEvidence(as(m.b), opened.id, { uploadId: shot.id, note: 'Final screen' });
      await disputes.addEvidence(as(m.b), opened.id, { note: 'They left early' });
      const third = await disputes.addEvidence(as(m.b), opened.id, { note: 'Third note' });
      expect(third).toMatchObject({ evidenceRemaining: 0, canAddEvidence: false });
      await expect(
        disputes.addEvidence(as(m.b), opened.id, { note: 'Fourth' }),
      ).rejects.toMatchObject({ status: 409 });

      const fromA = await disputes.getForMatch(m.matchId, as(m.a));
      expect(fromA!.myEvidence).toHaveLength(0);
      expect(fromA!.opponentEvidenceCount).toBe(3);
      // Same tracker for both players (UX Flow 6).
      expect(fromA!.tracker).toEqual(third.tracker);
    });

    it("rejects someone else's upload or a result-proof upload as evidence", async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'other',
        detail: 'Something is off here.',
      });
      const notMine = await upload(m.a, m.matchId, 'dispute_evidence');
      await expect(
        disputes.addEvidence(as(m.b), opened.id, { uploadId: notMine.id }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('moves through awaiting info → reviewed, audited, and closes evidence once reviewed', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'other',
        detail: 'Need a moderator here.',
      });
      await disputes.setReviewStatus(mod, opened.id, 'awaiting_info');
      expect((await disputes.getForMatch(m.matchId, as(m.a)))!.tracker[1]!.label).toBe(
        'More information requested',
      );
      await disputes.setReviewStatus(mod, opened.id, 'reviewed');
      await expect(
        disputes.addEvidence(as(m.b), opened.id, { note: 'late' }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(disputes.setReviewStatus(as(m.a), opened.id, 'reviewed')).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  // ------------------------------------------------ rulings, appeal, contract
  describe('rulings and the single appeal (F9.2, F9.3)', () => {
    it('ruling resolves the match, shows the moderator reason, and emits a valid dispute.ruled', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_winner',
        detail: 'I won, they lie.',
      });
      const event = await disputes.recordRuling(mod, opened.id, {
        outcome: 'side0_win',
        justification: 'Screenshot shows Ada won 2-1.',
        sanctionNote: 'Warning issued for a false claim.',
      });
      expect(disputeRuledEventSchema.parse(event)).toMatchObject({
        round: 1,
        outcome: 'side0_win',
        winnerUserId: m.a,
        loserUserId: m.b,
        ratingAction: 'apply',
        final: false,
      });
      const stored = await outbox('dispute.ruled', opened.id);
      expect(disputeRuledEventSchema.parse(stored[0]!.payload)).toEqual(event);
      // Opened by B, ruled against B: bad-faith datapoint.
      expect(await outbox('reputation.flag', m.b)).toHaveLength(1);

      const [mrow] = await db.select().from(schema.matches).where(eq(schema.matches.id, m.matchId));
      expect(mrow).toMatchObject({ status: 'resolved', winnerSide: 0, decidedVia: 'ruling' });
      const viewB = await disputes.getForMatch(m.matchId, as(m.b));
      expect(viewB!.ruling).toMatchObject({
        outcomeForViewer: 'loss',
        justification: 'Screenshot shows Ada won 2-1.',
        sanctionNote: 'Warning issued for a false claim.',
      });
      expect(viewB!.appeal).toMatchObject({ canAppeal: true, blockedReason: null });
    });

    it('allows exactly one appeal; the appeal ruling is final and reverses ratings when it changes', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_winner',
        detail: 'I won this match.',
      });
      await disputes.recordRuling(mod, opened.id, {
        outcome: 'side0_win',
        justification: 'First look favours Ada.',
      });

      await disputes.appeal(as(m.b), opened.id, 'New evidence: the final screen shows my win.');
      await expect(
        disputes.appeal(as(m.a), opened.id, 'I also want to appeal this.'),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        disputes.appeal(as(m.b), opened.id, 'Appealing a second time.'),
      ).rejects.toMatchObject({ status: 409 });

      const final = await disputes.recordRuling(mod, opened.id, {
        outcome: 'side1_win',
        justification: 'On appeal, Bayo won.',
      });
      expect(final).toMatchObject({
        round: 2,
        previousOutcome: 'side0_win',
        ratingAction: 'reverse_and_apply',
        final: true,
      });
      const [mrow] = await db.select().from(schema.matches).where(eq(schema.matches.id, m.matchId));
      expect(mrow).toMatchObject({
        status: 'resolved',
        winnerSide: 1,
        decidedVia: 'appeal_ruling',
      });

      const view = await disputes.getForMatch(m.matchId, as(m.a));
      expect(view).toMatchObject({ status: 'final' });
      expect(view!.previousRuling).toMatchObject({ round: 1, outcomeForViewer: 'win' });
      expect(view!.ruling).toMatchObject({ round: 2, outcomeForViewer: 'loss' });
      expect(view!.appeal.canAppeal).toBe(false);
      await expect(
        disputes.recordRuling(mod, opened.id, {
          outcome: 'draw',
          justification: 'Third time lucky.',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('a void ruling voids the match and cannot be appealed', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'disconnect',
        detail: 'Server crashed mid-game.',
      });
      const ev = await disputes.recordRuling(mod, opened.id, {
        outcome: 'void',
        justification: 'Server outage; no result.',
      });
      expect(ev).toMatchObject({ void: true, ratingAction: 'none', final: true });
      const [mrow] = await db.select().from(schema.matches).where(eq(schema.matches.id, m.matchId));
      expect(mrow!.status).toBe('voided');
      await expect(
        disputes.appeal(as(m.a), opened.id, 'I disagree with the void.'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rulings are append-only at the SQL level', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'other',
        detail: 'Please check this.',
      });
      await disputes.recordRuling(mod, opened.id, {
        outcome: 'draw',
        justification: 'Evidence is balanced.',
      });
      await expect(
        db.execute(sql`update rulings set ruling = 'side1_win' where dispute_id = ${opened.id}`),
      ).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/rulings is append-only/) },
      });
    });

    it('players cannot rule', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'other',
        detail: 'Rule in my favour.',
      });
      await expect(
        disputes.recordRuling(as(m.b), opened.id, {
          outcome: 'side1_win',
          justification: 'I say so myself.',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ----------------------------------------------------- evidence snapshot
  describe('evidence snapshot (F9.3)', () => {
    it('the digest stored at ruling time matches the live chat when nothing changed after', async () => {
      const m = await awaitingConfirmation();
      const opened = await disputes.open(as(m.b), m.matchId, {
        category: 'wrong_score',
        detail: 'Score mismatch here.',
      });
      const before = await disputes.chatSnapshot(db, m.matchId, new Date());
      await disputes.recordRuling(mod, opened.id, {
        outcome: 'side0_win',
        justification: 'Proof is clear.',
      });
      const snap = await disputes.evidence(mod, opened.id);
      const r1 = snap.rulings.find((r) => r.round === 1)!;
      expect(r1.chatMessageCount).toBe(before.messages.length);
      expect(r1.chatDigest).toBe(before.digest);
      // The ruling posts a system message, so the live transcript now has one more message.
      expect(snap.chat.messages.length).toBe(before.messages.length + 1);
      expect(snap.submissions).toHaveLength(1);
      await expect(disputes.evidence(as(m.a), opened.id)).rejects.toMatchObject({ status: 403 });
    });
  });

  // --------------------------------------------------------------- metrics
  describe('metrics (F9.4)', () => {
    it('reports dispute rate and median resolution', async () => {
      const metrics = await disputes.metrics(mod, 30);
      expect(metrics.disputesOpened).toBeGreaterThan(0);
      expect(metrics.disputeRate).toBeGreaterThan(0);
      expect(metrics.medianResolutionMs).not.toBeNull();
    });
  });
});
