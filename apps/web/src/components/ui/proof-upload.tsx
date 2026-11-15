'use client';

import { useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { ProofUploadState } from '@/lib/use-proof-upload';
import { Button } from './button';
import { Icon } from './icons';
import { Spinner } from './spinner';

export interface ProofUploadCopy {
  pick: string;
  camera: string;
  compressing: string;
  uploading: (pct: number) => string;
  processing: string;
  offline: string;
  failed: string;
  retry: string;
  remove: string;
  replace: string;
  ready: (kb: number) => string;
}

export interface ProofUploadProps {
  label: string;
  help: string;
  state: ProofUploadState;
  copy: ProofUploadCopy;
  onPick: (file: File) => void;
  onRetry: () => void;
  onRemove: () => void;
  error?: string;
  className?: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Screenshot field for the result sheet (Design §8): camera or gallery, preview
 * thumbnail, progress, retry and remove; offline and failed states never lose
 * the picked file. Status text is announced politely (Design §10).
 */
export function ProofUpload({
  label,
  help,
  state,
  copy,
  onPick,
  onRetry,
  onRemove,
  error,
  className,
}: ProofUploadProps) {
  const id = useId();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };

  const preview = state.status === 'idle' ? null : state.previewUrl;
  const busy =
    state.status === 'compressing' || state.status === 'uploading' || state.status === 'processing';

  const statusLine = (() => {
    switch (state.status) {
      case 'compressing':
        return copy.compressing;
      case 'uploading':
        return copy.uploading(state.progress);
      case 'processing':
        return copy.processing;
      case 'offline':
        return copy.offline;
      case 'failed':
        return state.message || copy.failed;
      case 'ready':
        return copy.ready(state.sizeKb);
      default:
        return null;
    }
  })();

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span id={`${id}-label`} className="text-body-sm text-fg-muted">
        {label}
      </span>

      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handle}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handle}
      />

      {state.status === 'idle' ? (
        <div
          className={cn(
            'flex flex-col gap-2 rounded-card border border-dashed bg-raised p-3',
            error ? 'border-loss' : 'border-line-strong',
          )}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => galleryRef.current?.click()}
              aria-describedby={`${id}-help`}
            >
              <span className="inline-flex items-center gap-2">
                <Icon name="image" size={20} />
                {copy.pick}
              </span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => cameraRef.current?.click()}
              aria-describedby={`${id}-help`}
            >
              <span className="inline-flex items-center gap-2">
                <Icon name="camera" size={20} />
                {copy.camera}
              </span>
            </Button>
          </div>
          <p id={`${id}-help`} className="text-caption text-fg-muted">
            {help}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            'flex items-start gap-3 rounded-card border bg-raised p-3',
            state.status === 'failed' ? 'border-loss' : 'border-line',
          )}
        >
          <div className="relative size-24 shrink-0 overflow-hidden rounded-card border border-line bg-surface">
            {preview ? (
              // Local object URL of the user's own file; never a remote screenshot.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-full object-cover" />
            ) : null}
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center bg-scrim text-fg">
                <Spinner />
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p
              role="status"
              aria-live="polite"
              className={cn(
                'flex items-start gap-1 text-body-sm',
                state.status === 'failed'
                  ? 'text-loss'
                  : state.status === 'ready'
                    ? 'text-fg'
                    : 'text-fg-muted',
              )}
            >
              {state.status === 'failed' ? (
                <Icon name="alert-triangle" size={16} className="mt-0.5 shrink-0" />
              ) : null}
              {state.status === 'offline' ? (
                <Icon name="wifi-off" size={16} className="mt-0.5 shrink-0" />
              ) : null}
              {state.status === 'ready' ? (
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent" />
              ) : null}
              <span>{statusLine}</span>
            </p>

            {state.status === 'uploading' ? (
              <div
                className="h-1 w-full overflow-hidden rounded-[2px] bg-overlay"
                role="progressbar"
                aria-label={copy.uploading(state.progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.progress}
              >
                {/* Transform-only animation (Design §5). */}
                <div
                  className="h-full w-full origin-left bg-accent transition-transform duration-[var(--motion-micro)] ease-standard"
                  style={{ transform: `scaleX(${state.progress / 100})` }}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {state.status === 'failed' || state.status === 'offline' ? (
                <Button size="md" variant="secondary" onClick={onRetry}>
                  <span className="inline-flex items-center gap-2">
                    <Icon name="refresh" size={16} />
                    {copy.retry}
                  </span>
                </Button>
              ) : null}
              {state.status === 'ready' ? (
                <Button size="md" variant="ghost" onClick={() => galleryRef.current?.click()}>
                  {copy.replace}
                </Button>
              ) : null}
              <Button size="md" variant="ghost" onClick={onRemove} aria-label={copy.remove}>
                <Icon name="trash" size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <p className="flex items-center gap-1 text-caption text-loss">
          <Icon name="alert-triangle" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
