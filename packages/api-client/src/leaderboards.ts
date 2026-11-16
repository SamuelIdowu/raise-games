import { apiFetch } from './fetch';

export type ReputationLevel = 'new' | 'low' | 'reliable' | 'trusted';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  provisional: boolean;
  rankTier: string;
  rankLabel: string;
  wins: number;
  losses: number;
  draws: number;
  ratedMatches: number;
  campus: string | null;
  city: string | null;
  trend: { delta: number; direction: 'up' | 'down' | 'flat' };
  reputation: ReputationLevel;
}

export interface LeaderboardPage {
  game: { key: string; name: string };
  version: number;
  items: LeaderboardRow[];
  nextCursor: string | null;
  me: LeaderboardRow | null;
}

export interface LeaderboardQuery {
  campus?: string;
  city?: string;
  cursor?: string;
  limit?: number;
}

export const leaderboardsApi = {
  get: (gameKey: string, query: LeaderboardQuery = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== '') params.set(k, String(v));
    const qs = params.toString();
    return apiFetch<LeaderboardPage>(
      `/leaderboards/${encodeURIComponent(gameKey)}${qs ? `?${qs}` : ''}`,
    );
  },
};
