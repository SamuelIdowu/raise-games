'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  RatingBadge,
  ReputationBadge,
  Select,
  SkeletonCard,
  useToast,
} from '@/components/ui';
import { ChallengeCard } from '@/components/challenge/challenge-card';
import { useNow } from '@/lib/use-now';
import { ChallengeDetailSheet } from '@/components/challenge/challenge-detail-sheet';
import {
  CreateChallengeSheet,
  type DirectTarget,
} from '@/components/challenge/create-challenge-sheet';
import {
  challengesApi,
  gamesApi,
  playersApi,
  type BoardQuery,
  type ChallengeCard as ChallengeCardData,
  type Game,
  type PlayerCard as PlayerCardData,
  type PlayerSearchQuery,
} from '@raise/api-client';

const POLL_INTERVAL_MS = 20_000;
const RANKS = [
  { value: '', label: 'All ranks' },
  { value: 'rookie', label: 'Rookie' },
  { value: 'challenger', label: 'Challenger' },
  { value: 'contender', label: 'Contender' },
  { value: 'elite', label: 'Elite' },
  { value: 'champion', label: 'Champion' },
];

/**
 * Play tab (UX Flow 2–3; Sprint 5 F5.3 + Sprint 6 F6.4): game switcher, open challenge
 * board, challenges sent to the viewer, player search with a Challenge action, create
 * and detail sheets. Accepting goes straight to the match room.
 */
export default function PlayPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState('all');
  const [view, setView] = useState<'board' | 'players'>('board');

  const [challenges, setChallenges] = useState<ChallengeCardData[]>([]);
  const [forMe, setForMe] = useState<ChallengeCardData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState<{ target?: DirectTarget } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const now = useNow();

  useEffect(() => {
    gamesApi
      .list()
      .then(setGames)
      .catch(() => setGames([]));
  }, []);

  /** First page of the board plus direct challenges for me. Polls; never auto-pages. */
  const loadFirstPage = useCallback(async () => {
    const seq = ++requestSeq.current;
    const q: BoardQuery = { limit: 20 };
    if (selectedGame !== 'all') q.game = selectedGame;
    try {
      const [board, mine] = await Promise.all([
        challengesApi.list(q),
        challengesApi.list({ ...q, forMe: 'true' }),
      ]);
      if (seq !== requestSeq.current) return; // a newer request (game switch) won
      setChallenges(board.items);
      setForMe(mine.items);
      setNextCursor(board.nextCursor);
      setError(null);
    } catch (e) {
      if (seq === requestSeq.current)
        setError(e instanceof Error ? e.message : 'Could not load challenges');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [selectedGame]);

  useEffect(() => {
    // loadFirstPage sets state only after its fetch resolves; the rule cannot see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFirstPage();
    const id = setInterval(() => void loadFirstPage(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadFirstPage]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const q: BoardQuery = { limit: 20, cursor: nextCursor };
      if (selectedGame !== 'all') q.game = selectedGame;
      const page = await challengesApi.list(q);
      setChallenges((prev) => [
        ...prev,
        ...page.items.filter((c) => !prev.some((p) => p.id === c.id)),
      ]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      toast({ title: 'Could not load more', description: (e as Error).message, variant: 'error' });
    } finally {
      setLoadingMore(false);
    }
  };

  const all = [...forMe, ...challenges];
  const findChallenge = (id: string) => all.find((c) => c.id === id);

  const accept = async (c: ChallengeCardData) => {
    setPendingId(c.id);
    try {
      const { matchId } = await challengesApi.accept(c.id);
      toast({
        title: 'Challenge accepted',
        description: 'Opening the match room.',
        variant: 'status',
      });
      router.push(`/matches/${matchId}`);
    } catch (e) {
      toast({ title: 'Could not accept', description: (e as Error).message, variant: 'error' });
      void loadFirstPage();
    } finally {
      setPendingId(null);
    }
  };

  const decline = async (c: ChallengeCardData) => {
    setPendingId(c.id);
    try {
      await challengesApi.decline(c.id);
      setForMe((prev) => prev.filter((x) => x.id !== c.id));
      setDetailId(null);
      toast({ title: 'Challenge declined', variant: 'status' });
    } catch (e) {
      toast({ title: 'Could not decline', description: (e as Error).message, variant: 'error' });
    } finally {
      setPendingId(null);
    }
  };

  const cancel = async (c: ChallengeCardData) => {
    setPendingId(c.id);
    try {
      await challengesApi.cancel(c.id);
      setChallenges((prev) => prev.filter((x) => x.id !== c.id));
      toast({ title: 'Challenge cancelled', variant: 'status' });
    } catch (e) {
      toast({ title: 'Could not cancel', description: (e as Error).message, variant: 'error' });
    } finally {
      setPendingId(null);
    }
  };

  const detail = detailId ? findChallenge(detailId) : undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-h1 font-semibold text-fg">Play</h1>
        <Button onClick={() => setCreateOpen({})} disabled={games.length === 0}>
          Create challenge
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 sm:flex-none">
          <Select
            label="Game"
            value={selectedGame}
            options={[
              { value: 'all', label: 'All games' },
              ...games.map((g) => ({ value: g.key, label: g.name })),
            ]}
            onChange={(v) => {
              setSelectedGame(v);
              setLoading(true);
            }}
          />
        </div>
        <div role="tablist" aria-label="Play views" className="flex gap-2">
          {(['board', 'players'] as const).map((v) => (
            <Button
              key={v}
              role="tab"
              aria-selected={view === v}
              variant={view === v ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView(v)}
            >
              {v === 'board' ? 'Board' : 'Players'}
            </Button>
          ))}
        </div>
      </div>

      {view === 'board' ? (
        <div className="space-y-6">
          {forMe.length > 0 ? (
            <section aria-labelledby="for-me-heading" className="space-y-3">
              <h2 id="for-me-heading" className="label-caps text-accent">
                Challenges for you · {forMe.length}
              </h2>
              {forMe.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  pending={pendingId === c.id}
                  onAccept={() => accept(c)}
                  onDecline={() => decline(c)}
                  onCancel={() => setDetailId(c.id)}
                  onDetails={() => setDetailId(c.id)}
                  now={now}
                />
              ))}
            </section>
          ) : null}

          <section aria-labelledby="board-heading" className="space-y-3">
            <h2 id="board-heading" className="sr-only">
              Open challenges
            </h2>
            {loading && challenges.length === 0 ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading challenges">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : error && challenges.length === 0 ? (
              <Banner
                variant="offline"
                action={
                  <Button size="sm" variant="secondary" onClick={() => void loadFirstPage()}>
                    Try again
                  </Button>
                }
              >
                Could not load the board. {error}
              </Banner>
            ) : challenges.length === 0 ? (
              <EmptyState
                icon="trophy"
                title="No open challenges"
                description={
                  selectedGame === 'all'
                    ? 'Be the first: post a challenge and someone will pick it up.'
                    : 'Nobody has posted for this game yet. Post the first one.'
                }
                action={<Button onClick={() => setCreateOpen({})}>Create challenge</Button>}
              />
            ) : (
              <>
                {challenges.map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    pending={pendingId === c.id}
                    onAccept={() => accept(c)}
                    onDecline={() => decline(c)}
                    onCancel={() => setDetailId(c.id)}
                    onDetails={() => setDetailId(c.id)}
                    now={now}
                  />
                ))}
                {nextCursor ? (
                  <div className="py-2 text-center">
                    <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                      Load more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : (
        <PlayersView
          selectedGame={selectedGame}
          onChallenge={(p) =>
            setCreateOpen({
              target: { userId: p.userId, username: p.username, gameKey: p.game.key },
            })
          }
        />
      )}

      {createOpen ? (
        <CreateChallengeSheet
          open
          games={games}
          initialGameKey={selectedGame}
          target={createOpen.target}
          onClose={() => setCreateOpen(null)}
          onCreated={() => {
            setCreateOpen(null);
            void loadFirstPage();
          }}
        />
      ) : null}

      {detailId ? (
        <ChallengeDetailSheet
          challengeId={detailId}
          summary={detail}
          pending={pendingId === detailId}
          onClose={() => setDetailId(null)}
          onAccept={() => detail && accept(detail)}
          onDecline={() => detail && decline(detail)}
          onCancel={async () => {
            if (detail) await cancel(detail);
          }}
        />
      ) : null}
    </div>
  );
}

function PlayersView({
  selectedGame,
  onChallenge,
}: {
  selectedGame: string;
  onChallenge: (player: PlayerCardData) => void;
}) {
  const [search, setSearch] = useState<PlayerSearchQuery>({});
  const [players, setPlayers] = useState<PlayerCardData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const q: PlayerSearchQuery = { ...search, limit: 20 };
    if (selectedGame !== 'all') q.game = selectedGame;
    const t = setTimeout(() => {
      playersApi
        .search(q)
        .then((res) => {
          if (mine !== seq.current) return;
          setPlayers(res.items);
          setNextCursor(res.nextCursor);
          setError(null);
        })
        .catch((e: Error) => mine === seq.current && setError(e.message))
        .finally(() => mine === seq.current && setLoading(false));
    }, 250); // debounce typing in campus/city
    return () => clearTimeout(t);
  }, [search, selectedGame]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const q: PlayerSearchQuery = { ...search, limit: 20, cursor: nextCursor };
    if (selectedGame !== 'all') q.game = selectedGame;
    const res = await playersApi.search(q);
    setPlayers((prev) => [...prev, ...res.items]);
    setNextCursor(res.nextCursor);
  };

  const inputClass =
    'h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Rank"
          value={search.rank ?? ''}
          options={RANKS}
          onChange={(v) =>
            setSearch((s) => ({ ...s, rank: (v || undefined) as PlayerSearchQuery['rank'] }))
          }
        />
        <label className="block">
          <span className="mb-1 block text-body-sm text-fg">Campus</span>
          <input
            className={inputClass}
            value={search.campus ?? ''}
            placeholder="e.g. UNILAG"
            onChange={(e) => setSearch((s) => ({ ...s, campus: e.target.value || undefined }))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-body-sm text-fg">City</span>
          <input
            className={inputClass}
            value={search.city ?? ''}
            placeholder="e.g. Lagos"
            onChange={(e) => setSearch((s) => ({ ...s, city: e.target.value || undefined }))}
          />
        </label>
      </div>

      {loading && players.length === 0 ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading players">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <Banner variant="offline">Could not load players. {error}</Banner>
      ) : players.length === 0 ? (
        <EmptyState
          icon="user"
          title="No players match"
          description="Clear a filter, or pick another game."
          action={
            <Button variant="secondary" onClick={() => setSearch({})}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {players.map((p) => (
            <article
              key={`${p.userId}-${p.game.key}`}
              className="flex items-center gap-3 rounded-card border border-line bg-surface p-4"
            >
              <Avatar username={p.username} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-body font-semibold text-fg">
                  {p.username}
                </p>
                <p className="text-caption text-fg-muted">
                  {p.game.name} · {p.rankLabel}
                  {p.city ? ` · ${p.city}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <RatingBadge value={p.rating} provisional={p.provisional} />
                  <span className="text-caption text-fg-muted tabular">{p.record}</span>
                  <ReputationBadge level={p.reputation} />
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onChallenge(p)}>
                Challenge
              </Button>
            </article>
          ))}
          {nextCursor ? (
            <div className="py-2 text-center">
              <Button variant="secondary" onClick={() => void loadMore()}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
