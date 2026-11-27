'use client';

import {
  ServerEvents,
  challengesApi,
  leaderboardsApi,
  matchesApi,
  notificationsApi,
  profilesApi,
  type BoardQuery,
} from '@raise/api-client';
import { getSocket } from './realtime';
import { refresh, useApi } from './use-api';

/**
 * Live updates for the shared lists: the same socket events the badges and the board
 * already use. Bursts (expiry sweeps) are coalesced into one refetch per namespace.
 */
let live = false;
const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};
function soon(ns: string) {
  if (timers[ns]) return;
  timers[ns] = setTimeout(() => {
    timers[ns] = undefined;
    refresh(ns);
  }, 800);
}
function ensureLive() {
  if (live || typeof window === 'undefined') return;
  const socket = getSocket();
  if (!socket) return;
  live = true;
  socket.on(ServerEvents.MatchState, () => {
    soon('matches');
    soon('leaderboard');
  });
  socket.on(ServerEvents.BoardChanged, () => soon('challenges'));
  socket.on(ServerEvents.NotificationNew, () => soon('notifications'));
  socket.on('connect', () => {
    soon('matches');
    soon('challenges');
    soon('notifications');
  });
}

/**
 * Shared reads for the signed-in app. Keys are namespaced so a mutation can call
 * `refresh('matches')` or `refresh('challenges')` and every widget on screen updates.
 */
export function useMyProfiles() {
  ensureLive();
  return useApi('profiles:me', () => profilesApi.listMine(), { maxAgeMs: 60_000 });
}

export function useMatches(scope: 'active' | 'finished' | 'all') {
  ensureLive();
  return useApi(`matches:${scope}`, () => matchesApi.list(scope));
}

export function useBoard(query: BoardQuery) {
  ensureLive();
  const key = `challenges:${JSON.stringify(query)}`;
  return useApi(key, () => challengesApi.list(query));
}

export function useMyOpenChallenges(game?: string) {
  ensureLive();
  return useBoard({ mine: 'true', status: 'open', game, limit: 10 });
}

export function useChallengesForMe(game?: string) {
  ensureLive();
  return useBoard({ forMe: 'true', status: 'open', game, limit: 10 });
}

export function useLeaderboard(gameKey: string, limit = 50) {
  ensureLive();
  return useApi(`leaderboard:${gameKey}:${limit}`, () => leaderboardsApi.get(gameKey, { limit }), {
    maxAgeMs: 60_000,
  });
}

export function useNotifications() {
  ensureLive();
  return useApi('notifications:list', () => notificationsApi.list());
}
