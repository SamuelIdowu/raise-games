/**
 * Sprint 11 — notifications: outbox event → notification row → in-app + push/email
 * attempts, dedupe, preferences, quiet hours, critical bypass, message batching,
 * eligibility, read state, expiring sweep, inbox conversations, relay consumer.
 */
process.env.NOTIFICATIONS_JOBS_DISABLED = 'true';
process.env.OUTBOX_RELAY_DISABLED = 'true';
process.env.CHAT_JOBS_DISABLED = 'true';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { NotificationsService } from './notifications/notifications.service';
import { MockEmailChannel } from './notifications/channels';
import { OutboxRelay } from './realtime/outbox-relay';
import type { AuthedUser } from './auth/jwt-auth.guard';

describe('Sprint 11 - notifications', () => {
  let moduleRef: TestingModule;
  let svc: NotificationsService;
  let relay: OutboxRelay;
  let gameId = '';
  let formatId = '';
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  const eventIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);
  const as = (id: string): AuthedUser => ({ sub: id, sid: 'test', role: 'player' });

  async function user(name: string, extra: Partial<typeof schema.users.$inferInsert> = {}) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23492${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-4)}`,
      tosVersionAccepted: '1.0',
      ...extra,
    });
    userIds.push(id);
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}_${id.slice(-4)}` });
    return id;
  }

  async function challenge(
    posterId: string,
    opts: { targetPlayerId?: string; deadlineInMs?: number } = {},
  ) {
    const id = uuidv7();
    await db.insert(schema.challenges).values({
      id,
      gameId,
      formatId,
      posterId,
      targetPlayerId: opts.targetPlayerId ?? null,
      status: 'open',
      startsAt: new Date(Date.now() + 7200_000),
      endsAt: new Date(Date.now() + 10_800_000),
      acceptanceDeadline: new Date(Date.now() + (opts.deadlineInMs ?? 48 * 3600_000)),
    });
    challengeIds.push(id);
    return id;
  }

  async function match(a: string, b: string) {
    const cid = await challenge(a);
    await db
      .update(schema.challenges)
      .set({ status: 'accepted', acceptedById: b })
      .where(eq(schema.challenges.id, cid));
    const matchId = uuidv7();
    await db.insert(schema.matches).values({ id: matchId, challengeId: cid, status: 'accepted' });
    matchIds.push(matchId);
    const profiles = await db
      .select()
      .from(schema.gameProfiles)
      .where(inArray(schema.gameProfiles.userId, [a, b]));
    await db.insert(schema.matchSides).values([
      {
        id: uuidv7(),
        matchId,
        userId: a,
        gameProfileId: profiles.find((p) => p.userId === a)!.id,
        side: 0,
        isPoster: true,
      },
      {
        id: uuidv7(),
        matchId,
        userId: b,
        gameProfileId: profiles.find((p) => p.userId === b)!.id,
        side: 1,
        isAcceptor: true,
      },
    ]);
    return matchId;
  }

  async function event(
    type: string,
    subjectId: string,
    payload: Record<string, unknown>,
    createdAt = new Date(),
  ) {
    const [row] = await db
      .insert(schema.outboxEvents)
      .values({ id: uuidv7(), type, subjectId, payload, createdAt })
      .returning();
    eventIds.push(row!.id);
    return row!;
  }

  async function attempts(userId: string) {
    return db
      .select({
        type: schema.notifications.type,
        channel: schema.deliveryAttempts.channel,
        status: schema.deliveryAttempts.status,
      })
      .from(schema.deliveryAttempts)
      .innerJoin(
        schema.notifications,
        eq(schema.notifications.id, schema.deliveryAttempts.notificationId),
      )
      .where(eq(schema.notifications.userId, userId));
  }

  async function rows(userId: string) {
    return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    svc = moduleRef.get(NotificationsService);
    relay = moduleRef.get(OutboxRelay);
    const [g] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = g!.id;
    const [f] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = f!.id;
  }, 60_000);

  afterAll(async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
      if (userIds.length) {
        await tx.delete(schema.notifications).where(inArray(schema.notifications.userId, userIds));
        await tx
          .delete(schema.notificationPreferences)
          .where(inArray(schema.notificationPreferences.userId, userIds));
        await tx
          .delete(schema.notificationSettings)
          .where(inArray(schema.notificationSettings.userId, userIds));
        await tx.delete(schema.sanctions).where(inArray(schema.sanctions.userId, userIds));
      }
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
        await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
      }
      if (eventIds.length)
        await tx.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.id, eventIds));
    });
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    if (userIds.length) {
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await moduleRef?.close();
  }, 60_000);

  it('direct challenge → challenge_received for the target, deduped on redelivery', async () => {
    const a = await user('ada');
    const b = await user('bayo');
    const cid = await challenge(a, { targetPlayerId: b });
    const ev = await event('challenge.created', cid, {
      challengeId: cid,
      posterId: a,
      targetPlayerId: b,
    });
    const first = await svc.fromEvent(ev);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: 'challenge_received', link: '/play', read: false });
    expect(first[0]!.title).toContain('ada_');
    expect(await svc.fromEvent(ev)).toHaveLength(0); // at-least-once relay: second delivery is a no-op
    expect(await rows(b)).toHaveLength(1);
    expect(await rows(a)).toHaveLength(0);
  });

  it('result submitted → opponent notified in-app + email (mock) once an address is set; prefs honoured', async () => {
    const a = await user('chi');
    const b = await user('dayo', { email: 'dayo@example.test' });
    const matchId = await match(a, b);
    MockEmailChannel.outbox = [];
    await svc.fromEvent(await event('result.submitted', matchId, { matchId, submitterId: a }));
    expect((await rows(b))[0]).toMatchObject({
      type: 'result_needs_confirmation',
      link: `/matches/${matchId}`,
    });
    const tried = await attempts(b);
    expect(tried).toEqual(
      expect.arrayContaining([
        { type: 'result_needs_confirmation', channel: 'in_app', status: 'sent' },
        { type: 'result_needs_confirmation', channel: 'email', status: 'sent' },
        { type: 'result_needs_confirmation', channel: 'push', status: 'skipped' },
      ]),
    );
    expect(MockEmailChannel.outbox.at(-1)!.message.url).toMatch(new RegExp(`/matches/${matchId}$`));

    // Email off for this type → only in-app (+ push) next time.
    await svc.updateSettings(as(b), {
      types: [{ type: 'result_needs_confirmation', push: false, email: false }],
    });
    const before = MockEmailChannel.outbox.length;
    const m2 = await match(a, b);
    await svc.fromEvent(await event('result.submitted', m2, { matchId: m2, submitterId: a }));
    expect(MockEmailChannel.outbox.length).toBe(before);
  });

  it('critical types ignore switched-off preferences and quiet hours', async () => {
    const a = await user('eze');
    const b = await user('funke', { email: 'funke@example.test' });
    const matchId = await match(a, b);
    await svc.updateSettings(as(b), {
      types: [{ type: 'dispute_opened', push: false, email: false }],
      quietHours: { startMinute: 0, endMinute: 1439, timeZone: 'Africa/Lagos' },
    });
    MockEmailChannel.outbox = [];
    await svc.fromEvent(await event('dispute.opened', uuidv7(), { matchId, openedBy: a }));
    expect((await rows(b)).map((r) => r.type)).toEqual(['dispute_opened']);
    expect(await rows(a)).toHaveLength(0); // the opener is not told about their own dispute
    expect(MockEmailChannel.outbox).toHaveLength(1);
    const settings = await svc.getSettings(as(b));
    expect(settings.types.find((t) => t.type === 'dispute_opened')).toMatchObject({
      critical: true,
      email: true,
    });
  });

  it('quiet hours defer non-critical push/email', async () => {
    const a = await user('gbenga');
    const b = await user('halima', { email: 'halima@example.test' });
    const matchId = await match(a, b);
    await svc.updateSettings(as(b), {
      quietHours: { startMinute: 0, endMinute: 1439, timeZone: 'Africa/Lagos' },
    });
    MockEmailChannel.outbox = [];
    await svc.fromEvent(
      await event('challenge.accepted', uuidv7(), {
        challengeId: (
          await db.select().from(schema.matches).where(eq(schema.matches.id, matchId))
        )[0]!.challengeId,
        acceptorId: b,
        matchId,
      }),
    );
    // The poster (a) has no quiet hours; b's quiet hours apply to b's notifications:
    const m2 = await match(a, b);
    await svc.fromEvent(await event('result.submitted', m2, { matchId: m2, submitterId: a }));
    const tried = await attempts(b);
    expect(tried.filter((t) => t.channel === 'email').map((t) => t.status)).toEqual(['deferred']);
    expect(MockEmailChannel.outbox.filter((e) => e.to === 'halima@example.test')).toHaveLength(0);
  });

  it('batches new messages per conversation until read', async () => {
    const a = await user('ife');
    const b = await user('jide');
    const matchId = await match(a, b);
    const conv = uuidv7();
    for (let i = 0; i < 3; i++) {
      await svc.fromEvent(
        await event('message.created', uuidv7(), {
          matchId,
          conversationId: conv,
          senderId: a,
          recipientIds: [b],
        }),
      );
    }
    const one = await rows(b);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ groupCount: 3 });
    expect(one[0]!.title).toMatch(/^3 new messages from/);
    expect(one[0]!.body).not.toMatch(/hello/i);
    await svc.markRead(as(b), 'all');
    await svc.fromEvent(
      await event('message.created', uuidv7(), {
        matchId,
        conversationId: conv,
        senderId: a,
        recipientIds: [b],
      }),
    );
    expect(await rows(b)).toHaveLength(2);
  });

  it('skips suspended or not-yet-consented players, but tells a suspended player about the sanction', async () => {
    const a = await user('kola');
    const suspended = await user('lara');
    const noConsent = await user('musa', { tosVersionAccepted: null });
    await db.insert(schema.sanctions).values({
      id: uuidv7(),
      userId: suspended,
      type: 'suspension',
      reason: 'test',
      startsAt: new Date(Date.now() - 1000),
    });
    const c1 = await challenge(a, { targetPlayerId: suspended });
    const c2 = await challenge(a, { targetPlayerId: noConsent });
    await svc.fromEvent(
      await event('challenge.created', c1, { challengeId: c1, targetPlayerId: suspended }),
    );
    await svc.fromEvent(
      await event('challenge.created', c2, { challengeId: c2, targetPlayerId: noConsent }),
    );
    expect(await rows(suspended)).toHaveLength(0);
    expect(await rows(noConsent)).toHaveLength(0);
    await svc.fromEvent(
      await event('sanction.applied', suspended, {
        userId: suspended,
        summary: 'Suspended for 7 days.',
      }),
    );
    expect((await rows(suspended))[0]).toMatchObject({
      type: 'sanction_applied',
      body: 'Suspended for 7 days.',
    });
  });

  it('ignores stale events replayed from the relay lookback', async () => {
    const a = await user('nkem');
    const b = await user('ola');
    const cid = await challenge(a, { targetPlayerId: b });
    const old = await event(
      'challenge.created',
      cid,
      { challengeId: cid, targetPlayerId: b },
      new Date(Date.now() - 3 * 3600_000),
    );
    expect(await svc.fromEvent(old)).toHaveLength(0);
  });

  it('read state: unread counts, mark one or all, never another user’s', async () => {
    const a = await user('pela');
    const b = await user('qudus');
    const matchId = await match(a, b);
    await svc.fromEvent(await event('result.submitted', matchId, { matchId, submitterId: a }));
    await svc.fromEvent(await event('match.confirmed', matchId, { matchId, via: 'auto_timeout' }));
    expect(await svc.unreadCount(b)).toBe(2);
    const page = await svc.list(as(b));
    expect(page.items.map((i) => i.type)).toEqual([
      'result_auto_confirmed',
      'result_needs_confirmation',
    ]);
    expect(await svc.markRead(as(a), [page.items[0]!.id])).toEqual({ unread: 1 }); // a's own count; b's untouched
    expect(await svc.unreadCount(b)).toBe(2);
    expect(await svc.markRead(as(b), [page.items[0]!.id])).toEqual({ unread: 1 });
  });

  it('challenge expiring: once per challenge within the last hour', async () => {
    const a = await user('remi');
    await challenge(a, { deadlineInMs: 30 * 60_000 });
    await challenge(a, { deadlineInMs: 5 * 3600_000 });
    await svc.notifyExpiring();
    await svc.notifyExpiring();
    expect((await rows(a)).map((r) => r.type)).toEqual(['challenge_expiring']);
  });

  it('inbox conversations list match chats with the last message and unread flag', async () => {
    const a = await user('sade');
    const b = await user('tobi');
    const matchId = await match(a, b);
    const conversationId = uuidv7();
    await db.insert(schema.conversations).values({ id: conversationId, scope: 'match', matchId });
    await db.insert(schema.conversationParticipants).values([
      { conversationId, userId: a },
      { conversationId, userId: b },
    ]);
    await db
      .insert(schema.messages)
      .values({ id: uuidv7(), conversationId, senderId: a, kind: 'user', body: 'ready?' });
    const list = await svc.conversations(as(b));
    expect(list[0]).toMatchObject({ matchId, lastMessage: 'ready?', unread: true });
    await svc.markConversationRead(as(b), conversationId);
    expect((await svc.conversations(as(b)))[0]!.unread).toBe(false);
    await expect(svc.markConversationRead(as(b), uuidv7())).rejects.toMatchObject({ status: 404 });
  });

  it('runs as an outbox consumer with its own delivery state', async () => {
    svc.onModuleInit(); // registers the 'notifications' consumer (compile() skips lifecycle hooks)
    const a = await user('uche');
    const b = await user('vic');
    const cid = await challenge(a, { targetPlayerId: b });
    const ev = await event('challenge.created', cid, { challengeId: cid, targetPlayerId: b });
    for (let i = 0; i < 20; i++) if ((await relay.drain()) === 0) break;
    const [state] = await db
      .select()
      .from(schema.outboxDeliveries)
      .where(
        and(
          eq(schema.outboxDeliveries.consumer, 'notifications'),
          eq(schema.outboxDeliveries.eventId, ev.id),
        ),
      );
    expect(state?.status).toBe('done');
    expect(await rows(b)).toHaveLength(1);
  });
});
