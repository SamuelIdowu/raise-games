import { apiFetch } from './fetch';

export interface OtpRequestResponse {
  resendAfterSeconds: number;
  turnstileRequired?: boolean;
}

export interface OtpVerifyResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MeResponse {
  id: string;
  phone: string;
  displayName: string | null;
  role: string;
  jurisdictionState: string | null;
  identityTier: string;
  createdAt: string;
}

export interface UpdateMeRequest {
  displayName?: string;
  jurisdictionState?: string;
}

export const authApi = {
  /** `inviteCode` is needed for new numbers while the closed beta is invite-only (Sprint 16). */
  requestOtp: (phone: string, turnstileToken?: string, inviteCode?: string) =>
    apiFetch<OtpRequestResponse>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone, turnstileToken, inviteCode: inviteCode || undefined }),
    }),

  verifyOtp: (phone: string, code: string, inviteCode?: string) =>
    apiFetch<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code, inviteCode: inviteCode || undefined }),
    }),

  refresh: (refreshToken: string) =>
    apiFetch<OtpVerifyResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken: string) =>
    apiFetch<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logoutAll: () =>
    apiFetch<{ ok: boolean; revoked: number }>('/auth/logout-all', {
      method: 'POST',
    }),

  me: () => apiFetch<MeResponse>('/auth/me'),

  /** Audit B28: everything held about the player (right of access). */
  exportMe: () => apiFetch<Record<string, unknown>>('/auth/me/export'),

  /** Audit B28: delete the account; the username must be typed to confirm. */
  deleteMe: (confirmUsername: string) =>
    apiFetch<{ deleted: true }>('/auth/me/delete', {
      method: 'POST',
      body: JSON.stringify({ confirmUsername }),
    }),

  updateMe: (data: UpdateMeRequest) =>
    apiFetch<MeResponse>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
