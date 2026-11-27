'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { playersApi, type PlayerCard } from '@raise/api-client';
import { Avatar, Icon, RatingBadge, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface PickedPlayer {
  userId: string;
  username: string;
}

/**
 * Find players of one game by name and pick up to `max` of them. Picked players show as
 * chips above the search; results already picked are marked, not hidden, so the list
 * does not jump while you add people.
 */
export function PlayerPicker({
  gameKey,
  value,
  onChange,
  max,
  label,
  helper,
}: {
  gameKey: string;
  value: PickedPlayer[];
  onChange: (next: PickedPlayer[]) => void;
  max: number;
  label: string;
  helper?: string;
}) {
  const ids = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const full = value.length >= max;

  useEffect(() => {
    const mine = ++seq.current;
    const term = q.trim();
    const t = setTimeout(() => {
      setLoading(true);
      playersApi
        .search({ game: gameKey, q: term || undefined, limit: 8 })
        .then((res) => {
          if (mine !== seq.current) return;
          setResults(res.items);
          setError(null);
        })
        .catch((e: Error) => mine === seq.current && setError(e.message))
        .finally(() => mine === seq.current && setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, gameKey]);

  const picked = (id: string) => value.some((p) => p.userId === id);
  const toggle = (p: PlayerCard) => {
    if (picked(p.userId)) onChange(value.filter((v) => v.userId !== p.userId));
    else if (max === 1) onChange([{ userId: p.userId, username: p.username }]);
    else if (!full) onChange([...value, { userId: p.userId, username: p.username }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${ids}-q`} className="text-body-sm text-fg">
          {label}
        </label>
        {max > 1 ? (
          <span className="text-caption text-fg-subtle tabular">
            {value.length}/{max}
          </span>
        ) : null}
      </div>

      {value.length > 0 ? (
        <ul aria-label="Picked players" className="flex flex-wrap gap-2">
          {value.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.userId !== p.userId))}
                aria-label={`Remove ${p.username}`}
                className="inline-flex h-10 items-center gap-2 rounded-control border border-accent bg-accent-subtle pl-1 pr-2.5 text-body-sm text-fg transition-colors hover:border-loss"
              >
                <Avatar username={p.username} size={32} />
                {p.username}
                <Icon name="x" size={14} className="text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          id={`${ids}-q`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username"
          autoComplete="off"
          aria-describedby={helper ? `${ids}-help` : undefined}
          className="h-11 w-full rounded-control border border-line bg-raised px-3 pr-9 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none lg:h-10"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner className="size-4" label="Searching" />
          </span>
        ) : null}
      </div>
      {helper ? (
        <p id={`${ids}-help`} className="text-caption text-fg-subtle">
          {helper}
        </p>
      ) : null}

      {error ? (
        <p className="text-caption text-loss">Could not search players. {error}</p>
      ) : results.length === 0 && !loading ? (
        <p className="rounded-control border border-dashed border-line-strong p-3 text-center text-caption text-fg-subtle">
          {q.trim() ? `No players named “${q.trim()}” play this game.` : 'No other players yet.'}
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
          {results.map((p) => {
            const on = picked(p.userId);
            const disabled = !on && full && max > 1;
            return (
              <li key={p.userId}>
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  disabled={disabled}
                  aria-pressed={on}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    on ? 'bg-accent-subtle' : 'hover:bg-surface',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Avatar username={p.username} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-fg">
                      {p.username}
                    </span>
                    <span className="block truncate text-caption text-fg-subtle tabular">
                      {p.rankLabel} · {p.record}
                    </span>
                  </span>
                  <RatingBadge value={p.rating} provisional={p.provisional} />
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 items-center justify-center rounded-xs border',
                      on
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-line-strong text-transparent',
                    )}
                  >
                    <Icon name="check" size={14} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
