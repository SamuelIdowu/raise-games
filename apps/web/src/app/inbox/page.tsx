'use client';

import { useState } from 'react';
import { Avatar, Banner, Button, EmptyState, Icon, Sheet, StatusChip } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/feature-flags';

const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    type: 'challenge_received',
    title: 'New challenge from Chioma_O',
    body: 'FIFA 25 • H2H • Free',
    time: '2m ago',
    unread: true,
  },
  {
    id: '2',
    type: 'challenge_accepted',
    title: 'TundePlays accepted your challenge',
    body: 'Call of Duty • Best of 3',
    time: '15m ago',
    unread: true,
  },
  {
    id: '3',
    type: 'result_submitted',
    title: 'Result submitted for RZ-1042',
    body: 'Chioma_O submitted 2–1 win',
    time: '1h ago',
    unread: false,
  },
  {
    id: '4',
    type: 'dispute_opened',
    title: 'Dispute opened on RZ-1040',
    body: 'Opponent claims wrong score',
    time: '3h ago',
    unread: true,
  },
  {
    id: '5',
    type: 'challenge_expiring',
    title: 'Your challenge RZ-1041 expires in 30m',
    body: 'FIFA 25 • Free',
    time: '4h ago',
    unread: false,
  },
  {
    id: '6',
    type: 'auto_confirmed',
    title: 'RZ-1039 auto-confirmed',
    body: 'You won +15 rating!',
    time: '1d ago',
    unread: false,
  },
  {
    id: '7',
    type: 'sanction',
    title: 'Warning issued',
    body: 'Late result submission',
    time: '2d ago',
    unread: false,
  },
];

const MOCK_MESSAGES = [
  {
    id: 'm1',
    username: 'Chioma_O',
    avatar: 'Chioma_O',
    lastMessage: 'GG! That was a close match.',
    time: '2m ago',
    unread: 1,
  },
  {
    id: 'm2',
    username: 'TundePlays',
    avatar: 'TundePlays',
    lastMessage: 'Ready when you are',
    time: '15m ago',
    unread: 0,
  },
];

const ENABLE_DM = FEATURE_FLAGS.restrictedDms;

export default function InboxPage() {
  const [activeTab, setActiveTab] = useState<'notifications' | 'messages' | 'preferences'>(
    'notifications',
  );
  const [selectedNotification, setSelectedNotification] = useState<
    (typeof MOCK_NOTIFICATIONS)[0] | null
  >(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-h1 font-semibold text-fg">Inbox</h1>
      </header>

      <div className="flex gap-2 border-b border-line">
        {(['notifications', 'messages', 'preferences'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSelectedNotification(null);
            }}
            className={`flex-1 py-2 px-4 font-display text-body-sm font-semibold rounded-t-card transition-colors ${
              activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-fg-muted hover:text-fg'
            }`}
            disabled={tab === 'messages' && !ENABLE_DM}
            aria-disabled={tab === 'messages' && !ENABLE_DM}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'messages' && !ENABLE_DM && (
              <Icon name="lock" size={14} className="ml-1 opacity-50" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'notifications' && (
        <NotificationsList notifications={MOCK_NOTIFICATIONS} onSelect={setSelectedNotification} />
      )}

      {activeTab === 'messages' && <MessagesList messages={MOCK_MESSAGES} enabled={ENABLE_DM} />}

      {activeTab === 'preferences' && <Preferences />}

      <Sheet
        open={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
        title="Notification"
        size="sm"
      >
        {selectedNotification && (
          <NotificationDetail
            notification={selectedNotification}
            onClose={() => setSelectedNotification(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

import { IconName } from '@/components/ui';

function NotificationDetail({
  notification,
  onClose,
}: {
  notification: (typeof MOCK_NOTIFICATIONS)[0];
  onClose: () => void;
}) {
  const typeConfig: Record<string, { icon: IconName; color: string }> = {
    challenge_received: { icon: 'mail', color: 'text-accent' },
    challenge_accepted: { icon: 'check-circle', color: 'text-win' },
    result_submitted: { icon: 'flag', color: 'text-accent' },
    dispute_opened: { icon: 'alert-triangle', color: 'text-dispute' },
    challenge_expiring: { icon: 'clock', color: 'text-loss' },
    auto_confirmed: { icon: 'check-circle', color: 'text-win' },
    sanction: { icon: 'alert-triangle', color: 'text-dispute' },
  };

  const config = typeConfig[notification.type] ?? {
    icon: 'info' as IconName,
    color: 'text-fg-muted',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex-shrink-0 size-12 rounded-[2px] flex items-center justify-center bg-accent-subtle ${config.color}`}
        >
          <Icon name={config.icon} size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-body font-semibold text-fg">{notification.title}</p>
          <p className="text-caption text-fg-muted">{notification.body}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-caption text-fg-muted">
        <span>{notification.time}</span>
        <span className="text-fg-subtle">•</span>
        <span>Notification ID: {notification.id}</span>
      </div>
      <div className="pt-2 border-t border-line flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function NotificationsList({
  notifications,
  onSelect,
}: {
  notifications: typeof MOCK_NOTIFICATIONS;
  onSelect: (n: (typeof MOCK_NOTIFICATIONS)[0]) => void;
}) {
  if (notifications.length === 0) {
    return <EmptyState icon="mail" title="No notifications" description="You're all caught up" />;
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <button
          key={n.id}
          onClick={() => onSelect(n)}
          className={`w-full flex items-start gap-3 p-3 rounded-card border text-left transition-colors ${
            n.unread
              ? 'border-accent bg-accent-subtle text-fg'
              : 'border-line bg-surface hover:border-line-strong'
          }`}
        >
          <div
            className={`flex-shrink-0 size-10 rounded-[2px] flex items-center justify-center ${
              n.type === 'challenge_received'
                ? 'bg-accent-subtle text-accent'
                : n.type === 'challenge_accepted'
                  ? 'bg-win/10 text-win'
                  : n.type === 'result_submitted'
                    ? 'bg-accent-subtle text-accent'
                    : n.type === 'dispute_opened'
                      ? 'bg-dispute/10 text-dispute'
                      : n.type === 'challenge_expiring'
                        ? 'bg-loss/10 text-loss'
                        : n.type === 'auto_confirmed'
                          ? 'bg-win/10 text-win'
                          : 'bg-surface text-fg-muted'
            }`}
          >
            <Icon
              name={
                (n.type === 'challenge_received'
                  ? 'mail'
                  : n.type === 'challenge_accepted'
                    ? 'check-circle'
                    : n.type === 'result_submitted'
                      ? 'flag'
                      : n.type === 'dispute_opened'
                        ? 'alert-triangle'
                        : n.type === 'challenge_expiring'
                          ? 'clock'
                          : n.type === 'auto_confirmed'
                            ? 'check-circle'
                            : 'info') as IconName
              }
              size={20}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`font-display text-body-sm font-semibold ${n.unread ? 'text-fg' : 'text-fg-muted'}`}
            >
              {n.title}
            </p>
            <p className="text-caption text-fg-muted truncate">{n.body}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-caption text-fg-muted">{n.time}</span>
            {n.unread && <span className="size-2 rounded-full bg-accent" aria-label="Unread" />}
          </div>
        </button>
      ))}
    </div>
  );
}

function MessagesList({ messages, enabled }: { messages: typeof MOCK_MESSAGES; enabled: boolean }) {
  if (!enabled) {
    return (
      <EmptyState
        icon="lock"
        title="Messages unavailable"
        description="Direct messages are restricted in Stage 1. Enable in settings when available."
        action={
          <Banner variant="system" className="max-w-md">
            DMs are pending owner confirmation for Stage 1. They will appear here once enabled.
          </Banner>
        }
      />
    );
  }

  if (messages.length === 0) {
    return (
      <EmptyState
        icon="mail"
        title="No messages yet"
        description="Complete a match to unlock direct messages"
      />
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <button
          key={m.id}
          className={`w-full flex items-center gap-3 p-3 rounded-card border text-left transition-colors ${
            m.unread
              ? 'border-accent bg-accent-subtle text-fg'
              : 'border-line bg-surface hover:border-line-strong'
          }`}
        >
          <Avatar username={m.avatar} size={32} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="font-display text-body font-semibold text-fg truncate">{m.username}</p>
              <span className="text-caption text-fg-muted">{m.time}</span>
            </div>
            <p className="text-caption text-fg-muted truncate">{m.lastMessage}</p>
          </div>
          {m.unread && (
            <span className="size-2 rounded-full bg-accent shrink-0" aria-label="Unread" />
          )}
        </button>
      ))}
    </div>
  );
}

function Preferences() {
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [sms, setSms] = useState(false);
  const [challengeAlerts, setChallengeAlerts] = useState(true);
  const [resultAlerts, setResultAlerts] = useState(true);
  const [disputeAlerts, setDisputeAlerts] = useState(true);
  const [marketing, setMarketing] = useState(false);

  return (
    <div className="space-y-6 max-w-md">
      <section>
        <h3 className="label-caps mb-3 text-fg-muted">Channels</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">Push notifications</span>
            <input
              type="checkbox"
              checked={push}
              onChange={(e) => setPush(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">Email</span>
            <input
              type="checkbox"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">SMS</span>
            <input
              type="checkbox"
              checked={sms}
              onChange={(e) => setSms(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
        </div>
      </section>

      <section>
        <h3 className="label-caps mb-3 text-fg-muted">Categories</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">Challenge alerts</span>
            <input
              type="checkbox"
              checked={challengeAlerts}
              onChange={(e) => setChallengeAlerts(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">Result alerts</span>
            <input
              type="checkbox"
              checked={resultAlerts}
              onChange={(e) => setResultAlerts(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">Dispute alerts</span>
            <input
              type="checkbox"
              checked={disputeAlerts}
              onChange={(e) => setDisputeAlerts(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-body text-fg">Marketing & updates</span>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
        </div>
      </section>

      <Banner variant="system" className="text-sm">
        You&apos;ll always receive critical notifications (disputes, sanctions, auto-confirmations)
        regardless of preferences.
      </Banner>
    </div>
  );
}
