/**
 * WebSocket contract (Sprint 7, F7.1). One connection carries three namespaced channels
 * (TA "Real-time"): chat, live match state, and in-app notifications. Mirrored in
 * packages/api-client/src/realtime.ts — keep both in sync.
 *
 * Rooms: every socket joins `user:{userId}` on connect. `match:{matchId}` is joined only
 * through `match:subscribe`, after a server-side participant (or moderator) check.
 */

export const ServerEvents = {
  ChatMessage: 'chat:message',
  ChatLocked: 'chat:locked',
  MatchState: 'match:state',
  Notification: 'notification',
} as const;

export const ClientEvents = {
  MatchSubscribe: 'match:subscribe',
  MatchUnsubscribe: 'match:unsubscribe',
  ChatSend: 'chat:send',
} as const;

export interface ChatMessageDto {
  id: string;
  matchId: string;
  conversationId: string;
  senderId: string | null;
  kind: 'user' | 'system';
  body: string;
  clientMsgId: string | null;
  createdAt: string;
}

export interface MatchStateEvent {
  matchId: string;
  status: string;
  version: number;
  /** Event that caused the change, e.g. "match.created". */
  cause: string;
}

export interface ChatLockedEvent {
  matchId: string;
  lockedAt: string;
}

/**
 * Minimal in-app notification envelope. Sprint 11 owns the notification service,
 * preferences and persistence; Sprint 7 only emits the live event.
 */
export interface NotificationEvent {
  type: 'message.new' | 'match.updated';
  matchId: string;
  at: string;
}

export const matchRoom = (matchId: string) => `match:${matchId}`;
export const userRoom = (userId: string) => `user:${userId}`;

/** Ack shape for client → server events. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string; status: number };
