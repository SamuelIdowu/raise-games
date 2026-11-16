import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { MatchesService } from '../matches/matches.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import {
  ServerEvents,
  matchRoom,
  userRoom,
  type ChatMessageDto,
  type NotificationEvent,
} from '../realtime/realtime.events';
import { decodeCursor, encodeCursor } from '../shared/cursor';
import { isChatLocked, validateBody, type MatchStatus } from './chat.rules';
import { FILTER_VERSION, runKeywordFilter } from './keyword-filter';
import { allowChatSend } from './chat.rate-limit';

type MessageRow = typeof schema.messages.$inferSelect;

export interface MessagePage {
  messages: ChatMessageDto[];
  /** Cursor for older messages (pass as `before`). */
  nextCursor: string | null;
}

export interface SendResult {
  message: ChatMessageDto;
  /** True when this was a retry of a message already stored. */
  deduped: boolean;
}

export type ReportReason = 'harassment' | 'hate' | 'spam' | 'cheating' | 'off_platform' | 'other';

interface MessageCursor {
  t: string;
  id: string;
}

function toDto(row: MessageRow, matchId: string): ChatMessageDto {
  return {
    id: row.id,
    matchId,
    conversationId: row.conversationId,
    senderId: row.senderId,
    kind: row.kind,
    body: row.body,
    clientMsgId: row.clientMsgId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ChatService {
  constructor(
    private readonly matches: MatchesService,
    private readonly publisher: RealtimePublisher,
  ) {}

  /**
   * Creates the match conversation and its two participants if missing. Idempotent: it
   * runs from the outbox relay on `match.created` (so the chat exists as soon as the
   * match does) and lazily on first read/send, so a missed event never breaks chat.
   */
  async ensureMatchConversation(matchId: string): Promise<string> {
    const [existing] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.matchId, matchId))
      .limit(1);
    let conversationId = existing?.id;

    if (!conversationId) {
      await db
        .insert(schema.conversations)
        .values({ id: uuidv7(), scope: 'match', matchId })
        .onConflictDoNothing({ target: schema.conversations.matchId });
      const [row] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(eq(schema.conversations.matchId, matchId))
        .limit(1);
      if (!row) throw new NotFoundException('Match not found');
      conversationId = row.id;
    }

    const sides = await db
      .select({ userId: schema.matchSides.userId })
      .from(schema.matchSides)
      .where(eq(schema.matchSides.matchId, matchId));
    if (sides.length > 0) {
      await db
        .insert(schema.conversationParticipants)
        .values(sides.map((s) => ({ conversationId: conversationId!, userId: s.userId })))
        .onConflictDoNothing();
    }
    return conversationId;
  }

  async listMessages(
    matchId: string,
    viewer: AuthedUser,
    opts: { before?: string; after?: string; limit?: number } = {},
  ): Promise<MessagePage> {
    await this.matches.access(matchId, viewer);
    const conversationId = await this.ensureMatchConversation(matchId);
    return this.pageMessages(conversationId, matchId, opts);
  }

  /** Shared by player reads and the admin evidence read. */
  private async pageMessages(
    conversationId: string,
    matchId: string,
    opts: { before?: string; after?: string; limit?: number },
  ): Promise<MessagePage> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const m = schema.messages;
    const conditions = [eq(m.conversationId, conversationId)];

    const before = decodeCursor<MessageCursor>(opts.before);
    const after = decodeCursor<MessageCursor>(opts.after);
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

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const oldest = page[page.length - 1];
    return {
      // Oldest first, as the chat renders them.
      messages: page.reverse().map((r) => toDto(r, matchId)),
      nextCursor:
        hasMore && oldest
          ? encodeCursor({ t: oldest.createdAt.toISOString(), id: oldest.id })
          : null,
    };
  }

  async send(
    sender: AuthedUser,
    matchId: string,
    input: { body: string; clientMsgId: string },
    now: Date = new Date(),
  ): Promise<SendResult> {
    const validation = validateBody(input.body);
    if (!validation.ok) {
      throw new BadRequestException(
        validation.reason === 'empty' ? 'Message is empty' : 'Message is over 500 characters',
      );
    }

    const { match, participantIds } = await this.matches.requireParticipant(matchId, sender);

    // A retry of a message that was already stored succeeds even if the sender has since
    // hit the rate limit or the chat has locked: the message was sent before either.
    const [stored] = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.senderId, sender.sub),
          eq(schema.messages.clientMsgId, input.clientMsgId),
        ),
      )
      .limit(1);
    if (stored) {
      const [conv] = await db
        .select({ matchId: schema.conversations.matchId })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, stored.conversationId))
        .limit(1);
      if (conv?.matchId !== matchId) throw new ConflictException('clientMsgId already used');
      return { message: toDto(stored, matchId), deduped: true };
    }

    if (isChatLocked({ ...match, status: match.status as MatchStatus }, now)) {
      throw new ConflictException('Chat is closed');
    }

    if (!(await allowChatSend(sender.sub, now.getTime()))) {
      throw new HttpException('You are sending messages too fast', HttpStatus.TOO_MANY_REQUESTS);
    }

    const conversationId = await this.ensureMatchConversation(matchId);
    const filter = runKeywordFilter(validation.body);

    const result = await db.transaction(async (tx) => {
      // Serialise retries of the same client message. A unique index cannot enforce this
      // on a partitioned table without the partition key, so use an advisory lock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${sender.sub}:${input.clientMsgId}`}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.senderId, sender.sub),
            eq(schema.messages.clientMsgId, input.clientMsgId),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw new ConflictException('clientMsgId already used');
        }
        return { row: existing, deduped: true };
      }

      const [row] = await tx
        .insert(schema.messages)
        .values({
          id: uuidv7(),
          conversationId,
          senderId: sender.sub,
          kind: 'user',
          body: validation.body,
          clientMsgId: input.clientMsgId,
          flagged: filter.flagged,
          createdAt: now,
        })
        .returning();

      if (filter.flagged) {
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
          messageId: row!.id,
          conversationId,
          matchId,
          senderId: sender.sub,
          recipientIds: participantIds.filter((id) => id !== sender.sub),
          flagged: filter.flagged,
        },
      });
      return { row: row!, deduped: false };
    });

    const dto = toDto(result.row, matchId);
    if (!result.deduped) {
      // Live delivery straight after commit (≤2s target); the outbox row is for the
      // Sprint 11 notification service, and the relay does not re-broadcast it.
      this.publisher.emit(matchRoom(matchId), ServerEvents.ChatMessage, dto);
      const notification: NotificationEvent = {
        type: 'message.new',
        matchId,
        at: dto.createdAt,
      };
      for (const id of participantIds.filter((p) => p !== sender.sub)) {
        this.publisher.emit(userRoom(id), ServerEvents.Notification, notification);
      }
    }
    return { message: dto, deduped: result.deduped };
  }

  /** Report a message (F7.3). Idempotent per reporter. Triage lands in Sprint 12. */
  async report(
    reporter: AuthedUser,
    matchId: string,
    messageId: string,
    input: { reason: ReportReason; note?: string },
  ): Promise<{ reportId: string | null; alreadyReported: boolean }> {
    await this.matches.requireParticipant(matchId, reporter);
    const conversationId = await this.ensureMatchConversation(matchId);

    const [message] = await db
      .select()
      .from(schema.messages)
      .where(
        and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.id, messageId)),
      )
      .limit(1);
    if (!message) throw new NotFoundException('Message not found');
    if (message.kind === 'system')
      throw new BadRequestException('System messages cannot be reported');
    if (message.senderId === reporter.sub)
      throw new BadRequestException('You cannot report your own message');

    const reportId = uuidv7();
    const inserted = await db
      .insert(schema.messageReports)
      .values({
        id: reportId,
        messageId,
        messageCreatedAt: message.createdAt,
        conversationId,
        reporterId: reporter.sub,
        reason: input.reason,
        note: input.note ?? null,
        bodySnapshot: message.body,
      })
      .onConflictDoNothing({
        target: [schema.messageReports.messageId, schema.messageReports.reporterId],
      })
      .returning({ id: schema.messageReports.id });

    if (inserted.length === 0) return { reportId: null, alreadyReported: true };

    await db.insert(schema.outboxEvents).values({
      id: uuidv7(),
      type: 'message.reported',
      subjectId: messageId,
      payload: { reportId, messageId, matchId, reporterId: reporter.sub, reason: input.reason },
    });
    return { reportId, alreadyReported: false };
  }

  /**
   * Records a block (F7.3 overflow menu). Enforcement — hiding messages, stopping DMs —
   * lands with Sprint 14 (F14.4); match chat stays usable so the match can be played.
   */
  async block(blocker: AuthedUser, blockedId: string): Promise<void> {
    if (blocker.sub === blockedId) throw new BadRequestException('You cannot block yourself');
    const [target] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, blockedId))
      .limit(1);
    if (!target) throw new NotFoundException('Player not found');

    const inserted = await db
      .insert(schema.userBlocks)
      .values({ blockerId: blocker.sub, blockedId })
      .onConflictDoNothing()
      .returning({ blockerId: schema.userBlocks.blockerId });
    if (inserted.length > 0) {
      await db.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'user.blocked',
        subjectId: blockedId,
        payload: { blockerId: blocker.sub, blockedId },
      });
    }
  }

  /**
   * Staff evidence read (F7.4, TA: "Admins can read match chats as dispute evidence").
   * Every read is written to the audit log. Includes keyword-filter flags.
   */
  async adminRead(
    staff: AuthedUser,
    matchId: string,
    opts: { before?: string; limit?: number },
    ip?: string,
  ): Promise<MessagePage & { flags: Array<typeof schema.chatFlags.$inferSelect> }> {
    if (staff.role !== 'moderator' && staff.role !== 'admin') {
      throw new ForbiddenException();
    }
    await this.matches.access(matchId, staff);
    const conversationId = await this.ensureMatchConversation(matchId);
    const page = await this.pageMessages(conversationId, matchId, opts);
    const flags = await db
      .select()
      .from(schema.chatFlags)
      .where(eq(schema.chatFlags.conversationId, conversationId))
      .orderBy(desc(schema.chatFlags.createdAt))
      .limit(200);

    await db.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: staff.sub,
      action: 'chat.read_as_staff',
      objectType: 'match',
      objectId: matchId,
      after: { conversationId, messageCount: page.messages.length, cursor: opts.before ?? null },
      ip: ip ?? null,
    });

    return { ...page, flags };
  }

  /**
   * Lock sweep: stamps `locked_at` on match chats whose 72h window has passed, posts a
   * system message, and tells connected clients. Sends are already refused by the
   * computed rule in send(); this only makes the lock visible and queryable.
   */
  async sweepLocks(now: Date = new Date()): Promise<number> {
    const due = await db.execute<{ conversation_id: string; match_id: string }>(sql`
      select c.id as conversation_id, m.id as match_id
      from conversations c
      join matches m on m.id = c.match_id
      where c.scope = 'match'
        and c.locked_at is null
        and m.status in ('confirmed','resolved','forfeited','voided','cancelled','expired')
        and coalesce(
              case m.status
                when 'confirmed' then m.confirmed_at
                when 'resolved' then m.resolved_at
                when 'forfeited' then m.forfeited_at
                when 'voided' then m.voided_at
                when 'cancelled' then m.cancelled_at
                when 'expired' then m.expired_at
              end,
              m.updated_at
            ) + interval '72 hours' <= ${now}
      limit 500
    `);

    let locked = 0;
    for (const row of due.rows) {
      // Lock stamp and "Chat is closed" message commit together, so a failure never
      // leaves a locked chat without its closing message (or the reverse).
      const system = await db.transaction(async (tx) => {
        const stamped = await tx
          .update(schema.conversations)
          .set({ lockedAt: now })
          .where(
            and(
              eq(schema.conversations.id, row.conversation_id),
              sql`${schema.conversations.lockedAt} is null`,
            ),
          )
          .returning({ id: schema.conversations.id });
        if (stamped.length === 0) return null; // another instance got it

        const [message] = await tx
          .insert(schema.messages)
          .values({
            id: uuidv7(),
            conversationId: row.conversation_id,
            senderId: null,
            kind: 'system',
            body: 'Chat is closed. Messages are kept for dispute review.',
            createdAt: now,
          })
          .returning();
        return message ?? null;
      });
      if (!system) continue;

      this.publisher.emit(
        matchRoom(row.match_id),
        ServerEvents.ChatMessage,
        toDto(system, row.match_id),
      );
      this.publisher.emit(matchRoom(row.match_id), ServerEvents.ChatLocked, {
        matchId: row.match_id,
        lockedAt: now.toISOString(),
      });
      locked += 1;
    }
    return locked;
  }

  async ensurePartitions(monthsAhead = 2): Promise<number> {
    const result = await db.execute<{ created: number }>(
      sql`select ensure_message_partitions(${monthsAhead}) as created`,
    );
    return Number(result.rows[0]?.created ?? 0);
  }
}
