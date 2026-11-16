import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { enforceRateLimit } from '../shared/rate-limit';
import { postSystemMessage } from '../matches/match-chat';
import { cancelConfirmationDeadline } from '../matches/match-deadline.queue';
import { disputeRuledEventSchema, type DisputeRuledEvent } from './dispute-events';
import {
  APPEAL_BLOCK_COPY,
  MAX_EVIDENCE_PER_PLAYER,
  acceptsEvidence,
  appealBlock,
  ratingActionFor,
  rulingRoundFor,
  trackerSteps,
  winnerSideOf,
  type DisputeCategory,
  type DisputeStatus,
  type RulingOutcome,
  type TrackerStep,
} from './disputes.rules';

type DisputeRow = typeof schema.disputes.$inferSelect;
type RulingRow = typeof schema.rulings.$inferSelect;

export const DISPUTE_MESSAGES = {
  notFound: 'Dispute not found',
  cannotOpen: 'A dispute can be opened while the result is waiting for confirmation.',
  alreadyOpen: 'You have already opened this dispute. Add evidence to it instead.',
  evidenceClosed: 'Evidence can no longer be added to this dispute.',
  evidenceCap: `You can add up to ${MAX_EVIDENCE_PER_PLAYER} pieces of evidence.`,
  evidenceInvalid: 'That screenshot cannot be used. Upload it again.',
  notRulable: 'This dispute is not waiting for a ruling.',
  systemOpened:
    'A dispute has been opened. A moderator will review both results, the evidence and this chat.',
  systemRuled: 'A moderator has ruled on the dispute. See the match for the reason.',
  systemAppealed: 'The ruling has been appealed. A moderator will review it again.',
} as const;

export interface DisputeRulingView {
  round: 1 | 2;
  outcome: RulingOutcome;
  /** Outcome from the viewer's side, for participants. */
  outcomeForViewer: 'win' | 'loss' | 'draw' | 'void' | null;
  justification: string;
  sanctionNote: string | null;
  ruledAt: string;
}

export interface DisputeView {
  id: string;
  matchId: string;
  status: DisputeStatus;
  source: string;
  category: string | null;
  reason: string;
  openedByViewer: boolean;
  openedAt: string;
  /** SLA clock starts at open (enforcement is Sprint 12). */
  slaStartedAt: string;
  tracker: TrackerStep[];
  myEvidence: Array<{
    id: string;
    uploadId: string | null;
    note: string | null;
    createdAt: string;
  }>;
  /** Players see how much the other side sent, not the evidence itself. */
  opponentEvidenceCount: number;
  canAddEvidence: boolean;
  evidenceRemaining: number;
  ruling: DisputeRulingView | null;
  previousRuling: DisputeRulingView | null;
  appeal: { canAppeal: boolean; blockedReason: string | null; appealedByViewer: boolean };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

@Injectable()
export class DisputesService {
  // ------------------------------------------------------------ access helpers

  /** The match's sides, and whether the viewer is one of them (staff may read). */
  private async loadParticipants(matchId: string, viewer: AuthedUser) {
    const sides = await db
      .select({ userId: schema.matchSides.userId, side: schema.matchSides.side })
      .from(schema.matchSides)
      .where(eq(schema.matchSides.matchId, matchId))
      .orderBy(asc(schema.matchSides.side));
    if (sides.length === 0) throw new NotFoundException(DISPUTE_MESSAGES.notFound);
    const mine = sides.find((s) => s.userId === viewer.sub) ?? null;
    const staff = viewer.role === 'moderator' || viewer.role === 'admin';
    // 404 for outsiders so dispute and match ids cannot be probed.
    if (!mine && !staff) throw new NotFoundException(DISPUTE_MESSAGES.notFound);
    return { sides, mine, staff };
  }

  private async loadDispute(disputeId: string): Promise<DisputeRow> {
    const [row] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, disputeId));
    if (!row) throw new NotFoundException(DISPUTE_MESSAGES.notFound);
    return row;
  }

  private async audit(
    conn: Tx | typeof db,
    actorId: string | null,
    action: string,
    disputeId: string,
    after: Record<string, unknown>,
  ) {
    await conn.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId,
      action,
      objectType: 'dispute',
      objectId: disputeId,
      after,
    });
  }

  // ------------------------------------------------------------------ reads

  async getForMatch(matchId: string, viewer: AuthedUser): Promise<DisputeView | null> {
    const { sides, mine } = await this.loadParticipants(matchId, viewer);
    const [d] = await db.select().from(schema.disputes).where(eq(schema.disputes.matchId, matchId));
    if (!d) return null;

    const rulings = await db
      .select()
      .from(schema.rulings)
      .where(eq(schema.rulings.disputeId, d.id))
      .orderBy(desc(schema.rulings.round));
    const evidence = await db
      .select()
      .from(schema.disputeEvidence)
      .where(eq(schema.disputeEvidence.disputeId, d.id))
      .orderBy(asc(schema.disputeEvidence.createdAt));
    const [appeal] = await db
      .select()
      .from(schema.disputeAppeals)
      .where(eq(schema.disputeAppeals.disputeId, d.id));

    const status = d.status as DisputeStatus;
    const latest = rulings[0] ?? null;
    const myEvidence = mine ? evidence.filter((e) => e.submittedById === viewer.sub) : [];
    const block = appealBlock({
      status,
      lastOutcome: (latest?.ruling as RulingOutcome | undefined) ?? null,
      hasAppeal: Boolean(appeal),
    });
    const toView = (r: RulingRow): DisputeRulingView => {
      const outcome = r.ruling as RulingOutcome;
      const winner = winnerSideOf(outcome);
      return {
        round: r.round as 1 | 2,
        outcome,
        outcomeForViewer: !mine
          ? null
          : outcome === 'void'
            ? 'void'
            : winner === null
              ? 'draw'
              : winner === mine.side
                ? 'win'
                : 'loss',
        justification: r.justification,
        sanctionNote: r.sanctionNote,
        ruledAt: r.createdAt.toISOString(),
      };
    };

    return {
      id: d.id,
      matchId,
      status,
      source: d.source,
      category: d.category,
      reason: d.reason,
      openedByViewer: d.raisedById === viewer.sub,
      openedAt: d.createdAt.toISOString(),
      slaStartedAt: d.createdAt.toISOString(),
      tracker: trackerSteps(status, Boolean(appeal)),
      myEvidence: myEvidence.map((e) => ({
        id: e.id,
        uploadId: e.uploadId,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
      opponentEvidenceCount: mine
        ? evidence.filter(
            (e) =>
              e.submittedById !== viewer.sub && sides.some((s) => s.userId === e.submittedById),
          ).length
        : evidence.length,
      canAddEvidence:
        Boolean(mine) && acceptsEvidence(status) && myEvidence.length < MAX_EVIDENCE_PER_PLAYER,
      evidenceRemaining: Math.max(0, MAX_EVIDENCE_PER_PLAYER - myEvidence.length),
      ruling: latest ? toView(latest) : null,
      previousRuling: rulings[1] ? toView(rulings[1]) : null,
      appeal: {
        canAppeal: Boolean(mine) && block === null,
        blockedReason: block ? APPEAL_BLOCK_COPY[block] : null,
        appealedByViewer: appeal?.appellantId === viewer.sub,
      },
    };
  }

  // ----------------------------------------------------------- player writes

  /**
   * Open a dispute (F9.1). Allowed while the opponent's result waits for confirmation
   * (awaiting_confirmation → disputed), or on a dispute the system already opened for
   * conflicting results, where it adds the player's reason. One dispute per match.
   */
  async open(
    viewer: AuthedUser,
    matchId: string,
    input: { category: DisputeCategory; detail: string; uploadIds?: string[] },
  ): Promise<DisputeView> {
    const { mine } = await this.loadParticipants(matchId, viewer);
    if (!mine) throw new ForbiddenException('Only the players can open a dispute');
    await enforceRateLimit(`rl:disputes:open:${viewer.sub}`, 5, 3_600_000);
    const uploadIds = input.uploadIds ?? [];
    if (uploadIds.length > MAX_EVIDENCE_PER_PLAYER) {
      throw new BadRequestException(DISPUTE_MESSAGES.evidenceCap);
    }

    const now = new Date();
    let createdNew = false;
    await db.transaction(async (tx) => {
      const [m] = await tx
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
        .for('update');
      if (!m) throw new NotFoundException(DISPUTE_MESSAGES.notFound);
      const [existing] = await tx
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.matchId, matchId))
        .for('update');

      let disputeId: string;
      if (existing) {
        if (existing.raisedById === viewer.sub || existing.category) {
          throw new ConflictException(DISPUTE_MESSAGES.alreadyOpen);
        }
        if (!acceptsEvidence(existing.status as DisputeStatus)) {
          throw new ConflictException(DISPUTE_MESSAGES.evidenceClosed);
        }
        // A system-opened dispute: the player's reason joins it.
        await tx
          .update(schema.disputes)
          .set({ category: input.category, detail: input.detail, updatedAt: now })
          .where(eq(schema.disputes.id, existing.id));
        disputeId = existing.id;
        await this.audit(tx, viewer.sub, 'dispute.reason_added', disputeId, {
          category: input.category,
        });
      } else {
        if (m.status !== 'awaiting_confirmation')
          throw new ConflictException(DISPUTE_MESSAGES.cannotOpen);
        const moved = await tx
          .update(schema.matches)
          .set({
            status: 'disputed',
            disputedAt: now,
            confirmationDeadline: null,
            version: sql`${schema.matches.version} + 1`,
            updatedAt: now,
          })
          .where(and(eq(schema.matches.id, matchId), eq(schema.matches.version, m.version)))
          .returning({ id: schema.matches.id });
        if (moved.length === 0) throw new ConflictException('The match changed; try again');
        disputeId = uuidv7();
        await tx.insert(schema.disputes).values({
          id: disputeId,
          matchId,
          raisedById: viewer.sub,
          source: 'player',
          reason: input.category,
          category: input.category,
          detail: input.detail,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        });
        await tx
          .update(schema.matchSides)
          .set({ disputedAt: now, updatedAt: now })
          .where(eq(schema.matchSides.matchId, matchId));
        await postSystemMessage(tx, matchId, DISPUTE_MESSAGES.systemOpened);
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'dispute.opened',
          subjectId: disputeId,
          payload: {
            disputeId,
            matchId,
            reason: input.category,
            source: 'player',
            openedBy: viewer.sub,
          },
        });
        await this.audit(tx, viewer.sub, 'dispute.opened', disputeId, {
          category: input.category,
          matchId,
        });
        createdNew = true;
      }

      for (const uploadId of uploadIds) {
        await this.attachEvidence(tx, disputeId, viewer.sub, matchId, uploadId, null);
      }
    });

    // The confirmation timer no longer applies once the match is disputed.
    if (createdNew) await cancelConfirmationDeadline(matchId);
    return (await this.getForMatch(matchId, viewer))!;
  }

  async addEvidence(
    viewer: AuthedUser,
    disputeId: string,
    input: { uploadId?: string; note?: string },
  ): Promise<DisputeView> {
    const d = await this.loadDispute(disputeId);
    const { mine } = await this.loadParticipants(d.matchId, viewer);
    if (!mine) throw new ForbiddenException('Only the players can add evidence');
    await enforceRateLimit(`rl:disputes:evidence:${viewer.sub}`, 20, 3_600_000);
    if (!input.uploadId && !input.note?.trim()) {
      throw new BadRequestException('Add a screenshot or a note');
    }
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: schema.disputes.status })
        .from(schema.disputes)
        .where(eq(schema.disputes.id, disputeId))
        .for('update');
      if (!locked || !acceptsEvidence(locked.status as DisputeStatus)) {
        throw new ConflictException(DISPUTE_MESSAGES.evidenceClosed);
      }
      await this.attachEvidence(
        tx,
        disputeId,
        viewer.sub,
        d.matchId,
        input.uploadId ?? null,
        input.note?.trim() || null,
      );
    });
    return (await this.getForMatch(d.matchId, viewer))!;
  }

  private async attachEvidence(
    tx: Tx,
    disputeId: string,
    userId: string,
    matchId: string,
    uploadId: string | null,
    note: string | null,
  ) {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(schema.disputeEvidence)
      .where(
        and(
          eq(schema.disputeEvidence.disputeId, disputeId),
          eq(schema.disputeEvidence.submittedById, userId),
        ),
      );
    if (n >= MAX_EVIDENCE_PER_PLAYER) throw new ConflictException(DISPUTE_MESSAGES.evidenceCap);
    if (uploadId) {
      const [u] = await tx
        .select({
          ownerId: schema.uploads.ownerId,
          matchId: schema.uploads.matchId,
          status: schema.uploads.status,
          purpose: schema.uploads.purpose,
        })
        .from(schema.uploads)
        .where(eq(schema.uploads.id, uploadId));
      if (
        !u ||
        u.ownerId !== userId ||
        u.matchId !== matchId ||
        u.status !== 'ready' ||
        u.purpose !== 'dispute_evidence'
      ) {
        throw new BadRequestException(DISPUTE_MESSAGES.evidenceInvalid);
      }
    }
    const id = uuidv7();
    await tx
      .insert(schema.disputeEvidence)
      .values({ id, disputeId, submittedById: userId, uploadId, note });
    await this.audit(tx, userId, 'dispute.evidence_added', disputeId, { evidenceId: id, uploadId });
  }

  /** The one appeal (PRD). Either player, after a non-void first ruling. */
  async appeal(viewer: AuthedUser, disputeId: string, reason: string): Promise<DisputeView> {
    const d = await this.loadDispute(disputeId);
    const { mine } = await this.loadParticipants(d.matchId, viewer);
    if (!mine) throw new ForbiddenException('Only the players can appeal');
    const now = new Date();
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.id, disputeId))
        .for('update');
      const [last] = await tx
        .select({ ruling: schema.rulings.ruling })
        .from(schema.rulings)
        .where(eq(schema.rulings.disputeId, disputeId))
        .orderBy(desc(schema.rulings.round))
        .limit(1);
      const [existingAppeal] = await tx
        .select({ id: schema.disputeAppeals.id })
        .from(schema.disputeAppeals)
        .where(eq(schema.disputeAppeals.disputeId, disputeId));
      const block = appealBlock({
        status: locked!.status as DisputeStatus,
        lastOutcome: (last?.ruling as RulingOutcome | undefined) ?? null,
        hasAppeal: Boolean(existingAppeal),
      });
      if (block) throw new ConflictException(APPEAL_BLOCK_COPY[block]);
      await tx
        .insert(schema.disputeAppeals)
        .values({ id: uuidv7(), disputeId, appellantId: viewer.sub, reason });
      await tx
        .update(schema.disputes)
        .set({ status: 'appealed', appealedAt: now, updatedAt: now })
        .where(eq(schema.disputes.id, disputeId));
      await postSystemMessage(tx, d.matchId, DISPUTE_MESSAGES.systemAppealed);
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'dispute.appealed',
        subjectId: disputeId,
        payload: { disputeId, matchId: d.matchId, appellantId: viewer.sub },
      });
      await this.audit(tx, viewer.sub, 'dispute.appealed', disputeId, {
        reasonLength: reason.length,
      });
    });
    return (await this.getForMatch(d.matchId, viewer))!;
  }

  // --------------------------------------------------- moderator operations
  // Sprint 12 builds the queue UI on these; Sprint 9 exposes them to staff so the player
  // surfaces (tracker, ruling view, appeal) work end to end.

  async setReviewStatus(
    staff: AuthedUser,
    disputeId: string,
    status: 'awaiting_info' | 'reviewed',
  ): Promise<void> {
    this.requireStaff(staff);
    const d = await this.loadDispute(disputeId);
    if (!['open', 'awaiting_info', 'reviewed'].includes(d.status))
      throw new ConflictException(DISPUTE_MESSAGES.notRulable);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.disputes)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.disputes.id, disputeId));
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'dispute.status_changed',
        subjectId: disputeId,
        payload: { disputeId, matchId: d.matchId, status },
      });
      await this.audit(tx, staff.sub, `dispute.${status}`, disputeId, {
        from: d.status,
        to: status,
      });
    });
  }

  /**
   * Record a ruling (round 1, or round 2 on an appeal). Moves the match to resolved (or
   * voided), stores an evidence snapshot digest, and emits `dispute.ruled` per the contract.
   * A ruling against the player who opened the dispute records a bad-faith datapoint.
   */
  async recordRuling(
    staff: AuthedUser,
    disputeId: string,
    input: { outcome: RulingOutcome; justification: string; sanctionNote?: string },
  ): Promise<DisputeRuledEvent> {
    this.requireStaff(staff);
    const now = new Date();
    return db.transaction(async (tx) => {
      const [d] = await tx
        .select()
        .from(schema.disputes)
        .where(eq(schema.disputes.id, disputeId))
        .for('update');
      if (!d) throw new NotFoundException(DISPUTE_MESSAGES.notFound);
      const round = rulingRoundFor(d.status as DisputeStatus);
      if (!round) throw new ConflictException(DISPUTE_MESSAGES.notRulable);

      const [m] = await tx
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, d.matchId))
        .for('update');
      const [challenge] = await tx
        .select({ gameId: schema.challenges.gameId })
        .from(schema.challenges)
        .where(eq(schema.challenges.id, m!.challengeId));
      const sides = await tx
        .select({ userId: schema.matchSides.userId, side: schema.matchSides.side })
        .from(schema.matchSides)
        .where(eq(schema.matchSides.matchId, d.matchId))
        .orderBy(asc(schema.matchSides.side));
      const [previous] = await tx
        .select({ ruling: schema.rulings.ruling })
        .from(schema.rulings)
        .where(eq(schema.rulings.disputeId, disputeId))
        .orderBy(desc(schema.rulings.round))
        .limit(1);
      const previousOutcome = (previous?.ruling as RulingOutcome | undefined) ?? null;

      const snapshot = await this.chatSnapshot(tx, d.matchId, now);
      await tx.insert(schema.rulings).values({
        id: uuidv7(),
        disputeId,
        moderatorId: staff.sub,
        ruling: input.outcome,
        justification: input.justification,
        round,
        sanctionNote: input.sanctionNote ?? null,
        chatDigest: snapshot.digest,
        chatMessageCount: snapshot.messages.length,
        createdAt: now,
      });

      const winnerSide = winnerSideOf(input.outcome);
      const decidedVia = round === 2 ? 'appeal_ruling' : 'ruling';
      if (input.outcome === 'void') {
        await tx
          .update(schema.matches)
          .set({
            status: 'voided',
            voidedAt: now,
            winnerSide: null,
            decidedVia,
            version: sql`${schema.matches.version} + 1`,
            updatedAt: now,
          })
          .where(eq(schema.matches.id, d.matchId));
      } else {
        // disputed → resolved (round 1); resolved stays resolved with the new winner (round 2).
        await tx
          .update(schema.matches)
          .set({
            status: 'resolved',
            resolvedAt: m!.resolvedAt ?? now,
            winnerSide,
            decidedVia,
            version: sql`${schema.matches.version} + 1`,
            updatedAt: now,
          })
          .where(eq(schema.matches.id, d.matchId));
      }

      const final = round === 2 || input.outcome === 'void';
      await tx
        .update(schema.disputes)
        .set({
          status: final ? 'final' : 'ruled',
          ruledAt: d.ruledAt ?? now,
          finalAt: final ? now : null,
          updatedAt: now,
        })
        .where(eq(schema.disputes.id, disputeId));

      const userBySide = (side: number | null) =>
        side === null ? null : sides.find((s) => s.side === side)!.userId;
      const event: DisputeRuledEvent = disputeRuledEventSchema.parse({
        disputeId,
        matchId: d.matchId,
        gameId: challenge!.gameId,
        round,
        outcome: input.outcome,
        previousOutcome,
        winnerUserId: userBySide(winnerSide),
        loserUserId: winnerSide === null ? null : userBySide(1 - winnerSide),
        draw: input.outcome === 'draw',
        void: input.outcome === 'void',
        participants: sides.map((s) => s.userId),
        ratingAction: ratingActionFor(round, input.outcome, previousOutcome),
        final,
        ruledAt: now.toISOString(),
        resolutionMs: Math.max(0, now.getTime() - d.createdAt.getTime()),
      });
      await tx
        .insert(schema.outboxEvents)
        .values({ id: uuidv7(), type: 'dispute.ruled', subjectId: disputeId, payload: event });

      // F9.4 incentive guard: a player-opened dispute ruled against its opener.
      if (d.raisedById && winnerSide !== null && userBySide(winnerSide) !== d.raisedById) {
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'reputation.flag',
          subjectId: d.raisedById,
          payload: {
            userId: d.raisedById,
            reason: 'dispute_ruled_against_opener',
            disputeId,
            round,
          },
        });
      }

      await postSystemMessage(tx, d.matchId, DISPUTE_MESSAGES.systemRuled);
      await this.audit(
        tx,
        staff.sub,
        round === 2 ? 'dispute.appeal_ruled' : 'dispute.ruled',
        disputeId,
        {
          outcome: input.outcome,
          round,
          chatDigest: snapshot.digest,
        },
      );
      return event;
    });
  }

  /**
   * Evidence snapshot for moderators (F9.3): the match chat up to `at`, both result
   * submissions and every evidence upload with its hashes. The digest is what a ruling
   * stores, so a later read can prove the chat it ruled on is unchanged.
   */
  async evidence(staff: AuthedUser, disputeId: string) {
    this.requireStaff(staff);
    const d = await this.loadDispute(disputeId);
    const chat = await this.chatSnapshot(db, d.matchId, new Date());
    const submissions = await db
      .select({
        id: schema.resultSubmissions.id,
        submitterId: schema.resultSubmissions.submitterId,
        kind: schema.resultSubmissions.kind,
        result: schema.resultSubmissions.result,
        score: schema.resultSubmissions.score,
        uploadId: schema.resultSubmissions.uploadId,
        note: schema.resultSubmissions.note,
        submittedAt: schema.resultSubmissions.submittedAt,
      })
      .from(schema.resultSubmissions)
      .where(eq(schema.resultSubmissions.matchId, d.matchId))
      .orderBy(asc(schema.resultSubmissions.submittedAt));
    const evidence = await db
      .select({
        id: schema.disputeEvidence.id,
        submittedById: schema.disputeEvidence.submittedById,
        note: schema.disputeEvidence.note,
        uploadId: schema.disputeEvidence.uploadId,
        sha256: schema.uploads.sha256,
        phash: schema.uploads.phash,
        createdAt: schema.disputeEvidence.createdAt,
      })
      .from(schema.disputeEvidence)
      .leftJoin(schema.uploads, eq(schema.uploads.id, schema.disputeEvidence.uploadId))
      .where(eq(schema.disputeEvidence.disputeId, disputeId))
      .orderBy(asc(schema.disputeEvidence.createdAt));
    const rulings = await db
      .select({
        round: schema.rulings.round,
        chatDigest: schema.rulings.chatDigest,
        chatMessageCount: schema.rulings.chatMessageCount,
        createdAt: schema.rulings.createdAt,
      })
      .from(schema.rulings)
      .where(eq(schema.rulings.disputeId, disputeId))
      .orderBy(asc(schema.rulings.round));

    await this.audit(db, staff.sub, 'dispute.evidence_read', disputeId, {
      messages: chat.messages.length,
    });
    return { disputeId, matchId: d.matchId, chat, submissions, evidence, rulings };
  }

  /** Chat messages up to `at`, oldest first, with a SHA-256 digest of the transcript. */
  async chatSnapshot(conn: Tx | typeof db, matchId: string, at: Date) {
    const rows = await conn
      .select({
        id: schema.messages.id,
        senderId: schema.messages.senderId,
        kind: schema.messages.kind,
        body: schema.messages.body,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(eq(schema.conversations.matchId, matchId), lte(schema.messages.createdAt, at)))
      .orderBy(asc(schema.messages.createdAt), asc(schema.messages.id));
    const messages = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    return { messages, digest: sha256(JSON.stringify(messages)) };
  }

  /**
   * Success metrics (PRD: dispute rate under 10%, median resolution under 24h) over a
   * window. Rate = disputes opened / matches that reached an outcome or dispute.
   */
  async metrics(staff: AuthedUser, days = 30) {
    this.requireStaff(staff);
    const since = new Date(Date.now() - days * 86_400_000);
    const [{ disputes } = { disputes: 0 }] = await db
      .select({ disputes: count() })
      .from(schema.disputes)
      .where(gte(schema.disputes.createdAt, since));
    const [{ decided } = { decided: 0 }] = await db
      .select({ decided: count() })
      .from(schema.matches)
      .where(
        and(
          gte(schema.matches.updatedAt, since),
          sql`${schema.matches.status} IN ('confirmed','resolved','forfeited','voided','disputed')`,
        ),
      );
    const [median] = (
      await db.execute<{ median_ms: number | null }>(sql`
        select percentile_cont(0.5) within group (order by extract(epoch from (ruled_at - created_at)) * 1000) as median_ms
        from disputes where ruled_at is not null and created_at >= ${since}`)
    ).rows;
    return {
      windowDays: days,
      disputesOpened: Number(disputes),
      matchesDecided: Number(decided),
      disputeRate: Number(decided) > 0 ? Number(disputes) / Number(decided) : 0,
      medianResolutionMs:
        median?.median_ms === null || median?.median_ms === undefined
          ? null
          : Math.round(Number(median.median_ms)),
    };
  }

  private requireStaff(user: AuthedUser) {
    if (user.role !== 'moderator' && user.role !== 'admin') {
      throw new HttpException('Moderators only', HttpStatus.FORBIDDEN);
    }
  }
}
