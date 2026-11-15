import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
// Subpath import: the package root pulls in games.json, which the compiled CommonJS API cannot load.
import {
  RESULT_ERROR_MESSAGES,
  validateResult,
  type ResultSchema,
  type ScorePayload,
} from '@raise/game-configs/results';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import { containsBlockedTerm } from '../shared/content-filter';
import { SUBMITTABLE_MATCH_STATES } from '../uploads/uploads.service';
import { postSystemMessage } from './match-chat';
import { MatchesService, type MatchViewDto } from './matches.service';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { cancelConfirmationDeadline, scheduleConfirmationDeadline } from './match-deadline.queue';
import {
  mirrorOf,
  resolvePair,
  resolveTimeout,
  type Resolution,
  type SideSubmission,
  type SubmissionKind,
  type SubmittedOutcome,
} from './result-resolution';
import type {
  ConfirmResultRequest,
  ListMatchesQuery,
  ReportNoShowRequest,
  SubmitResultRequest,
} from './matches.schemas';

export { RESULT_WINDOW_MS, CONFIRMATION_WINDOW_MS, NO_SHOW_GATE_MS } from './matches.rules';
import {
  CONFIRMATION_WINDOW_MS,
  NO_SHOW_GATE_MS,
  RESULT_WINDOW_MS,
  requiredProofColumn,
  resultSchemaColumn,
  type RequiredProof,
} from './matches.rules';

export const ACTIVE_STATES = [...SUBMITTABLE_MATCH_STATES, 'disputed'] as const;

export const MATCH_MESSAGES = {
  notFound: 'Match not found',
  notStarted: 'This match has not started yet.',
  closed: 'This match is no longer accepting results.',
  resultWindowClosed: 'The 24-hour window to submit a result has closed.',
  confirmWindowClosed: 'The confirmation window has closed.',
  alreadySubmitted: 'You have already submitted a result for this match.',
  noShowTooEarly: 'You can report a no-show 20 minutes after the agreed start.',
  proofRequired: 'Add a screenshot of the result before submitting.',
  noShowProofRequired: 'Add a screenshot that shows you tried to start the match.',
  proofInvalid: 'That screenshot cannot be used. Upload it again.',
  nothingToConfirm: 'Your opponent has not submitted a result yet.',
  noteBlocked: 'Remove offensive words from the note.',
  disputeSystemMessage:
    'The submitted results do not match, so a dispute has been opened. A moderator will review both submissions and this chat.',
  noShowDisputeMessage:
    'A no-show was reported and contested, so a dispute has been opened. A moderator will decide the forfeit.',
} as const;

type MatchRow = typeof schema.matches.$inferSelect;
type SideRow = typeof schema.matchSides.$inferSelect;
type SubmissionRow = typeof schema.resultSubmissions.$inferSelect;

interface MatchContext {
  match: MatchRow;
  startsAt: Date;
  gameId: string;
  resultSchema: ResultSchema;
  requiredProof: RequiredProof;
  sides: SideRow[];
  submissions: SubmissionRow[];
}

export interface SubmitOutcome {
  matchId: string;
  status: string;
  submissionId: string;
}

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(private readonly matches: MatchesService) {}

  // ---------------------------------------------------------------- reads

  /** The viewer's matches as hub views (newest activity first). */
  async listMine(viewer: AuthedUser, query: ListMatchesQuery): Promise<MatchViewDto[]> {
    const statusFilter =
      query.scope === 'active'
        ? inArray(schema.matches.status, [...ACTIVE_STATES])
        : query.scope === 'finished'
          ? sql`${schema.matches.status} NOT IN ('accepted','in_progress','awaiting_result','awaiting_confirmation','disputed')`
          : undefined;
    const rows = await db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .innerJoin(schema.matchSides, eq(schema.matchSides.matchId, schema.matches.id))
      .where(and(eq(schema.matchSides.userId, viewer.sub), statusFilter))
      .orderBy(desc(schema.matches.updatedAt))
      .limit(query.limit);
    const views: MatchViewDto[] = [];
    for (const row of rows) views.push(await this.matches.getView(row.id, viewer));
    return views;
  }

  // --------------------------------------------------------------- writes

  async submitResult(
    userId: string,
    matchId: string,
    input: SubmitResultRequest,
  ): Promise<SubmitOutcome> {
    const replay = await this.replay(input.idempotencyKey, userId);
    if (replay) return replay;
    this.assertNote(input.note);

    return this.writeSubmission(matchId, userId, async (tx, ctx, mine) => {
      const validation = validateResult(ctx.resultSchema, input.outcome, input.score);
      if (!validation.ok) throw new BadRequestException(RESULT_ERROR_MESSAGES[validation.error]);

      const needsProof = ctx.requiredProof.includes('screenshot');
      if (needsProof && !input.uploadId)
        throw new BadRequestException(MATCH_MESSAGES.proofRequired);
      if (input.uploadId)
        await this.assertUsableUpload(tx, input.uploadId, userId, matchId, 'result_proof');

      return {
        kind: 'result',
        outcome: input.outcome,
        score: input.score as ScorePayload,
        uploadId: input.uploadId ?? null,
        note: input.note || null,
        idempotencyKey: input.idempotencyKey,
        side: mine,
      };
    });
  }

  async reportNoShow(
    userId: string,
    matchId: string,
    input: ReportNoShowRequest,
  ): Promise<SubmitOutcome> {
    const replay = await this.replay(input.idempotencyKey, userId);
    if (replay) return replay;
    this.assertNote(input.note);

    return this.writeSubmission(matchId, userId, async (tx, ctx, mine) => {
      if (Date.now() < ctx.startsAt.getTime() + NO_SHOW_GATE_MS) {
        throw new ConflictException(MATCH_MESSAGES.noShowTooEarly);
      }
      await this.assertUsableUpload(tx, input.uploadId, userId, matchId, 'no_show_proof');
      return {
        kind: 'no_show',
        outcome: 'no_show',
        score: null,
        uploadId: input.uploadId,
        note: input.note || null,
        idempotencyKey: input.idempotencyKey,
        side: mine,
      };
    });
  }

  async confirmResult(
    userId: string,
    matchId: string,
    input: ConfirmResultRequest,
  ): Promise<SubmitOutcome> {
    const replay = await this.replay(input.idempotencyKey, userId);
    if (replay) return replay;

    return this.writeSubmission(matchId, userId, async (_tx, ctx, mine) => {
      const theirs = ctx.submissions.find((s) => s.matchSideId !== mine.id);
      if (!theirs) throw new ConflictException(MATCH_MESSAGES.nothingToConfirm);
      const mirror = mirrorOf(toSide(theirs, ctx.sides));
      return {
        kind: 'confirmation',
        outcome: mirror.outcome,
        score: mirror.score,
        uploadId: null,
        note: null,
        idempotencyKey: input.idempotencyKey,
        side: mine,
      };
    });
  }

  /**
   * Shared write path: lock the match row, check state and timing, append the
   * submission, then either open the confirmation window or resolve the pair.
   */
  private async writeSubmission(
    matchId: string,
    userId: string,
    build: (
      tx: Tx,
      ctx: MatchContext,
      mine: SideRow,
    ) => Promise<{
      kind: SubmissionKind;
      outcome: SubmittedOutcome;
      score: ScorePayload | null;
      uploadId: string | null;
      note: string | null;
      idempotencyKey: string;
      side: SideRow;
    }>,
  ): Promise<SubmitOutcome> {
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const ctx = await this.loadContext(tx, matchId, true);
      if (!ctx) throw new NotFoundException(MATCH_MESSAGES.notFound);
      const mine = ctx.sides.find((s) => s.userId === userId);
      if (!mine) throw new NotFoundException(MATCH_MESSAGES.notFound);

      const m = ctx.match;
      if (!(SUBMITTABLE_MATCH_STATES as readonly string[]).includes(m.status)) {
        throw new ConflictException(MATCH_MESSAGES.closed);
      }
      if (ctx.submissions.some((s) => s.matchSideId === mine.id)) {
        throw new ConflictException(MATCH_MESSAGES.alreadySubmitted);
      }
      if (now < ctx.startsAt) throw new ConflictException(MATCH_MESSAGES.notStarted);
      const isFirst = ctx.submissions.length === 0;
      if (isFirst && now > resultDeadlineOf(ctx)) {
        throw new ConflictException(MATCH_MESSAGES.resultWindowClosed);
      }
      if (!isFirst && m.confirmationDeadline && now > m.confirmationDeadline) {
        throw new ConflictException(MATCH_MESSAGES.confirmWindowClosed);
      }

      const sub = await build(tx, ctx, mine);
      const id = uuidv7();
      await tx.insert(schema.resultSubmissions).values({
        id,
        matchId,
        submitterId: userId,
        matchSideId: mine.id,
        kind: sub.kind,
        result: sub.outcome,
        score: sub.score ?? {},
        proof: sub.uploadId ? { uploadId: sub.uploadId } : null,
        uploadId: sub.uploadId,
        note: sub.note,
        revision: 1,
        idempotencyKey: sub.idempotencyKey,
        submittedAt: now,
      });
      await tx
        .update(schema.matchSides)
        .set({ result: sub.outcome, submittedAt: now, updatedAt: now })
        .where(eq(schema.matchSides.id, mine.id));

      const opponent = ctx.sides.find((s) => s.id !== mine.id)!;
      if (isFirst) {
        const confirmationDeadline = new Date(now.getTime() + CONFIRMATION_WINDOW_MS);
        await this.transition(tx, m, {
          status: 'awaiting_confirmation',
          resultSubmittedAt: now,
          confirmationDeadline,
          resultDeadline: resultDeadlineOf(ctx),
        });
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: sub.kind === 'no_show' ? 'noshow.reported' : 'result.submitted',
          subjectId: matchId,
          payload: {
            matchId,
            submitterId: userId,
            recipientId: opponent.userId,
            kind: sub.kind,
            confirmationDeadline: confirmationDeadline.toISOString(),
          },
        });
        return { id, status: 'awaiting_confirmation', confirmationDeadline };
      }

      const first = toSide(ctx.submissions[0]!, ctx.sides);
      const second: SideSubmission = {
        side: mine.side,
        kind: sub.kind,
        outcome: sub.outcome,
        score: sub.score,
      };
      const resolution = resolvePair(first, second);
      await this.applyResolution(tx, { ...ctx, match: { ...m } }, resolution, now);
      return { id, status: resolution.status, confirmationDeadline: null };
    });

    if (result.confirmationDeadline) {
      await scheduleConfirmationDeadline(matchId, result.confirmationDeadline);
    } else {
      await cancelConfirmationDeadline(matchId);
    }
    return { matchId, status: result.status, submissionId: result.id };
  }

  /**
   * Resolve every match whose confirmation window has closed (spec §5). Called by
   * the BullMQ job for one match and by the sweeper for all due matches.
   */
  async resolveDueConfirmations(matchId?: string): Promise<string[]> {
    const now = new Date();
    const due = await db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.status, 'awaiting_confirmation'),
          lte(schema.matches.confirmationDeadline, now),
          matchId ? eq(schema.matches.id, matchId) : undefined,
        ),
      )
      .limit(200);

    const resolved: string[] = [];
    for (const { id } of due) {
      const done = await db.transaction(async (tx) => {
        const ctx = await this.loadContext(tx, id, true, true);
        // Re-check under the lock: a second submission may have landed meanwhile.
        if (
          !ctx ||
          ctx.match.status !== 'awaiting_confirmation' ||
          !ctx.match.confirmationDeadline ||
          ctx.match.confirmationDeadline > now ||
          ctx.submissions.length !== 1
        ) {
          return false;
        }
        const resolution = resolveTimeout(toSide(ctx.submissions[0]!, ctx.sides));
        await this.applyResolution(tx, ctx, resolution, now);
        return true;
      });
      if (done) resolved.push(id);
    }
    return resolved;
  }

  // ------------------------------------------------------------- helpers

  private async applyResolution(tx: Tx, ctx: MatchContext, r: Resolution, now: Date) {
    const m = ctx.match;
    const userBySide = (side: number) => ctx.sides.find((s) => s.side === side)!.userId;

    if (r.status === 'confirmed') {
      await this.transition(tx, m, {
        status: 'confirmed',
        confirmedAt: now,
        winnerSide: r.winnerSide,
        decidedVia: r.via,
      });
      await tx
        .update(schema.matchSides)
        .set({ confirmedAt: now, updatedAt: now })
        .where(eq(schema.matchSides.matchId, m.id));
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'match.confirmed',
        subjectId: m.id,
        payload: {
          matchId: m.id,
          gameId: ctx.gameId,
          winnerUserId: r.winnerSide === null ? null : userBySide(r.winnerSide),
          loserUserId: r.winnerSide === null ? null : userBySide(1 - r.winnerSide),
          draw: r.winnerSide === null,
          participants: ctx.sides.map((s) => s.userId),
          via: r.via,
          confirmedAt: now.toISOString(),
        },
      });
      return;
    }

    if (r.status === 'forfeited') {
      const forfeitingUserId = userBySide(1 - r.winnerSide);
      await this.transition(tx, m, {
        status: 'forfeited',
        forfeitedAt: now,
        winnerSide: r.winnerSide,
        decidedVia: r.via,
      });
      await tx.insert(schema.outboxEvents).values([
        {
          id: uuidv7(),
          type: 'match.forfeited',
          subjectId: m.id,
          payload: {
            matchId: m.id,
            gameId: ctx.gameId,
            winnerUserId: userBySide(r.winnerSide),
            forfeitingUserId,
            participants: ctx.sides.map((s) => s.userId),
            via: r.via,
            forfeitedAt: now.toISOString(),
          },
        },
        {
          id: uuidv7(),
          type: 'reputation.debt',
          subjectId: forfeitingUserId,
          payload: { userId: forfeitingUserId, matchId: m.id, reason: 'no_show' },
        },
      ]);
      return;
    }

    // disputed
    await this.transition(tx, m, {
      status: 'disputed',
      disputedAt: now,
      confirmationDeadline: null,
    });
    const noShow = r.reason === 'no_show_contested' || r.reason === 'both_claimed_no_show';
    const disputeId = uuidv7();
    await tx.insert(schema.disputes).values({
      id: disputeId,
      matchId: m.id,
      raisedById: null,
      source: noShow ? 'no_show_contested' : 'auto_conflict',
      reason: r.reason,
      evidence: { submissionIds: ctx.submissions.map((s) => s.id) },
      status: 'open',
    });
    await tx
      .update(schema.matchSides)
      .set({ disputedAt: now, updatedAt: now })
      .where(eq(schema.matchSides.matchId, m.id));
    await postSystemMessage(
      tx,
      m.id,
      noShow ? MATCH_MESSAGES.noShowDisputeMessage : MATCH_MESSAGES.disputeSystemMessage,
    );
    await tx.insert(schema.outboxEvents).values({
      id: uuidv7(),
      type: 'dispute.opened',
      subjectId: disputeId,
      payload: {
        disputeId,
        matchId: m.id,
        reason: r.reason,
        source: noShow ? 'no_show_contested' : 'auto_conflict',
        participants: ctx.sides.map((s) => s.userId),
      },
    });
  }

  /** Version-checked state change (TA: optimistic concurrency on matches). */
  private async transition(
    tx: Tx,
    m: MatchRow,
    patch: Partial<typeof schema.matches.$inferInsert>,
  ) {
    const [row] = await tx
      .update(schema.matches)
      .set({ ...patch, version: m.version + 1, updatedAt: new Date() })
      .where(and(eq(schema.matches.id, m.id), eq(schema.matches.version, m.version)))
      .returning({ version: schema.matches.version });
    if (!row) throw new ConflictException('Match was modified by another request');
    m.version = row.version;
    m.status = (patch.status ?? m.status) as MatchRow['status'];
  }

  private async loadContext(
    conn: Tx | typeof db,
    matchId: string,
    lock: boolean,
    skipLocked = false,
  ): Promise<MatchContext | null> {
    const base = conn
      .select({
        match: schema.matches,
        startsAt: schema.challenges.startsAt,
        gameId: schema.challenges.gameId,
        resultSchema: schema.gameFormats.resultSchema,
        requiredProof: schema.gameFormats.requiredProof,
      })
      .from(schema.matches)
      .innerJoin(schema.challenges, eq(schema.challenges.id, schema.matches.challengeId))
      .innerJoin(schema.gameFormats, eq(schema.gameFormats.id, schema.challenges.formatId))
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    const rows = lock
      ? await base.for(
          'update',
          skipLocked ? { of: schema.matches, skipLocked: true } : { of: schema.matches },
        )
      : await base;
    const row = rows[0];
    if (!row) return null;

    const sides = await conn
      .select()
      .from(schema.matchSides)
      .where(eq(schema.matchSides.matchId, matchId))
      .orderBy(asc(schema.matchSides.side));
    const submissions = await conn
      .select()
      .from(schema.resultSubmissions)
      .where(
        and(
          eq(schema.resultSubmissions.matchId, matchId),
          eq(schema.resultSubmissions.revision, 1),
        ),
      )
      .orderBy(asc(schema.resultSubmissions.submittedAt), asc(schema.resultSubmissions.id));

    return {
      match: row.match,
      startsAt: row.startsAt,
      gameId: row.gameId,
      resultSchema: resultSchemaColumn.parse(row.resultSchema),
      requiredProof: requiredProofColumn.parse(row.requiredProof),
      sides,
      submissions,
    };
  }

  private async assertUsableUpload(
    tx: Tx,
    uploadId: string,
    userId: string,
    matchId: string,
    purpose: 'result_proof' | 'no_show_proof',
  ) {
    const [upload] = await tx
      .select({
        ownerId: schema.uploads.ownerId,
        matchId: schema.uploads.matchId,
        status: schema.uploads.status,
        purpose: schema.uploads.purpose,
      })
      .from(schema.uploads)
      .where(eq(schema.uploads.id, uploadId))
      .limit(1);
    if (
      !upload ||
      upload.ownerId !== userId ||
      upload.matchId !== matchId ||
      upload.status !== 'ready' ||
      upload.purpose !== purpose
    ) {
      throw new BadRequestException(
        purpose === 'no_show_proof'
          ? MATCH_MESSAGES.noShowProofRequired
          : MATCH_MESSAGES.proofInvalid,
      );
    }
    const [used] = await tx
      .select({ id: schema.resultSubmissions.id })
      .from(schema.resultSubmissions)
      .where(eq(schema.resultSubmissions.uploadId, uploadId))
      .limit(1);
    if (used) throw new BadRequestException(MATCH_MESSAGES.proofInvalid);
  }

  private assertNote(note: string | undefined) {
    if (note && containsBlockedTerm(note))
      throw new BadRequestException(MATCH_MESSAGES.noteBlocked);
  }

  /** Idempotency: a retried request with the same key returns the original outcome. */
  private async replay(idempotencyKey: string, userId: string): Promise<SubmitOutcome | null> {
    const [row] = await db
      .select({
        id: schema.resultSubmissions.id,
        matchId: schema.resultSubmissions.matchId,
        submitterId: schema.resultSubmissions.submitterId,
        status: schema.matches.status,
      })
      .from(schema.resultSubmissions)
      .innerJoin(schema.matches, eq(schema.matches.id, schema.resultSubmissions.matchId))
      .where(eq(schema.resultSubmissions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!row) return null;
    if (row.submitterId !== userId) throw new ConflictException('Idempotency key already used');
    return { matchId: row.matchId, status: row.status, submissionId: row.id };
  }
}

// ---------------------------------------------------------------- pure

export function resultDeadlineOf(ctx: Pick<MatchContext, 'match' | 'startsAt'>): Date {
  return ctx.match.resultDeadline ?? new Date(ctx.startsAt.getTime() + RESULT_WINDOW_MS);
}

function toSide(sub: SubmissionRow, sides: SideRow[]): SideSubmission {
  const side = sides.find((s) => s.id === sub.matchSideId)!;
  const score = sub.score as Partial<ScorePayload>;
  return {
    side: side.side,
    kind: sub.kind as SubmissionKind,
    outcome: sub.result as SubmittedOutcome,
    score:
      typeof score?.self === 'number' && typeof score?.opponent === 'number'
        ? { self: score.self, opponent: score.opponent }
        : null,
  };
}
