/**
 * Sprint 12 — trust & operations: staff MFA, dispute queue + atomic decisions, sanction
 * ladder and enforcement, reputation debts → auto-limits, reports, audit coverage.
 * Needs Postgres and Redis.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import type { AuthedUser } from './auth/jwt-auth.guard';
import { checkSessionActive } from './auth/jwt-auth.guard';
import { ChallengesService } from './challenges/challenges.service';
import { AdminService, maskPhone } from './moderation/admin.service';
import { MfaService, StaffMfaGuard, StepUp } from './moderation/mfa';
import { SanctionsService } from './moderation/sanctions.service';
import { getStanding } from './moderation/standing';
import { OutboxRelay } from './realtime/outbox-relay';
import { totpAt } from './shared/totp';
import { ensureRedis, redis } from './cache/redis';

describe('Sprint 12 - trust & operations', () => {
  let moduleRef: TestingModule;
  let admin: AdminService;
  let mfa: MfaService;
  let sanctions: SanctionsService;
  let challenges: ChallengesService;
  let relay: OutboxRelay;
  let gameId = '';
  let gameKey = '';
  let formatId = '';
  let formatKey = '';
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);

  async function person(
    name: string,
    role: AuthedUser['role'] = 'player',
    mfaOn = role !== 'player',
  ) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23481${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-6)}`,
      role,
      tosVersionAccepted: '1.0',
      mfaEnabledAt: mfaOn ? new Date() : null,
    });
    userIds.push(id);
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}_${id.slice(-6)}` });
    const sid = uuidv7();
    await db.insert(schema.sessions).values({
      id: sid,
      userId: id,
      refreshTokenHash: `t-${sid}`,
      expiresAt: new Date(Date.now() + 3600_000),
      mfaVerifiedAt: mfaOn ? new Date() : null,
    });
    return { sub: id, sid, role } as AuthedUser;
  }

  /** A disputed match between a (side 0) and b (side 1) with an open dispute. */
  async function disputed(a: AuthedUser, b: AuthedUser) {
    const challengeId = uuidv7();
    const now = new Date();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: a.sub,
      status: 'accepted',
      startsAt: new Date(now.getTime() - 7200_000),
      endsAt: now,
      acceptanceDeadline: new Date(now.getTime() - 9000_000),
      acceptedById: b.sub,
      acceptedAt: new Date(now.getTime() - 8000_000),
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db.insert(schema.matches).values({ id: matchId, challengeId, status: 'disputed' });
    matchIds.push(matchId);
    const profiles = await db
      .select()
      .from(schema.gameProfiles)
      .where(
        and(
          eq(schema.gameProfiles.gameId, gameId),
          inArray(schema.gameProfiles.userId, [a.sub, b.sub]),
        ),
      );
    const pid = (u: string) => profiles.find((p) => p.userId === u)!.id;
    await db.insert(schema.matchSides).values([
      { id: uuidv7(), matchId, userId: a.sub, gameProfileId: pid(a.sub), side: 0, isPoster: true },
      {
        id: uuidv7(),
        matchId,
        userId: b.sub,
        gameProfileId: pid(b.sub),
        side: 1,
        isAcceptor: true,
      },
    ]);
    const disputeId = uuidv7();
    await db.insert(schema.disputes).values({
      id: disputeId,
      matchId,
      raisedById: b.sub,
      source: 'player',
      reason: 'wrong_winner',
      status: 'open',
    });
    return { matchId, disputeId };
  }

  const ctx = (user: AuthedUser, handler: () => void): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  const reason = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { getResponse?: () => unknown; message?: string }) => {
        const r = e.getResponse?.() as { code?: string } | string | undefined;
        return typeof r === 'object' && r?.code ? r.code : (e.message ?? 'error');
      },
    );

  beforeAll(async () => {
    await ensureRedis();
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    admin = moduleRef.get(AdminService);
    mfa = moduleRef.get(MfaService);
    sanctions = moduleRef.get(SanctionsService);
    challenges = moduleRef.get(ChallengesService);
    relay = moduleRef.get(OutboxRelay);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    gameKey = game!.key;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(and(eq(schema.gameFormats.gameId, gameId), eq(schema.gameFormats.status, 'enabled')))
      .limit(1);
    formatId = format!.id;
    formatKey = format!.key;
  }, 60_000);

  afterAll(async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
      if (matchIds.length) {
        await tx
          .delete(schema.outboxEvents)
          .where(inArray(schema.outboxEvents.subjectId, matchIds));
        await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
      }
      if (userIds.length) {
        await tx.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, userIds));
        await tx
          .delete(schema.reputationDebts)
          .where(inArray(schema.reputationDebts.userId, userIds));
        await tx.delete(schema.reports).where(inArray(schema.reports.reporterId, userIds));
        await tx.delete(schema.sanctions).where(inArray(schema.sanctions.userId, userIds));
        await tx.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, userIds));
      }
    });
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    // Challenges created through the service by these players.
    if (userIds.length) {
      await db.delete(schema.challenges).where(inArray(schema.challenges.posterId, userIds));
      await db.delete(schema.sessions).where(inArray(schema.sessions.userId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await moduleRef?.close();
  }, 60_000);

  // ---------------------------------------------------------------- MFA
  describe('staff MFA (F12.1)', () => {
    it('enrols with a TOTP code, and the guard enforces setup, session age and step-up', async () => {
      const mod = await person('mfa_mod', 'moderator', false);
      const guard = new StaffMfaGuard(moduleRef.get(Reflector));
      const plain = () => undefined;
      class Sensitive {
        @StepUp() handler() {}
      }
      const sensitive = Sensitive.prototype.handler;

      expect(await reason(guard.canActivate(ctx(mod, plain)))).toBe('mfa_setup_required');

      const { secret, otpauthUri } = await mfa.setup(mod);
      expect(otpauthUri).toContain('otpauth://totp/');
      await redis.del(`rl:mfa:${mod.sub}`, `mfa:step:${mod.sub}`);
      await expect(mfa.enable(mod, '000000')).rejects.toMatchObject({ status: 401 });
      const status = await mfa.enable(mod, totpAt(secret, Date.now()));
      expect(status).toMatchObject({ enabled: true, sessionValid: true });
      expect(await guard.canActivate(ctx(mod, plain))).toBe(true);
      expect(await guard.canActivate(ctx(mod, sensitive))).toBe(true);

      // 20 minutes later: fine for normal staff routes, not for a sensitive one.
      await db
        .update(schema.sessions)
        .set({ mfaVerifiedAt: new Date(Date.now() - 20 * 60_000) })
        .where(eq(schema.sessions.id, mod.sid));
      expect(await guard.canActivate(ctx(mod, plain))).toBe(true);
      expect(await reason(guard.canActivate(ctx(mod, sensitive)))).toBe('mfa_step_up');
      // 13 hours later: every staff route asks again.
      await db
        .update(schema.sessions)
        .set({ mfaVerifiedAt: new Date(Date.now() - 13 * 3600_000) })
        .where(eq(schema.sessions.id, mod.sid));
      expect(await reason(guard.canActivate(ctx(mod, plain)))).toBe('mfa_required');

      // The secret is stored encrypted, never in clear.
      const [u] = await db
        .select({ enc: schema.users.mfaSecretEnc })
        .from(schema.users)
        .where(eq(schema.users.id, mod.sub));
      expect(u!.enc).toMatch(/^v1\./);
      expect(u!.enc).not.toContain(secret);
    });

    it('players are never let through', async () => {
      const p = await person('mfa_player');
      const guard = new StaffMfaGuard(moduleRef.get(Reflector));
      expect(await reason(guard.canActivate(ctx(p, () => undefined)))).toBe('Moderators only');
    });
  });

  // ---------------------------------------------------------------- queue
  describe('dispute queue + decisions (F12.2)', () => {
    it('two moderators racing to claim: exactly one wins', async () => {
      const [m1, m2, a, b] = await Promise.all([
        person('q_m1', 'moderator'),
        person('q_m2', 'moderator'),
        person('q_a'),
        person('q_b'),
      ]);
      const { disputeId } = await disputed(a, b);
      const results = await Promise.allSettled([
        admin.assign(m1, disputeId),
        admin.assign(m2, disputeId),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const [d] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, disputeId));
      expect([m1.sub, m2.sub]).toContain(d!.assignedToId);
    });

    it('queue shows state and SLA clock, oldest first', async () => {
      const [m, a, b] = await Promise.all([
        person('sla_m', 'moderator'),
        person('sla_a'),
        person('sla_b'),
      ]);
      const { disputeId } = await disputed(a, b);
      await db
        .update(schema.disputes)
        .set({ createdAt: new Date(Date.now() - 30 * 3600_000) })
        .where(eq(schema.disputes.id, disputeId));
      const page = await admin.queue({ state: 'unassigned', limit: 100 }, m);
      const row = page.items.find((i) => i.id === disputeId);
      expect(row).toMatchObject({ state: 'unassigned', sla: { breached: true } });
    });

    it('decision with a sanction is atomic: ruling, outcome, sanction, events, audit together', async () => {
      const [m, a, b] = await Promise.all([
        person('dec_m', 'moderator'),
        person('dec_a'),
        person('dec_b'),
      ]);
      const { disputeId, matchId } = await disputed(a, b);
      await admin.assign(m, disputeId);
      const res = await admin.decide(m, disputeId, {
        outcome: 'side0_win',
        justification: 'The screenshots and chat support the first player’s result.',
        sanction: { userId: b.sub, reason: 'Submitted a result the evidence contradicts' },
      });
      expect(res.ruling).toMatchObject({ outcome: 'side0_win', ratingAction: 'apply' });
      expect(res.sanction).toMatchObject({ userId: b.sub, step: 1, type: 'warning' });
      const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
      expect(match).toMatchObject({ status: 'resolved', winnerSide: 0 });
      const events = await db
        .select({ type: schema.outboxEvents.type })
        .from(schema.outboxEvents)
        .where(inArray(schema.outboxEvents.subjectId, [disputeId, b.sub]));
      expect(events.map((e) => e.type)).toEqual(
        expect.arrayContaining(['dispute.ruled', 'sanction.applied']),
      );
      const audit = await db
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.actorId, m.sub));
      expect(audit.map((x) => x.action)).toEqual(
        expect.arrayContaining(['dispute.assigned', 'dispute.ruled', 'sanction.applied']),
      );
    });

    it('a failed sanction rolls the ruling back too', async () => {
      const [m, a, b, outsider] = await Promise.all([
        person('rb_m', 'moderator'),
        person('rb_a'),
        person('rb_b'),
        person('rb_x'),
      ]);
      const { disputeId, matchId } = await disputed(a, b);
      await expect(
        admin.decide(m, disputeId, {
          outcome: 'side1_win',
          justification: 'Testing rollback of a ruling.',
          sanction: { userId: outsider.sub, reason: 'Not in this match' },
        }),
      ).rejects.toMatchObject({ status: 400 });
      const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
      expect(match!.status).toBe('disputed');
      expect(
        await db.select().from(schema.rulings).where(eq(schema.rulings.disputeId, disputeId)),
      ).toHaveLength(0);
    });

    it('a moderator cannot rule on a dispute someone else holds', async () => {
      const [m1, m2, a, b] = await Promise.all([
        person('own_m1', 'moderator'),
        person('own_m2', 'moderator'),
        person('own_a'),
        person('own_b'),
      ]);
      const { disputeId } = await disputed(a, b);
      await admin.assign(m1, disputeId);
      await expect(
        admin.decide(m2, disputeId, { outcome: 'draw', justification: 'Should be refused here.' }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ---------------------------------------------------------------- sanctions
  describe('sanction ladder + enforcement (F12.3)', () => {
    it('climbs warning → 7 days → 30 days → permanent ban', async () => {
      const [m, p] = await Promise.all([person('lad_m', 'moderator'), person('lad_p')]);
      const steps: Array<[number, string]> = [];
      for (let i = 0; i < 4; i++) {
        const s = await sanctions.apply(m, {
          userId: p.sub,
          reason: 'Ladder test step',
          source: 'manual',
        });
        steps.push([s.step, s.type]);
      }
      expect(steps).toEqual([
        [1, 'warning'],
        [2, 'suspension'],
        [3, 'suspension'],
        [4, 'permanent_ban'],
      ]);
    });

    it('a suspended player keeps their account but cannot create or accept challenges', async () => {
      const [m, p] = await Promise.all([person('sus_m', 'moderator'), person('sus_p')]);
      await sanctions.apply(m, { userId: p.sub, reason: 'Warning first', source: 'manual' });
      await sanctions.apply(m, { userId: p.sub, reason: 'Then suspension', source: 'manual' });
      await expect(checkSessionActive(p.sub, p.sid)).resolves.toBe('player'); // still signed in
      const standing = await getStanding(p.sub);
      expect(standing).toMatchObject({
        playBlocked: true,
        canPlay: false,
        sanction: { type: 'suspension', step: 2 },
      });
      const start = new Date(Date.now() + 3600_000);
      await expect(
        challenges.createChallenge(p.sub, {
          gameKey,
          formatKey,
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + 3600_000).toISOString(),
          rules: '',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('a permanent ban revokes every session at once', async () => {
      const [a, p] = await Promise.all([person('ban_a', 'admin'), person('ban_p')]);
      await sanctions.apply(a, { userId: p.sub, reason: 'Fraud ring', source: 'manual', step: 4 });
      const live = await db
        .select()
        .from(schema.sessions)
        .where(and(eq(schema.sessions.userId, p.sub), isNull(schema.sessions.revokedAt)));
      expect(live).toHaveLength(0);
      await expect(checkSessionActive(p.sub, p.sid)).rejects.toBeTruthy();
    });

    it('moderators cannot skip ladder steps; admins can', async () => {
      const [m, p] = await Promise.all([person('skip_m', 'moderator'), person('skip_p')]);
      await expect(
        sanctions.apply(m, { userId: p.sub, reason: 'Skipping', source: 'manual', step: 4 }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('revoking a suspension restores play', async () => {
      const [m, p] = await Promise.all([person('rev_m', 'moderator'), person('rev_p')]);
      await sanctions.apply(m, { userId: p.sub, reason: 'One', source: 'manual' });
      const s = await sanctions.apply(m, { userId: p.sub, reason: 'Two', source: 'manual' });
      expect((await getStanding(p.sub)).canPlay).toBe(false);
      await sanctions.revoke(m, s.id, 'Appeal accepted');
      expect((await getStanding(p.sub)).canPlay).toBe(true);
    });
  });

  // ---------------------------------------------------------------- fraud
  describe('reputation debts → auto-limit (F12.3, F12.4)', () => {
    it('debts from the outbox limit the account at 3; a moderator clear lifts it', async () => {
      const [m, p] = await Promise.all([person('dbt_m', 'moderator'), person('dbt_p')]);
      for (let i = 0; i < 3; i++) {
        await db.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'reputation.debt',
          subjectId: p.sub,
          payload: { userId: p.sub, reason: 'late_cancel', matchId: null },
        });
      }
      for (
        let i = 0;
        i < 40 &&
        (
          await db
            .select()
            .from(schema.reputationDebts)
            .where(eq(schema.reputationDebts.userId, p.sub))
        ).length < 3;
        i++
      ) {
        await relay.drain();
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(
        await db
          .select()
          .from(schema.reputationDebts)
          .where(eq(schema.reputationDebts.userId, p.sub)),
      ).toHaveLength(3);
      const limited = await getStanding(p.sub);
      expect(limited.autoLimit).toMatchObject({ limited: true, reasons: ['reputationDebts'] });
      expect(limited.canPlay).toBe(false);

      await admin.clearFraud(m, [p.sub], 'Reviewed: connection problems, not abuse');
      expect((await getStanding(p.sub)).canPlay).toBe(true);
    });
  });

  // ---------------------------------------------------------------- reports
  describe('reports queue (F12.4)', () => {
    it('actioning a report records it, applies the ladder and audits', async () => {
      const [m, reporter, subject] = await Promise.all([
        person('rp_m', 'moderator'),
        person('rp_r'),
        person('rp_s'),
      ]);
      const reportId = uuidv7();
      await db.insert(schema.reports).values({
        id: reportId,
        reporterId: reporter.sub,
        subjectType: 'user',
        subjectId: subject.sub,
        reason: 'harassment',
      });
      const queue = await admin.reportsQueue({ status: 'open', limit: 500 });
      expect(queue.items.some((i) => i.id === reportId && i.subject_user_id === subject.sub)).toBe(
        true,
      );

      await admin.resolveReports(m, [{ kind: 'report', id: reportId }], {
        resolution: 'actioned',
        note: 'Abusive messages',
        sanctionUserId: subject.sub,
      });
      const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
      expect(r).toMatchObject({ status: 'actioned', resolvedById: m.sub });
      expect((await sanctions.history(subject.sub))[0]).toMatchObject({
        step: 1,
        source: 'report',
      });
      expect((await getStanding(subject.sub)).autoLimit.counts.actionedReports).toBe(1);
    });
  });

  // ---------------------------------------------------------------- audit + data
  describe('audit coverage + data minimisation', () => {
    it('search masks phones; reveal is admin-only and audited', async () => {
      const [m, a, p] = await Promise.all([
        person('pii_m', 'moderator'),
        person('pii_a', 'admin'),
        person('pii_target'),
      ]);
      const [row] = await db
        .select({ phone: schema.users.phone, name: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, p.sub));
      const found = await admin.searchUsers({ q: row!.name!, limit: 10 });
      expect(found.items[0]!.phoneMasked).toBe(maskPhone(row!.phone));
      expect(JSON.stringify(found)).not.toContain(row!.phone);
      await expect(admin.revealPhone(m, p.sub, 'Need to verify identity')).rejects.toMatchObject({
        status: 403,
      });
      expect(await admin.revealPhone(a, p.sub, 'Identity check for appeal')).toEqual({
        phone: row!.phone,
      });
      const log = await admin.auditLog({ actorId: a.sub, limit: 10 });
      expect(log.items.map((x) => x.action)).toContain('user.phone_revealed');
    });

    it('demoting staff to player revokes their sessions and is audited', async () => {
      const [a, m] = await Promise.all([person('role_a', 'admin'), person('role_m', 'moderator')]);
      await admin.setRole(a, m.sub, 'player');
      const live = await db
        .select()
        .from(schema.sessions)
        .where(and(eq(schema.sessions.userId, m.sub), isNull(schema.sessions.revokedAt)));
      expect(live).toHaveLength(0);
      const log = await admin.auditLog({ objectId: m.sub, limit: 10 });
      expect(log.items[0]).toMatchObject({
        action: 'user.role_changed',
        before: { role: 'moderator' },
        after: { role: 'player' },
      });
    });

    it('dashboard counters respond with the queue and SLA numbers', async () => {
      const d = await admin.dashboard();
      expect(d.queue).toEqual(
        expect.objectContaining({
          unassigned: expect.any(Number),
          slaBreached: expect.any(Number),
        }),
      );
      expect(typeof d.openReports).toBe('number');
    });
  });
});
