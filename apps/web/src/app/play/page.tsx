'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  RatingBadge,
  ReputationBadge,
  Sheet,
  StatusChip,
} from '@/components/ui';
import { challengesApi, type ChallengeCard, type BoardQuery } from '@raise/api-client';
import { gamesApi, type Game } from '@raise/api-client';
import { playersApi, type PlayerSearchQuery, type PlayerCard } from '@raise/api-client';

const SELECT_ARROW =
  'bg-[url(\'data:image/svg+xml;charset=utf-8,<svg xmlns%3D"http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg" width%3D"24" height%3D"24" viewBox%3D"0%200%2024%2024" fill%3D"none" stroke%3D"%25236B7788" stroke-width%3D"1.5" stroke-linecap%3D"square" stroke-linejoin%3D"miter"><path d%3D"M6%209l6%206%206-6"/></svg>\')]';

const selectClass =
  'h-11 w-full rounded-control border border-line bg-raised px-3 py-2 text-body text-fg focus:border-accent focus:outline-none appearance-none bg-no-repeat bg-right-3 bg-center pr-10 ' +
  SELECT_ARROW;

const POLL_INTERVAL_MS = 20000;

export default function PlayPage() {
  const [games, setGames] = useState<{ id: string; key: string; name: string }[]>([]);
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [view, setView] = useState<'board' | 'players'>('board');
  const [challenges, setChallenges] = useState<ChallengeCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsActionCount, setNeedsActionCount] = useState(0);

  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [playersCursor, setPlayersCursor] = useState<string | null>(null);
  const [playersHasMore, setPlayersHasMore] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState<PlayerSearchQuery>({});

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'detail'>('create');
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeCard | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    gamesApi.list().then((data) => {
      setGames(data.map((g) => ({ id: g.id, key: g.key, name: g.name })));
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval>;

    async function loadBoard() {
      if (!mounted) return;
      setLoading(true);
      setError(null);
      try {
        const q: BoardQuery = { limit: 20 };
        if (selectedGame !== 'all') q.game = selectedGame;
        if (cursor) q.cursor = cursor;
        const res = await challengesApi.list(q);
        if (!mounted) return;
        if (cursor) {
          setChallenges((prev: ChallengeCard[]) => [...prev, ...res.items]);
        } else {
          setChallenges(res.items);
        }
        setCursor(res.nextCursor);
        setHasMore(!!res.nextCursor);
        setNeedsActionCount(res.needsActionCount);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load challenges');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadBoard();
    interval = setInterval(loadBoard, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedGame, cursor]);

  useEffect(() => {
    if (view !== 'players') return;
    let mounted = true;

    async function loadPlayers() {
      if (!mounted) return;
      setPlayersLoading(true);
      setPlayersError(null);
      try {
        const q: PlayerSearchQuery = { ...playerSearch, limit: 20 };
        if (playersCursor) q.cursor = playersCursor;
        if (selectedGame !== 'all') q.game = selectedGame;
        const res = await playersApi.search(q);
        if (!mounted) return;
        if (playersCursor) {
          setPlayers((prev: PlayerCard[]) => [...prev, ...res.items]);
        } else {
          setPlayers(res.items);
        }
        setPlayersCursor(res.nextCursor);
        setPlayersHasMore(!!res.nextCursor);
      } catch (e: unknown) {
        if (!mounted) return;
        setPlayersError(e instanceof Error ? e.message : 'Failed to load players');
      } finally {
        if (mounted) setPlayersLoading(false);
      }
    }

    loadPlayers();
  }, [view, playerSearch, selectedGame, playersCursor]);

  const filtered = challenges.filter((c) => {
    if (view === 'board') {
      if (selectedGame !== 'all' && c.game.key !== selectedGame) return false;
    }
    return true;
  });

  const handleAccept = async (challenge: ChallengeCard) => {
    setActionLoading(challenge.id);
    try {
      await challengesApi.accept(challenge.id);
      setChallenges((prev: ChallengeCard[]) =>
        prev.map((c) => (c.id === challenge.id ? { ...c, status: 'accepted', isMine: false } : c)),
      );
      setSheetOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to accept challenge');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (challenge: ChallengeCard) => {
    setActionLoading(challenge.id);
    try {
      await challengesApi.decline(challenge.id);
      setChallenges((prev) => prev.filter((c) => c.id !== challenge.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to decline challenge');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (challenge: ChallengeCard) => {
    setActionLoading(challenge.id);
    try {
      await challengesApi.cancel(challenge.id);
      setChallenges((prev) =>
        prev.map((c) => (c.id === challenge.id ? { ...c, status: 'cancelled' } : c)),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel challenge');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-h1 font-semibold text-fg">Play</h1>
        <Button
          onClick={() => {
            setSheetMode('create');
            setSheetOpen(true);
          }}
        >
          Create challenge
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={selectedGame}
          onChange={(e) => {
            setSelectedGame(e.target.value);
            setCursor(null);
            setPlayersCursor(null);
          }}
          className={selectClass}
        >
          <option value="all">All games</option>
          {games.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <Button
            variant={view === 'board' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('board')}
          >
            Board
          </Button>
          <Button
            variant={view === 'players' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('players')}
          >
            Players
          </Button>
        </div>
      </div>

      {view === 'board' ? (
        <BoardView
          challenges={challenges}
          loading={loading}
          error={error}
          hasMore={hasMore}
          onLoadMore={() => setCursor(cursor)}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onCancel={handleCancel}
          selectedGame={selectedGame}
          actionLoading={actionLoading}
        />
      ) : (
        <PlayersView
          players={players}
          loading={playersLoading}
          error={playersError}
          hasMore={playersHasMore}
          onLoadMore={() => setPlayersCursor(playersCursor)}
          search={playerSearch}
          onSearchChange={setPlayerSearch}
        />
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetMode === 'create' ? 'Create challenge' : 'Challenge details'}
        size="lg"
      >
        {sheetMode === 'create' ? (
          <CreateChallengeSheet onClose={() => setSheetOpen(false)} games={games} />
        ) : (
          <ChallengeDetailSheet
            challenge={selectedChallenge!}
            onClose={() => setSheetOpen(false)}
            onAccept={() => {
              if (selectedChallenge) handleAccept(selectedChallenge);
            }}
            onDecline={() => {
              if (selectedChallenge) handleDecline(selectedChallenge);
            }}
            onCancel={() => {
              if (selectedChallenge) handleCancel(selectedChallenge);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function BoardView({
  challenges,
  loading,
  error,
  hasMore,
  onLoadMore,
  onAccept,
  onDecline,
  onCancel,
  selectedGame,
  actionLoading,
}: {
  challenges: ChallengeCard[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onAccept: (challenge: ChallengeCard) => void;
  onDecline: (challenge: ChallengeCard) => void;
  onCancel: (challenge: ChallengeCard) => void;
  selectedGame: string;
  actionLoading: string | null;
}) {
  if (loading && challenges.length === 0) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading challenges">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <Banner variant="offline" className="mx-auto max-w-[480px]">
        <p className="font-display text-body-sm font-semibold text-fg">Failed to load board</p>
        <p className="text-caption text-fg-muted">{error}</p>
      </Banner>
    );
  }

  if (challenges.length === 0) {
    return (
      <EmptyState
        icon="trophy"
        title="No challenges yet"
        description={
          selectedGame === 'all'
            ? 'No open challenges right now — check back later'
            : 'No open challenges for this game yet. Create one.'
        }
        action={
          <Button
            onClick={() => {
              // setSheetMode('create'); setSheetOpen(true);
            }}
          >
            Create challenge
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {challenges.map((challenge) => (
        <ChallengeCard
          key={challenge.id}
          challenge={challenge}
          onAccept={() => onAccept(challenge)}
          onDecline={() => onDecline(challenge)}
          onCancel={() => onCancel(challenge)}
          isLoading={actionLoading === challenge.id}
        />
      ))}
      {hasMore && (
        <div className="text-center py-4">
          <Button variant="secondary" onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function PlayersView({
  players,
  loading,
  error,
  hasMore,
  onLoadMore,
  search,
  onSearchChange,
}: {
  players: PlayerCard[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  search: PlayerSearchQuery;
  onSearchChange: React.Dispatch<React.SetStateAction<PlayerSearchQuery>>;
}) {
  const rankOptions = [
    { value: 'rookie', label: 'Rookie' },
    { value: 'challenger', label: 'Challenger' },
    { value: 'contender', label: 'Contender' },
    { value: 'elite', label: 'Elite' },
    { value: 'champion', label: 'Champion' },
  ];

  if (loading && players.length === 0) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading players">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <Banner variant="offline" className="mx-auto max-w-[480px]">
        <p className="font-display text-body-sm font-semibold text-fg">Failed to load players</p>
        <p className="text-caption text-fg-muted">{error}</p>
      </Banner>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={search.rank ?? ''}
          onChange={(e) =>
            onSearchChange((prev: PlayerSearchQuery) => ({
              ...prev,
              rank: e.target.value ? (e.target.value as PlayerSearchQuery['rank']) : undefined,
            }))
          }
          className={selectClass}
        >
          <option value="">All ranks</option>
          {rankOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Campus"
          value={search.campus ?? ''}
          onChange={(e) =>
            onSearchChange((prev: PlayerSearchQuery) => ({
              ...prev,
              campus: e.target.value || undefined,
            }))
          }
          className="h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
        />
        <input
          type="text"
          placeholder="City"
          value={search.city ?? ''}
          onChange={(e) =>
            onSearchChange((prev: PlayerSearchQuery) => ({
              ...prev,
              city: e.target.value || undefined,
            }))
          }
          className="h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
        />
      </div>

      {players.length === 0 ? (
        <EmptyState
          icon="user"
          title="No players found"
          description="Try adjusting your filters or check back later"
        />
      ) : (
        <>
          <div className="space-y-3">
            {players.map((player) => (
              <PlayerCard key={player.userId} player={player} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center py-4">
              <Button variant="secondary" onClick={onLoadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChallengeCard({
  challenge,
  onAccept,
  onDecline,
  onCancel,
  isLoading,
}: {
  challenge: ChallengeCard;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { game, format, stake, poster, timeWindow, expiresAt, isMine, status } = challenge;

  const base = 'rounded-card border p-4 transition-colors';
  const isExpired =
    status === 'expired' || (status === 'open' && new Date(expiresAt).getTime() <= Date.now());
  const stateStyles = isMine
    ? 'border-accent bg-accent-subtle'
    : isExpired
      ? 'border-line bg-surface opacity-60'
      : 'border-line bg-surface hover:border-line-strong active:bg-overlay';

  return (
    <article className={`${base} ${stateStyles}`} aria-label={`Challenge ${challenge.id}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-h3 font-semibold text-fg">{game.name}</span>
          <StatusChip label={format.name} variant="neutral" />
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-h3 font-semibold text-accent">{stake.display}</p>
          <p className="text-caption text-fg-muted">Stage 1</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 p-3 rounded-card bg-raised border border-line">
        <Avatar username={poster.username} size={32} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-body font-semibold text-fg truncate">{poster.username}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <RatingBadge value={poster.rating} />
            <span className="text-caption text-fg-muted">{poster.record}</span>
            <ReputationBadge level={poster.reputation} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-stat-md font-semibold text-fg tabular">Rating gap</p>
          <p className="text-caption text-fg-muted">—</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-caption text-fg-muted mb-3">
        <span>
          {timeWindow.startsAt} – {timeWindow.endsAt}
        </span>
        <span className={isExpired ? 'text-loss' : 'text-accent'}>
          {isMine ? 'Your challenge' : `Expires ${expiresAt}`}
        </span>
      </div>

      <div className="flex gap-2">
        {isMine ? (
          <>
            <Button variant="secondary" fullWidth onClick={onCancel} disabled={isLoading}>
              Cancel challenge
            </Button>
          </>
        ) : isExpired ? (
          <Button variant="secondary" fullWidth disabled>
            Expired
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => {}} className="flex-1" disabled={isLoading}>
              Details
            </Button>
            <Button fullWidth onClick={onAccept} disabled={isLoading}>
              Accept
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function PlayerCard({ player }: { player: PlayerCard }) {
  return (
    <article className="rounded-card border border-line bg-surface p-4 hover:border-line-strong transition-colors">
      <div className="flex items-center gap-3">
        <Avatar username={player.username} size={32} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-body font-semibold text-fg truncate">{player.username}</p>
          <p className="text-caption text-fg-muted">{player.inGameId}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <RatingBadge value={player.rating} />
            <span className="text-caption text-fg-muted">{player.record}</span>
            <ReputationBadge level={player.reputation} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-caption text-fg-muted">
          <span className="text-caption text-fg-muted">{player.game.name}</span>
        </div>
      </div>
    </article>
  );
}

function CreateChallengeSheet({
  onClose,
  games,
}: {
  onClose: () => void;
  games: { id: string; key: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-body text-fg-muted">Create a new challenge for other players to accept.</p>
      <div className="space-y-3">
        <select className={selectClass}>
          {games.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
        <select className={selectClass}>
          <option value="1v1_duel">1v1 Duel</option>
          <option value="br_duo">Battle Royale Duo</option>
          <option value="br_solo">Battle Royale Solo</option>
          <option value="mp_duel">Multiplayer Duel</option>
        </select>
        <input
          type="text"
          placeholder="Time window (e.g. Today, 6–10 PM)"
          className="h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
        />
        <input
          type="text"
          placeholder="Stake (Free in Stage 1)"
          className="h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
          value="Free"
          readOnly
        />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onClose}>
          Cancel
        </Button>
        <Button fullWidth disabled>
          Create challenge
        </Button>
      </div>
    </div>
  );
}

function ChallengeDetailSheet({
  challenge,
  onClose,
  onAccept,
  onDecline,
  onCancel,
}: {
  challenge: ChallengeCard;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-h3 font-semibold text-fg">{challenge.game.name}</span>
          <span className="font-display text-h3 font-semibold text-accent">
            {challenge.stake.display}
          </span>
        </div>
        <p className="text-body-sm text-fg-muted">{challenge.format.name}</p>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="label-caps mb-3 text-fg-muted">Opponent</h3>
        <div className="flex items-center gap-3">
          <Avatar username={challenge.poster.username} size={32} />
          <div>
            <p className="font-display text-body font-semibold text-fg">
              {challenge.poster.username}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <RatingBadge value={challenge.poster.rating} />
              <span className="text-caption text-fg-muted">{challenge.poster.record}</span>
              <ReputationBadge level={challenge.poster.reputation} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-body-sm">
        <div className="flex justify-between">
          <span className="text-fg-muted">Time window</span>
          <span className="text-fg">
            {challenge.timeWindow.startsAt} – {challenge.timeWindow.endsAt}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Expires</span>
          <span className="text-accent font-semibold">{challenge.expiresAt}</span>
        </div>
      </div>

      <Banner variant="system" className="text-sm">
        By accepting, you agree to the match rules. Results must be submitted within 30 minutes of
        match end.
      </Banner>

      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onClose}>
          Decline
        </Button>
        <Button
          fullWidth
          onClick={() => {
            onAccept();
            onClose();
          }}
        >
          Accept challenge
        </Button>
      </div>
    </div>
  );
}
