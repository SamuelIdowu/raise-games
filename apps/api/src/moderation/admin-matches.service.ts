import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { postSystemMessage } from '../matches/match-chat';
import { decodeCursor, encodeCursor } from '../shared/cursor';
import { escapeLike } from '../shared/like';

/**
 * Matches a moderator may void directly: live, undecided matches (the stuck-match case).
 * A disputed match is voided by its dispute ruling, and a decided one through a dispute or
 * appeal, because those paths also reverse ratings and payouts (Sprint 9 contract).
 */
export const ADMIN_VOIDABLE = [
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
] as const;

const LIVE = sql.raw(`('accepted','in_progress','awaiting_result','awaiting_confirmation')`);

export const VOID_SYSTEM_MESSAGE =
  'A moderator voided this match. It does not count for ratings and any stakes are returned.';

export interface MatchListQuery {
  status?: string;
  stuck?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

/**
 * Admin matches screen (audit B22; UX Flow 11 "matches"; F8.5 "Voided reserved for admin
 * use"). Search and inspect any match, and void a stuck live one with a reason. Every read
 * of a single match and every void is audited.
 */
@Injectable()
export class AdminMatchesService {
  async list(q: MatchListQuery) {
    const conds: SQL[] = [sql`true`];
    if (q.status) conds.push(sql`m.status = ${q.status}`);
    if (q.stuck) {
      conds.push(sql`m.status IN ${LIVE} AND m.result_deadline < now()`);
    }
    if (q.q) {
      conds.push(sql`EXISTS (
        SELECT 1 FROM match_sides s2 JOIN users u2 ON u2.id = s2.user_id
        WHERE s2.match_id = m.id AND u2.display_name ILIKE ${`%${escapeLike(q.q.trim())}%`})`);
    }
    const cursor = decodeCursor<{ t: string; id: string }>(q.cursor);
    if (cursor) conds.push(sql`(m.created_at, m.id) < (${new Date(cursor.t)}, ${cursor.id})`);

    const rows = (
      await db.execute<{
        id: string;
        status: string;
        game: string;
        players: string[];
        created_at: Date;
        updated_at: Date;
        result_deadline: Date | null;
      }>(sql`
        SELECT m.id, m.status, g.name AS game, m.created_at, m.updated_at, m.result_deadline,
               array_agg(u.display_name ORDER BY s.side) AS players
        FROM matches m
        JOIN challenges c ON c.id = m.challenge_id
        JOIN games g ON g.id = c.game_id
        JOIN match_sides s ON s.match_id = m.id
        JOIN users u ON u.id = s.user_id
        WHERE ${sql.join(conds, sql` AND `)}
        GROUP BY m.id, g.name
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${q.limit + 1}`)
    ).rows;
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        status: r.status,
        game: r.game,
        players: r.players,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        stuck:
          (ADMIN_VOIDABLE as readonly string[]).includes(r.status) &&
          r.result_deadline !== null &&
          new Date(r.result_deadline).getTime() < Date.now(),
      })),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ t: new Date(last.created_at).toISOString(), id: last.id })
          : null,
    };
  }

  async detail(me: AuthedUser, matchId: string) {
    const [m] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
    if (!m) throw new NotFoundException('Match not found');
    const [challenge] = await db
      .select({ gameId: schema.challenges.gameId, rules: schema.challenges.rules })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, m.challengeId));
    const [game] = challenge
      ? await db
          .select({ name: schema.games.name })
          .from(schema.games)
          .where(eq(schema.games.id, challenge.gameId))
      : [];
    const sides = await db
      .select({
        side: schema.matchSides.side,
        userId: schema.matchSides.userId,
        displayName: schema.users.displayName,
      })
      .from(schema.matchSides)
      .innerJoin(schema.users, eq(schema.users.id, schema.matchSides.userId))
      .where(eq(schema.matchSides.matchId, matchId))
      .orderBy(schema.matchSides.side);
    const [dispute] = await db
      .select({ id: schema.disputes.id, status: schema.disputes.status })
      .from(schema.disputes)
      .where(eq(schema.disputes.matchId, matchId));
    const submissions = await db
      .select({
        userId: schema.resultSubmissions.submitterId,
        kind: schema.resultSubmissions.kind,
        result: schema.resultSubmissions.result,
        createdAt: schema.resultSubmissions.submittedAt,
      })
      .from(schema.resultSubmissions)
      .where(eq(schema.resultSubmissions.matchId, matchId));

    await this.audit(me, 'match.read_as_staff', matchId);
    return {
      id: m.id,
      status: m.status,
      version: m.version,
      game: game?.name ?? null,
      rules: challenge?.rules ?? '',
      winnerSide: m.winnerSide,
      decidedVia: m.decidedVia,
      timeline: {
        acceptedAt: m.acceptedAt,
        scheduledStartAt: m.scheduledStartAt,
        inProgressAt: m.inProgressAt,
        resultSubmittedAt: m.resultSubmittedAt,
        resultDeadline: m.resultDeadline,
        confirmedAt: m.confirmedAt,
        disputedAt: m.disputedAt,
        resolvedAt: m.resolvedAt,
        cancelledAt: m.cancelledAt,
        expiredAt: m.expiredAt,
        forfeitedAt: m.forfeitedAt,
        voidedAt: m.voidedAt,
      },
      sides,
      dispute: dispute ?? null,
      submissions: submissions.map((s) => ({
        userId: s.userId,
        kind: s.kind,
        result: s.result,
        createdAt: s.createdAt.toISOString(),
      })),
      voidable: (ADMIN_VOIDABLE as readonly string[]).includes(m.status),
    };
  }

  /**
   * Void a live, undecided match. The state guard (DB trigger) also checks the transition.
   * Emits `match.voided`: the wallet refunds any holds, the broadcaster refreshes both rooms.
   */
  async void(me: AuthedUser, matchId: string, reason: string) {
    return db.transaction(async (tx) => {
      const [m] = await tx
        .select({ status: schema.matches.status, version: schema.matches.version })
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
        .for('update');
      if (!m) throw new NotFoundException('Match not found');
      if (!(ADMIN_VOIDABLE as readonly string[]).includes(m.status)) {
        throw new ConflictException(
          m.status === 'disputed'
            ? 'This match is disputed. Void it from the dispute with a ruling.'
            : 'Only live matches can be voided here. Decided matches go through a dispute or appeal.',
        );
      }
      const now = new Date();
      await tx
        .update(schema.matches)
        .set({
          status: 'voided',
          voidedAt: now,
          winnerSide: null,
          decidedVia: 'admin_void',
          version: sql`${schema.matches.version} + 1`,
          updatedAt: now,
        })
        .where(eq(schema.matches.id, matchId));
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'match.voided',
        subjectId: matchId,
        payload: { matchId, by: me.sub, previousStatus: m.status },
      });
      await postSystemMessage(tx, matchId, VOID_SYSTEM_MESSAGE);
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: me.sub,
        action: 'match.voided',
        objectType: 'match',
        objectId: matchId,
        before: { status: m.status, version: m.version },
        after: { status: 'voided', reason },
      });
      return { id: matchId, status: 'voided' as const };
    });
  }

  private async audit(me: AuthedUser, action: string, matchId: string) {
    await db.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: me.sub,
      action,
      objectType: 'match',
      objectId: matchId,
    });
  }
}
