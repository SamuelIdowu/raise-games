/**
 * Sprint 14 — restricted DMs: flag gate (404 when off), eligibility (completed match or
 * accepted friend only), friend request lifecycle, per-pair limits, keyword flags into the
 * moderator queue, block/mute/report enforcement and audit, history kept after a block.
 * Needs Postgres and Redis.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import type { AuthedUser } from './auth/jwt-auth.guard';
import { ChatService } from './chat/chat.service';
import { AdminService } from './moderation/admin.service';
import { NotificationsService } from './notifications/notifications.service';
import { DmEnabledGuard, dmEnabled } from './dm/dm.flag';
import { DmService } from './dm/dm.service';
import { DM_COPY, DM_FLAG_KEY, DM_MAX_UNANSWERED } from './dm/dm.rules';
import { ensureRedis, redis } from './cache/redis';
import { retryOnDeadlock } from './test-fixtures/retry';

describe('Sprint 14 - restricted DMs', () => {
  let moduleRef: TestingModule;
  let dm: DmService;
  let chat: ChatService;
  let admin: AdminService;
  let notifications: NotificationsService;
  let gameId = '';
  let formatId = '';
  let flagWasEnabled: boolean | null = null;
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);

  async function person(name: string): Promise<AuthedUser> {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23482${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-6)}`,
      role: 'player',
      tosVersionAccepted: '1.0',
    });
    userIds.push(id);
    // Notifications only go to players who accepted the terms.
    await db
      .insert(schema.consentRecords)
      .values({ id: uuidv7(), userId: id, termsType: 'terms', termsVersion: '1.0' });
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}_${id.slice(-6)}` });
    return { sub: id, sid: uuidv7(), role: 'player' } as AuthedUser;
  }

  /** A match between a and b in the given state (confirmed = "completed together"). */
  async function matchBetween(a: AuthedUser, b: AuthedUser, status: 'confirmed' | 'forfeited') {
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
    await db.insert(schema.matches).values({ id: matchId, challengeId, status });
    matchIds.push(matchId);
    const profiles = await db
      .select()
      .from(schema.gameProfiles)
      .where(inArray(schema.gameProfiles.userId, [a.sub, b.sub]));
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
    return matchId;
  }

  async function setFlag(enabled: boolean) {
    const f = schema.featureFlags;
    const [row] = await db
      .select({ id: f.id, enabled: f.enabled })
      .from(f)
      .where(and(eq(f.key, DM_FLAG_KEY), eq(f.stage, '1'), isNull(f.jurisdiction)));
    if (row) await db.update(f).set({ enabled }).where(eq(f.id, row.id));
    else
      await db
        .insert(f)
        .values({ id: uuidv7(), key: DM_FLAG_KEY, stage: '1', jurisdiction: null, enabled });
  }

  const status = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { getStatus?: () => number }) => e.getStatus?.() ?? 500,
    );

  /**
   * Runs the notification consumer on an outbox event and returns the player's rows of that
   * type. Reads the table rather than the return value: the background relay may have
   * handled the event first, and a second delivery is deduplicated.
   */
  async function notifiedAfter(eventType: string, subjectId: string, userId: string, type: string) {
    const [event] = await db
      .select()
      .from(schema.outboxEvents)
      .where(
        and(eq(schema.outboxEvents.type, eventType), eq(schema.outboxEvents.subjectId, subjectId)),
      );
    await notifications.fromEvent(event!);
    return db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.type, type)));
  }

  const say = (u: AuthedUser, conversationId: string, body: string) =>
    dm.send(u, conversationId, { body, clientMsgId: uuidv7() });

  beforeAll(async () => {
    await ensureRedis();
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    dm = moduleRef.get(DmService);
    chat = moduleRef.get(ChatService);
    admin = moduleRef.get(AdminService);
    notifications = moduleRef.get(NotificationsService);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = format!.id;
    flagWasEnabled = await dmEnabled();
    await setFlag(true);
  }, 60_000);

  afterAll(async () => {
    // Retried as a whole on a deadlock with the outbox relay (see test-fixtures/retry).
    await retryOnDeadlock(async () => {
      await setFlag(flagWasEnabled ?? false);
      const convs = userIds.length
        ? await db
            .selectDistinct({ id: schema.conversationParticipants.conversationId })
            .from(schema.conversationParticipants)
            .where(inArray(schema.conversationParticipants.userId, userIds))
        : [];
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
        if (convs.length) {
          const ids = convs.map((c) => c.id);
          const msgIds = (
            await tx
              .select({ id: schema.messages.id })
              .from(schema.messages)
              .where(inArray(schema.messages.conversationId, ids))
          ).map((m) => m.id);
          if (msgIds.length)
            await tx
              .delete(schema.outboxEvents)
              .where(inArray(schema.outboxEvents.subjectId, msgIds));
          // Cascades: participants, messages, message_reports (+contexts), chat_flags.
          await tx.delete(schema.conversations).where(inArray(schema.conversations.id, ids));
        }
        if (matchIds.length) {
          await tx
            .delete(schema.outboxEvents)
            .where(inArray(schema.outboxEvents.subjectId, matchIds));
          await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
        }
        if (userIds.length) {
          const reqIds = (
            await tx
              .select({ id: schema.friendRequests.id })
              .from(schema.friendRequests)
              .where(
                or(
                  inArray(schema.friendRequests.requesterId, userIds),
                  inArray(schema.friendRequests.addresseeId, userIds),
                ),
              )
          ).map((r) => r.id);
          if (reqIds.length)
            await tx
              .delete(schema.outboxEvents)
              .where(inArray(schema.outboxEvents.subjectId, reqIds));
          await tx
            .delete(schema.outboxEvents)
            .where(inArray(schema.outboxEvents.subjectId, userIds));
          await tx
            .delete(schema.userBlocks)
            .where(
              or(
                inArray(schema.userBlocks.blockerId, userIds),
                inArray(schema.userBlocks.blockedId, userIds),
              ),
            );
          await tx.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, userIds));
          await tx.delete(schema.sanctions).where(inArray(schema.sanctions.userId, userIds));
        }
      });
      if (challengeIds.length)
        await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
      if (userIds.length) {
        await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
        await db
          .delete(schema.consentRecords)
          .where(inArray(schema.consentRecords.userId, userIds));
        // friend_requests and notifications cascade with the user.
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
    });
    await moduleRef?.close();
  }, 60_000);

  // ---------------------------------------------------------------- F14.1
  it('flag off: every DM route is a 404; on: open', async () => {
    const guard = new DmEnabledGuard();
    await setFlag(false);
    await expect(guard.canActivate()).rejects.toMatchObject({ status: 404 });
    await setFlag(true);
    await expect(guard.canActivate()).resolves.toBe(true);
  });

  // ---------------------------------------------------------------- F14.2
  it('strangers and forfeit-only pairs cannot DM; a completed match opens one conversation', async () => {
    const a = await person('dm_a');
    const b = await person('dm_b');
    expect(await status(dm.open(a, b.sub))).toBe(403);
    await expect(dm.open(a, b.sub)).rejects.toThrow(DM_COPY.cannotMessage);

    await matchBetween(a, b, 'forfeited');
    expect(await status(dm.open(a, b.sub))).toBe(403);

    await matchBetween(a, b, 'confirmed');
    const first = await dm.open(a, b.sub);
    const second = await dm.open(b, a.sub);
    expect(second.conversationId).toBe(first.conversationId);
    expect((await dm.relationship(b, a.sub)).canMessage).toBe(true);

    // A stranger cannot read or probe it: 404, not 403.
    const c = await person('dm_c');
    expect(await status(dm.messages(c, first.conversationId, {}))).toBe(404);
    expect(await status(dm.get(c, first.conversationId))).toBe(404);
  });

  it('friend requests: request → accept → DM; decline starts a cooldown for the requester only', async () => {
    const a = await person('fr_a');
    const b = await person('fr_b');
    const req = await dm.requestFriend(a, b.sub);
    expect(req.status).toBe('pending');
    // Duplicate ask returns the same pending request.
    expect((await dm.requestFriend(a, b.sub)).requestId).toBe(req.requestId);
    expect((await dm.requests(b)).incoming.map((r) => r.userId)).toContain(a.sub);
    expect((await dm.relationship(a, b.sub)).friend).toBe('outgoing');
    expect(await status(dm.respond(a, req.requestId!, 'accept'))).toBe(409); // only b accepts

    await dm.respond(b, req.requestId!, 'accept');
    expect((await dm.relationship(a, b.sub)).friend).toBe('friends');
    const { conversationId } = await dm.open(a, b.sub);
    expect(conversationId).toBeTruthy();

    // The request notified b; the acceptance notifies a.
    expect(
      await notifiedAfter('friend.requested', req.requestId!, b.sub, 'friend_request'),
    ).toHaveLength(1);
    expect(
      await notifiedAfter('friend.accepted', req.requestId!, a.sub, 'friend_accepted'),
    ).toHaveLength(1);

    // Unfriend: no more DMs (no completed match between them).
    await dm.removeFriend(b, a.sub);
    expect((await dm.relationship(a, b.sub)).canMessage).toBe(false);
    expect(await status(say(a, conversationId, 'still there?'))).toBe(403);

    // Decline → cooldown for the requester, but the decliner may ask.
    const c = await person('fr_c');
    const d = await person('fr_d');
    const r2 = await dm.requestFriend(c, d.sub);
    await dm.respond(d, r2.requestId!, 'decline');
    expect(await status(dm.requestFriend(c, d.sub))).toBe(403);
    const back = await dm.requestFriend(d, c.sub);
    expect(back.status).toBe('pending');
    // Asking back when the other side already asked is a yes.
    const mutual = await dm.requestFriend(c, d.sub);
    expect(mutual.status).toBe('accepted');
  });

  // ---------------------------------------------------------------- F14.3
  it('sends with dedupe; one-sided floods and pair bursts are throttled; keyword hits reach the queue', async () => {
    const a = await person('tx_a');
    const b = await person('tx_b');
    await matchBetween(a, b, 'confirmed');
    const { conversationId } = await dm.open(a, b.sub);
    await redis.del(`rl:chat:burst:${a.sub}`, `rl:chat:burst:${b.sub}`);

    const clientMsgId = uuidv7();
    const one = await dm.send(a, conversationId, { body: 'gg, rematch?', clientMsgId });
    const again = await dm.send(a, conversationId, { body: 'gg, rematch?', clientMsgId });
    expect(again.deduped).toBe(true);
    expect(again.message.id).toBe(one.message.id);
    expect(await status(say(a, conversationId, 'x'.repeat(501)))).toBe(400);

    // Unanswered cap: DM_MAX_UNANSWERED in a row, then wait for a reply.
    for (let i = 1; i < DM_MAX_UNANSWERED; i++) await say(a, conversationId, `msg ${i}`);
    await expect(say(a, conversationId, 'hello??')).rejects.toThrow(DM_COPY.unanswered);
    await say(b, conversationId, 'calm down, I was eating');
    await redis.del(`rl:dm:burst:${conversationId}:${a.sub}`, `rl:chat:burst:${a.sub}`);
    await say(a, conversationId, 'sorry, what time?');

    // Keyword hit: stored, flagged, and listed for moderators as a DM keyword flag.
    const flagged = await say(b, conversationId, 'add me on whatsapp');
    const [row] = await db
      .select()
      .from(schema.chatFlags)
      .where(eq(schema.chatFlags.messageId, flagged.message.id));
    expect(row?.categories).toContain('off_platform_contact');
    const queue = await admin.reportsQueue({ status: 'open', limit: 500 });
    const item = queue.items.find((i) => i.kind === 'flag' && i.id === row!.id);
    expect(item).toMatchObject({ scope: 'dm', subject_user_id: b.sub });
  });

  // ---------------------------------------------------------------- F14.4
  it('block: neither side can send, friendship ends, history is kept, audited; unblock restores match-based DMs', async () => {
    const a = await person('bl_a');
    const b = await person('bl_b');
    await matchBetween(a, b, 'confirmed');
    const fr = await dm.requestFriend(a, b.sub);
    await dm.respond(b, fr.requestId!, 'accept');
    const { conversationId } = await dm.open(a, b.sub);
    await say(a, conversationId, 'good game');
    await say(b, conversationId, 'thanks');

    await chat.block(b, a.sub, '10.0.0.1');
    expect(await status(say(a, conversationId, 'hey'))).toBe(403);
    expect(await status(say(b, conversationId, 'hey'))).toBe(403);
    expect(await status(dm.requestFriend(a, b.sub))).toBe(403);
    expect(await status(dm.open(a, b.sub))).toBe(403);

    // The blocked player sees what a stranger sees: no block reveal.
    const relA = await dm.relationship(a, b.sub);
    expect(relA).toMatchObject({ canMessage: false, blockedByMe: false, friend: 'none' });
    const viewA = await dm.get(a, conversationId);
    expect(viewA).toMatchObject({ canSend: false, notice: DM_COPY.cannotSend, blockedByMe: false });
    expect((await dm.relationship(b, a.sub)).blockedByMe).toBe(true);

    // History stays (report and dispute evidence).
    const page = await dm.messages(b, conversationId, {});
    expect(page.messages.map((m) => m.body)).toEqual(['good game', 'thanks']);

    const [friendship] = await db
      .select({ status: schema.friendRequests.status })
      .from(schema.friendRequests)
      .where(eq(schema.friendRequests.id, fr.requestId!));
    expect(friendship?.status).toBe('removed');

    await chat.unblock(b, a.sub);
    const actions = await db
      .select({ action: schema.auditLog.action, ip: schema.auditLog.ip })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorId, b.sub), eq(schema.auditLog.objectId, a.sub)));
    expect(actions.map((x) => x.action)).toEqual(
      expect.arrayContaining(['user.blocked', 'user.unblocked']),
    );
    // Unblocking does not restore the friendship, but the completed match still allows DMs.
    expect((await dm.relationship(a, b.sub)).friend).toBe('none');
    await say(a, conversationId, 'sorry about earlier');
  });

  it('a suspended player cannot DM or send friend requests until the suspension ends', async () => {
    const a = await person('su_a');
    const b = await person('su_b');
    await matchBetween(a, b, 'confirmed');
    const { conversationId } = await dm.open(a, b.sub);
    const sanctionId = uuidv7();
    await db.insert(schema.sanctions).values({
      id: sanctionId,
      userId: a.sub,
      type: 'suspension',
      reason: 'harassment in chat',
      step: 2,
      endsAt: new Date(Date.now() + 7 * 86_400_000),
    });
    await expect(say(a, conversationId, 'hey')).rejects.toThrow(DM_COPY.suspended);
    await expect(dm.requestFriend(a, b.sub)).rejects.toThrow(DM_COPY.suspended);
    // Only the suspended side is paused: b can still write (and report).
    await say(b, conversationId, 'you there?');

    await db
      .update(schema.sanctions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sanctions.id, sanctionId));
    await say(a, conversationId, 'back now');
  });

  it('mute suppresses DM notifications and is audited', async () => {
    const a = await person('mu_a');
    const b = await person('mu_b');
    await matchBetween(a, b, 'confirmed');
    const { conversationId } = await dm.open(a, b.sub);

    const notifyFor = (messageId: string) =>
      notifiedAfter('message.created', messageId, b.sub, 'new_direct_message');

    const loud = await say(a, conversationId, 'ready?');
    const made = await notifyFor(loud.message.id);
    expect(made).toHaveLength(1);
    expect(made[0]!.body).not.toContain('ready?'); // never the message text
    expect(made[0]!.link).toBe(`/messages/${conversationId}`);
    expect(made[0]!.groupCount).toBe(1);

    await dm.mute(b, conversationId, true);
    const quiet = await say(a, conversationId, 'hello?');
    const after = await notifyFor(quiet.message.id);
    // Still one row, not bumped to "2 new messages": the muted player is skipped.
    expect(after).toHaveLength(1);
    expect(after[0]!.groupCount).toBe(1);
    expect((await dm.list(b)).find((c) => c.conversationId === conversationId)?.muted).toBe(true);

    const [audit] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorId, b.sub), eq(schema.auditLog.action, 'dm.muted')));
    expect(audit?.objectId).toBe(conversationId);
  });

  it('report: lands in the moderator queue with a frozen context snapshot, once per reporter', async () => {
    const a = await person('rp_a');
    const b = await person('rp_b');
    await matchBetween(a, b, 'confirmed');
    const { conversationId } = await dm.open(a, b.sub);
    await say(a, conversationId, 'gg');
    const bad = await say(b, conversationId, 'you are trash, pay me back');
    await say(a, conversationId, 'what?');

    expect(
      await status(dm.report(b, conversationId, bad.message.id, { reason: 'harassment' })),
    ).toBe(400); // own message
    const first = await dm.report(a, conversationId, bad.message.id, { reason: 'harassment' });
    expect(first.alreadyReported).toBe(false);
    const dup = await dm.report(a, conversationId, bad.message.id, { reason: 'harassment' });
    expect(dup.alreadyReported).toBe(true);

    const queue = await admin.reportsQueue({ status: 'open', limit: 500 });
    const item = queue.items.find((i) => i.kind === 'message' && i.id === first.reportId);
    expect(item).toMatchObject({ scope: 'dm', subject_user_id: b.sub, match_id: null });
    const context = item!.context as Array<{ body: string; reported: boolean }>;
    expect(context.map((m) => m.body)).toEqual(['gg', 'you are trash, pay me back', 'what?']);
    expect(context.find((m) => m.reported)?.body).toBe('you are trash, pay me back');

    // Moderator actions the report like any other (F12 queue).
    const [audit] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorId, a.sub), eq(schema.auditLog.action, 'dm.reported')));
    expect(audit?.objectId).toBe(bad.message.id);
  });
});
