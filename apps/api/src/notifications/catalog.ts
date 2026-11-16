/**
 * Stage 1 notification catalog (Sprint 11, F11.2; UX "Notifications catalog").
 *
 * Templates live in code (not DB strings): they ship with the events that fill them, are
 * typed, and are translated by adding a locale map. The same keys and params are stored on
 * each notification so the web client can re-render in the player's language.
 *
 * Roster invites and friend requests arrive with their sprints; `sanction_applied` is wired
 * now (Sprint 12 emits `sanction.applied`).
 */

export const NOTIFICATION_TYPES = [
  'challenge_received',
  'challenge_accepted',
  'challenge_declined',
  'challenge_expiring',
  'result_needs_confirmation',
  'result_auto_confirmed',
  'dispute_opened',
  'dispute_ruled',
  'no_show_reported',
  'new_message',
  'sanction_applied',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Params = Record<string, string | number | null>;

interface CatalogEntry {
  /** Preference group shown on the preferences screen. */
  group: 'challenges' | 'results' | 'disputes' | 'messages' | 'account';
  /** Default channel switches (in-app is always on). */
  defaults: { push: boolean; email: boolean };
  /** Critical notifications ignore quiet hours and cannot be switched off (TA). */
  critical: boolean;
  icon: string;
  title: (p: Params) => string;
  body: (p: Params) => string;
  link: (p: Params) => string;
}

const name = (p: Params, key = 'opponent') => String(p[key] ?? 'Your opponent');

export const CATALOG: Record<NotificationType, CatalogEntry> = {
  challenge_received: {
    group: 'challenges',
    defaults: { push: true, email: false },
    critical: false,
    icon: 'flag',
    title: (p) => `${name(p, 'from')} challenged you`,
    body: (p) => `${p.game}. Accept or decline before it expires.`,
    link: () => '/play',
  },
  challenge_accepted: {
    group: 'challenges',
    defaults: { push: true, email: true },
    critical: false,
    icon: 'check',
    title: (p) => `${name(p)} accepted your challenge`,
    body: (p) => `${p.game}. Open the match room to agree the details.`,
    link: (p) => `/matches/${p.matchId}`,
  },
  challenge_declined: {
    group: 'challenges',
    defaults: { push: false, email: false },
    critical: false,
    icon: 'ban',
    title: (p) => `${name(p)} declined your challenge`,
    body: (p) => `${p.game}. Your challenge is closed.`,
    link: () => '/play',
  },
  challenge_expiring: {
    group: 'challenges',
    defaults: { push: true, email: false },
    critical: false,
    icon: 'hourglass',
    title: () => 'Your challenge expires soon',
    body: (p) => `${p.game} closes in under an hour if nobody accepts.`,
    link: () => '/play',
  },
  result_needs_confirmation: {
    group: 'results',
    defaults: { push: true, email: true },
    critical: false,
    icon: 'clock',
    title: (p) => `${name(p)} submitted a result`,
    body: () => 'Confirm it or submit your own within 24 hours, or it is confirmed automatically.',
    link: (p) => `/matches/${p.matchId}`,
  },
  result_auto_confirmed: {
    group: 'results',
    defaults: { push: true, email: false },
    critical: false,
    icon: 'check-circle',
    title: () => 'Result confirmed automatically',
    body: () => 'No response within 24 hours, so the submitted result now stands.',
    link: (p) => `/matches/${p.matchId}`,
  },
  dispute_opened: {
    group: 'disputes',
    defaults: { push: true, email: true },
    critical: true,
    icon: 'alert-triangle',
    title: () => 'A dispute was opened',
    body: () => 'A moderator will review both results, the evidence and the chat.',
    link: (p) => `/matches/${p.matchId}`,
  },
  dispute_ruled: {
    group: 'disputes',
    defaults: { push: true, email: true },
    critical: true,
    icon: 'check-circle',
    title: () => 'A moderator ruled on your dispute',
    body: () => 'Open the match to see the ruling and the reason.',
    link: (p) => `/matches/${p.matchId}`,
  },
  no_show_reported: {
    group: 'results',
    defaults: { push: true, email: true },
    critical: true,
    icon: 'flag',
    title: (p) => `${name(p)} reported a no-show`,
    body: () => 'Contest it within 24 hours or the match counts as a forfeit.',
    link: (p) => `/matches/${p.matchId}`,
  },
  new_message: {
    group: 'messages',
    defaults: { push: true, email: false },
    critical: false,
    icon: 'mail',
    title: (p) =>
      Number(p.count ?? 1) > 1
        ? `${p.count} new messages from ${name(p)}`
        : `New message from ${name(p)}`,
    // Never the message text: notification bodies leave the app (push, email).
    body: () => 'Open the match chat to read it.',
    link: (p) => `/matches/${p.matchId}`,
  },
  sanction_applied: {
    group: 'account',
    defaults: { push: true, email: true },
    critical: true,
    icon: 'shield',
    title: () => 'An action was taken on your account',
    body: (p) => String(p.summary ?? 'See your account for details.'),
    link: () => '/profile',
  },
};

export function render(type: NotificationType, params: Params) {
  const entry = CATALOG[type];
  return { title: entry.title(params), body: entry.body(params), link: entry.link(params) };
}

/**
 * Quiet hours: true when `now` falls inside [start, end) in the user's timezone. Windows
 * may wrap midnight (e.g. 22:00–07:00). Returns the end instant so deliveries can wait.
 */
export function quietUntil(
  now: Date,
  settings: { quietStartMinute: number | null; quietEndMinute: number | null; timeZone: string },
): Date | null {
  const { quietStartMinute: start, quietEndMinute: end } = settings;
  if (start === null || end === null || start === end) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const minute = h * 60 + m;
  const inside = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!inside) return null;
  const minutesLeft = (end - minute + 1440) % 1440 || 1440;
  return new Date(now.getTime() + minutesLeft * 60_000 - now.getSeconds() * 1000);
}
