import { apiFetch } from './fetch';

export type DisputeCategory =
  'wrong_score' | 'wrong_winner' | 'opponent_cheated' | 'no_show' | 'disconnect' | 'other';
export type DisputeStatus = 'open' | 'awaiting_info' | 'reviewed' | 'ruled' | 'appealed' | 'final';
export type RulingOutcome = 'side0_win' | 'side1_win' | 'draw' | 'void';

export interface DisputeTrackerStep {
  key: 'opened' | 'review' | 'ruled' | 'appeal' | 'final';
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export interface DisputeRuling {
  round: 1 | 2;
  outcome: RulingOutcome;
  outcomeForViewer: 'win' | 'loss' | 'draw' | 'void' | null;
  justification: string;
  sanctionNote: string | null;
  ruledAt: string;
}

/** GET /matches/:id/dispute — identical for both players apart from "my" evidence. */
export interface DisputeView {
  id: string;
  matchId: string;
  status: DisputeStatus;
  source: string;
  category: DisputeCategory | null;
  reason: string;
  openedByViewer: boolean;
  openedAt: string;
  slaStartedAt: string;
  tracker: DisputeTrackerStep[];
  myEvidence: Array<{
    id: string;
    uploadId: string | null;
    note: string | null;
    createdAt: string;
  }>;
  opponentEvidenceCount: number;
  canAddEvidence: boolean;
  evidenceRemaining: number;
  ruling: DisputeRuling | null;
  previousRuling: DisputeRuling | null;
  appeal: { canAppeal: boolean; blockedReason: string | null; appealedByViewer: boolean };
}

export const disputesApi = {
  forMatch: (matchId: string) =>
    apiFetch<{ dispute: DisputeView | null }>(`/matches/${matchId}/dispute`),

  open: (
    matchId: string,
    body: { category: DisputeCategory; detail: string; uploadIds?: string[] },
  ) =>
    apiFetch<DisputeView>(`/matches/${matchId}/dispute`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addEvidence: (disputeId: string, body: { uploadId?: string; note?: string }) =>
    apiFetch<DisputeView>(`/disputes/${disputeId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  appeal: (disputeId: string, reason: string) =>
    apiFetch<DisputeView>(`/disputes/${disputeId}/appeal`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
