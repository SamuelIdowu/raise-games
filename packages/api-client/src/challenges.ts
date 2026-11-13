import { apiFetch } from './fetch';

export interface ChallengeCard {
  id: string;
  status: string;
  createdAt: string;
  game: { id: string; key: string; name: string };
  format: { id: string; key: string; name: string };
  timeWindow: { startsAt: string; endsAt: string };
  expiresAt: string;
  poster: {
    userId: string;
    username: string;
    rating: number;
    rankTier: string;
    rankLabel: string;
    provisional: boolean;
    wins: number;
    losses: number;
    draws: number;
    record: string;
    reputation: 'new';
  };
  stake: {
    amountMinor: number;
    currency: string;
    display: string;
    band: string | null;
  };
  ratingGap: null;
  isMine: boolean;
}

export interface BoardQuery {
  game?: string;
  status?: 'open' | 'all';
  mine?: 'true' | 'false';
  campus?: string;
  city?: string;
  cursor?: string;
  limit?: number;
  stakeBand?: string;
}

export interface BoardResponse {
  items: ChallengeCard[];
  nextCursor: string | null;
  needsActionCount: number;
}

export const challengesApi = {
  list: (query: BoardQuery = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
    return apiFetch<BoardResponse>(`/challenges?${params.toString()}`);
  },
};
