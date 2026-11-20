import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { normalizeNigerianPhone } from '@raise/schemas';
import { db, schema } from '../db/client';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { generateInviteCode, inviteOnly, purgeWaitlist } from './invites';
import { PRD_TARGETS, onTrack, type MetricKey } from './metrics.rules';

export type Severity = 'S1' | 'S2' | 'S3' | 'S4';
export type FeedbackStatus = 'new' | 'triaged' | 'fixed' | 'wont_fix' | 'duplicate';

const requireAdmin = (me: AuthedUser) => {
  if (me.role !== 'admin') throw new ForbiddenException('Admins only');
};

/**
 * Closed beta (Sprint 16): invite codes and waitlist (F16.1), metrics (F16.2), feedback and
 * severity triage (F16.3). Every staff write is audited.
 */
@Injectable()
export class BetaService {
  private audit(
    me: AuthedUser,
    action: string,
    objectType: string,
    objectId: string,
    after?: unknown,
    before?: unknown,
  ) {
    return db.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: me.sub,
      action,
      objectType,
      objectId,
      before: before ?? null,
      after: after ?? null,
    });
  }

  // ------------------------------------------------------------ public

  async status() {
    return { inviteOnly: await inviteOnly() };
  }

  /** Idempotent per phone; never says whether the number already has an account. */
  async joinWaitlist(rawPhone: string, place?: string | null) {
    const phone = normalizeNigerianPhone(rawPhone);
    if (!phone) throw new BadRequestException('Enter a valid Nigerian mobile number');
    await purgeWaitlist();
    await db
      .insert(schema.betaWaitlist)
      .values({ id: uuidv7(), phone, place: place?.trim() || null })
      .onConflictDoNothing({ target: schema.betaWaitlist.phone });
    return { ok: true as const };
  }

  // ------------------------------------------------------------ invite codes (staff)

  async codes() {
    const c = schema.inviteCodes;
    const rows = await db.select().from(c).orderBy(desc(c.createdAt)).limit(500);
    const cohorts = await db.execute<{ cohort: string; players: number }>(sql`
      SELECT cohort, count(*)::int AS players FROM invite_redemptions GROUP BY cohort ORDER BY cohort`);
    return {
      inviteOnly: await inviteOnly(),
      codes: rows.map((r) => ({
        ...r,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      cohorts: cohorts.rows,
    };
  }

  async createCodes(
    me: AuthedUser,
    input: {
      cohort: string;
      place?: string | null;
      maxUses: number;
      expiresAt?: string | null;
      count: number;
    },
  ) {
    requireAdmin(me);
    const created: Array<{ id: string; code: string }> = [];
    for (let i = 0; i < input.count; i++) {
      // Collisions are vanishingly rare (31^8); retry a few times on the unique index.
      for (let attempt = 0; attempt < 5; attempt++) {
        const id = uuidv7();
        const code = generateInviteCode();
        const rows = await db
          .insert(schema.inviteCodes)
          .values({
            id,
            code,
            cohort: input.cohort.trim(),
            place: input.place?.trim() || null,
            maxUses: input.maxUses,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            createdById: me.sub,
          })
          .onConflictDoNothing({ target: schema.inviteCodes.code })
          .returning({ id: schema.inviteCodes.id, code: schema.inviteCodes.code });
        if (rows[0]) {
          created.push(rows[0]);
          break;
        }
      }
    }
    await this.audit(me, 'beta.codes_created', 'invite_code', input.cohort, {
      ...input,
      ids: created.map((c) => c.id),
    });
    return { created };
  }

  async updateCode(
    me: AuthedUser,
    id: string,
    input: { active?: boolean; maxUses?: number; expiresAt?: string | null },
  ) {
    requireAdmin(me);
    const c = schema.inviteCodes;
    const [before] = await db.select().from(c).where(eq(c.id, id));
    if (!before) throw new NotFoundException('Invite code not found');
    if (input.maxUses !== undefined && input.maxUses < before.uses)
      throw new BadRequestException(`Already used ${before.uses} times`);
    const [after] = await db
      .update(c)
      .set({
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
      })
      .where(eq(c.id, id))
      .returning();
    await this.audit(me, 'beta.code_updated', 'invite_code', id, input, {
      active: before.active,
      maxUses: before.maxUses,
      expiresAt: before.expiresAt,
    });
    return after;
  }

  // ------------------------------------------------------------ waitlist (staff)

  async waitlist() {
    await purgeWaitlist();
    const w = schema.betaWaitlist;
    const rows = await db
      .select({
        id: w.id,
        phone: w.phone,
        place: w.place,
        createdAt: w.createdAt,
        invitedAt: w.invitedAt,
        code: schema.inviteCodes.code,
      })
      .from(w)
      .leftJoin(schema.inviteCodes, eq(schema.inviteCodes.id, w.inviteCodeId))
      .orderBy(asc(w.createdAt))
      .limit(1000);
    return rows.map((r) => ({
      ...r,
      // Data minimisation: staff see the last four digits; the full number goes only into
      // the invite message the admin sends.
      phone: `${r.phone.slice(0, 4)} *** *** ${r.phone.slice(-4)}`,
      createdAt: r.createdAt.toISOString(),
      invitedAt: r.invitedAt?.toISOString() ?? null,
    }));
  }

  /** Marks a waitlist entry invited with a code and returns the message to send. */
  async inviteFromWaitlist(me: AuthedUser, waitlistId: string, codeId: string) {
    requireAdmin(me);
    const [code] = await db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.id, codeId));
    if (!code || !code.active) throw new BadRequestException('Choose an active invite code');
    const [row] = await db
      .update(schema.betaWaitlist)
      .set({ invitedAt: new Date(), inviteCodeId: codeId })
      .where(and(eq(schema.betaWaitlist.id, waitlistId), isNull(schema.betaWaitlist.invitedAt)))
      .returning();
    if (!row) throw new ConflictException('Already invited or no longer on the waitlist');
    await this.audit(me, 'beta.waitlist_invited', 'waitlist', waitlistId, { codeId });
    return {
      phone: row.phone,
      message: `You're in! Join the RAISE beta with invite code ${code.code}. Sign up with this phone number.`,
    };
  }

  // ------------------------------------------------------------ feedback

  async submitFeedback(
    me: AuthedUser,
    input: { kind: 'bug' | 'idea' | 'other'; body: string; page?: string; appVersion?: string },
    userAgent?: string,
  ) {
    const id = uuidv7();
    await db.insert(schema.feedback).values({
      id,
      userId: me.sub,
      kind: input.kind,
      body: input.body.trim(),
      page: input.page?.slice(0, 300) ?? null,
      appVersion: input.appVersion?.slice(0, 64) ?? null,
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
    return { id };
  }

  async feedbackQueue(q: { status?: FeedbackStatus | 'open'; severity?: Severity; limit: number }) {
    const f = schema.feedback;
    const conditions = [];
    if (q.status === 'open') conditions.push(inArray(f.status, ['new', 'triaged']));
    else if (q.status) conditions.push(eq(f.status, q.status));
    if (q.severity) conditions.push(eq(f.severity, q.severity));
    const rows = await db
      .select({
        id: f.id,
        kind: f.kind,
        body: f.body,
        page: f.page,
        appVersion: f.appVersion,
        severity: f.severity,
        status: f.status,
        note: f.note,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        userId: f.userId,
        reporter: schema.users.displayName,
      })
      .from(f)
      .leftJoin(schema.users, eq(schema.users.id, f.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      // Untriaged first, then by severity, then oldest.
      .orderBy(sql`${f.severity} IS NOT NULL`, asc(f.severity), asc(f.createdAt))
      .limit(q.limit);
    return {
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      openBySeverity: await this.openBySeverity(),
    };
  }

  async triage(
    me: AuthedUser,
    id: string,
    input: { severity?: Severity; status?: FeedbackStatus; note?: string },
  ) {
    const f = schema.feedback;
    const [before] = await db.select().from(f).where(eq(f.id, id));
    if (!before) throw new NotFoundException('Feedback not found');
    const severity = input.severity ?? before.severity;
    // Leaving "new" means it has been looked at: it needs a severity.
    const status =
      input.status ?? (input.severity && before.status === 'new' ? 'triaged' : before.status);
    if (status !== 'new' && !severity)
      throw new BadRequestException('Set a severity when triaging');
    const [after] = await db
      .update(f)
      .set({
        severity,
        status,
        note: input.note !== undefined ? input.note.trim() || null : before.note,
        triagedById: me.sub,
        updatedAt: new Date(),
      })
      .where(eq(f.id, id))
      .returning();
    await this.audit(
      me,
      'feedback.triaged',
      'feedback',
      id,
      { severity, status, note: after?.note ?? null },
      { severity: before.severity, status: before.status },
    );
    return after;
  }

  private async openBySeverity() {
    const { rows } = await db.execute<{ severity: string | null; n: number }>(sql`
      SELECT severity, count(*)::int AS n FROM feedback
      WHERE status IN ('new', 'triaged') GROUP BY severity`);
    const by = Object.fromEntries(rows.map((r) => [r.severity ?? 'untriaged', Number(r.n)]));
    return {
      S1: by.S1 ?? 0,
      S2: by.S2 ?? 0,
      S3: by.S3 ?? 0,
      S4: by.S4 ?? 0,
      untriaged: by.untriaged ?? 0,
    };
  }

  // ------------------------------------------------------------ metrics (F16.2)

  /**
   * The PRD Stage 1 success metrics over a window, optionally for one cohort. Definitions
   * are in docs/sprints/sprint-16-closed-beta.md; targets in metrics.rules.ts.
   */
  async metrics(q: { cohort?: string | null; since?: string | null; now?: Date }) {
    const now = q.now ?? new Date();
    const cohort = q.cohort?.trim() || null;
    const sinceRow = q.since
      ? null
      : (
          await db.execute<{ at: string | null }>(
            sql`SELECT min(created_at) AS at FROM invite_redemptions`,
          )
        ).rows[0];
    const since = q.since
      ? new Date(q.since)
      : sinceRow?.at
        ? new Date(sinceRow.at)
        : new Date(now.getTime() - 56 * 86_400_000);

    const { rows } = await db.execute<Record<string, number | string | null>>(sql`
      WITH p AS (
        SELECT u.id, u.created_at FROM users u
        LEFT JOIN invite_redemptions r ON r.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.role = 'player' AND u.created_at >= ${since}
          AND u.created_at <= ${now}
          AND (${cohort}::text IS NULL OR r.cohort = ${cohort})
      ),
      gid AS (SELECT p.id FROM p WHERE EXISTS (SELECT 1 FROM game_profiles g WHERE g.user_id = p.id)),
      challengers AS (
        SELECT gid.id FROM gid WHERE EXISTS (
          SELECT 1 FROM challenges c WHERE (c.poster_id = gid.id OR c.accepted_by_id = gid.id)
            AND c.created_at >= ${since})
      ),
      pm AS (
        SELECT DISTINCT m.id, m.status, m.confirmed_at, m.resolved_at, m.updated_at
        FROM matches m JOIN match_sides s ON s.match_id = m.id JOIN p ON p.id = s.user_id
      ),
      completed AS (
        SELECT * FROM pm WHERE status IN ('confirmed', 'resolved')
          AND coalesce(confirmed_at, resolved_at, updated_at) >= ${since}
      ),
      decided AS (
        SELECT * FROM pm WHERE status IN ('confirmed','resolved','forfeited','voided','disputed')
          AND updated_at >= ${since}
      ),
      pd AS (SELECT d.* FROM disputes d WHERE d.match_id IN (SELECT id FROM pm) AND d.created_at >= ${since}),
      firsts AS (
        SELECT s.user_id, min(coalesce(m.confirmed_at, m.resolved_at)) AS first_done
        FROM match_sides s JOIN matches m ON m.id = s.match_id JOIN p ON p.id = s.user_id
        WHERE m.status IN ('confirmed', 'resolved')
        GROUP BY s.user_id
      ),
      eligible AS (SELECT * FROM firsts WHERE first_done <= ${now}::timestamptz - interval '28 days'),
      retained AS (
        SELECT e.user_id FROM eligible e WHERE
          EXISTS (SELECT 1 FROM challenges c WHERE c.poster_id = e.user_id
                  AND c.created_at >= e.first_done + interval '21 days' AND c.created_at < e.first_done + interval '28 days')
          OR EXISTS (SELECT 1 FROM challenges c WHERE c.accepted_by_id = e.user_id
                  AND c.accepted_at >= e.first_done + interval '21 days' AND c.accepted_at < e.first_done + interval '28 days')
          OR EXISTS (SELECT 1 FROM match_sides s JOIN matches m ON m.id = s.match_id
                  WHERE s.user_id = e.user_id AND m.status IN ('confirmed','resolved')
                  AND coalesce(m.confirmed_at, m.resolved_at) >= e.first_done + interval '21 days'
                  AND coalesce(m.confirmed_at, m.resolved_at) < e.first_done + interval '28 days')
      )
      SELECT
        (SELECT count(*)::int FROM p) AS signed_up,
        (SELECT count(*)::int FROM gid) AS registered,
        (SELECT count(*)::int FROM challengers) AS challengers,
        (SELECT count(*)::int FROM completed) AS completed,
        (SELECT count(*)::int FROM completed c WHERE c.status = 'confirmed'
           AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.match_id = c.id)) AS auto_confirmed,
        (SELECT count(*)::int FROM decided) AS decided,
        (SELECT count(*)::int FROM pd) AS disputes,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (ruled_at - created_at)) * 1000)
           FROM pd WHERE ruled_at IS NOT NULL) AS median_resolution_ms,
        (SELECT count(*)::int FROM eligible) AS retention_eligible,
        (SELECT count(*)::int FROM retained) AS retained,
        (SELECT count(DISTINCT user_id)::int FROM firsts WHERE first_done >= ${since}) AS played
    `);
    const r = rows[0] ?? {};
    const n = (k: string) => Number(r[k] ?? 0);
    const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
    const days = Math.max(1, Math.round((now.getTime() - since.getTime()) / 86_400_000));
    const weeks = Math.min(8, days / 7);

    const values: Record<MetricKey, number | null> = {
      registered: n('registered'),
      challengeShare: ratio(n('challengers'), n('registered')),
      completedMatches: n('completed'),
      autoConfirmShare: ratio(n('auto_confirmed'), n('completed')),
      disputeRate: ratio(n('disputes'), n('decided')),
      medianResolutionHours:
        r.median_resolution_ms === null || r.median_resolution_ms === undefined
          ? null
          : Number(r.median_resolution_ms) / 3_600_000,
      week4Retention: ratio(n('retained'), n('retention_eligible')),
    };

    const series = await db.execute<{
      day: string;
      signups: number;
      challenges: number;
      completed: number;
    }>(sql`
      WITH p AS (
        SELECT u.id, u.created_at FROM users u LEFT JOIN invite_redemptions r ON r.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.role = 'player' AND u.created_at >= ${since}
          AND (${cohort}::text IS NULL OR r.cohort = ${cohort})
      ),
      days AS (SELECT generate_series(date_trunc('day', ${since}::timestamptz), date_trunc('day', ${now}::timestamptz), interval '1 day') AS day)
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
        (SELECT count(*)::int FROM p WHERE date_trunc('day', p.created_at) = d.day) AS signups,
        (SELECT count(*)::int FROM challenges c JOIN p ON p.id = c.poster_id
          WHERE date_trunc('day', c.created_at) = d.day) AS challenges,
        (SELECT count(DISTINCT m.id)::int FROM matches m JOIN match_sides s ON s.match_id = m.id
          JOIN p ON p.id = s.user_id
          WHERE m.status IN ('confirmed','resolved')
            AND date_trunc('day', coalesce(m.confirmed_at, m.resolved_at)) = d.day) AS completed
      FROM days d ORDER BY d.day`);

    return {
      cohort,
      since: since.toISOString(),
      until: now.toISOString(),
      days,
      metrics: (Object.keys(PRD_TARGETS) as MetricKey[]).map((key) => ({
        key,
        ...PRD_TARGETS[key],
        value: values[key],
        // Count targets are 8-week launch targets: show the pace for the elapsed weeks.
        pace: PRD_TARGETS[key].kind === 'count' ? (PRD_TARGETS[key].target * weeks) / 8 : null,
        status: onTrack(key, values[key], weeks),
      })),
      funnel: {
        signedUp: n('signed_up'),
        gameId: n('registered'),
        firstChallenge: n('challengers'),
        firstCompletedMatch: n('played'),
      },
      retention: { eligible: n('retention_eligible'), retained: n('retained') },
      series: series.rows.map((s) => ({
        day: s.day,
        signups: Number(s.signups),
        challenges: Number(s.challenges),
        completed: Number(s.completed),
      })),
      feedback: await this.openBySeverity(),
      cohorts: (
        await db.execute<{ cohort: string }>(
          sql`SELECT DISTINCT cohort FROM invite_codes ORDER BY cohort`,
        )
      ).rows.map((c) => c.cohort),
    };
  }
}
