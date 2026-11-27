'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadsApi, type UploadPurpose } from '@raise/api-client';
import { compressImage } from './image-compress';
import { track } from './analytics';

/**
 * Screenshot upload state machine (Design §8 result sheet states: uploading,
 * offline with queue and retry, failed with retry, submitted).
 *
 *   idle → compressing → uploading(progress) → processing → ready
 *                    ↘ offline (auto-resumes on `online`) ↘ failed (manual retry)
 *
 * The compressed file is kept in memory so a retry never asks the user to pick
 * the file again.
 */
export type ProofUploadState =
  | { status: 'idle' }
  | { status: 'compressing'; previewUrl: string }
  | { status: 'uploading'; previewUrl: string; progress: number }
  | { status: 'processing'; previewUrl: string }
  | { status: 'offline'; previewUrl: string }
  | { status: 'failed'; previewUrl: string | null; message: string }
  | { status: 'ready'; previewUrl: string; uploadId: string; sizeKb: number };

const FALLBACK_ERROR = 'Could not upload the screenshot. Check your connection and try again.';

class OfflineError extends Error {}

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(FALLBACK_ERROR));
    xhr.onerror = () => reject(navigator.onLine ? new Error(FALLBACK_ERROR) : new OfflineError());
    xhr.ontimeout = () => reject(new Error(FALLBACK_ERROR));
    xhr.timeout = 60_000;
    xhr.send(body);
  });
}

export function useProofUpload(matchId: string, purpose: UploadPurpose) {
  const [state, setState] = useState<ProofUploadState>({ status: 'idle' });
  const fileRef = useRef<Blob | null>(null);
  const previewRef = useRef<string | null>(null);
  const runId = useRef(0);

  const setPreview = (url: string | null) => {
    if (previewRef.current && previewRef.current !== url) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
  };

  const run = useCallback(async () => {
    const file = fileRef.current;
    const previewUrl = previewRef.current;
    if (!file || !previewUrl) return;
    const id = ++runId.current;
    const live = () => id === runId.current;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState({ status: 'offline', previewUrl });
      return;
    }
    try {
      setState({ status: 'uploading', previewUrl, progress: 0 });
      const presigned = await uploadsApi.presign({
        matchId,
        purpose,
        contentType: file.type || 'image/jpeg',
        sizeBytes: file.size,
      });
      if (!live()) return;
      await putWithProgress(presigned.url, presigned.headers, file, (progress) => {
        if (live()) setState({ status: 'uploading', previewUrl, progress });
      });
      if (!live()) return;
      setState({ status: 'processing', previewUrl });
      const info = await uploadsApi.complete(presigned.uploadId);
      if (!live()) return;
      setState({
        status: 'ready',
        previewUrl,
        uploadId: info.id,
        sizeKb: Math.round(file.size / 1024),
      });
      track('result_proof_uploaded', { purpose, size_kb: Math.round(file.size / 1024) });
    } catch (err) {
      if (!live()) return;
      if (err instanceof OfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setState({ status: 'offline', previewUrl });
        return;
      }
      const message =
        err instanceof Error && err.message !== 'Failed to fetch' ? err.message : FALLBACK_ERROR;
      setState({ status: 'failed', previewUrl, message });
      track('result_proof_upload_failed', { purpose });
    }
  }, [matchId, purpose]);

  const pick = useCallback(
    async (file: File) => {
      const id = ++runId.current;
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);
      setState({ status: 'compressing', previewUrl });
      try {
        const compressed = await compressImage(file);
        if (id !== runId.current) return;
        fileRef.current = compressed.blob;
        await run();
      } catch {
        if (id !== runId.current) return;
        setState({ status: 'failed', previewUrl, message: 'This file is not a supported image.' });
      }
    },
    [run],
  );

  const retry = useCallback(() => void run(), [run]);

  const remove = useCallback(() => {
    runId.current++;
    fileRef.current = null;
    setPreview(null);
    setState({ status: 'idle' });
  }, []);

  // Offline queue: resume automatically when the connection comes back.
  useEffect(() => {
    if (state.status !== 'offline') return;
    const resume = () => void run();
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [state.status, run]);

  useEffect(() => () => setPreview(null), []);

  return { state, pick, retry, remove };
}
