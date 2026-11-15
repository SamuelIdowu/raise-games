import { apiFetch } from './fetch';

export interface ChatMessage {
  id: string;
  matchId: string;
  conversationId: string;
  senderId: string | null;
  kind: 'user' | 'system';
  body: string;
  clientMsgId: string | null;
  createdAt: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export interface SendResult {
  message: ChatMessage;
  deduped: boolean;
}

export type ReportReason = 'harassment' | 'hate' | 'spam' | 'cheating' | 'off_platform' | 'other';

export const chatApi = {
  list: (matchId: string, opts: { before?: string; after?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.before) params.set('before', opts.before);
    if (opts.after) params.set('after', opts.after);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiFetch<MessagePage>(`/matches/${matchId}/chat/messages${qs ? `?${qs}` : ''}`);
  },

  /** HTTP fallback for sending while the socket is down. Same dedupe by clientMsgId. */
  send: (matchId: string, body: string, clientMsgId: string) =>
    apiFetch<SendResult>(`/matches/${matchId}/chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, clientMsgId }),
    }),

  report: (matchId: string, messageId: string, reason: ReportReason, note?: string) =>
    apiFetch<{ reportId: string | null; alreadyReported: boolean }>(
      `/matches/${matchId}/chat/messages/${messageId}/report`,
      { method: 'POST', body: JSON.stringify({ reason, note }) },
    ),

  block: (userId: string) => apiFetch<void>(`/blocks/${userId}`, { method: 'POST' }),
};
