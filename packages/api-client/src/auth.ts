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
  requestOtp: (phone: string, turnstileToken?: string) =>
    apiFetch<OtpRequestResponse>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone, turnstileToken }),
    }),

  verifyOtp: (phone: string, code: string) =>
    apiFetch<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
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

  updateMe: (data: UpdateMeRequest) =>
    apiFetch<MeResponse>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
