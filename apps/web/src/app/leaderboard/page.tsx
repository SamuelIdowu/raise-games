'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  gamesApi,
  leaderboardsApi,
  type Game,
  type LeaderboardPage,
  type LeaderboardRow,
} from '@raise/api-client';
import {
  Avatar,
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  Icon,
  RatingBadge,
  SkeletonCard,
  PageHeader,
} from '@/components/ui';
import { cn } from '@/lib/cn';

const POLL_MS = 20_000;

/**
 * Leaderboards (Sprint 10, F10.4; Design §8 leaderboard row, UX Flow 8). Per game,
 * confirmed results only, campus/city filters, the viewer's row pinned to the bottom
 * whenever it is off-screen, top three marked with an accent notch.
 */
export default function LeaderboardPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [gameKey, setGameKey] = useState<string>('');
  const [scope, setScope] = useState<'all' | 'campus' | 'city'>('all');
  const [place, setPlace] = useState('');
  const [page, setPage] = useState<LeaderboardPage | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [meVisible, setMeVisible] = useState(true);
  const meRef = useRef<HTMLLIElement | null>(null);
  const versionRef = useRef<number | null>(null);

  useEffect(() => {
    gamesApi
      .list()
      .then((list) => {
        setGames(list);
        setGameKey((current) => current || list[0]?.key || '');
      })
      .catch(() => setError('Could not load games.'));
  }, []);

  const filter = scope !== 'all' && place.trim() ? { [scope]: place.trim() } : {};
  const filterKey = JSON.stringify(filter);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!gameKey) return;
    let live = true;
    const run = async (poll: boolean) => {
      try {
        const next = await leaderboardsApi.get(gameKey, { ...JSON.parse(filterKey), limit: 25 });
        if (!live) return;
        // Cheap freshness check: an unchanged version means an unchanged board.
        if (poll && next.version === versionRef.current) return;
        versionRef.current = next.version;
        setPage(next);
        setRows(next.items);
        setError(null);
      } catch (err) {
        if (live && !poll) {
          setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
        }
      }
    };
    // Filters changed: the next response replaces the board (old rows stay until then).
    versionRef.current = null;
    void run(false);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void run(true);
    }, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [gameKey, filterKey, reloadKey]);

  const loadMore = async () => {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await leaderboardsApi.get(gameKey, {
        ...JSON.parse(filterKey),
        limit: 25,
        cursor: page.nextCursor,
      });
      setRows((current) => [...current, ...next.items]);
      setPage((current) => (current ? { ...current, nextCursor: next.nextCursor } : next));
    } finally {
      setLoadingMore(false);
    }
  };

  // Pin the viewer's row when their in-list row is not on screen (Design §8).
  const me = page?.me ?? null;
  const meInList = !!me && rows.some((r) => r.userId === me.userId);
  useEffect(() => {
    const el = meRef.current;
    // No in-list row: the pin condition (`!meInList`) already shows the pinned row.
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setMeVisible(entry?.isIntersecting ?? false));
    io.observe(el);
    return () => io.disconnect();
  }, [rows, me?.userId]);

  const gameName = games.find((g) => g.key === gameKey)?.name ?? '';

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 pb-24">
      <PageHeader eyebrow="Top players" title="Leaderboard" />

      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap gap-2 border-b border-line bg-bg px-4 py-2">
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <span className="sr-only">Game</span>
          <select
            value={gameKey}
            onChange={(e) => setGameKey(e.target.value)}
            className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg focus:border-accent focus:outline-none"
          >
            {games.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[7rem] flex-col gap-1">
          <span className="sr-only">Area</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg focus:border-accent focus:outline-none"
          >
            <option value="all">Everywhere</option>
            <option value="campus">Campus</option>
            <option value="city">City</option>
          </select>
        </label>
        {scope !== 'all' ? (
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="sr-only">{scope === 'campus' ? 'Campus name' : 'City name'}</span>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder={scope === 'campus' ? 'e.g. UNILAG' : 'e.g. Lagos'}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
          </label>
        ) : null}
        <label className="flex min-w-[7rem] flex-col gap-1">
          <span className="sr-only">Period</span>
          {/* Seasons come later (F10.3); all-time is the only period today. */}
          <select
            value="all_time"
            disabled
            aria-describedby="period-note"
            className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg-muted"
          >
            <option value="all_time">All-time</option>
          </select>
          <span id="period-note" className="sr-only">
            Seasonal leaderboards are coming later.
          </span>
        </label>
      </div>

      {error && !page ? (
        <Banner
          variant="system"
          action={
            <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          }
        >
          {error}
        </Banner>
      ) : null}

      {!page && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {page && rows.length === 0 ? (
        <EmptyState
          icon="trophy"
          title={`No ranked players${gameName ? ` in ${gameName}` : ''} yet`}
          description="Players appear here after their first confirmed match."
          action={
            <ButtonLink href="/play" arrow>
              Find a challenge
            </ButtonLink>
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <ol aria-label={`${gameName} leaderboard`} className="flex flex-col">
          {rows.map((row) => (
            <Row
              key={row.userId}
              row={row}
              mine={row.userId === me?.userId}
              ref={row.userId === me?.userId ? meRef : undefined}
            />
          ))}
        </ol>
      ) : null}

      {page?.nextCursor ? (
        <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
          Show more
        </Button>
      ) : null}

      {me && (!meInList || !meVisible) ? (
        <div
          className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-line-strong bg-raised px-4 sm:bottom-0"
          aria-label="Your position"
        >
          <ol className="mx-auto max-w-[640px]">
            <Row row={me} mine />
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  row,
  mine,
  ref,
}: {
  row: LeaderboardRow;
  mine: boolean;
  ref?: React.Ref<HTMLLIElement>;
}) {
  const top3 = row.rank <= 3;
  const trendLabel =
    row.trend.direction === 'flat'
      ? 'No change this week'
      : `${row.trend.direction === 'up' ? 'Up' : 'Down'} ${Math.abs(row.trend.delta)} this week`;
  return (
    <li
      ref={ref}
      aria-current={mine ? 'true' : undefined}
      className={cn(
        'relative flex min-h-14 items-center gap-3 border-b border-line px-3',
        mine && 'bg-accent-subtle',
      )}
    >
      {/* Top three: accent notch (Design §8); tier is never shown by colour alone. */}
      {top3 ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-accent" /> : null}
      <span
        className={cn(
          'w-8 shrink-0 text-right font-display text-stat-md font-semibold tabular',
          top3 ? 'text-accent' : 'text-fg-muted',
        )}
        aria-label={`Rank ${row.rank}`}
      >
        {row.rank}
      </span>
      <Avatar username={row.username} size={32} />
      <Link
        href={`/profile/${row.userId}`}
        className="min-w-0 flex-1 truncate text-body text-fg hover:underline"
      >
        {row.username}
        {mine ? <span className="sr-only"> (you)</span> : null}
      </Link>
      <RatingBadge value={row.rating} provisional={row.provisional} />
      <span
        className="hidden w-14 text-right text-body-sm text-fg-muted tabular sm:inline"
        aria-label={`Record ${row.wins} wins, ${row.losses} losses`}
      >
        {row.wins}–{row.losses}
      </span>
      <span className="flex w-12 items-center justify-end gap-0.5 text-caption tabular text-fg-muted">
        <Icon
          name={
            row.trend.direction === 'up'
              ? 'trend-up'
              : row.trend.direction === 'down'
                ? 'trend-down'
                : 'minus'
          }
          size={16}
        />
        <span aria-hidden>{row.trend.direction === 'flat' ? '' : Math.abs(row.trend.delta)}</span>
        <span className="sr-only">{trendLabel}</span>
      </span>
    </li>
  );
}
