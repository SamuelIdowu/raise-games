import { apiFetch } from './fetch';

export type NotificationType =
  | 'challenge_received'
  | 'challenge_accepted'
  | 'challenge_declined'
  | 'challenge_expiring'
  | 'result_needs_confirmation'
  | 'result_auto_confirmed'
  | 'dispute_opened'
  | 'dispute_ruled'
  | 'no_show_reported'
  | 'new_message'
  | 'sanction_applied';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  icon: string;
  title: string;
  body: string;
  link: string;
  params: Record<string, string | number | null>;
  count: number;
  read: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  types: Array<{
    type: NotificationType;
    group: 'challenges' | 'results' | 'disputes' | 'messages' | 'account';
    critical: boolean;
    push: boolean;
    email: boolean;
  }>;
  quietHours: { startMinute: number | null; endMinute: number | null; timeZone: string };
  email: string | null;
  push: { available: boolean; publicKey: string | null };
}

export interface InboxConversation {
  conversationId: string;
  matchId: string;
  opponent: string;
  game: string;
  lastMessage: string | null;
  lastIsSystem: boolean;
  lastAt: string | null;
  unread: boolean;
}

export const notificationsApi = {
  list: (before?: string) =>
    apiFetch<{ items: NotificationItem[]; nextCursor: string | null; unread: number }>(
      `/notifications${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  unreadCount: () => apiFetch<{ unread: number }>('/notifications/unread-count'),
  markRead: (ids: string[] | 'all') =>
    apiFetch<{ unread: number }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  settings: () => apiFetch<NotificationSettings>('/notifications/settings'),
  updateSettings: (body: {
    types?: Array<{ type: NotificationType; push: boolean; email: boolean }>;
    quietHours?: NotificationSettings['quietHours'];
    email?: string | null;
  }) =>
    apiFetch<NotificationSettings>('/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    apiFetch<void>('/notifications/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify(sub),
    }),
  unsubscribePush: (endpoint: string) =>
    apiFetch<void>('/notifications/push-subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
  conversations: () => apiFetch<{ items: InboxConversation[] }>('/inbox/conversations'),
  markConversationRead: (id: string) =>
    apiFetch<void>(`/inbox/conversations/${id}/read`, { method: 'POST' }),
};
