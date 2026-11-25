'use client';

import {
  challengesApi,
  leaderboardsApi,
  matchesApi,
  notificationsApi,
  profilesApi,
  type BoardQuery,
} from '@raise/api-client';
import { useApi } from './use-api';

/**
 * Shared reads for the signed-in app. Keys are namespaced so a mutation can call
 * `refresh('matches')` or `refresh('challenges')` and every widget on screen updates.
 */
export function useMyProfiles() {
  return useApi('profiles:me', () => profilesApi.listMine(), { maxAgeMs: 60_000 });
}

export function useMatches(scope: 'active' | 'finished' | 'all') {
  return useApi(`matches:${scope}`, () => matchesApi.list(scope));
}

export function useBoard(query: BoardQuery) {
  const key = `challenges:${JSON.stringify(query)}`;
  return useApi(key, () => challengesApi.list(query));
}

export function useMyOpenChallenges(game?: string) {
  return useBoard({ mine: 'true', status: 'open', game, limit: 10 });
}

export function useChallengesForMe() {
  return useBoard({ forMe: 'true', status: 'open', limit: 10 });
}

export function useLeaderboard(gameKey: string, limit = 50) {
  return useApi(`leaderboard:${gameKey}:${limit}`, () => leaderboardsApi.get(gameKey, { limit }), {
    maxAgeMs: 60_000,
  });
}

export function useNotifications() {
  return useApi('notifications:list', () => notificationsApi.list());
}
