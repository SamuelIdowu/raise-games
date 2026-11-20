/**
 * Sprint 16 — closed beta: invite-only signup (gate, atomic redemption at max uses,
 * expiry, brute-force limit, existing accounts never locked out), waitlist retention,
 * feedback triage, and the PRD metrics on seeded data. Needs Postgres and Redis.
 *
 * The gate is switched on through AuthService.gate() on this file's own module instance,
 * never through the shared flag row: other integration files sign up in parallel.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import type { AuthedUser } from './auth/jwt-auth.guard';
import { AuthService } from './auth/auth.service';
import { BetaService } from './beta/beta.service';
import { BAD_INVITE_LIMIT, INVITE_COPY } from './beta/invites';
import { ensureRedis, redis } from './cache/redis';

describe('Sprint 16 - closed beta', () => {
  let moduleRef: TestingModule;
  let auth: AuthService;
  let beta: BetaService;
  let gameId = '';
  let formatId = '';
  const userIds: string[] = [];
  const codeIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  const nonce = Date.now().toString().slice(-3);
  let counter = 0;
  const phone = () => `0816${nonce}${(counter++).toString().padStart(4, '0')}`;
  const intl = (local: string) => `+234${local.slice(1)}`;
  let admin: AuthedUser;

  const reason = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { getResponse?: () => unknown; getStatus?: () => number }) => {
        const r = e.getResponse?.() as { code?: string } | undefined;
        return r?.code ?? String(e.getStatus?.() ?? 'error');
      },
    );

  async function clearOtp(local: string, ip: string) {
    const p = intl(local);
    await redis.del(
      `otp:pending:${p}`,
      `otp:resend:${p}`,
      `otp:attempts:${p}`,
      `otp:rate:phone:${p}`,
      `otp:rate:ip:${ip}`,
      `beta:invite:bad:${ip}`,
    );
  }

  /** Full mock-OTP signup; returns the created user id or the refusal reason. */
  async function signUp(local: string, code: string | null, ip = '10.16.0.1') {
    await clearOtp(local, ip);
    const req = await reason(auth.requestOtp(local, ip, 'test', code));
    if (req !== 'ok') return { reason: req };
    const tokens = await auth
      .verifyOtp(local, '000000', { ip, userAgent: 'test' }, code)
      .catch((e: { getResponse?: () => { code?: string } }) => ({ err: e.getResponse?.()?.code }));
    if (!tokens || 'err' in tokens) return { reason: tokens ? tokens.err : 'otp' };
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.phone, intl(local)));
    if (u) userIds.push(u.id);
    return { userId: u?.id };
  }

  async function makeCode(cohort: string, opts: { maxUses?: number; expiresAt?: string } = {}) {
    const { created } = await beta.createCodes(admin, {
      cohort,
      maxUses: opts.maxUses ?? 50,
      expiresAt: opts.expiresAt ?? null,
      count: 1,
    });
    codeIds.push(created[0]!.id);
    return created[0]!;
  }

  beforeAll(async () => {
    await ensureRedis();
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    auth = moduleRef.get(AuthService);
    beta = moduleRef.get(BetaService);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = format!.id;
    const adminId = uuidv7();
    await db.insert(schema.users).values({
      id: adminId,
      phone: intl(phone()),
      displayName: `beta_admin_${adminId.slice(-6)}`,
      role: 'admin',
    });
    userIds.push(adminId);
    admin = { sub: adminId, sid: uuidv7(), role: 'admin' } as AuthedUser;
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
    });
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    if (userIds.length) {
      await db.delete(schema.feedback).where(inArray(schema.feedback.userId, userIds));
      await db
        .delete(schema.inviteRedemptions)
        .where(inArray(schema.inviteRedemptions.userId, userIds));
      await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, userIds));
      await db.delete(schema.sessions).where(inArray(schema.sessions.userId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
    }
    if (codeIds.length) {
      await db
        .delete(schema.betaWaitlist)
        .where(inArray(schema.betaWaitlist.inviteCodeId, codeIds));
      await db.delete(schema.inviteCodes).where(inArray(schema.inviteCodes.id, codeIds));
    }
    if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await moduleRef?.close();
  }, 60_000);

  // ---------------------------------------------------------------- F16.1
  describe('invite-only signup', () => {
    beforeAll(() => {
      auth.gate = async () => true;
    });
    afterAll(() => {
      auth.gate = AuthService.prototype.gate;
    });

    it('a new number needs a usable code; the account joins the code’s cohort', async () => {
      const code = await makeCode(`cohort_a_${nonce}`);
      expect(await signUp(phone(), null)).toEqual({ reason: 'invite_required' });
      expect(await signUp(phone(), 'ZZZZZZZZ')).toEqual({ reason: 'invite_invalid' });

      const ok = await signUp(phone(), code.code.toLowerCase().replace(/(.{4})/, '$1-'));
      expect(ok.userId).toBeTruthy();
      const [r] = await db
        .select()
        .from(schema.inviteRedemptions)
        .where(eq(schema.inviteRedemptions.userId, ok.userId!));
      expect(r).toMatchObject({ codeId: code.id, cohort: `cohort_a_${nonce}` });
      const [c] = await db
        .select({ uses: schema.inviteCodes.uses })
        .from(schema.inviteCodes)
        .where(eq(schema.inviteCodes.id, code.id));
      expect(c?.uses).toBe(1);
    });

    it('existing accounts always sign in without a code', async () => {
      const code = await makeCode(`cohort_b_${nonce}`);
      const local = phone();
      const first = await signUp(local, code.code);
      expect(first.userId).toBeTruthy();
      const again = await signUp(local, null);
      expect(again.userId).toBe(first.userId);
    });

    it('concurrent signups never push a code past max uses', async () => {
      const code = await makeCode(`cohort_c_${nonce}`, { maxUses: 2 });
      const phones = Array.from({ length: 5 }, () => phone());
      // All five pass the read-only check at request time…
      for (const [i, local] of phones.entries()) {
        await clearOtp(local, `10.16.1.${i}`);
        await auth.requestOtp(local, `10.16.1.${i}`, 'test', code.code);
      }
      // …but only two can redeem when the accounts are created.
      const results = await Promise.all(
        phones.map((local, i) =>
          auth
            .verifyOtp(local, '000000', { ip: `10.16.1.${i}` }, code.code)
            .then((t) => (t ? 'created' : 'otp'))
            .catch((e: { getResponse?: () => { code?: string } }) => e.getResponse?.()?.code),
        ),
      );
      expect(results.filter((r) => r === 'created')).toHaveLength(2);
      expect(results.filter((r) => r === 'invite_invalid')).toHaveLength(3);
      const created = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(inArray(schema.users.phone, phones.map(intl)));
      userIds.push(...created.map((u) => u.id));
      expect(created).toHaveLength(2); // refused signups rolled back: no orphan accounts
      const [c] = await db
        .select({ uses: schema.inviteCodes.uses })
        .from(schema.inviteCodes)
        .where(eq(schema.inviteCodes.id, code.id));
      expect(c?.uses).toBe(2);
    });

    it('expired and paused codes are refused with the same neutral copy', async () => {
      const expired = await makeCode(`cohort_d_${nonce}`, {
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(await signUp(phone(), expired.code)).toEqual({ reason: 'invite_invalid' });
      const paused = await makeCode(`cohort_d_${nonce}`);
      await beta.updateCode(admin, paused.id, { active: false });
      expect(await signUp(phone(), paused.code)).toEqual({ reason: 'invite_invalid' });
      await expect(auth.requestOtp(phone(), '10.16.9.9', 'test', paused.code)).rejects.toThrow(
        INVITE_COPY.invalid,
      );
    });

    it('guessing codes is rate-limited per IP', async () => {
      const ip = '10.16.2.1';
      await redis.del(`beta:invite:bad:${ip}`);
      const outcomes: string[] = [];
      for (let i = 0; i <= BAD_INVITE_LIMIT.max; i++) {
        const local = phone();
        await clearOtp(local, ip);
        await redis.del(`otp:rate:ip:${ip}`);
        outcomes.push(await reason(auth.requestOtp(local, ip, 'test', 'ABCDEFGH')));
      }
      expect(outcomes.slice(0, BAD_INVITE_LIMIT.max).every((o) => o === 'invite_invalid')).toBe(
        true,
      );
      expect(outcomes.at(-1)).toBe('429');
    });

    it('only admins create or change codes, and every change is audited', async () => {
      const mod = { sub: admin.sub, sid: admin.sid, role: 'moderator' } as AuthedUser;
      await expect(
        beta.createCodes(mod, { cohort: 'x', maxUses: 5, count: 1 }),
      ).rejects.toMatchObject({ status: 403 });
      const code = await makeCode(`cohort_e_${nonce}`);
      await beta.updateCode(admin, code.id, { maxUses: 80 });
      const actions = await db
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.actorId, admin.sub));
      expect(actions.map((a) => a.action)).toEqual(
        expect.arrayContaining(['beta.codes_created', 'beta.code_updated']),
      );
    });
  });

  it('gate off: signup needs no code (the default)', async () => {
    const res = await signUp(phone(), null);
    expect(res.userId).toBeTruthy();
  });

  // ---------------------------------------------------------------- waitlist
  it('waitlist: idempotent per phone, masked for staff, purged after 90 days, invite marks it', async () => {
    const local = phone();
    await beta.joinWaitlist(local, 'UNILAG');
    await beta.joinWaitlist(local, 'UNILAG');
    const rows = await db
      .select()
      .from(schema.betaWaitlist)
      .where(eq(schema.betaWaitlist.phone, intl(local)));
    expect(rows).toHaveLength(1);

    const list = await beta.waitlist();
    const mine = list.find((w) => w.id === rows[0]!.id)!;
    expect(mine.phone).toMatch(/\*\*\*/);
    expect(mine.phone).not.toContain(intl(local).slice(4, 8));

    const code = await makeCode(`cohort_w_${nonce}`);
    const invited = await beta.inviteFromWaitlist(admin, rows[0]!.id, code.id);
    expect(invited.message).toContain(code.code);
    await expect(beta.inviteFromWaitlist(admin, rows[0]!.id, code.id)).rejects.toMatchObject({
      status: 409,
    });

    const old = phone();
    await beta.joinWaitlist(old, null);
    await db
      .update(schema.betaWaitlist)
      .set({ createdAt: new Date(Date.now() - 91 * 86_400_000) })
      .where(eq(schema.betaWaitlist.phone, intl(old)));
    await beta.waitlist(); // purges on read
    expect(
      await db
        .select()
        .from(schema.betaWaitlist)
        .where(eq(schema.betaWaitlist.phone, intl(old))),
    ).toHaveLength(0);
  });

  // ---------------------------------------------------------------- F16.3
  it('feedback: submitted by a player, triaged with a severity, open S1 counted, audited', async () => {
    const player = await signUp(phone(), null);
    const me = { sub: player.userId!, sid: uuidv7(), role: 'player' } as AuthedUser;
    const { id } = await beta.submitFeedback(
      me,
      { kind: 'bug', body: 'My win was recorded as a loss', page: '/matches/x' },
      'test-agent',
    );
    const before = (await beta.feedbackQueue({ status: 'open', limit: 500 })).openBySeverity.S1;

    await expect(beta.triage(admin, id, { status: 'fixed' })).rejects.toMatchObject({
      status: 400,
    }); // a severity is required to leave "new"
    const triaged = await beta.triage(admin, id, { severity: 'S1', note: 'ratings bug' });
    expect(triaged).toMatchObject({ severity: 'S1', status: 'triaged' });
    expect((await beta.feedbackQueue({ status: 'open', limit: 500 })).openBySeverity.S1).toBe(
      before + 1,
    );

    await beta.triage(admin, id, { status: 'fixed' });
    expect((await beta.feedbackQueue({ status: 'open', limit: 500 })).openBySeverity.S1).toBe(
      before,
    );
    const audit = await db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorId, admin.sub), eq(schema.auditLog.objectId, id)));
    expect(audit).toHaveLength(2);
  });

  // ---------------------------------------------------------------- F16.2
  it('metrics: the PRD definitions on a seeded cohort', async () => {
    const cohort = `cohort_m_${nonce}`;
    const code = await makeCode(cohort);
    const now = new Date();
    const day = 86_400_000;
    const since = new Date(now.getTime() - 50 * day);

    // Four players in the cohort, created 45 days ago: three with a game ID, two who play.
    const players: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = uuidv7();
      await db.insert(schema.users).values({
        id,
        phone: intl(phone()),
        displayName: `m_${i}_${id.slice(-6)}`,
        role: 'player',
        createdAt: new Date(now.getTime() - 45 * day),
      });
      userIds.push(id);
      players.push(id);
      await db.insert(schema.inviteRedemptions).values({ userId: id, codeId: code.id, cohort });
      if (i < 3)
        await db
          .insert(schema.gameProfiles)
          .values({ id: uuidv7(), userId: id, gameId, inGameId: `m_${i}_${id.slice(-6)}` });
    }
    const [a, b] = players as [string, string];
    const profiles = await db
      .select()
      .from(schema.gameProfiles)
      .where(inArray(schema.gameProfiles.userId, [a, b]));
    const pid = (u: string) => profiles.find((p) => p.userId === u)!.id;

    async function match(status: 'confirmed' | 'resolved', doneDaysAgo: number, disputed = false) {
      const challengeId = uuidv7();
      const done = new Date(now.getTime() - doneDaysAgo * day);
      await db.insert(schema.challenges).values({
        id: challengeId,
        gameId,
        formatId,
        posterId: a,
        status: 'accepted',
        startsAt: new Date(done.getTime() - 3600_000),
        endsAt: done,
        acceptanceDeadline: new Date(done.getTime() - 7200_000),
        acceptedById: b,
        acceptedAt: new Date(done.getTime() - 7000_000),
        createdAt: new Date(done.getTime() - 8000_000),
      });
      challengeIds.push(challengeId);
      const matchId = uuidv7();
      await db.insert(schema.matches).values({
        id: matchId,
        challengeId,
        status,
        confirmedAt: status === 'confirmed' ? done : null,
        resolvedAt: status === 'resolved' ? done : null,
        updatedAt: done,
      });
      matchIds.push(matchId);
      await db.insert(schema.matchSides).values([
        { id: uuidv7(), matchId, userId: a, gameProfileId: pid(a), side: 0, isPoster: true },
        { id: uuidv7(), matchId, userId: b, gameProfileId: pid(b), side: 1, isAcceptor: true },
      ]);
      if (disputed)
        await db.insert(schema.disputes).values({
          id: uuidv7(),
          matchId,
          raisedById: b,
          source: 'player',
          reason: 'wrong_winner',
          status: 'ruled',
          createdAt: new Date(done.getTime() - 4 * 3600_000),
          ruledAt: done,
        });
    }
    await match('confirmed', 40); // first completed match for both: 40 days ago
    await match('confirmed', 15); // day 25 after the first: week 4 activity
    await match('resolved', 10, true); // disputed, ruled 4h after opening

    const m = await beta.metrics({ cohort, since: since.toISOString(), now });
    const v = Object.fromEntries(m.metrics.map((x) => [x.key, x.value]));
    expect(m.funnel).toEqual({ signedUp: 4, gameId: 3, firstChallenge: 2, firstCompletedMatch: 2 });
    expect(v.registered).toBe(3);
    expect(v.challengeShare).toBeCloseTo(2 / 3);
    expect(v.completedMatches).toBe(3);
    expect(v.autoConfirmShare).toBeCloseTo(2 / 3); // the resolved one needed a moderator
    expect(v.disputeRate).toBeCloseTo(1 / 3);
    expect(v.medianResolutionHours).toBeCloseTo(4);
    expect(v.week4Retention).toBe(1); // both played again in days 22–28
    expect(m.retention).toEqual({ eligible: 2, retained: 2 });
    const status = Object.fromEntries(m.metrics.map((x) => [x.key, x.status]));
    expect(status.disputeRate).toBe('behind');
    expect(status.medianResolutionHours).toBe('on_track');
    expect(m.series.at(-1)?.day).toBe(now.toISOString().slice(0, 10));

    // Another cohort sees none of it.
    const other = await beta.metrics({ cohort: `none_${nonce}`, since: since.toISOString(), now });
    expect(other.funnel.signedUp).toBe(0);
    expect(other.metrics.find((x) => x.key === 'week4Retention')?.status).toBe('no_data');
  });

  it('existing users are untouched: no orphan redemptions or codes', async () => {
    const orphans = await db
      .select()
      .from(schema.inviteRedemptions)
      .where(
        or(
          inArray(schema.inviteRedemptions.codeId, codeIds.length ? codeIds : [uuidv7()]),
          inArray(schema.inviteRedemptions.userId, userIds),
        ),
      );
    for (const r of orphans) expect(userIds).toContain(r.userId);
  });
});
