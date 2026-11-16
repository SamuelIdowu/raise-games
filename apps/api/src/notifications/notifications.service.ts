import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import { env } from '../config/env.instance';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { OutboxRelay, type OutboxEvent } from '../realtime/outbox-relay';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ServerEvents, userRoom } from '../realtime/realtime.events';
import { decodeCursor, encodeCursor } from '../shared/cursor';
import {
  CATALOG,
  NOTIFICATION_TYPES,
  quietUntil,
  render,
  type NotificationType,
  type Params,
} from './catalog';
import {
  WebPushChannel,
  emailChannelFromEnv,
  type EmailChannel,
  type OutboundMessage,
  type PushChannel,
} from './channels';

export type Channel = 'push' | 'email';

/** Outbox events this consumer turns into notifications (F11.2). */
export const NOTIFICATION_EVENT_TYPES = new Set([
  'challenge.created',
  'challenge.accepted',
  'challenge.declined',
  'result.submitted',
  'noshow.reported',
  'match.confirmed',
  'dispute.opened',
  'dispute.ruled',
  'message.created',
  'sanction.applied',
]);

/**
 * A new consumer replays the relay's 7-day lookback. Notifications about week-old events
 * are noise, so events older than this are acknowledged without notifying.
 */
export const STALE_EVENT_MS = 60 * 60 * 1000;

export interface NotificationDto {
  id: string;
  type: NotificationType;
  icon: string;
  title: string;
  body: string;
  link: string;
  params: Params;
  count: number;
  read: boolean;
  createdAt: string;
}

interface Draft {
  userId: string;
  type: NotificationType;
  sourceKey: string;
  params: Params;
  /** Batching key (new messages per conversation). */
  groupKey?: string;
}

export interface Scheduler {
  /** Queue an outbound delivery, optionally delayed (quiet hours). */
  schedule(notificationId: string, channel: Channel, delayMs: number): Promise<boolean>;
}

function toDto(row: typeof schema.notifications.$inferSelect): NotificationDto {
  const type = row.type as NotificationType;
  return {
    id: row.id,
    type,
    icon: CATALOG[type]?.icon ?? 'info',
    title: row.title,
    body: row.body,
    link: row.link,
    params: row.params as Params,
    count: row.groupCount,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Notification service (Sprint 11, F11.1). Outbox event → recipients → `notifications` row
 * (source of record, deduped per recipient + event + type) → in-app socket emit right away
 * → push/email per preference, through BullMQ with retries and backoff, delayed by quiet
 * hours unless the type is critical. Every outbound try writes a `delivery_attempts` row.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  readonly push: PushChannel = new WebPushChannel();
  readonly email: EmailChannel = emailChannelFromEnv();
  private scheduler: Scheduler | null = null;

  constructor(
    private readonly relay: OutboxRelay,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit(): void {
    this.relay.register({
      name: 'notifications',
      matches: (type) => NOTIFICATION_EVENT_TYPES.has(type),
      handle: (event) => this.fromEvent(event).then(() => undefined),
    });
  }

  /** The BullMQ worker registers itself; without it deliveries run inline (tests, Redis down). */
  useScheduler(scheduler: Scheduler | null): void {
    this.scheduler = scheduler;
  }

  // ------------------------------------------------------------ event mapping

  async fromEvent(event: OutboxEvent, now: Date = new Date()): Promise<NotificationDto[]> {
    if (now.getTime() - event.createdAt.getTime() > STALE_EVENT_MS) return [];
    const drafts = await this.draftsFor(event);
    const created: NotificationDto[] = [];
    for (const draft of drafts) {
      const n = await this.create(draft);
      if (n) created.push(n);
    }
    return created;
  }

  private async draftsFor(event: OutboxEvent): Promise<Draft[]> {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
    const key = event.id;

    switch (event.type) {
      case 'challenge.created': {
        const target = str('targetPlayerId');
        if (!target) return [];
        const ctx = await this.challengeContext(str('challengeId')!);
        return [
          {
            userId: target,
            type: 'challenge_received',
            sourceKey: key,
            params: { from: await this.nameOf(ctx.posterId), game: ctx.game },
          },
        ];
      }
      case 'challenge.accepted': {
        const ctx = await this.challengeContext(str('challengeId')!);
        return [
          {
            userId: ctx.posterId,
            type: 'challenge_accepted',
            sourceKey: key,
            params: {
              opponent: await this.nameOf(str('acceptorId')),
              game: ctx.game,
              matchId: str('matchId'),
            },
          },
        ];
      }
      case 'challenge.declined': {
        if (p.closed !== true) return []; // open-board declines are not news to the poster
        const ctx = await this.challengeContext(str('challengeId')!);
        return [
          {
            userId: ctx.posterId,
            type: 'challenge_declined',
            sourceKey: key,
            params: { opponent: await this.nameOf(str('declinedBy')), game: ctx.game },
          },
        ];
      }
      case 'result.submitted':
      case 'noshow.reported': {
        const matchId = str('matchId') ?? event.subjectId;
        const submitter = str('submitterId');
        const recipients = (await this.sidesOf(matchId)).filter((u) => u !== submitter);
        const type: NotificationType =
          event.type === 'noshow.reported' ? 'no_show_reported' : 'result_needs_confirmation';
        const opponent = await this.nameOf(submitter);
        return recipients.map((userId) => ({
          userId,
          type,
          sourceKey: key,
          params: { opponent, matchId },
        }));
      }
      case 'match.confirmed': {
        if (p.via !== 'auto_timeout') return [];
        const matchId = str('matchId') ?? event.subjectId;
        return (await this.sidesOf(matchId)).map((userId) => ({
          userId,
          type: 'result_auto_confirmed' as const,
          sourceKey: key,
          params: { matchId },
        }));
      }
      case 'dispute.opened':
      case 'dispute.ruled': {
        const matchId = str('matchId')!;
        const type: NotificationType =
          event.type === 'dispute.ruled' ? 'dispute_ruled' : 'dispute_opened';
        const opener = str('openedBy');
        return (await this.sidesOf(matchId))
          .filter((u) => u !== opener) // the opener knows; the other player must
          .map((userId) => ({ userId, type, sourceKey: key, params: { matchId } }));
      }
      case 'message.created': {
        const matchId = str('matchId')!;
        const ids = Array.isArray(p.recipientIds) ? (p.recipientIds as string[]) : [];
        const opponent = await this.nameOf(str('senderId'));
        return ids.map((userId) => ({
          userId,
          type: 'new_message' as const,
          sourceKey: key,
          params: { opponent, matchId, count: 1 },
          groupKey: `chat:${str('conversationId') ?? matchId}`,
        }));
      }
      case 'sanction.applied': {
        const userId = str('userId');
        if (!userId) return [];
        return [
          { userId, type: 'sanction_applied', sourceKey: key, params: { summary: str('summary') } },
        ];
      }
      default:
        return [];
    }
  }

  private async challengeContext(challengeId: string) {
    const [row] = await db
      .select({ posterId: schema.challenges.posterId, game: schema.games.name })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.games.id, schema.challenges.gameId))
      .where(eq(schema.challenges.id, challengeId));
    if (!row) throw new Error(`challenge ${challengeId} not found`);
    return row;
  }

  private async sidesOf(matchId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: schema.matchSides.userId })
      .from(schema.matchSides)
      .where(eq(schema.matchSides.matchId, matchId));
    return rows.map((r) => r.userId);
  }

  private async nameOf(userId: string | null): Promise<string> {
    if (!userId) return 'Your opponent';
    const [u] = await db
      .select({ displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return u?.displayName ?? 'Your opponent';
  }

  // ------------------------------------------------------------ creation

  /** Who may receive anything: active accounts that accepted the terms, not suspended. */
  private async eligible(userId: string, type: NotificationType): Promise<boolean> {
    const [u] = await db
      .select({ deletedAt: schema.users.deletedAt, tos: schema.users.tosVersionAccepted })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!u || u.deletedAt || !u.tos) return false;
    if (type === 'sanction_applied') return true; // the suspended player must be told
    const now = new Date();
    const [sanction] = await db
      .select({ id: schema.sanctions.id })
      .from(schema.sanctions)
      .where(
        and(
          eq(schema.sanctions.userId, userId),
          isNull(schema.sanctions.revokedAt),
          lte(schema.sanctions.startsAt, now),
          or(isNull(schema.sanctions.endsAt), gt(schema.sanctions.endsAt, now)),
        ),
      )
      .limit(1);
    return !sanction;
  }

  async create(draft: Draft): Promise<NotificationDto | null> {
    if (!(await this.eligible(draft.userId, draft.type))) return null;
    const now = new Date();

    // Batching: an unread message notification for the same conversation is updated in
    // place ("3 new messages from …") instead of stacking a new row per message.
    if (draft.groupKey) {
      const [open] = await db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, draft.userId),
            eq(schema.notifications.groupKey, draft.groupKey),
            isNull(schema.notifications.readAt),
          ),
        )
        .limit(1);
      if (open) {
        const count = open.groupCount + 1;
        const params = { ...draft.params, count };
        const text = render(draft.type, params);
        const [row] = await db
          .update(schema.notifications)
          .set({ groupCount: count, params, title: text.title, body: text.body, updatedAt: now })
          .where(eq(schema.notifications.id, open.id))
          .returning();
        const dto = toDto(row!);
        await this.emitInApp(draft.userId, dto);
        return dto; // already pushed/emailed for this unread group
      }
    }

    const text = render(draft.type, draft.params);
    const [row] = await db
      .insert(schema.notifications)
      .values({
        id: uuidv7(),
        userId: draft.userId,
        type: draft.type,
        sourceKey: draft.sourceKey,
        params: draft.params,
        title: text.title,
        body: text.body,
        link: text.link,
        groupKey: draft.groupKey ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [
          schema.notifications.userId,
          schema.notifications.sourceKey,
          schema.notifications.type,
        ],
      })
      .returning();
    if (!row) return null; // duplicate event delivery: already notified

    const dto = toDto(row);
    await this.emitInApp(draft.userId, dto);
    await db
      .insert(schema.deliveryAttempts)
      .values({ id: uuidv7(), notificationId: row.id, channel: 'in_app', status: 'sent' });
    await this.fanOut(row.id, draft.userId, draft.type, now);
    return dto;
  }

  private async emitInApp(userId: string, dto: NotificationDto) {
    this.publisher.emit(userRoom(userId), ServerEvents.NotificationNew, dto);
    this.publisher.emit(userRoom(userId), ServerEvents.NotificationUnread, {
      unread: await this.unreadCount(userId),
    });
  }

  private async fanOut(notificationId: string, userId: string, type: NotificationType, now: Date) {
    const entry = CATALOG[type];
    const prefs = await this.preferencesFor(userId);
    const wanted: Channel[] = (['push', 'email'] as const).filter(
      (c) => entry.critical || prefs[type][c],
    );
    if (wanted.length === 0) return;

    const [settings] = await db
      .select()
      .from(schema.notificationSettings)
      .where(eq(schema.notificationSettings.userId, userId));
    const until = entry.critical || !settings ? null : quietUntil(now, settings);
    const delayMs = until ? until.getTime() - now.getTime() : 0;

    for (const channel of wanted) {
      if (delayMs > 0) {
        await db.insert(schema.deliveryAttempts).values({
          id: uuidv7(),
          notificationId,
          channel,
          status: 'deferred',
          detail: `quiet hours until ${until!.toISOString()}`,
        });
      }
      const queued = this.scheduler
        ? await this.scheduler.schedule(notificationId, channel, delayMs)
        : false;
      if (!queued && delayMs === 0) {
        // No queue (tests, Redis down): deliver once inline; failures are recorded.
        await this.deliver(notificationId, channel, 1).catch(() => undefined);
      }
    }
  }

  // ------------------------------------------------------------ delivery

  /**
   * Deliver one notification on one channel. Throws on a transient failure so BullMQ
   * retries with backoff; records every outcome in `delivery_attempts`.
   */
  async deliver(
    notificationId: string,
    channel: Channel,
    attempt: number,
  ): Promise<'sent' | 'skipped'> {
    const [n] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notificationId));
    if (!n) return 'skipped';
    const message: OutboundMessage = {
      title: n.title,
      body: n.body,
      url: new URL(n.link, env.APP_URL).toString(),
    };
    const record = (status: 'sent' | 'failed' | 'skipped', detail: string | null) =>
      db
        .insert(schema.deliveryAttempts)
        .values({ id: uuidv7(), notificationId, channel, status, attempt, detail });

    try {
      if (channel === 'push') {
        if (!this.push.enabled) {
          await record('skipped', 'web push not configured');
          return 'skipped';
        }
        const subs = await db
          .select()
          .from(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.userId, n.userId));
        if (subs.length === 0) {
          await record('skipped', 'no push subscription');
          return 'skipped';
        }
        let sent = 0;
        for (const s of subs) {
          const result = await this.push.send(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            message,
          );
          if (result === 'gone') {
            await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
          } else sent += 1;
        }
        await record(sent > 0 ? 'sent' : 'skipped', sent > 0 ? null : 'all subscriptions expired');
        return sent > 0 ? 'sent' : 'skipped';
      }

      const [u] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, n.userId));
      if (!u?.email) {
        await record('skipped', 'no email address');
        return 'skipped';
      }
      const result = await this.email.send(u.email, message);
      await record(result.status, result.status === 'skipped' ? result.reason : null);
      return result.status;
    } catch (error) {
      await record('failed', ((error as Error).message ?? String(error)).slice(0, 300));
      throw error;
    }
  }

  /** Challenges expiring within the hour (F11.2 "challenge expiring"). Idempotent per challenge. */
  async notifyExpiring(now: Date = new Date()): Promise<number> {
    const soon = await db
      .select({
        id: schema.challenges.id,
        posterId: schema.challenges.posterId,
        game: schema.games.name,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.games.id, schema.challenges.gameId))
      .where(
        and(
          eq(schema.challenges.status, 'open'),
          gt(schema.challenges.acceptanceDeadline, now),
          lt(schema.challenges.acceptanceDeadline, new Date(now.getTime() + 3_600_000)),
        ),
      )
      .limit(500);
    let created = 0;
    for (const c of soon) {
      const n = await this.create({
        userId: c.posterId,
        type: 'challenge_expiring',
        sourceKey: `expiring:${c.id}`,
        params: { game: c.game },
      });
      if (n) created += 1;
    }
    return created;
  }

  // ------------------------------------------------------------ reads & settings

  async list(viewer: AuthedUser, opts: { before?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const cursor = decodeCursor<{ t: string; id: string }>(opts.before);
    const n = schema.notifications;
    const rows = await db
      .select()
      .from(n)
      .where(
        and(
          eq(n.userId, viewer.sub),
          cursor
            ? or(
                lt(n.createdAt, new Date(cursor.t)),
                and(eq(n.createdAt, new Date(cursor.t)), lt(n.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(n.createdAt), desc(n.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toDto),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
      unread: await this.unreadCount(viewer.sub),
    };
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
    return Number(row?.n ?? 0);
  }

  /** Mark some (or all) as read; every tab of this user gets the new count. */
  async markRead(viewer: AuthedUser, ids: string[] | 'all'): Promise<{ unread: number }> {
    const n = schema.notifications;
    await db
      .update(n)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(n.userId, viewer.sub),
          isNull(n.readAt),
          ids === 'all' ? undefined : inArray(n.id, ids),
        ),
      );
    const unread = await this.unreadCount(viewer.sub);
    this.publisher.emit(userRoom(viewer.sub), ServerEvents.NotificationUnread, { unread });
    return { unread };
  }

  async preferencesFor(
    userId: string,
  ): Promise<Record<NotificationType, { push: boolean; email: boolean }>> {
    const rows = await db
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId));
    const out = {} as Record<NotificationType, { push: boolean; email: boolean }>;
    for (const type of NOTIFICATION_TYPES) {
      const row = rows.find((r) => r.type === type);
      out[type] = row ? { push: row.push, email: row.email } : { ...CATALOG[type].defaults };
    }
    return out;
  }

  async getSettings(viewer: AuthedUser) {
    const [settings] = await db
      .select()
      .from(schema.notificationSettings)
      .where(eq(schema.notificationSettings.userId, viewer.sub));
    const [u] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, viewer.sub));
    const prefs = await this.preferencesFor(viewer.sub);
    return {
      types: NOTIFICATION_TYPES.map((type) => ({
        type,
        group: CATALOG[type].group,
        critical: CATALOG[type].critical,
        ...prefs[type],
      })),
      quietHours: {
        startMinute: settings?.quietStartMinute ?? null,
        endMinute: settings?.quietEndMinute ?? null,
        timeZone: settings?.timeZone ?? 'Africa/Lagos',
      },
      email: u?.email ?? null,
      push: { available: this.push.enabled, publicKey: this.push.publicKey },
    };
  }

  async updateSettings(
    viewer: AuthedUser,
    input: {
      types?: Array<{ type: NotificationType; push: boolean; email: boolean }>;
      quietHours?: { startMinute: number | null; endMinute: number | null; timeZone: string };
      email?: string | null;
    },
  ) {
    await db.transaction(async (tx) => {
      for (const t of input.types ?? []) {
        if (CATALOG[t.type].critical) continue; // critical types cannot be switched off
        await tx
          .insert(schema.notificationPreferences)
          .values({ userId: viewer.sub, type: t.type, push: t.push, email: t.email })
          .onConflictDoUpdate({
            target: [schema.notificationPreferences.userId, schema.notificationPreferences.type],
            set: { push: t.push, email: t.email, updatedAt: new Date() },
          });
      }
      if (input.quietHours) {
        const q = input.quietHours;
        await tx
          .insert(schema.notificationSettings)
          .values({
            userId: viewer.sub,
            quietStartMinute: q.startMinute,
            quietEndMinute: q.endMinute,
            timeZone: q.timeZone,
          })
          .onConflictDoUpdate({
            target: schema.notificationSettings.userId,
            set: {
              quietStartMinute: q.startMinute,
              quietEndMinute: q.endMinute,
              timeZone: q.timeZone,
              updatedAt: new Date(),
            },
          });
      }
      if (input.email !== undefined) {
        await tx
          .update(schema.users)
          .set({ email: input.email, updatedAt: new Date() })
          .where(eq(schema.users.id, viewer.sub));
      }
    });
    return this.getSettings(viewer);
  }

  async subscribePush(
    viewer: AuthedUser,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await db
      .insert(schema.pushSubscriptions)
      .values({ id: uuidv7(), userId: viewer.sub, endpoint: sub.endpoint, keys: sub.keys })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId: viewer.sub, keys: sub.keys },
      });
  }

  async unsubscribePush(viewer: AuthedUser, endpoint: string) {
    await db
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, viewer.sub),
          eq(schema.pushSubscriptions.endpoint, endpoint),
        ),
      );
  }

  /** Ops counters for the M4 "failed notification delivery" alert. */
  async deliveryHealth(hours = 24) {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await db
      .select({
        channel: schema.deliveryAttempts.channel,
        status: schema.deliveryAttempts.status,
        n: count(),
      })
      .from(schema.deliveryAttempts)
      .where(gte(schema.deliveryAttempts.createdAt, since))
      .groupBy(schema.deliveryAttempts.channel, schema.deliveryAttempts.status);
    const [dead] = await db
      .select({ n: count() })
      .from(schema.outboxDeliveries)
      .where(
        and(
          eq(schema.outboxDeliveries.consumer, 'notifications'),
          eq(schema.outboxDeliveries.status, 'dead'),
        ),
      );
    return {
      windowHours: hours,
      attempts: rows.map((r) => ({ ...r, n: Number(r.n) })),
      deadEvents: Number(dead?.n ?? 0),
    };
  }

  /** Message threads for the Inbox Messages tab: the viewer's match chats, newest first. */
  async conversations(viewer: AuthedUser) {
    const rows = await db.execute<{
      conversation_id: string;
      match_id: string;
      last_body: string | null;
      last_kind: string | null;
      last_at: Date | null;
      last_read_at: Date | null;
      opponent: string | null;
      game: string;
    }>(sql`
      select c.id as conversation_id, c.match_id,
        lm.body as last_body, lm.kind as last_kind, lm.created_at as last_at,
        cp.last_read_at,
        (select u.display_name from match_sides s join users u on u.id = s.user_id
          where s.match_id = c.match_id and s.user_id <> ${viewer.sub} limit 1) as opponent,
        g.name as game
      from conversation_participants cp
      join conversations c on c.id = cp.conversation_id and c.scope = 'match'
      join matches m on m.id = c.match_id
      join challenges ch on ch.id = m.challenge_id
      join games g on g.id = ch.game_id
      left join lateral (
        select body, kind, created_at from messages where conversation_id = c.id
        order by created_at desc, id desc limit 1
      ) lm on true
      where cp.user_id = ${viewer.sub}
      order by lm.created_at desc nulls last
      limit 50`);
    return rows.rows.map((r) => ({
      conversationId: r.conversation_id,
      matchId: r.match_id,
      opponent: r.opponent ?? 'Opponent',
      game: r.game,
      lastMessage: r.last_body,
      lastIsSystem: r.last_kind === 'system',
      lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
      unread: Boolean(
        r.last_at && (!r.last_read_at || new Date(r.last_at) > new Date(r.last_read_at)),
      ),
    }));
  }

  async markConversationRead(viewer: AuthedUser, conversationId: string) {
    const updated = await db
      .update(schema.conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, conversationId),
          eq(schema.conversationParticipants.userId, viewer.sub),
        ),
      )
      .returning({ id: schema.conversationParticipants.conversationId });
    if (updated.length === 0) throw new NotFoundException('Conversation not found');
  }
}
