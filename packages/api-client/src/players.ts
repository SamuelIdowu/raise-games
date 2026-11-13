import { apiFetch } from './fetch';

export interface PlayerCard {
  userId: string;
  username: string;
  game: { key: string; name: string };
  inGameId: string;
  rating: number;
  rankTier: string;
  rankLabel: string;
  provisional: boolean;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  record: string;
  campus: string | null;
  city: string | null;
  reputation: 'new';
}

export interface PlayerSearchQuery {
  game?: string;
  rank?: 'rookie' | 'challenger' | 'contender' | 'elite' | 'champion';
  campus?: string;
  city?: string;
  cursor?: string;
  limit?: number;
}

export interface PlayerSearchResponse {
  items: PlayerCard[];
  nextCursor: string | null;
}

export const playersApi = {
  search: (query: PlayerSearchQuery = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
    return apiFetch<PlayerSearchResponse>(`/players/search?${params.toString()}`);
  },
};
