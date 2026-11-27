'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';

/**
 * Current time, re-read every `intervalMs`.
 *
 * With Cache Components, Next.js prerenders client components and rejects reading the
 * clock in render (blocking-prerender-current-time-client), which broke `next build`.
 * The server snapshot is a fixed 0, so the prerender never touches the clock; on the
 * client the store reads it (once per tick, cached, so the snapshot is stable).
 */
export function useNow(intervalMs = 30_000): number {
  const current = useRef<number | null>(null);
  const subscribe = useCallback(
    (notify: () => void) => {
      const id = setInterval(() => {
        current.current = Date.now();
        notify();
      }, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  const getSnapshot = useCallback(() => (current.current ??= Date.now()), []);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
