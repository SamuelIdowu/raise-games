import { HttpException, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  AccessDeniedError,
  checkSessionActive,
  verifyAccessToken,
  type AuthedUser,
} from '../auth/jwt-auth.guard';
import { ChatService } from '../chat/chat.service';
import { sendMessageSchema } from '../chat/chat.schemas';
import { MatchesService } from '../matches/matches.service';
import { RealtimePublisher } from './realtime.publisher';
import { ClientEvents, matchRoom, userRoom, type Ack } from './realtime.events';

interface SocketData {
  user: AuthedUser;
}
type AppSocket = Socket & { data: SocketData };

const subscribeSchema = z.object({ matchId: z.uuid() });
const chatSendSchema = sendMessageSchema.extend({ matchId: z.uuid() });

/** Max match rooms one socket may hold (a player has few live matches at once). */
const MAX_MATCH_ROOMS = 20;

function fail(error: unknown): { ok: false; error: string; status: number } {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? error.message);
    return {
      ok: false,
      error: Array.isArray(message) ? message.join('; ') : message,
      status: error.getStatus(),
    };
  }
  if (error instanceof z.ZodError) return { ok: false, error: 'Invalid payload', status: 400 };
  return { ok: false, error: 'Something went wrong', status: 500 };
}

/**
 * The single real-time connection (F7.1): chat, live match state, notifications.
 *
 * Auth: the access JWT is sent in the handshake (`auth.token`) and checked with the
 * same rules as the HTTP guard before the connection is accepted. Because a socket can
 * outlive a logout or a sanction, connected sockets are re-checked every minute and
 * disconnected when their session is no longer active.
 *
 * Authorization: rooms are joined only server-side. `match:{id}` requires being a
 * participant (or moderator/admin, read-only) — a client cannot name a room to join.
 */
@WebSocketGateway({ transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private server!: Server;
  private revalidateTimer: NodeJS.Timeout | null = null;

  static readonly REVALIDATE_MS = 60_000;

  constructor(
    private readonly jwt: JwtService,
    private readonly publisher: RealtimePublisher,
    private readonly matches: MatchesService,
    private readonly chat: ChatService,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    this.publisher.attach(server);

    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || token.length === 0) {
        return next(new Error('unauthenticated'));
      }
      verifyAccessToken(this.jwt, token)
        .then((user) => {
          (socket as AppSocket).data.user = user;
          void socket.join(userRoom(user.sub));
          next();
        })
        .catch((error: unknown) => {
          next(new Error(error instanceof AccessDeniedError ? error.reason : 'unauthenticated'));
        });
    });

    this.revalidateTimer = setInterval(() => {
      void this.revalidateSessions().catch((error: Error) =>
        this.logger.warn(`session revalidation failed: ${error.message}`),
      );
    }, RealtimeGateway.REVALIDATE_MS);
    this.revalidateTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.revalidateTimer) clearInterval(this.revalidateTimer);
  }

  /**
   * Disconnects this instance's sockets whose session was revoked, expired, or whose
   * account was suspended or deleted since they connected. Public for tests.
   */
  async revalidateSessions(): Promise<number> {
    if (!this.server) return 0;
    const sockets = (await this.server.local.fetchSockets()) as unknown as AppSocket[];
    const bySession = new Map<string, AppSocket[]>();
    for (const socket of sockets) {
      const user = socket.data.user;
      if (!user) continue;
      const key = `${user.sub}:${user.sid}`;
      bySession.set(key, [...(bySession.get(key) ?? []), socket]);
    }

    let dropped = 0;
    for (const [key, group] of bySession) {
      const [userId, sessionId] = key.split(':') as [string, string];
      try {
        const role = await checkSessionActive(userId, sessionId);
        for (const socket of group) socket.data.user.role = role; // pick up role changes
      } catch (error) {
        if (!(error instanceof AccessDeniedError)) throw error;
        for (const socket of group) {
          socket.emit('auth:revoked', { reason: error.reason });
          socket.disconnect(true);
          dropped += 1;
        }
      }
    }
    return dropped;
  }

  @SubscribeMessage(ClientEvents.MatchSubscribe)
  async subscribe(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<{ matchId: string; version: number; status: string }>> {
    try {
      const { matchId } = subscribeSchema.parse(body);
      const { match } = await this.matches.access(matchId, socket.data.user);
      const joined = [...socket.rooms].filter((r) => r.startsWith('match:')).length;
      if (!socket.rooms.has(matchRoom(matchId)) && joined >= MAX_MATCH_ROOMS) {
        return { ok: false, error: 'Too many match subscriptions', status: 429 };
      }
      await socket.join(matchRoom(matchId));
      // Current state in the ack, so a (re)subscribing client never misses a transition
      // that happened while it was disconnected.
      return { ok: true, data: { matchId, version: match.version, status: match.status } };
    } catch (error) {
      return fail(error);
    }
  }

  @SubscribeMessage(ClientEvents.MatchUnsubscribe)
  async unsubscribe(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<{ matchId: string }>> {
    try {
      const { matchId } = subscribeSchema.parse(body);
      await socket.leave(matchRoom(matchId));
      return { ok: true, data: { matchId } };
    } catch (error) {
      return fail(error);
    }
  }

  @SubscribeMessage(ClientEvents.ChatSend)
  async chatSend(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    try {
      const { matchId, body: text, clientMsgId } = chatSendSchema.parse(body);
      const result = await this.chat.send(socket.data.user, matchId, { body: text, clientMsgId });
      return { ok: true as const, data: result };
    } catch (error) {
      return fail(error);
    }
  }
}
