import { apiFetch } from './fetch';

export type UploadPurpose = 'result_proof' | 'no_show_proof';

export interface PresignedUpload {
  uploadId: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface UploadInfo {
  id: string;
  status: 'pending' | 'ready' | 'rejected';
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  flagged: boolean;
}

export const uploadsApi = {
  presign: (body: {
    matchId: string;
    purpose: UploadPurpose;
    contentType: string;
    sizeBytes: number;
  }) =>
    apiFetch<PresignedUpload>('/uploads/presign', { method: 'POST', body: JSON.stringify(body) }),

  complete: (id: string) => apiFetch<UploadInfo>(`/uploads/${id}/complete`, { method: 'POST' }),

  signedUrl: (id: string, variant: 'full' | 'thumb' = 'full') =>
    apiFetch<{ url: string; expiresAt: string }>(`/uploads/${id}/url?variant=${variant}`),
};
