import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { DisputesService } from '../disputes/disputes.service';
import type { RulingOutcome } from '../disputes/disputes.rules';
import { FILE_STORAGE, type FileStoragePort } from '../storage/file-storage.port';
import { ReputationService } from '../ratings/reputation.service';
import { rankTierForRating, rankTierLabel } from '../shared/ranks';
import { cursorSchemas, decodeCursor, encodeCursor } from '../shared/cursor';
import { escapeLike } from '../shared/like';
import { SanctionsService } from './sanctions.service';
import { getStanding } from './standing';
import { LADDER } from './ladder';

/** Moderator SLA (PRD success metric: median resolution under 24h). */
export const DISPUTE_SLA_MS = 24 * 3600_000;

/** Reason templates for the decision panel (Design §8 "reason template"). Plain voice. */
export const RULING_TEMPLATES = [
  {
    key: 'evidence_side0',
    outcome: 'side0_win',
    text: 'The screenshots and chat support the first player’s result.',
  },
  {
    key: 'evidence_side1',
    outcome: 'side1_win',
    text: 'The screenshots and chat support the second player’s result.',
  },
  {
    key: 'no_show_upheld',
    outcome: null,
    text: 'The no-show report is supported by the proof of attempt and the chat.',
  },
  { key: 'draw_agreed', outcome: 'draw', text: 'The evidence shows the match ended level.' },
  {
    key: 'void_unplayable',
    outcome: 'void',
    text: 'The match could not be played fairly, so it does not count.',
  },
  {
    key: 'void_insufficient',
    outcome: 'void',
    text: 'Neither side’s evidence was enough to decide the result, so the match does not count.',
  },
] as const;

export type QueueState = 'unassigned' | 'assigned' | 'awaiting_info' | 'resolved';

/** Masks a phone for display: +234 *** *** 1234 (data minimisation, Sprint 12 audit). */
export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${phone.slice(0, 4)} *** *** ${phone.slice(-4)}` : '***';
}

function queueStateOf(status: string, assignedToId: string | null): QueueState {
  if (status === 'ruled' || status === 'final') return 'resolved';
  if (status === 'awaiting_info') return 'awaiting_info';
  return assignedToId ? 'assigned' : 'unassigned';
}

function slaOf(d: { status: string; createdAt: Date; appealedAt: Date | null }, now: Date) {
  const start = d.status === 'appealed' && d.appealedAt ? d.appealedAt : d.createdAt;
  const due = new Date(start.getTime() + DISPUTE_SLA_MS);
  return { startedAt: start.toISOString(), dueAt: due.toISOString(), breached: now > due };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly disputes: DisputesService,
    private readonly sanctions: SanctionsService,
    private readonly reputation: ReputationService,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  private async audit(
    actor: AuthedUser,
    action: string,
    objectType: string,
    objectId: string,
    after?: unknown,
    before?: unknown,
  ) {
    await db.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: actor.sub,
      action,
      objectType,
      objectId,
      after: after ?? null,
      before: before ?? null,
    });
  }

  // ------------------------------------------------------------ dashboard

  async dashboard() {
    const now = new Date();
    const { rows } = await db.execute<Record<string, number | string | null>>(sql`
      SELECT
        (SELECT count(*)::int FROM disputes WHERE status IN ('open','reviewed','appealed') AND assigned_to_id IS NULL) AS unassigned,
        (SELECT count(*)::int FROM disputes WHERE status IN ('open','reviewed','appealed') AND assigned_to_id IS NOT NULL) AS assigned,
        (SELECT count(*)::int FROM disputes WHERE status = 'awaiting_info') AS awaiting_info,
        (SELECT count(*)::int FROM disputes WHERE status IN ('open','reviewed','appealed','awaiting_info')
           AND coalesce(CASE WHEN status = 'appealed' THEN appealed_at END, created_at) < ${new Date(now.getTime() - DISPUTE_SLA_MS)}) AS sla_breached,
        (SELECT min(created_at) FROM disputes WHERE status IN ('open','reviewed','appealed','awaiting_info')) AS oldest_open,
        (SELECT count(*)::int FROM reports WHERE status = 'open') + (SELECT count(*)::int FROM message_reports WHERE status = 'open') AS open_reports,
        (SELECT count(*)::int FROM uploads WHERE (reused_upload_id IS NOT NULL OR similar_upload_id IS NOT NULL)
           AND created_at > now() - interval '30 days') AS hash_flags,
        (SELECT count(*)::int FROM chat_flags WHERE status = 'open') AS chat_flags,
        (SELECT count(*)::int FROM matches WHERE
            (status = 'awaiting_confirmation' AND confirmation_deadline < now() - interval '5 minutes')
         OR (status IN ('accepted','in_progress','awaiting_result') AND result_deadline < now())) AS stuck_matches,
        (SELECT count(*)::int FROM sanctions WHERE revoked_at IS NULL AND starts_at <= now()
           AND (ends_at IS NULL OR ends_at > now()) AND type <> 'warning') AS active_sanctions
    `);
    const r = rows[0] ?? {};
    const stuck = await db
      .select({
        id: schema.matches.id,
        status: schema.matches.status,
        confirmationDeadline: schema.matches.confirmationDeadline,
        resultDeadline: schema.matches.resultDeadline,
        updatedAt: schema.matches.updatedAt,
      })
      .from(schema.matches)
      .where(
        or(
          and(
            eq(schema.matches.status, 'awaiting_confirmation'),
            sql`${schema.matches.confirmationDeadline} < now() - interval '5 minutes'`,
          ),
          and(
            inArray(schema.matches.status, ['accepted', 'in_progress', 'awaiting_result']),
            sql`${schema.matches.resultDeadline} < now()`,
          ),
        ),
      )
      .orderBy(asc(schema.matches.updatedAt))
      .limit(10);
    const metrics = await this.disputes.metrics(
      { sub: 'system', sid: 'system', role: 'admin' },
      30,
    );
    return {
      queue: {
        unassigned: Number(r.unassigned ?? 0),
        assigned: Number(r.assigned ?? 0),
        awaitingInfo: Number(r.awaiting_info ?? 0),
        slaBreached: Number(r.sla_breached ?? 0),
        oldestOpenAt: r.oldest_open ? new Date(String(r.oldest_open)).toISOString() : null,
      },
      openReports: Number(r.open_reports ?? 0),
      hashFlags30d: Number(r.hash_flags ?? 0),
      openChatFlags: Number(r.chat_flags ?? 0),
      stuckMatches: Number(r.stuck_matches ?? 0),
      activeSanctions: Number(r.active_sanctions ?? 0),
      stuck: stuck.map((m) => ({
        ...m,
        confirmationDeadline: m.confirmationDeadline?.toISOString() ?? null,
        resultDeadline: m.resultDeadline?.toISOString() ?? null,
        updatedAt: m.updatedAt.toISOString(),
      })),
      metrics,
    };
  }

  // ------------------------------------------------------------ dispute queue

  async queue(
    q: { state?: QueueState; mine?: boolean; cursor?: string; limit: number },
    me: AuthedUser,
  ) {
    const d = schema.disputes;
    const conds: SQL[] = [];
    if (q.state === 'unassigned')
      conds.push(sql`${d.status} IN ('open','reviewed','appealed') AND ${d.assignedToId} IS NULL`);
    if (q.state === 'assigned')
      conds.push(
        sql`${d.status} IN ('open','reviewed','appealed') AND ${d.assignedToId} IS NOT NULL`,
      );
    if (q.state === 'awaiting_info') conds.push(eq(d.status, 'awaiting_info'));
    if (q.state === 'resolved') conds.push(inArray(d.status, ['ruled', 'final']));
    if (q.mine) conds.push(eq(d.assignedToId, me.sub));
    const cursor = decodeCursor(q.cursor, cursorSchemas.timeId);
    if (cursor) conds.push(sql`(${d.createdAt}, ${d.id}) > (${new Date(cursor.t)}, ${cursor.id})`);

    const rows = await db
      .select({
        id: d.id,
        matchId: d.matchId,
        status: d.status,
        source: d.source,
        category: d.category,
        reason: d.reason,
        assignedToId: d.assignedToId,
        assignedName: schema.users.displayName,
        createdAt: d.createdAt,
        appealedAt: d.appealedAt,
        gameName: schema.games.name,
      })
      .from(d)
      .innerJoin(schema.matches, eq(schema.matches.id, d.matchId))
      .innerJoin(schema.challenges, eq(schema.challenges.id, schema.matches.challengeId))
      .innerJoin(schema.games, eq(schema.games.id, schema.challenges.gameId))
      .leftJoin(schema.users, eq(schema.users.id, d.assignedToId))
      .where(conds.length ? and(...conds) : undefined)
      // Oldest first: the SLA clock runs from creation (Design §8 queue).
      .orderBy(asc(d.createdAt), asc(d.id))
      .limit(q.limit + 1);
    const now = new Date();
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        appealedAt: r.appealedAt?.toISOString() ?? null,
        state: queueStateOf(r.status, r.assignedToId),
        sla: slaOf(r, now),
      })),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /**
   * Optimistic claim: succeeds only if nobody (else) holds it, so two moderators can
   * never both work one dispute. Admins may take over with `force`.
   */
  async assign(me: AuthedUser, disputeId: string, force = false) {
    const d = schema.disputes;
    const [row] = await db
      .update(d)
      .set({ assignedToId: me.sub, assignedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(d.id, disputeId),
          force && me.role === 'admin'
            ? undefined
            : or(isNull(d.assignedToId), eq(d.assignedToId, me.sub)),
        ),
      )
      .returning({ id: d.id });
    if (!row) {
      const [exists] = await db.select({ id: d.id }).from(d).where(eq(d.id, disputeId));
      if (!exists) throw new NotFoundException('Dispute not found');
      throw new ConflictException('Another moderator has already claimed this dispute');
    }
    await this.audit(me, force ? 'dispute.reassigned' : 'dispute.assigned', 'dispute', disputeId);
    return { id: disputeId, assignedToId: me.sub };
  }

  async unassign(me: AuthedUser, disputeId: string) {
    const d = schema.disputes;
    const [row] = await db
      .update(d)
      .set({ assignedToId: null, assignedAt: null, updatedAt: new Date() })
      .where(and(eq(d.id, disputeId), me.role === 'admin' ? undefined : eq(d.assignedToId, me.sub)))
      .returning({ id: d.id });
    if (!row) throw new ConflictException('You do not hold this dispute');
    await this.audit(me, 'dispute.unassigned', 'dispute', disputeId);
    return { id: disputeId, assignedToId: null };
  }

  /** Design §8 admin dispute viewer: everything a moderator needs in one payload. */
  async viewer(me: AuthedUser, disputeId: string) {
    const [d] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, disputeId));
    if (!d) throw new NotFoundException('Dispute not found');
    const evidence = await this.disputes.evidence(me, disputeId); // audited by Sprint 9

    const [match] = await db
      .select({
        id: schema.matches.id,
        status: schema.matches.status,
        gameName: schema.games.name,
        formatName: schema.gameFormats.name,
        startsAt: schema.challenges.startsAt,
        winnerSide: schema.matches.winnerSide,
      })
      .from(schema.matches)
      .innerJoin(schema.challenges, eq(schema.challenges.id, schema.matches.challengeId))
      .innerJoin(schema.games, eq(schema.games.id, schema.challenges.gameId))
      .innerJoin(schema.gameFormats, eq(schema.gameFormats.id, schema.challenges.formatId))
      .where(eq(schema.matches.id, d.matchId));

    const sides = await db
      .select({
        side: schema.matchSides.side,
        userId: schema.matchSides.userId,
        username: schema.users.displayName,
        inGameId: schema.gameProfiles.inGameId,
        rating: schema.gameProfiles.rating,
        provisional: schema.gameProfiles.provisional,
      })
      .from(schema.matchSides)
      .innerJoin(schema.users, eq(schema.users.id, schema.matchSides.userId))
      .innerJoin(schema.gameProfiles, eq(schema.gameProfiles.id, schema.matchSides.gameProfileId))
      .where(eq(schema.matchSides.matchId, d.matchId))
      .orderBy(asc(schema.matchSides.side));
    const userIds = sides.map((s) => s.userId);
    const reps = await this.reputation.forUsers(userIds);

    const history = await db.execute<{
      user_id: string;
      opened: number;
      lost: number;
      total: number;
    }>(sql`
      SELECT ms.user_id,
        count(*) FILTER (WHERE dd.raised_by_id = ms.user_id)::int AS opened,
        count(*) FILTER (WHERE dd.status IN ('ruled','final') AND m.winner_side IS NOT NULL AND m.winner_side <> ms.side)::int AS lost,
        count(*)::int AS total
      FROM disputes dd
      JOIN matches m ON m.id = dd.match_id
      JOIN match_sides ms ON ms.match_id = m.id
      WHERE ms.user_id IN (${sql.join(
        userIds.map((u) => sql`${u}::uuid`),
        sql`, `,
      )}) AND dd.id <> ${disputeId}
      GROUP BY ms.user_id`);

    // Hash flags inline (Design §8: "Reused screenshot" with a link to the earlier match).
    const uploadIds = [
      ...evidence.submissions.map((s) => s.uploadId),
      ...evidence.evidence.map((e) => e.uploadId),
    ].filter((x): x is string => !!x);
    const uploads = uploadIds.length
      ? await db.select().from(schema.uploads).where(inArray(schema.uploads.id, uploadIds))
      : [];
    const linkedIds = uploads
      .flatMap((u) => [u.reusedUploadId, u.similarUploadId])
      .filter((x): x is string => !!x);
    const linked = linkedIds.length
      ? await db
          .select({
            id: schema.uploads.id,
            matchId: schema.uploads.matchId,
            ownerId: schema.uploads.ownerId,
          })
          .from(schema.uploads)
          .where(inArray(schema.uploads.id, linkedIds))
      : [];
    const proof = await Promise.all(
      uploads.map(async (u) => {
        const ref = linked.find((l) => l.id === (u.reusedUploadId ?? u.similarUploadId));
        const signed =
          u.status === 'ready' && u.storageKey && u.thumbKey && this.storage.configured
            ? {
                full: (await this.storage.presignGet(u.storageKey, 300)).url,
                thumb: (await this.storage.presignGet(u.thumbKey, 300)).url,
              }
            : null;
        return {
          uploadId: u.id,
          ownerId: u.ownerId,
          status: u.status,
          urls: signed,
          flag: u.reusedUploadId
            ? { kind: 'reused' as const, earlierMatchId: ref?.matchId ?? null, distance: 0 }
            : u.similarUploadId
              ? {
                  kind: 'similar' as const,
                  earlierMatchId: ref?.matchId ?? null,
                  distance: u.similarDistance,
                }
              : null,
        };
      }),
    );

    const notes = await db
      .select({
        id: schema.moderatorNotes.id,
        body: schema.moderatorNotes.body,
        authorName: schema.users.displayName,
        createdAt: schema.moderatorNotes.createdAt,
      })
      .from(schema.moderatorNotes)
      .innerJoin(schema.users, eq(schema.users.id, schema.moderatorNotes.authorId))
      .where(eq(schema.moderatorNotes.disputeId, disputeId))
      .orderBy(asc(schema.moderatorNotes.createdAt));
    const ratingEvents = await db
      .select({
        userId: schema.ratingEvents.userId,
        kind: schema.ratingEvents.kind,
        delta: schema.ratingEvents.delta,
        reason: schema.ratingEvents.reason,
      })
      .from(schema.ratingEvents)
      .where(eq(schema.ratingEvents.matchId, d.matchId))
      .orderBy(asc(schema.ratingEvents.seq));

    const players = await Promise.all(
      sides.map(async (s) => {
        const h = history.rows.find((x) => x.user_id === s.userId);
        const tier = rankTierForRating(s.rating);
        return {
          ...s,
          rankLabel: rankTierLabel(tier),
          reputation: reps.get(s.userId) ?? 'new',
          disputeHistory: {
            opened: Number(h?.opened ?? 0),
            lost: Number(h?.lost ?? 0),
            total: Number(h?.total ?? 0),
          },
          standing: await getStanding(s.userId),
          sanctionPreview: await this.sanctions.preview(s.userId),
        };
      }),
    );

    return {
      dispute: {
        id: d.id,
        status: d.status,
        source: d.source,
        category: d.category,
        reason: d.reason,
        detail: d.detail,
        createdAt: d.createdAt.toISOString(),
        assignedToId: d.assignedToId,
        state: queueStateOf(d.status, d.assignedToId),
        sla: slaOf(d, new Date()),
      },
      match: match ? { ...match, startsAt: match.startsAt.toISOString() } : null,
      players,
      submissions: evidence.submissions.map((s) => ({
        ...s,
        submittedAt: s.submittedAt.toISOString(),
      })),
      evidence: evidence.evidence.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      proof,
      chat: evidence.chat,
      rulings: evidence.rulings,
      ratingEvents,
      notes: notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
      templates: RULING_TEMPLATES,
    };
  }

  async addNote(me: AuthedUser, disputeId: string, body: string) {
    const [d] = await db
      .select({ id: schema.disputes.id })
      .from(schema.disputes)
      .where(eq(schema.disputes.id, disputeId));
    if (!d) throw new NotFoundException('Dispute not found');
    const id = uuidv7();
    await db.insert(schema.moderatorNotes).values({ id, disputeId, authorId: me.sub, body });
    await this.audit(me, 'dispute.note_added', 'dispute', disputeId, { noteId: id });
    return { id };
  }

  /**
   * Decision panel submit (F12.2). The ruling (Sprint 9: match outcome, `dispute.ruled`
   * for ratings and notifications, audit) and the optional ladder sanction commit in ONE
   * transaction: either both happen or neither does.
   */
  async decide(
    me: AuthedUser,
    disputeId: string,
    input: {
      outcome: RulingOutcome;
      justification: string;
      sanction?: { userId: string; reason: string } | null;
    },
  ) {
    const [d] = await db
      .select({
        id: schema.disputes.id,
        matchId: schema.disputes.matchId,
        assignedToId: schema.disputes.assignedToId,
      })
      .from(schema.disputes)
      .where(eq(schema.disputes.id, disputeId));
    if (!d) throw new NotFoundException('Dispute not found');
    if (d.assignedToId && d.assignedToId !== me.sub && me.role !== 'admin') {
      throw new ConflictException('Another moderator holds this dispute');
    }
    if (input.sanction) {
      const [side] = await db
        .select({ id: schema.matchSides.id })
        .from(schema.matchSides)
        .where(
          and(
            eq(schema.matchSides.matchId, d.matchId),
            eq(schema.matchSides.userId, input.sanction.userId),
          ),
        );
      if (!side)
        throw new BadRequestException('A sanction from a ruling must target a player in the match');
    }
    return db.transaction(async (tx) => {
      const ruling = await this.disputes.recordRuling(
        me,
        disputeId,
        {
          outcome: input.outcome,
          justification: input.justification,
          sanctionNote: input.sanction
            ? `${LADDER[(await this.sanctions.preview(input.sanction.userId)).step].label}: ${input.sanction.reason}`
            : undefined,
        },
        tx,
      );
      const sanction = input.sanction
        ? await this.sanctions.apply(
            me,
            {
              userId: input.sanction.userId,
              reason: input.sanction.reason,
              source: 'dispute',
              sourceId: disputeId,
            },
            tx,
          )
        : null;
      return { ruling, sanction };
    });
  }

  // ------------------------------------------------------------ users

  async searchUsers(q: { q?: string; cursor?: string; limit: number }) {
    const u = schema.users;
    const conds: SQL[] = [isNull(u.deletedAt)];
    if (q.q) {
      const term = q.q.trim();
      // Usernames by substring; phones only by the full number (no partial phone probing).
      conds.push(or(ilike(u.displayName, `%${escapeLike(term)}%`), eq(u.phone, term))!);
    }
    const cursor = decodeCursor(q.cursor, cursorSchemas.id);
    if (cursor) conds.push(sql`${u.id} > ${cursor.id}`);
    const rows = await db
      .select({
        id: u.id,
        displayName: u.displayName,
        phone: u.phone,
        role: u.role,
        createdAt: u.createdAt,
      })
      .from(u)
      .where(and(...conds))
      .orderBy(asc(u.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const active = await this.sanctions.activeFor(page.map((r) => r.id));
    const now = Date.now();
    return {
      items: page.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        phoneMasked: maskPhone(r.phone),
        role: r.role,
        createdAt: r.createdAt.toISOString(),
        sanctioned: active.some(
          (s) =>
            s.userId === r.id && s.type !== 'warning' && (!s.endsAt || s.endsAt.getTime() > now),
        ),
      })),
      nextCursor:
        rows.length > q.limit && page.length
          ? encodeCursor({ id: page[page.length - 1]!.id })
          : null,
    };
  }

  async userDetail(userId: string) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!u) throw new NotFoundException('Player not found');
    const profiles = await db
      .select({
        gameName: schema.games.name,
        rating: schema.gameProfiles.rating,
        ratedMatches: schema.gameProfiles.ratedMatches,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
      })
      .from(schema.gameProfiles)
      .innerJoin(schema.games, eq(schema.games.id, schema.gameProfiles.gameId))
      .where(eq(schema.gameProfiles.userId, userId));
    const devices = await db.execute<{ device_id: string; others: number }>(sql`
      SELECT s.device_id, (SELECT count(DISTINCT x.user_id)::int FROM sessions x WHERE x.device_id = s.device_id AND x.user_id <> ${userId}) AS others
      FROM sessions s WHERE s.user_id = ${userId} AND s.device_id IS NOT NULL GROUP BY s.device_id`);
    const reports = await db
      .select({
        id: schema.reports.id,
        reason: schema.reports.reason,
        status: schema.reports.status,
        createdAt: schema.reports.createdAt,
      })
      .from(schema.reports)
      .where(and(eq(schema.reports.subjectType, 'user'), eq(schema.reports.subjectId, userId)))
      .orderBy(desc(schema.reports.createdAt))
      .limit(20);
    return {
      id: u.id,
      displayName: u.displayName,
      phoneMasked: maskPhone(u.phone),
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      mfaEnabled: Boolean(u.mfaEnabledAt),
      reputation: (await this.reputation.forUsers([userId])).get(userId) ?? 'new',
      standing: await getStanding(userId),
      sanctionPreview: await this.sanctions.preview(userId),
      sanctions: (await this.sanctions.history(userId)).map((s) => ({
        ...s,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,
        revokedAt: s.revokedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      profiles,
      sharedDevices: devices.rows
        .filter((d) => Number(d.others) > 0)
        .map((d) => ({ deviceId: d.device_id, otherAccounts: Number(d.others) })),
      reports: reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  /** Full phone, admins only, step-up MFA, always audited (data minimisation). */
  async revealPhone(me: AuthedUser, userId: string, why: string) {
    if (me.role !== 'admin') throw new ForbiddenException('Admins only');
    const [u] = await db
      .select({ phone: schema.users.phone })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!u) throw new NotFoundException('Player not found');
    await this.audit(me, 'user.phone_revealed', 'user', userId, { why });
    return { phone: u.phone };
  }

  async setRole(me: AuthedUser, userId: string, role: 'player' | 'moderator' | 'admin') {
    if (me.role !== 'admin') throw new ForbiddenException('Admins only');
    if (userId === me.sub) throw new BadRequestException('You cannot change your own role');
    const [u] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!u) throw new NotFoundException('Player not found');
    if (u.role === role) return { id: userId, role };
    await db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ role, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
      // Losing staff rights ends their sessions so no elevated token outlives the change.
      if (role === 'player') {
        await tx
          .update(schema.sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
      }
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: me.sub,
        action: 'user.role_changed',
        objectType: 'user',
        objectId: userId,
        before: { role: u.role },
        after: { role },
      });
    });
    return { id: userId, role };
  }

  /** Lift the fraud auto-limit: earlier signals stop counting (F12.4). */
  async clearFraud(me: AuthedUser, userIds: string[], note: string) {
    const now = new Date();
    const unique = [...new Set(userIds)];
    await db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ fraudClearedAt: now, updatedAt: now })
        .where(inArray(schema.users.id, unique));
      for (const id of unique) {
        await tx.insert(schema.auditLog).values({
          id: uuidv7(),
          actorId: me.sub,
          action: 'user.fraud_cleared',
          objectType: 'user',
          objectId: id,
          after: { note },
        });
      }
    });
    return { cleared: unique.length };
  }

  // ------------------------------------------------------------ reports

  async reportsQueue(q: { status: 'open' | 'dismissed' | 'actioned'; limit: number }) {
    const { rows } = await db.execute<{
      kind: string;
      id: string;
      reason: string;
      note: string | null;
      status: string;
      created_at: string;
      subject_type: string;
      subject_id: string;
      subject_user_id: string | null;
      reporter_name: string | null;
      body_snapshot: string | null;
      match_id: string | null;
      scope: 'match' | 'dm' | null;
      context: unknown;
    }>(sql`
      SELECT * FROM (
        SELECT 'report' AS kind, r.id, r.reason, r.note, r.status, r.created_at, r.subject_type, r.subject_id,
               CASE WHEN r.subject_type = 'user' THEN r.subject_id ELSE (SELECT c.poster_id FROM challenges c WHERE c.id = r.subject_id) END AS subject_user_id,
               u.display_name AS reporter_name, NULL::text AS body_snapshot, NULL::uuid AS match_id,
               NULL::text AS scope, NULL::jsonb AS context
        FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.status = ${q.status}
        UNION ALL
        SELECT 'message' AS kind, mr.id, mr.reason, mr.note, mr.status, mr.created_at, 'message', mr.message_id,
               (SELECT m.sender_id FROM messages m WHERE m.id = mr.message_id AND m.created_at = mr.message_created_at LIMIT 1),
               u.display_name, mr.body_snapshot, c.match_id, c.scope::text, ctx.messages
        FROM message_reports mr JOIN users u ON u.id = mr.reporter_id
        JOIN conversations c ON c.id = mr.conversation_id
        LEFT JOIN message_report_contexts ctx ON ctx.report_id = mr.id
        WHERE mr.status = ${q.status}
        UNION ALL
        -- Keyword-filter hits (F7.3 filter, F14.3): no reporter, the filter flagged it.
        SELECT 'flag' AS kind, f.id, array_to_string(ARRAY(SELECT jsonb_array_elements_text(f.categories)), ', '),
               NULL, f.status, f.created_at, 'message', f.message_id,
               m.sender_id, NULL, m.body, c.match_id, c.scope::text, NULL::jsonb
        FROM chat_flags f
        JOIN conversations c ON c.id = f.conversation_id
        LEFT JOIN messages m ON m.id = f.message_id AND m.created_at = f.message_created_at
        WHERE f.status = ${q.status}
      ) x ORDER BY created_at ASC LIMIT ${q.limit}`);
    return { items: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) };
  }

  /**
   * Resolve one or many reports. `action` marks them actioned (counts toward the
   * subject's auto-limit) and can apply the next ladder step to the reported player.
   */
  async resolveReports(
    me: AuthedUser,
    items: Array<{ kind: 'report' | 'message' | 'flag'; id: string }>,
    input: { resolution: 'dismissed' | 'actioned'; note: string; sanctionUserId?: string | null },
  ) {
    const now = new Date();
    let changed = 0;
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (item.kind === 'report') {
          const rows = await tx
            .update(schema.reports)
            .set({
              status: input.resolution,
              resolvedById: me.sub,
              resolvedAt: now,
              resolution: input.note,
            })
            .where(and(eq(schema.reports.id, item.id), eq(schema.reports.status, 'open')))
            .returning({ id: schema.reports.id });
          changed += rows.length;
        } else if (item.kind === 'flag') {
          const rows = await tx
            .update(schema.chatFlags)
            .set({ status: input.resolution })
            .where(and(eq(schema.chatFlags.id, item.id), eq(schema.chatFlags.status, 'open')))
            .returning({ id: schema.chatFlags.id });
          changed += rows.length;
        } else {
          const rows = await tx
            .update(schema.messageReports)
            .set({ status: input.resolution })
            .where(
              and(eq(schema.messageReports.id, item.id), eq(schema.messageReports.status, 'open')),
            )
            .returning({ id: schema.messageReports.id });
          changed += rows.length;
        }
        await tx.insert(schema.auditLog).values({
          id: uuidv7(),
          actorId: me.sub,
          action: `report.${input.resolution}`,
          objectType: item.kind,
          objectId: item.id,
          after: { note: input.note },
        });
      }
      if (input.resolution === 'actioned' && input.sanctionUserId) {
        await this.sanctions.apply(
          me,
          {
            userId: input.sanctionUserId,
            reason: input.note,
            source: 'report',
            sourceId: items[0]?.id ?? null,
          },
          tx,
        );
      }
    });
    return { changed };
  }

  // ------------------------------------------------------------ fraud signals

  async signals() {
    const hash = await db.execute(sql`
      SELECT u.id AS upload_id, u.owner_id, ow.display_name AS owner_name, u.match_id, u.status, u.reject_reason,
             u.similar_distance, u.created_at,
             coalesce(u.reused_upload_id, u.similar_upload_id) AS earlier_upload_id,
             e.match_id AS earlier_match_id, e.owner_id AS earlier_owner_id,
             CASE WHEN u.reused_upload_id IS NOT NULL THEN 'reused' ELSE 'similar' END AS kind
      FROM uploads u
      JOIN users ow ON ow.id = u.owner_id
      LEFT JOIN uploads e ON e.id = coalesce(u.reused_upload_id, u.similar_upload_id)
      WHERE (u.reused_upload_id IS NOT NULL OR u.similar_upload_id IS NOT NULL)
        AND u.created_at > now() - interval '30 days'
      ORDER BY u.created_at DESC LIMIT 100`);
    // Win-trading risk: pairs with 4+ rated results in 7 days whose wins alternate.
    const pairs = await db.execute(sql`
      SELECT re.game_id, re.user_id AS a, re.opponent_id AS b, ua.display_name AS a_name, ub.display_name AS b_name,
             count(*)::int AS matches,
             count(*) FILTER (WHERE re.score = 1)::int AS a_wins,
             count(*) FILTER (WHERE re.score = 0)::int AS b_wins,
             count(*) FILTER (WHERE re.multiplier < 1)::int AS dampened,
             max(re.decided_at) AS last_at
      FROM rating_events re
      JOIN users ua ON ua.id = re.user_id JOIN users ub ON ub.id = re.opponent_id
      WHERE re.kind = 'apply' AND re.user_id < re.opponent_id AND re.decided_at > now() - interval '7 days'
      GROUP BY re.game_id, re.user_id, re.opponent_id, ua.display_name, ub.display_name
      HAVING count(*) >= 4
      ORDER BY count(*) DESC LIMIT 50`);
    const shared = await db.execute(sql`
      SELECT s.device_id, array_agg(DISTINCT s.user_id) AS user_ids, count(DISTINCT s.user_id)::int AS accounts,
             max(s.created_at) AS last_seen
      FROM sessions s
      WHERE s.device_id IS NOT NULL AND s.created_at > now() - interval '30 days'
      GROUP BY s.device_id HAVING count(DISTINCT s.user_id) > 1
      ORDER BY count(DISTINCT s.user_id) DESC LIMIT 50`);
    const repeat = await db.execute(sql`
      SELECT pc.game_id, pc.user_a_id, pc.user_b_id, pc.count, pc.last_pairing_at
      FROM pairing_counters pc WHERE pc.count >= 5 ORDER BY pc.count DESC LIMIT 50`);
    const limited = await db.execute<{ id: string; display_name: string | null }>(sql`
      SELECT DISTINCT u.id, u.display_name FROM users u
      WHERE u.id IN (
        SELECT owner_id FROM uploads WHERE reject_reason = 'reused_screenshot' AND created_at > now() - interval '30 days'
        UNION SELECT user_id FROM reputation_debts WHERE created_at > now() - interval '30 days'
      ) LIMIT 200`);
    const autoLimited: Array<{ id: string; displayName: string | null; reasons: string[] }> = [];
    for (const u of limited.rows) {
      const s = await getStanding(u.id);
      if (s.autoLimit.limited)
        autoLimited.push({ id: u.id, displayName: u.display_name, reasons: s.autoLimit.reasons });
    }
    return {
      hashFlags: hash.rows,
      winTrading: pairs.rows.map((p) => {
        const r = p as { a_wins: number; b_wins: number; matches: number };
        // Risk 0–1: high when wins split evenly across many matches (trading), low when one-sided.
        const balance =
          1 - Math.abs(Number(r.a_wins) - Number(r.b_wins)) / Math.max(1, Number(r.matches));
        return { ...p, risk: Math.round(balance * Math.min(1, Number(r.matches) / 8) * 100) / 100 };
      }),
      sharedDevices: shared.rows,
      repeatPairings: repeat.rows,
      autoLimited,
    };
  }

  // ------------------------------------------------------------ flags, games, audit

  async flags() {
    return db
      .select()
      .from(schema.featureFlags)
      .orderBy(asc(schema.featureFlags.key), asc(schema.featureFlags.stage));
  }

  async setFlag(me: AuthedUser, id: string, enabled: boolean) {
    if (me.role !== 'admin') throw new ForbiddenException('Admins only');
    const [before] = await db
      .select()
      .from(schema.featureFlags)
      .where(eq(schema.featureFlags.id, id));
    if (!before) throw new NotFoundException('Flag not found');
    await db.update(schema.featureFlags).set({ enabled }).where(eq(schema.featureFlags.id, id));
    await this.audit(
      me,
      'flag.toggled',
      'feature_flag',
      id,
      { key: before.key, enabled },
      { enabled: before.enabled },
    );
    return { id, enabled };
  }

  async gamesConfig() {
    const games = await db.select().from(schema.games).orderBy(asc(schema.games.name));
    const formats = await db.select().from(schema.gameFormats);
    return games.map((g) => ({ ...g, formats: formats.filter((f) => f.gameId === g.id) }));
  }

  async updateFormat(
    me: AuthedUser,
    formatId: string,
    patch: { status?: 'enabled' | 'disabled'; name?: string; tiebreakRules?: string },
  ) {
    if (me.role !== 'admin') throw new ForbiddenException('Admins only');
    const [before] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.id, formatId));
    if (!before) throw new NotFoundException('Format not found');
    await db.update(schema.gameFormats).set(patch).where(eq(schema.gameFormats.id, formatId));
    await this.audit(me, 'game_format.updated', 'game_format', formatId, patch, {
      status: before.status,
      name: before.name,
      tiebreakRules: before.tiebreakRules,
    });
    return { id: formatId, ...patch };
  }

  async auditLog(q: {
    action?: string;
    actorId?: string;
    objectId?: string;
    cursor?: string;
    limit: number;
  }) {
    const a = schema.auditLog;
    const conds: SQL[] = [];
    if (q.action) conds.push(ilike(a.action, `${escapeLike(q.action)}%`));
    if (q.actorId) conds.push(eq(a.actorId, q.actorId));
    if (q.objectId) conds.push(eq(a.objectId, q.objectId));
    const cursor = decodeCursor(q.cursor, cursorSchemas.timeId);
    if (cursor) conds.push(sql`(${a.createdAt}, ${a.id}) < (${new Date(cursor.t)}, ${cursor.id})`);
    const rows = await db
      .select({
        id: a.id,
        action: a.action,
        objectType: a.objectType,
        objectId: a.objectId,
        actorId: a.actorId,
        actorName: schema.users.displayName,
        before: a.before,
        after: a.after,
        ip: a.ip,
        createdAt: a.createdAt,
      })
      .from(a)
      .leftJoin(schema.users, eq(schema.users.id, a.actorId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(a.createdAt), desc(a.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }
}
