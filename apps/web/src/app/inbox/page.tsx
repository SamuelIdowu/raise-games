'use client';

import { Suspense, useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  dmApi,
  notificationsApi,
  type DmConversationItem,
  type FriendRequestItem,
  type InboxConversation,
  type NotificationItem,
  type NotificationSettings,
  type NotificationType,
} from '@raise/api-client';
import {
  Banner,
  Button,
  EmptyState,
  Icon,
  SkeletonCard,
  useToast,
  type IconName,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { setUnread, useBadges } from '@/lib/badges';
import { useDmEnabled } from '@/features/dm/dm-kit';
import { disablePush, enablePush, currentSubscription, pushSupport } from '@/lib/push';
import { formatClock, userTimeZone } from '@/lib/time';

type Tab = 'notifications' | 'messages' | 'preferences';

/**
 * Inbox (Sprint 11, F11.3; UX Flow 10): notifications grouped by day, match-chat threads,
 * direct messages and friend requests (Sprint 14, only while `messaging.dm` is on), and
 * per-type preferences with quiet hours.
 */
export default function InboxPage() {
  // useSearchParams needs a Suspense boundary under Cache Components.
  return (
    <Suspense fallback={<SkeletonCard />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const asked = params.get('tab');
    // Settings links to ?tab=preferences (notification email, per-type choices, quiet hours).
    return asked === 'messages' || asked === 'preferences' ? asked : 'notifications';
  });
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'notifications', label: 'Notifications' },
    { key: 'messages', label: 'Messages' },
    { key: 'preferences', label: 'Preferences' },
  ];
  return (
    <div className="mx-auto max-w-[640px] space-y-4">
      <h1 className="font-display text-h1 font-semibold text-fg">Inbox</h1>
      <div role="tablist" aria-label="Inbox" className="flex border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-11 flex-1 px-3 font-display text-body-sm font-semibold',
              tab === t.key
                ? 'border-b-2 border-accent text-accent'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'notifications' ? (
          <Notifications />
        ) : tab === 'messages' ? (
          <Messages />
        ) : (
          <Preferences />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- notifications

function dayLabel(iso: string): string {
  const tz = userTimeZone();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = fmt.format(new Date(iso));
  const today = fmt.format(new Date());
  const yesterday = fmt.format(new Date(Date.now() - 86_400_000));
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

function Notifications() {
  const router = useRouter();
  const { latest } = useBadges();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await notificationsApi.list();
      setItems(page.items);
      setNext(page.nextCursor);
      setUnread(page.unread);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // load() sets state only after its fetch resolves; the rule cannot see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // A notification that arrives live goes to the top (or replaces its batched row).
  useEffect(() => {
    if (!latest) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems((prev) => (prev ? [latest, ...prev.filter((n) => n.id !== latest.id)] : prev));
  }, [latest]);

  const open = async (n: NotificationItem) => {
    if (!n.read) {
      const { unread } = await notificationsApi.markRead([n.id]).catch(() => ({ unread: -1 }));
      if (unread >= 0) setUnread(unread);
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? prev);
    }
    router.push(n.link);
  };

  const markAll = async () => {
    const { unread } = await notificationsApi.markRead('all');
    setUnread(unread);
    setItems((prev) => prev?.map((x) => ({ ...x, read: true })) ?? prev);
  };

  if (error && !items)
    return <Banner variant="offline">Could not load notifications. {error}</Banner>;
  if (!items) {
    return (
      <div className="space-y-3" aria-busy="true">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon="mail"
        title="No notifications yet"
        description="Challenges, results and disputes show up here."
        action={
          <Link href="/play" className="text-accent hover:underline">
            Find a match
          </Link>
        }
      />
    );
  }

  const groups: Array<{ label: string; items: NotificationItem[] }> = [];
  for (const n of items) {
    const label = dayLabel(n.createdAt);
    const g = groups.at(-1);
    if (g?.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <div className="space-y-4">
      {items.some((n) => !n.read) ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={markAll}>
            Mark all as read
          </Button>
        </div>
      ) : null}
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="label-caps mb-2 text-fg-muted">{g.label}</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {g.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void open(n)}
                  className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left hover:bg-overlay"
                >
                  <Icon
                    name={(n.icon as IconName) ?? 'info'}
                    size={20}
                    className="mt-0.5 shrink-0 text-fg-muted"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-semibold text-fg">{n.title}</span>
                    <span className="block text-body-sm text-fg-muted">{n.body}</span>
                    <time dateTime={n.createdAt} className="text-caption text-fg-subtle">
                      {formatClock(n.createdAt)}
                    </time>
                  </span>
                  {!n.read ? (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-accent">
                      <span className="sr-only">Unread</span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {next ? (
        <div className="text-center">
          <Button
            variant="secondary"
            onClick={async () => {
              const page = await notificationsApi.list(next);
              setItems((prev) => [...(prev ?? []), ...page.items]);
              setNext(page.nextCursor);
            }}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- messages

function Messages() {
  const { enabled: dmOn } = useDmEnabled();
  return (
    <div className="space-y-6">
      {dmOn ? <DirectMessages /> : null}
      <section aria-labelledby="match-chats-heading" className="space-y-2">
        <h2 id="match-chats-heading" className={dmOn ? 'label-caps text-fg-muted' : 'sr-only'}>
          Match chats
        </h2>
        <MatchChats />
      </section>
    </div>
  );
}

/** Sprint 14: friend requests and DM conversations (rendered only while DMs are on). */
function DirectMessages() {
  const { toast } = useToast();
  const [dms, setDms] = useState<DmConversationItem[] | null>(null);
  const [requests, setRequests] = useState<{
    incoming: FriendRequestItem[];
    outgoing: FriendRequestItem[];
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([dmApi.list(), dmApi.requests()])
      .then(([list, reqs]) => {
        if (!live) return;
        setDms(list.items);
        setRequests(reqs);
      })
      .catch(() => {
        if (live) setDms([]);
      });
    return () => {
      live = false;
    };
  }, [tick]);

  const answer = async (r: FriendRequestItem, action: 'accept' | 'decline' | 'cancel') => {
    setBusy(r.requestId);
    try {
      await dmApi.respond(r.requestId, action);
      if (action === 'accept')
        toast({
          title: `You and ${r.name} are friends`,
          description: 'You can message each other now.',
        });
      setTick((t) => t + 1);
    } catch (e) {
      toast({
        title: 'Could not update the request',
        description: (e as Error).message,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {requests && (requests.incoming.length > 0 || requests.outgoing.length > 0) ? (
        <section aria-labelledby="requests-heading" className="space-y-2">
          <h2 id="requests-heading" className="label-caps text-fg-muted">
            Friend requests
          </h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {requests.incoming.map((r) => (
              <li
                key={r.requestId}
                className="flex min-h-11 flex-wrap items-center gap-2 px-4 py-3"
              >
                <Link
                  href={`/profile/${r.userId}`}
                  className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg hover:underline"
                >
                  {r.name}
                </Link>
                <Button
                  size="sm"
                  loading={busy === r.requestId}
                  onClick={() => void answer(r, 'accept')}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === r.requestId}
                  onClick={() => void answer(r, 'decline')}
                >
                  Decline
                </Button>
              </li>
            ))}
            {requests.outgoing.map((r) => (
              <li
                key={r.requestId}
                className="flex min-h-11 flex-wrap items-center gap-2 px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-body-sm text-fg">
                  <Link href={`/profile/${r.userId}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>{' '}
                  <span className="text-fg-muted">· Request sent</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === r.requestId}
                  onClick={() => void answer(r, 'cancel')}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="dm-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="dm-heading" className="label-caps text-fg-muted">
            Direct messages
          </h2>
          <Link
            href="/messages/blocked"
            className="flex min-h-11 items-center text-caption text-accent hover:underline"
          >
            Blocked players
          </Link>
        </div>
        {!dms ? (
          <SkeletonCard />
        ) : dms.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-fg-muted">
            You can message players you have finished a match with or added as friends. Open their
            profile to start.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {dms.map((c) => (
              <li key={c.conversationId}>
                <Link
                  href={`/messages/${c.conversationId}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-overlay"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-semibold text-fg">{c.name}</span>
                    <span className="block truncate text-body-sm text-fg-muted">
                      {c.lastMessage
                        ? `${c.lastFromMe ? 'You: ' : ''}${c.lastMessage}`
                        : 'No messages yet'}
                    </span>
                  </span>
                  {c.muted ? (
                    <span className="text-fg-subtle">
                      <Icon name="bell-off" size={14} aria-hidden />
                      <span className="sr-only">Muted</span>
                    </span>
                  ) : null}
                  {c.lastAt ? (
                    <time className="text-caption text-fg-subtle">{formatClock(c.lastAt)}</time>
                  ) : null}
                  {c.unread && !c.muted ? (
                    <span className="size-2 rounded-full bg-accent">
                      <span className="sr-only">Unread</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function MatchChats() {
  const [items, setItems] = useState<InboxConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notificationsApi
      .conversations()
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error && !items) return <Banner variant="offline">Could not load messages. {error}</Banner>;
  if (!items) return <SkeletonCard />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon="mail"
        title="No conversations yet"
        description="Each match has its own chat. It appears here once a challenge is accepted."
      />
    );
  }
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {items.map((c) => (
        <li key={c.conversationId}>
          <Link
            href={`/matches/${c.matchId}`}
            onClick={() =>
              void notificationsApi.markConversationRead(c.conversationId).catch(() => undefined)
            }
            className="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-overlay"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-semibold text-fg">
                {c.opponent} <span className="font-normal text-fg-muted">· {c.game}</span>
              </span>
              <span
                className={cn(
                  'block truncate text-body-sm',
                  c.lastIsSystem ? 'italic text-fg-muted' : 'text-fg-muted',
                )}
              >
                {c.lastMessage ?? 'No messages yet'}
              </span>
            </span>
            {c.lastAt ? (
              <time className="text-caption text-fg-subtle">{formatClock(c.lastAt)}</time>
            ) : null}
            {c.unread ? (
              <span className="size-2 rounded-full bg-accent">
                <span className="sr-only">Unread</span>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- preferences

const TYPE_LABELS: Record<NotificationType, string> = {
  challenge_received: 'Someone challenges you',
  challenge_accepted: 'Your challenge is accepted',
  challenge_declined: 'Your challenge is declined',
  challenge_expiring: 'Your challenge is about to expire',
  result_needs_confirmation: 'A result needs your confirmation',
  result_auto_confirmed: 'A result is confirmed automatically',
  dispute_opened: 'A dispute is opened',
  dispute_ruled: 'A dispute is ruled',
  no_show_reported: 'A no-show is reported against you',
  new_message: 'New match chat messages',
  sanction_applied: 'Action on your account',
  friend_request: 'Someone sends you a friend request',
  friend_accepted: 'Your friend request is accepted',
  new_direct_message: 'New direct messages',
};

const toTime = (m: number | null) =>
  m === null
    ? ''
    : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h! * 60 + m! : null;
};

function Preferences() {
  const { toast } = useToast();
  const ids = useId();
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [email, setEmail] = useState('');
  const [quiet, setQuiet] = useState({ start: '', end: '' });
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const support = typeof window === 'undefined' ? 'unsupported' : pushSupport();

  useEffect(() => {
    notificationsApi.settings().then((r) => {
      setS(r);
      setEmail(r.email ?? '');
      setQuiet({ start: toTime(r.quietHours.startMinute), end: toTime(r.quietHours.endMinute) });
    });
    void currentSubscription().then((sub) => setPushOn(Boolean(sub)));
  }, []);

  if (!s) return <SkeletonCard />;

  const toggle = (type: NotificationType, channel: 'push' | 'email') =>
    setS({
      ...s,
      types: s.types.map((t) => (t.type === type ? { ...t, [channel]: !t[channel] } : t)),
    });

  const save = async () => {
    setBusy(true);
    try {
      const updated = await notificationsApi.updateSettings({
        types: s.types
          .filter((t) => !t.critical)
          .map(({ type, push, email: e }) => ({ type, push, email: e })),
        quietHours: {
          startMinute: fromTime(quiet.start),
          endMinute: fromTime(quiet.end),
          timeZone: userTimeZone(),
        },
        email: email.trim() || null,
      });
      const sentLink =
        Boolean(updated.email) && !updated.emailVerified && updated.email !== s.email;
      setS(updated);
      toast({
        title: 'Preferences saved',
        description: sentLink ? `We sent a confirmation link to ${updated.email}.` : undefined,
        variant: 'status',
      });
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const togglePush = async () => {
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        await enablePush(s.push.publicKey!);
        setPushOn(true);
      }
    } catch (e) {
      toast({ title: 'Push notifications', description: (e as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${ids}-push`} className="space-y-2">
        <h2 id={`${ids}-push`} className="label-caps text-fg-muted">
          This device
        </h2>
        {!s.push.available ? (
          <p className="text-body-sm text-fg-muted">
            Push notifications are not available yet. Email is used instead.
          </p>
        ) : support === 'needs-install' ? (
          <p className="text-body-sm text-fg-muted">
            On iPhone, add RAISE to your home screen to get push notifications. Until then, email
            keeps you posted.
          </p>
        ) : support === 'denied' ? (
          <p className="text-body-sm text-fg-muted">
            Notifications are blocked for this site in your browser settings.
          </p>
        ) : support === 'unsupported' ? (
          <p className="text-body-sm text-fg-muted">
            This browser does not support push notifications. Email keeps you posted.
          </p>
        ) : (
          <Button variant="secondary" onClick={togglePush}>
            {pushOn ? 'Turn off push on this device' : 'Turn on push on this device'}
          </Button>
        )}
      </section>

      <section aria-labelledby={`${ids}-email`} className="space-y-2">
        <h2 id={`${ids}-email`} className="label-caps text-fg-muted">
          Email
        </h2>
        <label htmlFor={`${ids}-email-input`} className="block text-body-sm text-fg">
          Email address for notifications
        </label>
        <input
          id={`${ids}-email-input`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
        />
        <p className="text-caption text-fg-muted">
          Only used for notifications. Never shown to other players.
        </p>
        {s.email ? (
          s.emailVerified ? (
            <p className="flex items-center gap-1 text-caption text-fg-muted">
              <Icon name="check-circle" size={16} aria-hidden /> Confirmed
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-caption text-fg">
              <Icon name="alert-triangle" size={16} aria-hidden />
              <span>
                Not confirmed yet. Open the link we emailed to {s.email} to get email notifications.
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    const r = await notificationsApi.resendEmailConfirmation();
                    toast({
                      title: r.sent ? 'Confirmation link sent' : 'Nothing to confirm',
                      variant: 'status',
                    });
                  } catch (e) {
                    toast({
                      title: 'Could not send',
                      description: (e as Error).message,
                      variant: 'error',
                    });
                  }
                }}
              >
                Send the link again
              </Button>
            </div>
          )
        ) : null}
      </section>

      <section aria-labelledby={`${ids}-types`}>
        <h2 id={`${ids}-types`} className="label-caps mb-2 text-fg-muted">
          What you get
        </h2>
        <table className="w-full text-body-sm">
          <thead>
            <tr className="text-left text-caption text-fg-muted">
              <th className="py-1 font-normal">Notification</th>
              <th className="w-16 py-1 text-center font-normal">Push</th>
              <th className="w-16 py-1 text-center font-normal">Email</th>
            </tr>
          </thead>
          <tbody>
            {s.types.map((t) => (
              <tr key={t.type} className="border-t border-line">
                <td className="py-2 pr-2 text-fg">
                  {TYPE_LABELS[t.type]}
                  {t.critical ? (
                    <span className="block text-caption text-fg-muted">
                      Always on: important to your account
                    </span>
                  ) : null}
                </td>
                {(['push', 'email'] as const).map((channel) => (
                  <td key={channel} className="text-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--accent)]"
                      checked={t[channel]}
                      disabled={t.critical}
                      onChange={() => toggle(t.type, channel)}
                      aria-label={`${channel === 'push' ? 'Push' : 'Email'}: ${TYPE_LABELS[t.type]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-caption text-fg-muted">In-app notifications are always on.</p>
      </section>

      <section aria-labelledby={`${ids}-quiet`} className="space-y-2">
        <h2 id={`${ids}-quiet`} className="label-caps text-fg-muted">
          Quiet hours
        </h2>
        <p className="text-body-sm text-fg-muted">
          Push and email wait until quiet hours end. Disputes, no-shows and account actions still
          come through.
        </p>
        <div className="flex gap-3">
          <label className="flex-1 text-caption text-fg-muted">
            From
            <input
              type="time"
              value={quiet.start}
              onChange={(e) => setQuiet({ ...quiet, start: e.target.value })}
              className="mt-1 h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg"
            />
          </label>
          <label className="flex-1 text-caption text-fg-muted">
            To
            <input
              type="time"
              value={quiet.end}
              onChange={(e) => setQuiet({ ...quiet, end: e.target.value })}
              className="mt-1 h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg"
            />
          </label>
        </div>
        {quiet.start || quiet.end ? (
          <button
            type="button"
            className="min-h-11 text-caption text-fg-muted hover:text-fg"
            onClick={() => setQuiet({ start: '', end: '' })}
          >
            Clear quiet hours
          </button>
        ) : null}
      </section>

      <Button
        fullWidth
        loading={busy}
        onClick={save}
        disabled={Boolean(quiet.start) !== Boolean(quiet.end)}
        hint={
          Boolean(quiet.start) !== Boolean(quiet.end)
            ? 'Set both a start and an end time.'
            : undefined
        }
      >
        Save preferences
      </Button>
    </div>
  );
}
