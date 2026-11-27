'use client';

import { useEffect, useState } from 'react';
import { uploadsApi } from '@raise/api-client';
import { Icon, Skeleton } from '@/components/ui';

/**
 * Opponent's screenshot, shown only through a short-lived signed URL (Design §6:
 * screenshots are untrusted content). The 96px thumbnail lazy-loads; tapping
 * fetches a fresh signed URL for the full image.
 */
export function ProofThumbnail({ uploadId, label }: { uploadId: string; label: string }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    uploadsApi
      .signedUrl(uploadId, 'thumb')
      .then((r) => live && setThumb(r.url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [uploadId]);

  const openFull = async () => {
    try {
      const { url } = await uploadsApi.signedUrl(uploadId, 'full');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <span className="flex size-24 items-center justify-center rounded-card border border-line bg-raised text-fg-subtle">
        <Icon name="image" size={24} />
      </span>
    );
  }
  if (!thumb) return <Skeleton className="size-24 rounded-card" />;

  return (
    <button
      type="button"
      onClick={openFull}
      aria-label={label}
      className="size-24 shrink-0 overflow-hidden rounded-card border border-line bg-raised"
    >
      {/* Signed, expiring URL from private storage; next/image would proxy and cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
    </button>
  );
}
