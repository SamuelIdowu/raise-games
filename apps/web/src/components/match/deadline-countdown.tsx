'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatAbsolute, formatDuration } from '@/lib/time';

/**
 * Relative countdown; tap to show the absolute time in the user's timezone (WAT by
 * default) — Design §8 Match timeline. Ticks every second under an hour, every 30s
 * above, and is not itself a live region (the room announces state changes instead,
 * so screen readers are not flooded with ticks).
 */
export function DeadlineCountdown({
  at,
  label,
  now: fixedNow,
  className,
}: {
  at: string;
  label: string;
  /** Freeze time (stories, tests). */
  now?: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => fixedNow ?? Date.now());
  const [absolute, setAbsolute] = useState(false);
  const remaining = new Date(at).getTime() - now;

  useEffect(() => {
    if (fixedNow !== undefined) return;
    const step = remaining > 3600_000 ? 30_000 : 1000;
    const id = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(id);
  }, [fixedNow, remaining > 3600_000]); // eslint-disable-line react-hooks/exhaustive-deps

  const relative = formatDuration(remaining);
  const absoluteText = formatAbsolute(at);

  return (
    <button
      type="button"
      onClick={() => setAbsolute((v) => !v)}
      aria-label={`${label}: ${relative ? `${relative} left` : 'passed'}, ${absoluteText}. Tap to switch format.`}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-left font-display text-body font-semibold tabular',
        relative ? 'text-fg' : 'text-fg-muted',
        className,
      )}
    >
      <span className="text-caption font-normal text-fg-muted">{label}</span>
      <span aria-hidden>{absolute ? absoluteText : relative ? `${relative} left` : 'Passed'}</span>
    </button>
  );
}
