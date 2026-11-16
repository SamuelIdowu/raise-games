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
export type MatchOutcome = 'win' | 'loss' | 'draw';
export type SubmissionKind = 'result' | 'no_show' | 'confirmation';
export type ScoreModel = 'goals' | 'kills' | 'placement' | 'points';

export interface ScorePayload {
  self: number;
  opponent: number;
}

export interface MatchSubmission {
  kind: SubmissionKind;
  outcome: MatchOutcome | 'no_show';
  score: ScorePayload | null;
  note: string | null;
  submittedAt: string;
  uploadId: string | null;
}

export interface MatchPlayer {
  userId: string;
  username: string;
  rating: number;
  rankTier: string;
  rankLabel: string;
  provisional: boolean;
  record: string;
  reputation: import('./leaderboards').ReputationLevel;
  gameId: string;
  /** Same as gameId. */
  inGameId: string;
  wins: number;
  losses: number;
  draws: number;
  side: number;
  isPoster: boolean;
  submittedAt: string | null;
  submission: MatchSubmission | null;
}

export type MatchNextAction =
  | 'wait_for_start'
  | 'submit_result'
  | 'confirm_or_submit'
  | 'waiting_for_opponent'
  | 'disputed'
  | 'done'
  | 'closed';

/** GET /matches/:id — the match room (Sprint 7 hub + Sprint 8 results). */
export interface MatchView {
  id: string;
  challengeId: string;
  status: MatchStatus;
  version: number;
  game: { key: string; name: string };
  format: {
    key: string;
    name: string;
    resultSchema: { outcomeOptions: MatchOutcome[]; scoreModel: ScoreModel; drawAllowed: boolean };
    requiredProof: ('screenshot' | 'score' | 'none')[];
  };
  rules: string;
  timeWindow: { startsAt: string; endsAt: string };
  acceptedAt: string;
  resultSubmittedAt: string | null;
  completedAt: string | null;
  deadline: { kind: DeadlineKind; at: string } | null;
  /** Null when a moderator views as staff. */
  me: MatchPlayer | null;
  players: MatchPlayer[];
  opponent: MatchPlayer | null;
  roomCode: string | null;
  roomCodeMode: 'none' | 'optional' | 'required';
  canSetRoomCode: boolean;
  chat: { locked: boolean; locksAt: string | null };
  viewerRole: 'participant' | 'staff';
  agreedStartAt: string;
  resultDeadline: string;
  noShowAvailableAt: string;
  confirmationDeadline: string | null;
  winnerSide: number | null;
  decidedVia: string | null;
  outcomeForViewer: MatchOutcome | null;
  nextAction: MatchNextAction;
  ratingDelta: number | null;
  confirmedAt: string | null;
}

/**
 * The result components only render for participants, where `me` and `opponent` are set.
 */
export type MatchDetail = MatchView & { me: MatchPlayer; opponent: MatchPlayer };

export function isParticipantView(view: MatchView): view is MatchDetail {
  return view.viewerRole === 'participant' && view.me !== null && view.opponent !== null;
}

export interface SubmitResultRequest {
  outcome: MatchOutcome;
  score: ScorePayload;
  uploadId?: string;
  note?: string;
  idempotencyKey: string;
}

export interface ReportNoShowRequest {
  uploadId: string;
  note?: string;
  idempotencyKey: string;
}

export interface SubmitResultResponse {
  matchId: string;
  status: string;
  submissionId: string;
}

export const matchesApi = {
  list: (scope: 'active' | 'finished' | 'all' = 'all') =>
    apiFetch<{ items: MatchView[] }>(`/matches?scope=${scope}`),

  get: (id: string) => apiFetch<MatchView>(`/matches/${id}`),

  setRoomCode: (id: string, roomCode: string) =>
    apiFetch<{ roomCode: string }>(`/matches/${id}/room-code`, {
      method: 'PUT',
      body: JSON.stringify({ roomCode }),
    }),

  submitResult: (id: string, body: SubmitResultRequest) =>
    apiFetch<SubmitResultResponse>(`/matches/${id}/result`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reportNoShow: (id: string, body: ReportNoShowRequest) =>
    apiFetch<SubmitResultResponse>(`/matches/${id}/no-show`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  confirm: (id: string, idempotencyKey: string) =>
    apiFetch<SubmitResultResponse>(`/matches/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
};
