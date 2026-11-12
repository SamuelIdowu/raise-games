import { apiFetch } from './fetch';

export interface ConsentStatus {
  current: { terms: string; privacy: string };
  accepted: { terms: boolean; privacy: boolean };
  playAllowed: boolean;
}

export interface AcceptConsentRequest {
  termsType: 'terms' | 'privacy';
  termsVersion: string;
}

export const consentApi = {
  status: () => apiFetch<ConsentStatus>('/consent/status'),

  accept: (data: AcceptConsentRequest) =>
    apiFetch<ConsentStatus>('/consent/accept', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
