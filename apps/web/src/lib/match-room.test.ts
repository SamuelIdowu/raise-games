import { describe, expect, it } from 'vitest';
import type { ChatMessage, MatchPlayer, MatchStatus, MatchView } from '@raise/api-client';
import { stepStates } from '@/components/match/match-timeline';
import { primaryAction } from '@/components/match/primary-action';
import { statusDisplay } from './match-status';
import { mergeMessages, type ChatEntry } from './use-match-room';
import { formatAbsolute, formatDuration } from './time';

const me: MatchPlayer = {
  userId: 'me',
  username: 'Alice',
  rating: 1200,
  rankTier: 'rookie',
  rankLabel: 'Rookie',
  provisional: true,
  record: '0–0–0',
  reputation: 'new',
  gameId: 'alice_efb',
  side: 0,
  isPoster: true,
  submittedAt: null,
};

function view(
  status: MatchStatus,
  overrides: Partial<MatchView> = {},
): Pick<MatchView, 'status' | 'me' | 'viewerRole'> {
  return { status, me, viewerRole: 'participant', ...overrides };
}

describe('timeline step states', () => {
  it('maps live states to the current step', () => {
    expect(stepStates('accepted')).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(stepStates('awaiting_result')).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
    expect(stepStates('awaiting_confirmation')).toEqual([
      'done',
      'done',
      'done',
      'current',
      'upcoming',
    ]);
  });

  it('marks the confirm step blocked during a dispute', () => {
    expect(stepStates('disputed')[3]).toBe('blocked');
  });

  it('completes every step on confirmed and resolved', () => {
    expect(stepStates('confirmed').every((s) => s === 'done')).toBe(true);
    expect(stepStates('resolved').every((s) => s === 'done')).toBe(true);
  });

  it('stops after Accepted on side exits', () => {
    for (const s of ['cancelled', 'expired', 'forfeited', 'voided'] as const) {
      expect(stepStates(s)).toEqual(['done', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    }
  });
});

describe('status display (Design §7)', () => {
  it('uses accent only when the viewer must act', () => {
    expect(statusDisplay(view('awaiting_confirmation'))).toMatchObject({
      label: 'Needs confirmation',
      variant: 'accent',
      viewerMustAct: true,
    });
    expect(
      statusDisplay(
        view('awaiting_confirmation', { me: { ...me, submittedAt: '2026-11-14T10:00:00Z' } }),
      ),
    ).toMatchObject({ label: 'Waiting for opponent', variant: 'neutral', viewerMustAct: false });
  });

  it('never asks staff to act', () => {
    expect(
      statusDisplay(view('awaiting_result', { viewerRole: 'staff', me: null })).viewerMustAct,
    ).toBe(false);
  });

  it('keeps Confirmed neutral and side exits muted', () => {
    expect(statusDisplay(view('confirmed')).variant).toBe('neutral');
    expect(statusDisplay(view('forfeited'))).toMatchObject({
      label: 'Forfeited',
      variant: 'muted',
    });
    expect(statusDisplay(view('disputed')).variant).toBe('dispute');
  });
});

describe('primary action', () => {
  it('swaps with state and never disables silently', () => {
    const cases: Array<[MatchStatus, string]> = [
      ['accepted', 'Submit result'],
      ['awaiting_result', 'Submit result'],
      ['awaiting_confirmation', 'Confirm result'],
      ['disputed', 'Dispute in review'],
      ['confirmed', 'Back to matches'],
      ['cancelled', 'Back to matches'],
    ];
    for (const [status, label] of cases) {
      const spec = primaryAction(view(status));
      expect(spec?.label, status).toBe(label);
      if (!spec?.href) expect(spec?.disabledReason, status).toBeTruthy();
    }
  });

  it('shows waiting once the viewer has submitted', () => {
    expect(
      primaryAction(view('awaiting_confirmation', { me: { ...me, submittedAt: 'x' } }))?.label,
    ).toBe('Waiting for opponent');
  });

  it('has no action for staff', () => {
    expect(primaryAction(view('awaiting_result', { viewerRole: 'staff', me: null }))).toBeNull();
  });
});

describe('mergeMessages', () => {
  const msg = (id: string, createdAt: string, clientMsgId: string | null = null): ChatMessage => ({
    id,
    matchId: 'm',
    conversationId: 'c',
    senderId: 'me',
    kind: 'user',
    body: id,
    clientMsgId,
    createdAt,
  });

  it('replaces a pending send with the server copy by clientMsgId', () => {
    const pending: ChatEntry = {
      ...msg('local-1', '2026-11-14T10:00:05Z', 'cid-1'),
      delivery: 'sending',
    };
    const merged = mergeMessages([pending], [msg('srv-1', '2026-11-14T10:00:04Z', 'cid-1')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'srv-1', delivery: 'sent' });
  });

  it('dedupes by id and orders by time, keeping failed sends last', () => {
    const failed: ChatEntry = {
      ...msg('local-2', '2026-11-14T09:00:00Z', 'cid-2'),
      delivery: 'failed',
    };
    const a = msg('a', '2026-11-14T10:00:01Z');
    const b = msg('b', '2026-11-14T10:00:00Z');
    const merged = mergeMessages([failed, { ...a, delivery: 'sent' }], [a, b]);
    expect(merged.map((m) => m.id)).toEqual(['b', 'a', 'local-2']);
  });
});

describe('time formatting', () => {
  it('formats durations and reports passed deadlines as null', () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(2 * 3600_000 + 14 * 60_000)).toBe('2h 14m');
    expect(formatDuration(3 * 86_400_000 + 2 * 3600_000)).toBe('3d 2h');
  });

  it('formats absolute time in WAT', () => {
    const text = formatAbsolute('2026-11-14T20:30:00Z', 'Africa/Lagos');
    expect(text).toContain('21:30');
  });
});
