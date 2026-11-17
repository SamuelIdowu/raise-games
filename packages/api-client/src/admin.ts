import { apiFetch } from './fetch';
import type { ReputationLevel } from './leaderboards';

/** Sprint 12 trust & operations console. Every call needs a staff role + MFA. */

export interface MfaStatus {
  enabled: boolean;
  verifiedAt: string | null;
  sessionValid: boolean;
}

export type QueueState = 'unassigned' | 'assigned' | 'awaiting_info' | 'resolved';
export type RulingOutcome = 'side0_win' | 'side1_win' | 'draw' | 'void';

export interface Sla {
  startedAt: string;
  dueAt: string;
  breached: boolean;
}

export interface QueueItem {
  id: string;
  matchId: string;
  status: string;
  source: string;
  category: string | null;
  reason: string;
  assignedToId: string | null;
  assignedName: string | null;
  createdAt: string;
  appealedAt: string | null;
  gameName: string;
  state: QueueState;
  sla: Sla;
}

export interface Standing {
  sanction: { id: string; type: string; step: number | null; endsAt: string | null } | null;
  loginBlocked: boolean;
  playBlocked: boolean;
  autoLimit: { limited: boolean; reasons: string[]; counts: Record<string, number> };
  canPlay: boolean;
}

export interface LadderPreview {
  step: 1 | 2 | 3 | 4;
  type: string;
  label: string;
  durationMs: number | null;
}

export interface ViewerPlayer {
  side: number;
  userId: string;
  username: string | null;
  inGameId: string;
  rating: number;
  provisional: boolean;
  rankLabel: string;
  reputation: ReputationLevel;
  disputeHistory: { opened: number; lost: number; total: number };
  standing: Standing;
  sanctionPreview: LadderPreview;
}

export interface DisputeViewer {
  dispute: {
    id: string;
    status: string;
    source: string;
    category: string | null;
    reason: string;
    detail: string | null;
    createdAt: string;
    assignedToId: string | null;
    state: QueueState;
    sla: Sla;
  };
  match: {
    id: string;
    status: string;
    gameName: string;
    formatName: string;
    startsAt: string;
    winnerSide: number | null;
  } | null;
  players: ViewerPlayer[];
  submissions: Array<{
    id: string;
    submitterId: string;
    kind: string;
    result: string;
    score: { self?: number; opponent?: number } | null;
    uploadId: string | null;
    note: string | null;
    submittedAt: string;
  }>;
  evidence: Array<{
    id: string;
    submittedById: string;
    note: string | null;
    uploadId: string | null;
    createdAt: string;
  }>;
  proof: Array<{
    uploadId: string;
    ownerId: string;
    status: string;
    urls: { full: string; thumb: string } | null;
    flag: {
      kind: 'reused' | 'similar';
      earlierMatchId: string | null;
      distance: number | null;
    } | null;
  }>;
  chat: {
    messages: Array<{
      id: string;
      senderId: string | null;
      kind: string;
      body: string;
      createdAt: string;
    }>;
    digest: string;
  };
  rulings: Array<{ round: number; createdAt: string }>;
  ratingEvents: Array<{ userId: string; kind: string; delta: number; reason: string }>;
  notes: Array<{ id: string; body: string; authorName: string | null; createdAt: string }>;
  templates: ReadonlyArray<{ key: string; outcome: RulingOutcome | null; text: string }>;
}

export interface AdminUserRow {
  id: string;
  displayName: string | null;
  phoneMasked: string;
  role: string;
  createdAt: string;
  sanctioned: boolean;
}

export interface AdminUserDetail {
  id: string;
  displayName: string | null;
  phoneMasked: string;
  role: string;
  createdAt: string;
  mfaEnabled: boolean;
  reputation: ReputationLevel;
  standing: Standing;
  sanctionPreview: LadderPreview;
  sanctions: Array<{
    id: string;
    type: string;
    step: number | null;
    reason: string;
    source: string;
    startsAt: string;
    endsAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }>;
  profiles: Array<{
    gameName: string;
    rating: number;
    ratedMatches: number;
    wins: number;
    losses: number;
    draws: number;
  }>;
  sharedDevices: Array<{ deviceId: string; otherAccounts: number }>;
  reports: Array<{ id: string; reason: string; status: string; createdAt: string }>;
}

export interface ReportItem {
  kind: 'report' | 'message';
  id: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  subject_type: string;
  subject_id: string;
  subject_user_id: string | null;
  reporter_name: string | null;
  body_snapshot: string | null;
  match_id: string | null;
}

export interface Dashboard {
  queue: {
    unassigned: number;
    assigned: number;
    awaitingInfo: number;
    slaBreached: number;
    oldestOpenAt: string | null;
  };
  openReports: number;
  hashFlags30d: number;
  openChatFlags: number;
  stuckMatches: number;
  activeSanctions: number;
  stuck: Array<{
    id: string;
    status: string;
    confirmationDeadline: string | null;
    resultDeadline: string | null;
    updatedAt: string;
  }>;
  metrics: {
    windowDays: number;
    disputesOpened: number;
    disputeRate: number;
    medianResolutionMs: number | null;
  };
}

export interface AuditRow {
  id: string;
  action: string;
  objectType: string | null;
  objectId: string | null;
  actorId: string | null;
  actorName: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const patch = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const adminApi = {
  mfaStatus: () => apiFetch<MfaStatus>('/admin/mfa'),
  mfaSetup: () => post<{ secret: string; otpauthUri: string }>('/admin/mfa/setup'),
  mfaEnable: (code: string) => post<MfaStatus>('/admin/mfa/enable', { code }),
  mfaVerify: (code: string) => post<MfaStatus>('/admin/mfa/verify', { code }),

  dashboard: () => apiFetch<Dashboard>('/admin/dashboard'),

  queue: (q: { state?: QueueState; mine?: boolean; cursor?: string; limit?: number } = {}) =>
    apiFetch<{ items: QueueItem[]; nextCursor: string | null }>(
      `/admin/queue/disputes${qs({ ...q, mine: q.mine ? 'true' : undefined })}`,
    ),
  assign: (id: string, force = false) =>
    post<{ id: string; assignedToId: string }>(`/admin/disputes/${id}/assign`, { force }),
  unassign: (id: string) => post<{ id: string }>(`/admin/disputes/${id}/unassign`),
  viewer: (id: string) => apiFetch<DisputeViewer>(`/admin/disputes/${id}/viewer`),
  addNote: (id: string, body: string) =>
    post<{ id: string }>(`/admin/disputes/${id}/notes`, { body }),
  decide: (
    id: string,
    body: {
      outcome: RulingOutcome;
      justification: string;
      sanction?: { userId: string; reason: string } | null;
    },
  ) =>
    post<{ ruling: unknown; sanction: { step: number; type: string } | null }>(
      `/admin/disputes/${id}/decide`,
      body,
    ),

  users: (q: { q?: string; cursor?: string; limit?: number } = {}) =>
    apiFetch<{ items: AdminUserRow[]; nextCursor: string | null }>(`/admin/users${qs(q)}`),
  user: (id: string) => apiFetch<AdminUserDetail>(`/admin/users/${id}`),
  revealPhone: (id: string, why: string) =>
    post<{ phone: string }>(`/admin/users/${id}/reveal-phone`, { why }),
  sanction: (id: string, reason: string, step?: number) =>
    post<{ step: number; type: string }>(`/admin/users/${id}/sanctions`, { reason, step }),
  revokeSanction: (id: string, note: string) =>
    post<{ id: string }>(`/admin/sanctions/${id}/revoke`, { note }),
  setRole: (id: string, role: 'player' | 'moderator' | 'admin') =>
    patch<{ id: string; role: string }>(`/admin/users/${id}/role`, { role }),
  bulkSanction: (userIds: string[], reason: string, batchId: string) =>
    post<{ results: Array<{ userId: string; ok: boolean; step?: number; error?: string }> }>(
      '/admin/bulk/sanctions',
      { userIds, reason, batchId },
    ),
  clearFraud: (userIds: string[], note: string) =>
    post<{ cleared: number }>('/admin/bulk/clear-fraud', { userIds, note }),

  reports: (status: 'open' | 'dismissed' | 'actioned' = 'open', limit = 50) =>
    apiFetch<{ items: ReportItem[] }>(`/admin/queue/reports${qs({ status, limit })}`),
  resolveReports: (body: {
    items: Array<{ kind: 'report' | 'message'; id: string }>;
    resolution: 'dismissed' | 'actioned';
    note: string;
    sanctionUserId?: string | null;
  }) => post<{ changed: number }>('/admin/reports/resolve', body),

  signals: () => apiFetch<Record<string, Array<Record<string, unknown>>>>('/admin/signals'),

  flags: () =>
    apiFetch<
      Array<{
        id: string;
        key: string;
        stage: string;
        jurisdiction: string | null;
        enabled: boolean;
      }>
    >('/admin/flags'),
  setFlag: (id: string, enabled: boolean) =>
    patch<{ id: string; enabled: boolean }>(`/admin/flags/${id}`, { enabled }),
  games: () =>
    apiFetch<
      Array<{
        id: string;
        key: string;
        name: string;
        status: string;
        formats: Array<{
          id: string;
          key: string;
          name: string;
          status: string;
          tiebreakRules: string | null;
        }>;
      }>
    >('/admin/games'),
  updateFormat: (
    id: string,
    body: { status?: 'enabled' | 'disabled'; name?: string; tiebreakRules?: string },
  ) => patch<{ id: string }>(`/admin/formats/${id}`, body),
  audit: (
    q: {
      action?: string;
      actorId?: string;
      objectId?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) => apiFetch<{ items: AuditRow[]; nextCursor: string | null }>(`/admin/audit${qs(q)}`),
};
