'use client';

import { useSyncExternalStore } from 'react';
import {
  ServerEvents,
  isAuthenticated,
  matchesApi,
  notificationsApi,
  type MatchView,
  type NotificationItem,
} from '@raise/api-client';
import { getSocket } from './realtime';

/**
 * App-wide badge state (Sprint 11, F11.5): unread notifications (Inbox badge) and matches
 * that need the viewer's action (Matches badge + needs-action banner). Live over the
 * shared socket: `notification:unread` keeps every tab in sync, match-state changes
 * refresh the needs-action list, and everything re-syncs on reconnect.
 */
export interface NeedsAction {
  matchId: string;
  game: string;
  opponent: string;
  action: 'submit_result' | 'confirm_or_submit';
}

interface BadgeState {
  unread: number;
  needsAction: NeedsAction[];
  /** The newest notification received live, for a polite announcement. */
  latest: NotificationItem | null;
}

const EMPTY: BadgeState = { unread: 0, needsAction: [], latest: null };
let state: BadgeState = EMPTY;
const listeners = new Set<() => void>();
let started = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function set(patch: Partial<BadgeState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function toNeedsAction(m: MatchView): NeedsAction | null {
  if (m.nextAction !== 'submit_result' && m.nextAction !== 'confirm_or_submit') return null;
  return {
    matchId: m.id,
    game: m.game.name,
    opponent: m.opponent?.username ?? 'Opponent',
    action: m.nextAction,
  };
}

async function refreshAll() {
  try {
    const [{ unread }, active] = await Promise.all([
      notificationsApi.unreadCount(),
      matchesApi.list('active'),
    ]);
    set({
      unread,
      needsAction: active.items.map(toNeedsAction).filter((x): x is NeedsAction => x !== null),
    });
  } catch {
    // Signed out or offline: keep the last known badges.
  }
}

/** Coalesce bursts of match events into one refresh. */
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshAll();
  }, 400);
}

function start() {
  if (started || typeof window === 'undefined' || !isAuthenticated()) return;
  started = true;
  void refreshAll();
  const socket = getSocket();
  if (!socket) return;
  socket.on(ServerEvents.NotificationUnread, (e: { unread: number }) => set({ unread: e.unread }));
  socket.on(ServerEvents.NotificationNew, (n: NotificationItem) => set({ latest: n }));
  socket.on(ServerEvents.MatchState, scheduleRefresh);
  socket.on('connect', () => void refreshAll()); // catch up after a reconnect
}

export function setUnread(unread: number) {
  set({ unread });
}

export function useBadges(): BadgeState {
  return useSyncExternalStore(
    (listener) => {
      start();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    // Server render and hydration always see empty badges, so client-side navigations
    // (where the store is already filled) still hydrate without a mismatch.
    () => EMPTY,
  );
}
