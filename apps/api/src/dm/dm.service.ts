import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ServerEvents, userRoom } from '../realtime/realtime.events';
import { cursorSchemas, decodeCursor, encodeCursor } from '../shared/cursor';
import { validateBody } from '../chat/chat.rules';
import { FILTER_VERSION, runKeywordFilter } from '../chat/keyword-filter';
import { allowChatSend, allowWindows } from '../chat/chat.rate-limit';
import type { ReportReason } from '../chat/chat.service';
import { getStanding } from '../moderation/standing';
import {
  COMPLETED_MATCH_STATES,
  DM_COPY,
  DM_MAX_UNANSWERED,
  DM_PAIR_LIMITS,
  MAX_PENDING_OUTGOING,
  canRequestAgain,
  dmEligibility,
  nextFriendStatus,
  otherOf,
  overUnansweredCap,
  pairKey,
  type Eligibility,
  type FriendAction,
  type FriendStatus,
} from './dm.rules';

type MessageRow = typeof schema.messages.$inferSelect;

export interface DmMessageDto {
  id: string;
  /** Always null: DMs belong to no match. Kept so match-chat components can render them. */
  matchId: null;
  conversationId: string;
  senderId: string | null;
  kind: 'user' | 'system';
  body: string;
  clientMsgId: string | null;
  createdAt: string;
}

export type FriendState = 'none' | 'outgoing' | 'incoming' | 'friends';

function toDto(row: MessageRow): DmMessageDto {
  return {
    id: row.id,
    matchId: null,
    conversationId: row.conversationId,
    senderId: row.senderId,
    kind: row.kind,
    body: row.body,
    clientMsgId: row.clientMsgId,
    createdAt: row.createdAt.toISOString(),
  };
}

function pgCode(error: unknown): string | undefined {
  for (
    let e = error as { code?: unknown; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    if (typeof e.code === 'string') return e.code;
  }
  return undefined;
}

/**
 * Restricted DMs (Sprint 14). Every public method is reached only through DmEnabledGuard.
 * Conversations reuse the Sprint 7 model (scope 'dm', sorted pair key); messages reuse the
 * same table, 500-character rule, keyword filter and report table as match chat.
 */
@Injectable()
export class DmService {
  constructor(private readonly publisher: RealtimePublisher) {}

  // ------------------------------------------------------------ eligibility

  private async facts(me: string, other: string) {
    const { rows } = await db.execute<{
      blocked: boolean;
      blocked_by_me: boolean;
      friends: boolean;
      completed: boolean;
    }>(sql`
      SELECT
        EXISTS (SELECT 1 FROM user_blocks b
                WHERE (b.blocker_id = ${me} AND b.blocked_id = ${other})
                   OR (b.blocker_id = ${other} AND b.blocked_id = ${me})) AS blocked,
        EXISTS (SELECT 1 FROM user_blocks b
                WHERE b.blocker_id = ${me} AND b.blocked_id = ${other}) AS blocked_by_me,
        EXISTS (SELECT 1 FROM friend_requests f
                WHERE f.pair_key = ${pairKey(me, other)} AND f.status = 'accepted') AS friends,
        EXISTS (SELECT 1 FROM match_sides a
                JOIN match_sides b ON b.match_id = a.match_id AND b.user_id = ${other}
                JOIN matches m ON m.id = a.match_id
                WHERE a.user_id = ${me}
                  AND m.status IN (${sql.join(
                    COMPLETED_MATCH_STATES.map((s) => sql`${s}`),
                    sql`, `,
                  )})) AS completed`);
    const r = rows[0]!;
    return {
      eligibility: dmEligibility({
        self: me === other,
        blocked: Boolean(r.blocked),
        friends: Boolean(r.friends),
        completedMatch: Boolean(r.completed),
      }),
      blockedByMe: Boolean(r.blocked_by_me),
    };
  }

  /**
   * A suspended player cannot start or continue DMs (decision 0007): the same sanctions
   * that stop play stop messaging. Auto-limits do not, since they are not a finding.
   */
  private async assertNotSuspended(userId: string) {
    if ((await getStanding(userId)).playBlocked) throw new ForbiddenException(DM_COPY.suspended);
  }

  private async requireUser(userId: string) {
    const [u] = await db
      .select({ id: schema.users.id, name: schema.users.displayName })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .limit(1);
    if (!u) throw new NotFoundException('Player not found');
    return u;
  }

  /** What the profile page shows: friend state and whether a Message button appears. */
  async relationship(me: AuthedUser, otherId: string) {
    await this.requireUser(otherId);
    const { eligibility, blockedByMe } = await this.facts(me.sub, otherId);
    const fr = schema.friendRequests;
    const [live] = await db
      .select({ id: fr.id, requesterId: fr.requesterId, status: fr.status })
      .from(fr)
      .where(
        and(eq(fr.pairKey, pairKey(me.sub, otherId)), inArray(fr.status, ['pending', 'accepted'])),
      )
      .limit(1);
    const friend: FriendState = !live
      ? 'none'
      : live.status === 'accepted'
        ? 'friends'
        : live.requesterId === me.sub
          ? 'outgoing'
          : 'incoming';
    const [conv] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.dmPairKey, pairKey(me.sub, otherId)))
      .limit(1);
    return {
      self: me.sub === otherId,
      friend,
      requestId: live?.status === 'pending' ? live.id : null,
      canMessage: eligibility.ok,
      // A player who was blocked sees exactly what a stranger sees (no reveal).
      blockedByMe,
      conversationId: eligibility.ok || blockedByMe ? (conv?.id ?? null) : null,
    };
  }

  // ------------------------------------------------------------ friend requests

  async requestFriend(me: AuthedUser, otherId: string) {
    if (me.sub === otherId) throw new BadRequestException('You cannot add yourself');
    await this.requireUser(otherId);
    await this.assertNotSuspended(me.sub);
    const { eligibility } = await this.facts(me.sub, otherId);
    if (!eligibility.ok && eligibility.reason === 'blocked')
      throw new ForbiddenException(DM_COPY.cannotRequest);

    const fr = schema.friendRequests;
    const key = pairKey(me.sub, otherId);
    const history = await db
      .select({
        id: fr.id,
        requesterId: fr.requesterId,
        status: fr.status,
        respondedAt: fr.respondedAt,
      })
      .from(fr)
      .where(eq(fr.pairKey, key))
      .orderBy(desc(fr.createdAt))
      .limit(50);

    // They already asked me: asking back is a yes.
    const theirs = history.find((r) => r.status === 'pending' && r.requesterId === otherId);
    if (theirs) return this.respond(me, theirs.id, 'accept');

    const allowed = canRequestAgain(
      history.map((r) => ({ ...r, status: r.status as FriendStatus })),
      me.sub,
      Date.now(),
    );
    if (!allowed.ok) {
      if (allowed.reason === 'friends') return { requestId: null, status: 'accepted' as const };
      if (allowed.reason === 'pending') {
        const mine = history.find((r) => r.status === 'pending');
        return { requestId: mine?.id ?? null, status: 'pending' as const };
      }
      throw new ForbiddenException(DM_COPY.cannotRequest);
    }

    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(fr)
      .where(and(eq(fr.requesterId, me.sub), eq(fr.status, 'pending')));
    if (n >= MAX_PENDING_OUTGOING)
      throw new HttpException(
        'You have too many friend requests waiting. Wait for some answers first.',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const id = uuidv7();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(fr).values({ id, requesterId: me.sub, addresseeId: otherId, pairKey: key });
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'friend.requested',
          subjectId: id,
          payload: { requestId: id, requesterId: me.sub, addresseeId: otherId },
        });
      });
    } catch (error) {
      // A concurrent request for the same pair won the partial unique index.
      if (pgCode(error) === '23505') throw new ConflictException('A request is already open');
      throw error;
    }
    return { requestId: id, status: 'pending' as const };
  }

  async respond(me: AuthedUser, requestId: string, action: FriendAction) {
    const fr = schema.friendRequests;
    const [row] = await db.select().from(fr).where(eq(fr.id, requestId)).limit(1);
    if (!row || (row.requesterId !== me.sub && row.addresseeId !== me.sub))
      throw new NotFoundException('Request not found');
    const next = nextFriendStatus(row.status as FriendStatus, action, row.addresseeId === me.sub);
    if (!next) throw new ConflictException('This request has already been answered');
    if (next === 'accepted') {
      const { eligibility } = await this.facts(row.requesterId, row.addresseeId);
      if (!eligibility.ok && eligibility.reason === 'blocked')
        throw new ForbiddenException(DM_COPY.cannotRequest);
    }

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(fr)
        .set({ status: next, respondedAt: new Date() })
        .where(and(eq(fr.id, requestId), eq(fr.status, row.status)))
        .returning({ id: fr.id });
      if (rows.length === 0) return false;
      if (next === 'accepted') {
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'friend.accepted',
          subjectId: requestId,
          payload: { requestId, requesterId: row.requesterId, addresseeId: row.addresseeId },
        });
      }
      return true;
    });
    if (!updated) throw new ConflictException('This request has already been answered');
    return { requestId, status: next };
  }

  async removeFriend(me: AuthedUser, otherId: string) {
    const fr = schema.friendRequests;
    const [row] = await db
      .select({ id: fr.id })
      .from(fr)
      .where(and(eq(fr.pairKey, pairKey(me.sub, otherId)), eq(fr.status, 'accepted')))
      .limit(1);
    if (!row) throw new NotFoundException('You are not friends with this player');
    return this.respond(me, row.id, 'remove');
  }

  async requests(me: AuthedUser) {
    const { rows } = await db.execute<{
      id: string;
      requester_id: string;
      addressee_id: string;
      created_at: string;
      other_name: string | null;
    }>(sql`
      SELECT f.id, f.requester_id, f.addressee_id, f.created_at,
             u.display_name AS other_name
      FROM friend_requests f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ${me.sub} THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'pending' AND (f.requester_id = ${me.sub} OR f.addressee_id = ${me.sub})
        AND u.deleted_at IS NULL
      ORDER BY f.created_at DESC
      LIMIT 100`);
    const shape = (r: (typeof rows)[number]) => ({
      requestId: r.id,
      userId: r.requester_id === me.sub ? r.addressee_id : r.requester_id,
      name: r.other_name ?? 'Player',
      createdAt: new Date(r.created_at).toISOString(),
    });
    return {
      incoming: rows.filter((r) => r.addressee_id === me.sub).map(shape),
      outgoing: rows.filter((r) => r.requester_id === me.sub).map(shape),
    };
  }

  // ------------------------------------------------------------ conversations

  /** Opens (or returns) the pair's DM. Only for eligible pairs. */
  async open(me: AuthedUser, otherId: string): Promise<{ conversationId: string }> {
    await this.requireUser(otherId);
    await this.assertNotSuspended(me.sub);
    const { eligibility } = await this.facts(me.sub, otherId);
    if (!eligibility.ok) throw new ForbiddenException(DM_COPY.cannotMessage);
    const key = pairKey(me.sub, otherId);
    await db
      .insert(schema.conversations)
      .values({ id: uuidv7(), scope: 'dm', dmPairKey: key })
      .onConflictDoNothing({ target: schema.conversations.dmPairKey });
    const [conv] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.dmPairKey, key))
      .limit(1);
    await db
      .insert(schema.conversationParticipants)
      .values([
        { conversationId: conv!.id, userId: me.sub },
        { conversationId: conv!.id, userId: otherId },
      ])
      .onConflictDoNothing();
    return { conversationId: conv!.id };
  }

  /** The caller's DM list: the other player, last message, unread and muted state. */
  async list(me: AuthedUser) {
    const { rows } = await db.execute<{
      conversation_id: string;
      pair_key: string;
      last_body: string | null;
      last_kind: string | null;
      last_sender: string | null;
      last_at: string | null;
      last_read_at: string | null;
      muted_at: string | null;
      other_name: string | null;
    }>(sql`
      SELECT c.id AS conversation_id, c.dm_pair_key AS pair_key,
             lm.body AS last_body, lm.kind AS last_kind, lm.sender_id AS last_sender,
             lm.created_at AS last_at, cp.last_read_at, cp.muted_at,
             (SELECT u.display_name FROM conversation_participants o JOIN users u ON u.id = o.user_id
               WHERE o.conversation_id = c.id AND o.user_id <> ${me.sub} LIMIT 1) AS other_name
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id AND c.scope = 'dm'
      LEFT JOIN LATERAL (
        SELECT body, kind, sender_id, created_at FROM messages WHERE conversation_id = c.id
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) lm ON true
      WHERE cp.user_id = ${me.sub}
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 50`);
    return rows.map((r) => {
      const lastAt = r.last_at ? new Date(r.last_at) : null;
      const unread =
        !!lastAt &&
        r.last_sender !== me.sub &&
        (!r.last_read_at || lastAt > new Date(r.last_read_at));
      return {
        conversationId: r.conversation_id,
        userId: otherOf(r.pair_key, me.sub),
        name: r.other_name ?? 'Player',
        lastMessage: r.last_body,
        lastIsSystem: r.last_kind === 'system',
        lastFromMe: r.last_sender === me.sub,
        lastAt: lastAt?.toISOString() ?? null,
        unread,
        muted: Boolean(r.muted_at),
      };
    });
  }

  private async requireParticipant(me: string, conversationId: string) {
    const [row] = await db
      .select({
        pairKey: schema.conversations.dmPairKey,
        mutedAt: schema.conversationParticipants.mutedAt,
      })
      .from(schema.conversationParticipants)
      .innerJoin(
        schema.conversations,
        eq(schema.conversations.id, schema.conversationParticipants.conversationId),
      )
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, conversationId),
          eq(schema.conversationParticipants.userId, me),
          eq(schema.conversations.scope, 'dm'),
        ),
      )
      .limit(1);
    // 404 for strangers too: whether a conversation exists is not theirs to learn.
    if (!row?.pairKey) throw new NotFoundException('Conversation not found');
    return { otherId: otherOf(row.pairKey, me), muted: Boolean(row.mutedAt) };
  }

  /** Header for the conversation screen. `canSend` is false (neutral copy) when blocked. */
  async get(me: AuthedUser, conversationId: string) {
    const { otherId, muted } = await this.requireParticipant(me.sub, conversationId);
    const [other] = await db
      .select({ name: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, otherId));
    const { eligibility, blockedByMe } = await this.facts(me.sub, otherId);
    return {
      conversationId,
      other: { userId: otherId, name: other?.name ?? 'Player' },
      muted,
      canSend: eligibility.ok,
      blockedByMe,
      notice: eligibility.ok ? null : DM_COPY.cannotSend,
    };
  }

  async messages(
    me: AuthedUser,
    conversationId: string,
    opts: { before?: string; after?: string; limit?: number },
  ) {
    await this.requireParticipant(me.sub, conversationId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const m = schema.messages;
    const conditions = [eq(m.conversationId, conversationId)];
    const before = decodeCursor(opts.before, cursorSchemas.timeId);
    const after = decodeCursor(opts.after, cursorSchemas.timeId);
    if (before) {
      const t = new Date(before.t);
      conditions.push(or(lt(m.createdAt, t), and(eq(m.createdAt, t), lt(m.id, before.id)))!);
    }
    if (after) {
      const t = new Date(after.t);
      conditions.push(or(gt(m.createdAt, t), and(eq(m.createdAt, t), gt(m.id, after.id)))!);
    }
    const rows = await db
      .select()
      .from(m)
      .where(and(...conditions))
      .orderBy(desc(m.createdAt), desc(m.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const oldest = page[page.length - 1];
    return {
      messages: page.reverse().map(toDto),
      nextCursor:
        rows.length > limit && oldest
          ? encodeCursor({ t: oldest.createdAt.toISOString(), id: oldest.id })
          : null,
    };
  }

  async send(
    me: AuthedUser,
    conversationId: string,
    input: { body: string; clientMsgId: string },
    now: Date = new Date(),
  ): Promise<{ message: DmMessageDto; deduped: boolean }> {
    const validation = validateBody(input.body);
    if (!validation.ok)
      throw new BadRequestException(
        validation.reason === 'empty' ? 'Message is empty' : 'Message is over 500 characters',
      );
    const { otherId } = await this.requireParticipant(me.sub, conversationId);

    const m = schema.messages;
    const [stored] = await db
      .select()
      .from(m)
      .where(and(eq(m.senderId, me.sub), eq(m.clientMsgId, input.clientMsgId)))
      .limit(1);
    if (stored) {
      if (stored.conversationId !== conversationId)
        throw new ConflictException('clientMsgId already used');
      return { message: toDto(stored), deduped: true };
    }

    await this.assertNotSuspended(me.sub);
    // Eligibility is re-checked on every send: a block or unfriend takes effect at once.
    const { eligibility } = await this.facts(me.sub, otherId);
    if (!eligibility.ok) throw new ForbiddenException(DM_COPY.cannotSend);

    const recent = await db
      .select({ senderId: m.senderId })
      .from(m)
      .where(eq(m.conversationId, conversationId))
      .orderBy(desc(m.createdAt), desc(m.id))
      .limit(DM_MAX_UNANSWERED + 5);
    if (
      overUnansweredCap(
        recent.map((r) => r.senderId),
        me.sub,
      )
    )
      throw new HttpException(DM_COPY.unanswered, HttpStatus.TOO_MANY_REQUESTS);

    const userOk = await allowChatSend(me.sub, now.getTime());
    const pairOk = await allowWindows(
      'rl:dm',
      `${conversationId}:${me.sub}`,
      DM_PAIR_LIMITS,
      now.getTime(),
    );
    if (!userOk || !pairOk) throw new HttpException(DM_COPY.tooFast, HttpStatus.TOO_MANY_REQUESTS);

    const filter = runKeywordFilter(validation.body);
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${me.sub}:${input.clientMsgId}`}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(m)
        .where(and(eq(m.senderId, me.sub), eq(m.clientMsgId, input.clientMsgId)))
        .limit(1);
      if (existing) {
        if (existing.conversationId !== conversationId)
          throw new ConflictException('clientMsgId already used');
        return { row: existing, deduped: true };
      }
      const [row] = await tx
        .insert(m)
        .values({
          id: uuidv7(),
          conversationId,
          senderId: me.sub,
          kind: 'user',
          body: validation.body,
          clientMsgId: input.clientMsgId,
          flagged: filter.flagged,
          createdAt: now,
        })
        .returning();
      if (filter.flagged) {
        // Lands in the moderators' reports queue (F12) as a keyword flag.
        await tx.insert(schema.chatFlags).values({
          id: uuidv7(),
          messageId: row!.id,
          messageCreatedAt: row!.createdAt,
          conversationId,
          categories: filter.categories,
          terms: filter.terms,
          filterVersion: FILTER_VERSION,
        });
      }
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'message.created',
        subjectId: row!.id,
        payload: {
          scope: 'dm',
          messageId: row!.id,
          conversationId,
          matchId: null,
          senderId: me.sub,
          recipientIds: [otherId],
          flagged: filter.flagged,
        },
      });
      return { row: row!, deduped: false };
    });

    const dto = toDto(result.row);
    if (!result.deduped) {
      // Both user rooms: the recipient, and the sender's other tabs and devices.
      for (const id of [me.sub, otherId])
        this.publisher.emit(userRoom(id), ServerEvents.DmMessage, dto);
    }
    return { message: dto, deduped: result.deduped };
  }

  /**
   * Report a DM (F14.4). Same table and queue as match-chat reports, plus a frozen snapshot
   * of the surrounding conversation for the moderator. Idempotent per reporter. Audited.
   */
  async report(
    me: AuthedUser,
    conversationId: string,
    messageId: string,
    input: { reason: ReportReason; note?: string },
    ip?: string,
  ) {
    await this.requireParticipant(me.sub, conversationId);
    const m = schema.messages;
    const [message] = await db
      .select()
      .from(m)
      .where(and(eq(m.conversationId, conversationId), eq(m.id, messageId)))
      .limit(1);
    if (!message) throw new NotFoundException('Message not found');
    if (message.kind === 'system')
      throw new BadRequestException('System messages cannot be reported');
    if (message.senderId === me.sub)
      throw new BadRequestException('You cannot report your own message');

    const [beforeRows, afterRows] = await Promise.all([
      db
        .select()
        .from(m)
        .where(
          and(
            eq(m.conversationId, conversationId),
            or(
              lt(m.createdAt, message.createdAt),
              and(eq(m.createdAt, message.createdAt), lt(m.id, message.id)),
            ),
          ),
        )
        .orderBy(desc(m.createdAt), desc(m.id))
        .limit(10),
      db
        .select()
        .from(m)
        .where(
          and(
            eq(m.conversationId, conversationId),
            or(
              gt(m.createdAt, message.createdAt),
              and(eq(m.createdAt, message.createdAt), gt(m.id, message.id)),
            ),
          ),
        )
        .orderBy(m.createdAt, m.id)
        .limit(5),
    ]);
    const context = [...beforeRows.reverse(), message, ...afterRows].map((r) => ({
      id: r.id,
      senderId: r.senderId,
      kind: r.kind,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      reported: r.id === message.id,
    }));

    const reportId = uuidv7();
    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.messageReports)
        .values({
          id: reportId,
          messageId,
          messageCreatedAt: message.createdAt,
          conversationId,
          reporterId: me.sub,
          reason: input.reason,
          note: input.note ?? null,
          bodySnapshot: message.body,
        })
        .onConflictDoNothing({
          target: [schema.messageReports.messageId, schema.messageReports.reporterId],
        })
        .returning({ id: schema.messageReports.id });
      if (inserted.length === 0) return false;
      await tx.insert(schema.messageReportContexts).values({ reportId, messages: context });
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'message.reported',
        subjectId: messageId,
        payload: {
          scope: 'dm',
          reportId,
          messageId,
          conversationId,
          reporterId: me.sub,
          reason: input.reason,
        },
      });
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: me.sub,
        action: 'dm.reported',
        objectType: 'message',
        objectId: messageId,
        after: { reportId, conversationId, reason: input.reason },
        ip: ip ?? null,
      });
      return true;
    });
    return created
      ? { reportId, alreadyReported: false }
      : { reportId: null, alreadyReported: true };
  }

  /** Mute: no notifications and no unread dot for this conversation. Audited. */
  async mute(me: AuthedUser, conversationId: string, muted: boolean, ip?: string) {
    await this.requireParticipant(me.sub, conversationId);
    await db
      .update(schema.conversationParticipants)
      .set({ mutedAt: muted ? new Date() : null })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, conversationId),
          eq(schema.conversationParticipants.userId, me.sub),
        ),
      );
    await db.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: me.sub,
      action: muted ? 'dm.muted' : 'dm.unmuted',
      objectType: 'conversation',
      objectId: conversationId,
      ip: ip ?? null,
    });
    return { muted };
  }

  async markRead(me: AuthedUser, conversationId: string) {
    await this.requireParticipant(me.sub, conversationId);
    await db
      .update(schema.conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, conversationId),
          eq(schema.conversationParticipants.userId, me.sub),
        ),
      );
  }

  /** Inbox counts for the Messages tab. */
  async status(me: AuthedUser) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.friendRequests)
      .where(
        and(
          eq(schema.friendRequests.addresseeId, me.sub),
          eq(schema.friendRequests.status, 'pending'),
        ),
      );
    return { enabled: true as const, incomingRequests: n };
  }
}

export type { Eligibility };
