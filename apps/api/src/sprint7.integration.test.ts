/**
 * Sprint 7 — match room, real-time gateway, match chat.
 *
 * Needs Postgres (migrated + seeded) and Redis, like the other integration suites.
 * The socket tests boot TWO API instances in-process on separate ports, each with its
 * own socket.io server and Redis adapter: a client on instance 1 and a client on
 * instance 2 only see each other's events if the Redis fan-out works.
 */
process.env.CHAT_JOBS_DISABLED = 'true';
process.env.OUTBOX_RELAY_DISABLED = 'true';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { redis } from './cache/redis';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { OutboxRelay } from './realtime/outbox-relay';
import { ChatService } from './chat/chat.service';
import { MatchesService } from './matches/matches.service';
import { resetChatRateLimitMemory } from './chat/chat.rate-limit';
import { CHAT_LOCK_AFTER_MS } from './chat/chat.rules';
import type { AuthedUser } from './auth/jwt-auth.guard';
import type { ChatMessageDto, MatchStateEvent } from './realtime/realtime.events';

interface Instance {
  app: NestFastifyApplication;
  adapter: RedisIoAdapter;
  url: string;
}

async function bootInstance(): Promise<Instance> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  const adapter = new RedisIoAdapter(app);
  const connected = await adapter.connectToRedis();
  if (!connected) throw new Error('Redis is required for the Sprint 7 socket tests');
  app.useWebSocketAdapter(adapter);
  await app.init();
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, adapter, url: `http://127.0.0.1:${port}` };
}

function connect(url: string, token?: string): ClientSocket {
  return ioClient(url, {
    transports: ['websocket'],
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
  });
}

function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}

describe('Sprint 7 - match room, gateway & chat', () => {
  let one: Instance;
  let two: Instance;
  let chat: ChatService;
  let matches: MatchesService;
  let relay: OutboxRelay;
  let gateway: RealtimeGateway;
  let jwt: JwtService;

  let gameId = '';
  let formatId = '';
  const userIds: string[] = [];
  const sessionIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  const profileIds: string[] = [];
  const sockets: ClientSocket[] = [];
  let phoneCounter = 0;

  interface Player {
    user: AuthedUser;
    token: string;
  }
  let alice: Player;
  let bola: Player;
  let outsider: Player;
  let mod: Player;

  async function createPlayer(
    name: string,
    role: 'player' | 'moderator' = 'player',
  ): Promise<Player> {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23490${Date.now().toString().slice(-6)}${(phoneCounter++).toString().padStart(2, '0')}`,
      displayName: name,
      role,
      tosVersionAccepted: '1.0',
      // Sprint 12: staff routes need MFA; staff fixtures are enrolled and verified.
      mfaEnabledAt: role === 'player' ? null : new Date(),
    });
    userIds.push(id);
    const profileId = uuidv7();
    await db.insert(schema.gameProfiles).values({
      id: profileId,
      userId: id,
      gameId,
      inGameId: `${name.toLowerCase()}_efb`,
      rating: 1200,
    });
    profileIds.push(profileId);
    const sid = uuidv7();
    await db.insert(schema.sessions).values({
      id: sid,
      userId: id,
      refreshTokenHash: `test-${sid}`,
      expiresAt: new Date(Date.now() + 3600_000),
      mfaVerifiedAt: role === 'player' ? null : new Date(),
    });
    sessionIds.push(sid);
    const token = await jwt.signAsync({ sub: id, sid });
    return { user: { sub: id, sid, role }, token };
  }

  async function createMatch(
    poster: Player,
    acceptor: Player,
    opts: { status?: string; roomCode?: string | null; withConversation?: boolean } = {},
  ): Promise<string> {
    const challengeId = uuidv7();
    const now = Date.now();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: poster.user.sub,
      status: 'accepted',
      rules: 'Best of one.',
      startsAt: new Date(now + 3600_000),
      endsAt: new Date(now + 4 * 3600_000),
      acceptanceDeadline: new Date(now + 48 * 3600_000),
      acceptedById: acceptor.user.sub,
      acceptedAt: new Date(now),
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db.insert(schema.matches).values({
      id: matchId,
      challengeId,
      status: (opts.status ?? 'accepted') as 'accepted',
      roomCode: opts.roomCode === undefined ? 'ROOM-42' : opts.roomCode,
    });
    matchIds.push(matchId);
    const [pp] = await db
      .select({ id: schema.gameProfiles.id })
      .from(schema.gameProfiles)
      .where(
        and(
          eq(schema.gameProfiles.userId, poster.user.sub),
          eq(schema.gameProfiles.gameId, gameId),
        ),
      );
    const [ap] = await db
      .select({ id: schema.gameProfiles.id })
      .from(schema.gameProfiles)
      .where(
        and(
          eq(schema.gameProfiles.userId, acceptor.user.sub),
          eq(schema.gameProfiles.gameId, gameId),
        ),
      );
    await db.insert(schema.matchSides).values([
      {
        id: uuidv7(),
        matchId,
        userId: poster.user.sub,
        gameProfileId: pp!.id,
        side: 0,
        isPoster: true,
      },
      {
        id: uuidv7(),
        matchId,
        userId: acceptor.user.sub,
        gameProfileId: ap!.id,
        side: 1,
        isAcceptor: true,
      },
    ]);
    if (opts.withConversation !== false) await chat.ensureMatchConversation(matchId);
    return matchId;
  }

  /** Walks a match through legal states (the DB transition guard refuses jumps). */
  async function advance(matchId: string, path: string[], last: Record<string, unknown> = {}) {
    for (const [i, status] of path.entries()) {
      await db
        .update(schema.matches)
        .set({ status: status as 'accepted', ...(i === path.length - 1 ? last : {}) })
        .where(eq(schema.matches.id, matchId));
    }
  }

  async function clearChatLimits(): Promise<void> {
    resetChatRateLimitMemory();
    const keys = userIds.flatMap((id) => [`rl:chat:burst:${id}`, `rl:chat:hour:${id}`]);
    if (keys.length) await redis.del(...keys).catch(() => undefined);
  }

  beforeAll(async () => {
    one = await bootInstance();
    two = await bootInstance();
    chat = one.app.get(ChatService);
    matches = one.app.get(MatchesService);
    relay = one.app.get(OutboxRelay);
    gateway = one.app.get(RealtimeGateway);
    jwt = one.app.get(JwtService);

    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    if (!game) throw new Error('Expected seeded game efootball');
    gameId = game.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(and(eq(schema.gameFormats.gameId, gameId), eq(schema.gameFormats.key, '1v1_duel')));
    if (!format) throw new Error('Expected seeded format 1v1_duel');
    formatId = format.id;

    alice = await createPlayer('Alice');
    bola = await createPlayer('Bola');
    outsider = await createPlayer('Outsider');
    mod = await createPlayer('Mod', 'moderator');
  }, 60_000);

  beforeEach(clearChatLimits);

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    if (matchIds.length) {
      const convs = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(inArray(schema.conversations.matchId, matchIds));
      const convIds = convs.map((c) => c.id);
      if (convIds.length) {
        await db.delete(schema.chatFlags).where(inArray(schema.chatFlags.conversationId, convIds));
        await db
          .delete(schema.messageReports)
          .where(inArray(schema.messageReports.conversationId, convIds));
        await db.delete(schema.messages).where(inArray(schema.messages.conversationId, convIds));
        await db
          .delete(schema.conversationParticipants)
          .where(inArray(schema.conversationParticipants.conversationId, convIds));
        await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
      }
      await db.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, matchIds));
      await db.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
    }
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    if (userIds.length) {
      await db.delete(schema.userBlocks).where(inArray(schema.userBlocks.blockerId, userIds));
      await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, userIds));
      await db.delete(schema.sessions).where(inArray(schema.sessions.userId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.id, profileIds));
      await db.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await one?.app.close();
    await two?.app.close();
    await one?.adapter.dispose();
    await two?.adapter.dispose();
  }, 60_000);

  // ---------------------------------------------------------------- F7.2 hub
  describe('match view (F7.2)', () => {
    it('gives participants the hub, with opponent, deadline and room code', async () => {
      const matchId = await createMatch(alice, bola);
      const view = await matches.getView(matchId, alice.user);
      expect(view.viewerRole).toBe('participant');
      expect(view.me?.userId).toBe(alice.user.sub);
      expect(view.players.map((p) => p.username)).toEqual(['Alice', 'Bola']);
      expect(view.roomCode).toBe('ROOM-42');
      expect(view.deadline?.kind).toBe('submit_result');
      expect(view.chat).toEqual({ locked: false, locksAt: null });
    });

    it('hides the match from non-participants as a 404', async () => {
      const matchId = await createMatch(alice, bola);
      await expect(matches.getView(matchId, outsider.user)).rejects.toMatchObject({ status: 404 });
    });

    it('lets moderators view as staff, without the room code', async () => {
      const matchId = await createMatch(alice, bola);
      const view = await matches.getView(matchId, mod.user);
      expect(view.viewerRole).toBe('staff');
      expect(view.me).toBeNull();
      expect(view.roomCode).toBeNull();
    });

    it('serves GET /matches/:id over HTTP with auth', async () => {
      const matchId = await createMatch(alice, bola);
      const ok = await one.app.inject({
        method: 'GET',
        url: `/matches/${matchId}`,
        headers: { authorization: `Bearer ${bola.token}` },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().id).toBe(matchId);
      const anon = await one.app.inject({ method: 'GET', url: `/matches/${matchId}` });
      expect(anon.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------- room code (F6.5 / F7.2)
  describe('room code', () => {
    it('is refused for games that join by game ID (eFootball)', async () => {
      const matchId = await createMatch(alice, bola, { roomCode: null });
      await expect(matches.setRoomCode(matchId, alice.user, 'ROOM-1')).rejects.toMatchObject({
        status: 400,
      });
      expect((await matches.getView(matchId, alice.user)).canSetRoomCode).toBe(false);
    });

    it('can be set by a participant on a room-code game, bumps the version, and stays private', async () => {
      const matchId = await createMatch(alice, bola, { roomCode: null });
      const [codm] = await db.select().from(schema.games).where(eq(schema.games.key, 'codm'));
      const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
      await db
        .update(schema.challenges)
        .set({ gameId: codm!.id })
        .where(eq(schema.challenges.id, match!.challengeId));
      const [codmFormat] = await db
        .select()
        .from(schema.gameFormats)
        .where(eq(schema.gameFormats.gameId, codm!.id))
        .limit(1);
      await db
        .update(schema.challenges)
        .set({ formatId: codmFormat!.id })
        .where(eq(schema.challenges.id, match!.challengeId));

      const before = await matches.getView(matchId, bola.user);
      expect(before).toMatchObject({
        roomCodeMode: 'optional',
        canSetRoomCode: true,
        roomCode: null,
      });
      await matches.setRoomCode(matchId, bola.user, '  CODM-77X  ');
      const after = await matches.getView(matchId, alice.user);
      expect(after.roomCode).toBe('CODM-77X');
      expect(after.version).toBe(before.version + 1);
      expect((await matches.getView(matchId, mod.user)).roomCode).toBeNull();
      await expect(matches.setRoomCode(matchId, outsider.user, 'X-1')).rejects.toMatchObject({
        status: 404,
      });
      await expect(matches.setRoomCode(matchId, alice.user, 'bad code!')).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  // ---------------------------------------------------------------- F7.3 chat
  describe('chat (F7.3)', () => {
    it('creates the conversation on match.created through the outbox relay', async () => {
      const matchId = await createMatch(alice, bola, { withConversation: false });
      await db.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'match.created',
        subjectId: matchId,
        payload: { matchId },
      });
      // Other suites may leave events queued; drain until ours is processed.
      for (let i = 0; i < 20; i++) {
        if ((await relay.drain()) === 0) break;
      }
      const [conv] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.matchId, matchId));
      expect(conv?.scope).toBe('match');
      const parts = await db
        .select()
        .from(schema.conversationParticipants)
        .where(eq(schema.conversationParticipants.conversationId, conv!.id));
      expect(parts.map((p) => p.userId).sort()).toEqual([alice.user.sub, bola.user.sub].sort());
    });

    it('sends, pages oldest-first, and rejects empty / over-limit bodies', async () => {
      const matchId = await createMatch(alice, bola);
      await chat.send(alice.user, matchId, { body: 'ready?', clientMsgId: uuidv7() });
      await chat.send(bola.user, matchId, { body: 'yes, sending code', clientMsgId: uuidv7() });
      const page = await chat.listMessages(matchId, alice.user);
      expect(page.messages.map((m) => m.body)).toEqual(['ready?', 'yes, sending code']);

      await expect(
        chat.send(alice.user, matchId, { body: '   ', clientMsgId: uuidv7() }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        chat.send(alice.user, matchId, { body: 'x'.repeat(501), clientMsgId: uuidv7() }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('deduplicates retries, including concurrent ones', async () => {
      const matchId = await createMatch(alice, bola);
      const clientMsgId = uuidv7();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          chat.send(alice.user, matchId, { body: 'gg', clientMsgId }),
        ),
      );
      expect(new Set(results.map((r) => r.message.id)).size).toBe(1);
      expect(results.filter((r) => !r.deduped)).toHaveLength(1);
      const page = await chat.listMessages(matchId, alice.user);
      expect(page.messages.filter((m) => m.clientMsgId === clientMsgId)).toHaveLength(1);
    });

    it('flags keyword hits without blocking delivery', async () => {
      const matchId = await createMatch(alice, bola);
      const { message } = await chat.send(alice.user, matchId, {
        body: 'add me on whatsapp 08031234567',
        clientMsgId: uuidv7(),
      });
      expect(message.body).toBe('add me on whatsapp 08031234567');
      const flags = await db
        .select()
        .from(schema.chatFlags)
        .where(eq(schema.chatFlags.messageId, message.id));
      expect(flags).toHaveLength(1);
      expect(flags[0]!.categories).toContain('off_platform_contact');
    });

    it('only lets participants send (not outsiders, not staff)', async () => {
      const matchId = await createMatch(alice, bola);
      await expect(
        chat.send(outsider.user, matchId, { body: 'hi', clientMsgId: uuidv7() }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        chat.send(mod.user, matchId, { body: 'hi', clientMsgId: uuidv7() }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('rate limits bursts', async () => {
      const matchId = await createMatch(alice, bola);
      const sends = [];
      for (let i = 0; i < 9; i++) {
        sends.push(
          await chat.send(alice.user, matchId, { body: `m${i}`, clientMsgId: uuidv7() }).then(
            () => 'ok',
            (e) => e.status,
          ),
        );
      }
      expect(sends.slice(0, 8).every((s) => s === 'ok')).toBe(true);
      expect(sends[8]).toBe(429);
    });

    it('locks 72h after completion, but a retry of an already-stored message still succeeds', async () => {
      const matchId = await createMatch(alice, bola);
      const clientMsgId = uuidv7();
      const sent = await chat.send(alice.user, matchId, { body: 'good game', clientMsgId });

      const confirmedAt = new Date(Date.now() - CHAT_LOCK_AFTER_MS - 60_000);
      await advance(matchId, ['awaiting_confirmation', 'confirmed'], { confirmedAt });

      await expect(
        chat.send(bola.user, matchId, { body: 'late', clientMsgId: uuidv7() }),
      ).rejects.toMatchObject({ status: 409 });
      const retry = await chat.send(alice.user, matchId, { body: 'good game', clientMsgId });
      expect(retry).toMatchObject({ deduped: true, message: { id: sent.message.id } });
      expect((await matches.getView(matchId, alice.user)).chat.locked).toBe(true);
    });

    it('keeps a disputed match chat open regardless of age', async () => {
      const matchId = await createMatch(alice, bola);
      await advance(matchId, ['awaiting_confirmation', 'disputed'], {
        confirmedAt: new Date(Date.now() - 10 * CHAT_LOCK_AFTER_MS),
      });
      await expect(
        chat.send(alice.user, matchId, { body: 'evidence attached', clientMsgId: uuidv7() }),
      ).resolves.toBeTruthy();
    });

    it('lock sweep stamps locked_at once and posts the system message', async () => {
      const matchId = await createMatch(alice, bola);
      await advance(matchId, ['awaiting_confirmation', 'disputed', 'resolved'], {
        resolvedAt: new Date(Date.now() - CHAT_LOCK_AFTER_MS - 1000),
      });
      expect(await chat.sweepLocks()).toBeGreaterThanOrEqual(1);
      expect(await chat.sweepLocks()).toBe(0);
      const [conv] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.matchId, matchId));
      expect(conv?.lockedAt).toBeInstanceOf(Date);
      const page = await chat.listMessages(matchId, alice.user);
      expect(page.messages.at(-1)).toMatchObject({ kind: 'system', senderId: null });
    });

    it('reports are idempotent per reporter and snapshot the body', async () => {
      const matchId = await createMatch(alice, bola);
      const { message } = await chat.send(bola.user, matchId, {
        body: 'you cheat',
        clientMsgId: uuidv7(),
      });
      const first = await chat.report(alice.user, matchId, message.id, { reason: 'harassment' });
      const again = await chat.report(alice.user, matchId, message.id, { reason: 'harassment' });
      expect(first.alreadyReported).toBe(false);
      expect(again).toEqual({ reportId: null, alreadyReported: true });
      const [row] = await db
        .select()
        .from(schema.messageReports)
        .where(eq(schema.messageReports.messageId, message.id));
      expect(row?.bodySnapshot).toBe('you cheat');
      await expect(
        chat.report(bola.user, matchId, message.id, { reason: 'spam' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('records blocks idempotently', async () => {
      await chat.block(alice.user, outsider.user.sub);
      await chat.block(alice.user, outsider.user.sub);
      const rows = await db
        .select()
        .from(schema.userBlocks)
        .where(
          and(
            eq(schema.userBlocks.blockerId, alice.user.sub),
            eq(schema.userBlocks.blockedId, outsider.user.sub),
          ),
        );
      expect(rows).toHaveLength(1);
      await expect(chat.block(alice.user, alice.user.sub)).rejects.toMatchObject({ status: 400 });
    });

    it('stores messages in the monthly partition for their created_at', async () => {
      const matchId = await createMatch(alice, bola);
      const { message } = await chat.send(alice.user, matchId, {
        body: 'partition check',
        clientMsgId: uuidv7(),
      });
      const result = await db.execute<{ part: string }>(
        sql`select tableoid::regclass::text as part from messages where id = ${message.id}`,
      );
      const d = new Date(message.createdAt);
      const expected = `messages_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      expect(result.rows[0]?.part).toBe(expected);
    });
  });

  // ---------------------------------------------------------------- F7.4 admin read
  describe('admin chat read (F7.4)', () => {
    it('lets moderators read with flags and writes an audit row', async () => {
      const matchId = await createMatch(alice, bola);
      await chat.send(alice.user, matchId, {
        body: 'pay ₦5,000 to my opay',
        clientMsgId: uuidv7(),
      });
      const res = await one.app.inject({
        method: 'GET',
        url: `/admin/matches/${matchId}/chat`,
        headers: { authorization: `Bearer ${mod.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.messages).toHaveLength(1);
      expect(body.flags[0].categories).toContain('money_solicitation');
      const audits = await db
        .select()
        .from(schema.auditLog)
        .where(
          and(eq(schema.auditLog.actorId, mod.user.sub), eq(schema.auditLog.objectId, matchId)),
        );
      expect(audits[0]?.action).toBe('chat.read_as_staff');
    });

    it('refuses players, even participants', async () => {
      const matchId = await createMatch(alice, bola);
      const res = await one.app.inject({
        method: 'GET',
        url: `/admin/matches/${matchId}/chat`,
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---------------------------------------------------------------- F7.1 gateway
  describe('gateway (F7.1)', () => {
    it('rejects connections without a valid token', async () => {
      const anon = connect(one.url);
      sockets.push(anon);
      await expect(connected(anon)).rejects.toThrow('unauthenticated');
      const bad = connect(one.url, 'not-a-jwt');
      sockets.push(bad);
      await expect(connected(bad)).rejects.toThrow('unauthenticated');
    });

    it('only lets participants (or staff) subscribe to a match room', async () => {
      const matchId = await createMatch(alice, bola);
      const s = connect(one.url, outsider.token);
      sockets.push(s);
      await connected(s);
      const ack = await s.emitWithAck('match:subscribe', { matchId });
      expect(ack).toMatchObject({ ok: false, status: 404 });
    });

    it('fans chat out across instances through Redis', async () => {
      const matchId = await createMatch(alice, bola);
      const a = connect(one.url, alice.token);
      const b = connect(two.url, bola.token);
      sockets.push(a, b);
      await Promise.all([connected(a), connected(b)]);
      expect(await a.emitWithAck('match:subscribe', { matchId })).toMatchObject({ ok: true });
      expect(await b.emitWithAck('match:subscribe', { matchId })).toMatchObject({ ok: true });

      const received = waitFor<ChatMessageDto>(b, 'chat:message');
      const notified = waitFor<{ type: string; matchId: string }>(b, 'notification');
      const started = Date.now();
      const ack = await a.emitWithAck('chat:send', {
        matchId,
        body: 'hello from instance one',
        clientMsgId: uuidv7(),
      });
      expect(ack).toMatchObject({ ok: true, data: { deduped: false } });
      const msg = await received;
      expect(msg.body).toBe('hello from instance one');
      expect(Date.now() - started).toBeLessThan(2000); // ≤2s acceptance target
      expect(await notified).toMatchObject({ type: 'message.new', matchId });
    });

    it('broadcasts match state from the outbox to both players on either instance', async () => {
      const matchId = await createMatch(alice, bola);
      const a = connect(one.url, alice.token);
      const b = connect(two.url, bola.token);
      sockets.push(a, b);
      await Promise.all([connected(a), connected(b)]);
      // Not subscribed to the match room: state still reaches the user rooms.
      const gotA = waitFor<MatchStateEvent>(a, 'match:state', 5000);
      const gotB = waitFor<MatchStateEvent>(b, 'match:state', 5000);

      await db
        .update(schema.matches)
        .set({ status: 'in_progress', version: 2 })
        .where(eq(schema.matches.id, matchId));
      await db.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'match.in_progress',
        subjectId: matchId,
        payload: { matchId },
      });
      // drain() returns 0 at once while another drain holds the lock (this instance's
      // timer, or another test file's relay on the shared database), so keep polling.
      let done = false;
      const both = Promise.all([gotA, gotB]).finally(() => (done = true));
      while (!done) {
        await relay.drain();
        await new Promise((r) => setTimeout(r, 25));
      }

      const [ea, eb] = await both;
      expect(ea).toMatchObject({
        matchId,
        status: 'in_progress',
        version: 2,
        cause: 'match.in_progress',
      });
      expect(eb).toMatchObject({ matchId, status: 'in_progress', version: 2 });
    });

    it('disconnects sockets whose session was revoked', async () => {
      const temp = await createPlayer('Temp');
      const s = connect(one.url, temp.token);
      sockets.push(s);
      await connected(s);
      const revoked = waitFor<{ reason: string }>(s, 'auth:revoked');
      const disconnected = waitFor<string>(s, 'disconnect');
      await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.sessions.id, temp.user.sid));
      expect(await gateway.revalidateSessions()).toBeGreaterThanOrEqual(1);
      expect(await revoked).toEqual({ reason: 'session_expired' });
      await disconnected;
    });
  });
});
