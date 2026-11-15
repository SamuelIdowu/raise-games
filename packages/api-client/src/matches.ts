import { apiFetch } from './fetch';

export type MatchStatus =
  | 'open'
  | 'accepted'
  | 'in_progress'
  | 'awaiting_result'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'disputed'
  | 'resolved'
  | 'cancelled'
  | 'expired'
  | 'forfeited'
  | 'voided';

export type DeadlineKind = 'submit_result' | 'confirm_result';

export interface MatchPlayer {
  userId: string;
  username: string;
  rating: number;
  rankTier: string;
  rankLabel: string;
  provisional: boolean;
  record: string;
  reputation: 'new';
  gameId: string;
  side: number;
  isPoster: boolean;
  submittedAt: string | null;
}

/** GET /matches/:id — the match room hub (Sprint 7, F7.2). */
export interface MatchView {
  id: string;
  challengeId: string;
  status: MatchStatus;
  version: number;
  game: { key: string; name: string };
  format: { key: string; name: string };
  rules: string;
  timeWindow: { startsAt: string; endsAt: string };
  acceptedAt: string;
  resultSubmittedAt: string | null;
  completedAt: string | null;
  deadline: { kind: DeadlineKind; at: string } | null;
  me: MatchPlayer | null;
  players: MatchPlayer[];
  roomCode: string | null;
  roomCodeMode: 'none' | 'optional' | 'required';
  canSetRoomCode: boolean;
  chat: { locked: boolean; locksAt: string | null };
  viewerRole: 'participant' | 'staff';
}

export const matchesApi = {
  get: (id: string) => apiFetch<MatchView>(`/matches/${id}`),

  setRoomCode: (id: string, roomCode: string) =>
    apiFetch<{ roomCode: string }>(`/matches/${id}/room-code`, {
      method: 'PUT',
      body: JSON.stringify({ roomCode }),
    }),
};
