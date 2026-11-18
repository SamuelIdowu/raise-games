import { ApiError, apiFetch } from './fetch';
import type { ChatMessage, MessagePage, ReportReason, SendResult } from './chat';

/** Sprint 14 restricted DMs. Every endpoint 404s while the `messaging.dm` flag is off. */

export type FriendState = 'none' | 'outgoing' | 'incoming' | 'friends';

export interface DmRelationship {
  self: boolean;
  friend: FriendState;
  /** Pending request id (outgoing or incoming), for cancel/accept/decline. */
  requestId: string | null;
  canMessage: boolean;
  blockedByMe: boolean;
  conversationId: string | null;
}

export interface FriendRequestItem {
  requestId: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface DmConversationItem {
  conversationId: string;
  userId: string;
  name: string;
  lastMessage: string | null;
  lastIsSystem: boolean;
  lastFromMe: boolean;
  lastAt: string | null;
  unread: boolean;
  muted: boolean;
}

export interface DmConversation {
  conversationId: string;
  other: { userId: string; name: string };
  muted: boolean;
  canSend: boolean;
  blockedByMe: boolean;
  /** Neutral copy shown instead of the composer when sending is not possible. */
  notice: string | null;
}

export type DmMessage = ChatMessage;

const page = (opts: { before?: string; after?: string; limit?: number }) => {
  const params = new URLSearchParams();
  if (opts.before) params.set('before', opts.before);
  if (opts.after) params.set('after', opts.after);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const dmApi = {
  /**
   * Whether DMs exist for this player. Resolves `null` when the flag is off (404), so
   * callers can hide every entry point; other errors reject.
   */
  status: async (): Promise<{ enabled: true; incomingRequests: number } | null> => {
    try {
      return await apiFetch<{ enabled: true; incomingRequests: number }>('/dm/status');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  relationship: (userId: string) => apiFetch<DmRelationship>(`/dm/relationship/${userId}`),

  requests: () =>
    apiFetch<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }>(
      '/dm/friend-requests',
    ),
  requestFriend: (userId: string) =>
    apiFetch<{ requestId: string | null; status: string }>('/dm/friend-requests', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  respond: (requestId: string, action: 'accept' | 'decline' | 'cancel') =>
    apiFetch<{ requestId: string; status: string }>(`/dm/friend-requests/${requestId}/${action}`, {
      method: 'POST',
    }),
  unfriend: (userId: string) => apiFetch<unknown>(`/dm/friends/${userId}`, { method: 'DELETE' }),

  list: () => apiFetch<{ items: DmConversationItem[] }>('/dm/conversations'),
  open: (userId: string) =>
    apiFetch<{ conversationId: string }>('/dm/conversations', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  get: (conversationId: string) => apiFetch<DmConversation>(`/dm/conversations/${conversationId}`),
  messages: (
    conversationId: string,
    opts: { before?: string; after?: string; limit?: number } = {},
  ) => apiFetch<MessagePage>(`/dm/conversations/${conversationId}/messages${page(opts)}`),
  send: (conversationId: string, body: string, clientMsgId: string) =>
    apiFetch<SendResult>(`/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, clientMsgId }),
    }),
  report: (conversationId: string, messageId: string, reason: ReportReason, note?: string) =>
    apiFetch<{ reportId: string | null; alreadyReported: boolean }>(
      `/dm/conversations/${conversationId}/messages/${messageId}/report`,
      { method: 'POST', body: JSON.stringify({ reason, note }) },
    ),
  mute: (conversationId: string, muted: boolean) =>
    apiFetch<{ muted: boolean }>(`/dm/conversations/${conversationId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ muted }),
    }),
  markRead: (conversationId: string) =>
    apiFetch<void>(`/dm/conversations/${conversationId}/read`, { method: 'POST' }),
};
