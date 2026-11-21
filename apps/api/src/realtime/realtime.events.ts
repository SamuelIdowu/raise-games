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
  /** Sprint 11: a persisted notification (NotificationDto). */
  NotificationNew: 'notification:new',
  /** Sprint 11: { unread } — keeps every tab's badge in sync. */
  NotificationUnread: 'notification:unread',
  /** Sprint 14: a direct message (DmMessageDto), sent to both players' user rooms. */
  DmMessage: 'dm:message',
  /** Audit B32: a challenge appeared on or left the board (BoardChangedEvent). */
  BoardChanged: 'board:changed',
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
/** Every socket joins this room on connect: open-board changes (audit B32). */
export const BOARD_ROOM = 'board';

export interface BoardChangedEvent {
  challengeId: string;
  gameId: string | null;
  change: 'created' | 'removed';
}
export const userRoom = (userId: string) => `user:${userId}`;

/** Ack shape for client → server events. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string; status: number };
