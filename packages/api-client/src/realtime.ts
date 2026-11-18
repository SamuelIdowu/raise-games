/**
 * WebSocket contract — mirror of apps/api/src/realtime/realtime.events.ts.
 * Transport is websocket-only (no long-polling); the HTTP endpoints are the fallback.
 */
export const ServerEvents = {
  ChatMessage: 'chat:message',
  ChatLocked: 'chat:locked',
  MatchState: 'match:state',
  Notification: 'notification',
  NotificationNew: 'notification:new',
  NotificationUnread: 'notification:unread',
  /** Sprint 14: a direct message (DmMessageDto), sent to both players' user rooms. */
  DmMessage: 'dm:message',
  AuthRevoked: 'auth:revoked',
} as const;

export const ClientEvents = {
  MatchSubscribe: 'match:subscribe',
  MatchUnsubscribe: 'match:unsubscribe',
  ChatSend: 'chat:send',
} as const;

export interface MatchStateEvent {
  matchId: string;
  status: string;
  version: number;
  cause: string;
}

export interface ChatLockedEvent {
  matchId: string;
  lockedAt: string;
}

export interface NotificationEvent {
  type: 'message.new' | 'match.updated';
  matchId: string;
  at: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string; status: number };
