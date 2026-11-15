import { apiFetch } from './fetch';

export type ReportSubjectType = 'challenge' | 'user';
export type ReportReasonCode =
  'harassment' | 'hate' | 'cheating' | 'off_platform' | 'spam' | 'impersonation' | 'other';

export const reportsApi = {
  create: (input: {
    subjectType: ReportSubjectType;
    subjectId: string;
    reason: ReportReasonCode;
    note?: string;
  }) =>
    apiFetch<{ reportId: string; alreadyReported: boolean }>('/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
