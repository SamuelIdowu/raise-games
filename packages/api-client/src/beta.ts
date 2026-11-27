import { apiFetch } from './fetch';

/** Sprint 16 closed beta: gate status, waitlist, feedback, and the staff screens. */

export type Severity = 'S1' | 'S2' | 'S3' | 'S4';
export type FeedbackStatus = 'new' | 'triaged' | 'fixed' | 'wont_fix' | 'duplicate';
export type TrackStatus = 'on_track' | 'behind' | 'no_data';

export interface InviteCode {
  id: string;
  code: string;
  cohort: string;
  place: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  /** Masked for staff. */
  phone: string;
  place: string | null;
  createdAt: string;
  invitedAt: string | null;
  code: string | null;
}

export interface FeedbackItem {
  id: string;
  kind: 'bug' | 'idea' | 'other';
  body: string;
  page: string | null;
  appVersion: string | null;
  severity: Severity | null;
  status: FeedbackStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  reporter: string | null;
}

export interface OpenBySeverity {
  S1: number;
  S2: number;
  S3: number;
  S4: number;
  untriaged: number;
}

export interface BetaMetric {
  key:
    | 'registered'
    | 'challengeShare'
    | 'completedMatches'
    | 'autoConfirmShare'
    | 'disputeRate'
    | 'medianResolutionHours'
    | 'week4Retention';
  label: string;
  kind: 'count' | 'min' | 'max';
  target: number;
  unit: 'players' | 'matches' | 'share' | 'hours';
  prd: string;
  value: number | null;
  pace: number | null;
  status: TrackStatus;
}

export interface BetaMetrics {
  cohort: string | null;
  since: string;
  until: string;
  days: number;
  metrics: BetaMetric[];
  funnel: { signedUp: number; gameId: number; firstChallenge: number; firstCompletedMatch: number };
  retention: { eligible: number; retained: number };
  series: Array<{ day: string; signups: number; challenges: number; completed: number }>;
  feedback: OpenBySeverity;
  cohorts: string[];
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const betaApi = {
  status: () => apiFetch<{ inviteOnly: boolean }>('/beta/status'),
  joinWaitlist: (phone: string, place?: string) =>
    apiFetch<{ ok: true }>('/beta/waitlist', {
      method: 'POST',
      body: JSON.stringify({ phone, place: place || undefined }),
    }),
  sendFeedback: (body: {
    kind: 'bug' | 'idea' | 'other';
    body: string;
    page?: string;
    appVersion?: string;
  }) => apiFetch<{ id: string }>('/feedback', { method: 'POST', body: JSON.stringify(body) }),

  // ---- staff
  codes: () =>
    apiFetch<{
      inviteOnly: boolean;
      codes: InviteCode[];
      cohorts: Array<{ cohort: string; players: number }>;
    }>('/admin/beta/codes'),
  createCodes: (body: {
    cohort: string;
    place?: string | null;
    maxUses: number;
    expiresAt?: string | null;
    count: number;
  }) =>
    apiFetch<{ created: Array<{ id: string; code: string }> }>('/admin/beta/codes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCode: (
    id: string,
    body: { active?: boolean; maxUses?: number; expiresAt?: string | null },
  ) =>
    apiFetch<InviteCode>(`/admin/beta/codes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  waitlist: () => apiFetch<WaitlistEntry[]>('/admin/beta/waitlist'),
  inviteFromWaitlist: (id: string, codeId: string) =>
    apiFetch<{ phone: string; message: string }>(`/admin/beta/waitlist/${id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ codeId }),
    }),
  metrics: (q: { cohort?: string; since?: string } = {}) =>
    apiFetch<BetaMetrics>(`/admin/metrics${qs(q)}`),
  feedback: (q: { status?: FeedbackStatus | 'open'; severity?: Severity } = {}) =>
    apiFetch<{ items: FeedbackItem[]; openBySeverity: OpenBySeverity }>(`/admin/feedback${qs(q)}`),
  triage: (id: string, body: { severity?: Severity; status?: FeedbackStatus; note?: string }) =>
    apiFetch<FeedbackItem>(`/admin/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
