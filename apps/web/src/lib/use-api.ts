'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Tiny shared fetch cache for the signed-in app. Several widgets on one screen (the
 * dashboard, the rail) read the same lists; keyed entries make that one request, and
 * `refresh(key)` after a mutation updates every reader. Entries refetch when older than
 * `maxAgeMs` and when the tab becomes visible again.
 */
interface Entry<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  fetchedAt: number;
  promise: Promise<void> | null;
  fetcher: () => Promise<T>;
}

const entries = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function load(key: string) {
  const entry = entries.get(key);
  if (!entry || entry.promise) return;
  entry.loading = true;
  entries.set(key, { ...entry });
  emit(key);
  const promise = entry
    .fetcher()
    .then((data) => {
      entries.set(key, {
        ...entries.get(key)!,
        data,
        error: null,
        loading: false,
        fetchedAt: Date.now(),
        promise: null,
      });
    })
    .catch((err: unknown) => {
      entries.set(key, {
        ...entries.get(key)!,
        error: err instanceof Error ? err.message : 'Something went wrong.',
        loading: false,
        promise: null,
      });
    })
    .finally(() => emit(key));
  entries.set(key, { ...entries.get(key)!, promise });
}

/** Refetch one key, or every key that starts with `prefix:`. */
export function refresh(keyOrPrefix: string) {
  for (const key of entries.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) load(key);
  }
}

const EMPTY = { data: undefined, error: null, loading: true } as const;

export interface ApiState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useApi<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { maxAgeMs = 15_000 }: { maxAgeMs?: number } = {},
): ApiState<T> {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {};
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(listener);
      return () => listeners.get(key)?.delete(listener);
    },
    [key],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    () => (key ? (entries.get(key) as Entry<T> | undefined) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!key) return;
    const existing = entries.get(key);
    if (!existing) {
      entries.set(key, {
        data: undefined,
        error: null,
        loading: true,
        fetchedAt: 0,
        promise: null,
        fetcher,
      });
    } else {
      existing.fetcher = fetcher;
    }
    if (!existing || Date.now() - existing.fetchedAt > maxAgeMs) load(key);

    const onVisible = () => {
      const e = entries.get(key);
      if (document.visibilityState === 'visible' && e && Date.now() - e.fetchedAt > maxAgeMs) {
        load(key);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // The fetcher is captured per key; a new closure for the same key must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxAgeMs]);

  const reload = useCallback(() => {
    if (key) load(key);
  }, [key]);

  const state = snapshot ?? (key ? EMPTY : { ...EMPTY, loading: false });
  return {
    data: state.data as T | undefined,
    error: state.error,
    loading: state.loading && state.data === undefined,
    reload,
  };
}
