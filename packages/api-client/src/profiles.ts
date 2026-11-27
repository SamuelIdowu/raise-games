import { apiFetch } from './fetch';
import type { ReputationLevel } from './leaderboards';

export interface GameProfile {
  id: string;
  userId: string;
  displayName: string | null;
  gameId: string;
  gameKey: string;
  gameName: string;
  inGameId: string;
  city: string | null;
  campus: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  provisional: boolean;
  ratedMatches: number;
  rankTier: string;
  rankLabel: string;
  reputation: ReputationLevel;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProfileRequest {
  gameKey: string;
  inGameId: string;
  city?: string;
  campus?: string;
}

export const profilesApi = {
  listMine: () => apiFetch<GameProfile[]>('/profiles/me'),

  getMine: (gameKey: string) => apiFetch<GameProfile>(`/profiles/me/${gameKey}`),

  upsert: (data: UpsertProfileRequest) =>
    apiFetch<GameProfile>('/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPublic: (userId: string) => apiFetch<GameProfile[]>(`/profiles/${userId}`),
};
