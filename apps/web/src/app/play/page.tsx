'use client';

import { useState } from 'react';
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  Icon,
  RatingBadge,
  RankTierBadge,
  ReputationBadge,
  Sheet,
  StatusChip,
} from '@/components/ui';

const SELECT_ARROW =
  'bg-[url(\'data:image/svg+xml;charset=utf-8,<svg xmlns%3D"http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg" width%3D"24" height%3D"24" viewBox%3D"0%200%2024%2024" fill%3D"none" stroke%3D"%25236B7788" stroke-width%3D"1.5" stroke-linecap%3D"square" stroke-linejoin%3D"miter"><path d%3D"M6%209l6%206%206-6"/></svg>\')]';

const selectClass =
  'h-11 w-full rounded-control border border-line bg-raised px-3 py-2 text-body text-fg focus:border-accent focus:outline-none appearance-none bg-no-repeat bg-right-3 bg-center pr-10 ' +
  SELECT_ARROW;

interface Challenge {
  id: string;
  game: string;
  format: string;
  stake: string;
  poster: {
    username: string;
    rating: number;
    record: string;
    reputation: 'new' | 'low' | 'reliable' | 'trusted';
  };
  timeWindow: string;
  expiresIn: string;
  isMine: boolean;
  state: 'open' | 'expired' | 'pending';
}

const MOCK_CHALLENGES: Challenge[] = [
  {
    id: 'RZ-1042',
    game: 'FIFA 25',
    format: 'H2H • 90 min',
    stake: 'Free',
    poster: { username: 'Chioma_O', rating: 1247, record: '12–3–1', reputation: 'trusted' },
    timeWindow: 'Today, 6:00–10:00 PM WAT',
    expiresIn: '2h 15m',
    isMine: false,
    state: 'open',
  },
  {
    id: 'RZ-1043',
    game: 'Call of Duty',
    format: '1v1 • Best of 3',
    stake: 'Free',
    poster: { username: 'TundePlays', rating: 980, record: '5–2–0', reputation: 'reliable' },
    timeWindow: 'Tomorrow, 2:00–6:00 PM WAT',
    expiresIn: '18h',
    isMine: false,
    state: 'open',
  },
  {
    id: 'RZ-1044',
    game: 'Tekken 8',
    format: 'First to 3',
    stake: 'Free',
    poster: { username: 'Ade_Gamer', rating: 1102, record: '8–5–2', reputation: 'low' },
    timeWindow: 'Today, 8:00 PM–12:00 AM WAT',
    expiresIn: '45m',
    isMine: false,
    state: 'open',
  },
  {
    id: 'RZ-1041',
    game: 'FIFA 25',
    format: 'H2H • 90 min',
    stake: 'Free',
    poster: { username: 'You', rating: 1180, record: '10–4–1', reputation: 'reliable' },
    timeWindow: 'Expired',
    expiresIn: 'Expired',
    isMine: true,
    state: 'expired',
  },
];

export default function PlayPage() {
  const [filter, setFilter] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'detail'>('create');
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);

  const filtered = MOCK_CHALLENGES.filter((c) => {
    if (filter === 'mine') return c.isMine;
    if (filter === 'open') return !c.isMine && c.state === 'open';
    return true;
  });

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

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'open', 'mine'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f)}
            className="whitespace-nowrap"
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No challenges yet"
          description={
            filter === 'mine'
              ? 'Create your first challenge to get started'
              : 'No open challenges right now — check back later'
          }
          action={
            <Button
              onClick={() => {
                setSheetMode('create');
                setSheetOpen(true);
              }}
            >
              Create challenge
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              onAccept={() => {
                setSelectedChallenge(challenge);
                setSheetMode('detail');
                setSheetOpen(true);
              }}
              onCancel={() => {}}
            />
          ))}
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetMode === 'create' ? 'Create challenge' : 'Challenge details'}
        size="lg"
      >
        {sheetMode === 'create' ? (
          <CreateChallengeSheet onClose={() => setSheetOpen(false)} />
        ) : (
          <ChallengeDetailSheet
            challenge={selectedChallenge!}
            onClose={() => setSheetOpen(false)}
            onAccept={() => {
              // Navigate to match room
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function ChallengeCard({
  challenge,
  onAccept,
  onCancel,
}: {
  challenge: Challenge;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const { game, format, stake, poster, timeWindow, expiresIn, isMine, state } = challenge;

  const base = 'rounded-card border p-4 transition-colors';
  const stateStyles = isMine
    ? 'border-accent bg-accent-subtle'
    : state === 'expired'
      ? 'border-line bg-surface opacity-60'
      : 'border-line bg-surface hover:border-line-strong active:bg-overlay';

  return (
    <article className={`${base} ${stateStyles}`} aria-label={`Challenge ${challenge.id}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-h3 font-semibold text-fg">{game}</span>
          <StatusChip label={format} variant="neutral" />
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-h3 font-semibold text-accent">{stake}</p>
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
        <span>{timeWindow}</span>
        <span className={expiresIn === 'Expired' ? 'text-loss' : 'text-accent'}>
          {isMine ? 'Your challenge' : `Expires in ${expiresIn}`}
        </span>
      </div>

      <div className="flex gap-2">
        {isMine ? (
          <>
            <Button variant="secondary" fullWidth onClick={onCancel}>
              Cancel challenge
            </Button>
          </>
        ) : state === 'expired' ? (
          <Button variant="secondary" fullWidth disabled>
            Expired
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => {}} className="flex-1">
              Details
            </Button>
            <Button fullWidth onClick={onAccept}>
              Accept
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function CreateChallengeSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-body text-fg-muted">Create a new challenge for other players to accept.</p>
      <div className="space-y-3">
        <select className={selectClass}>
          <option value="fifa25">FIFA 25</option>
          <option value="cod">Call of Duty</option>
          <option value="tekken8">Tekken 8</option>
          <option value="streetfighter6">Street Fighter 6</option>
        </select>
        <select className={selectClass}>
          <option value="h2h">H2H \u2022 90 min</option>
          <option value="bo3">Best of 3</option>
          <option value="ft3">First to 3</option>
        </select>
        <input
          type="text"
          placeholder="Time window (e.g. Today, 6\u201310 PM)"
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
        <Button fullWidth>Create challenge</Button>
      </div>
    </div>
  );
}

function ChallengeDetailSheet({
  challenge,
  onClose,
  onAccept,
}: {
  challenge: Challenge;
  onClose: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-h3 font-semibold text-fg">{challenge.game}</span>
          <span className="font-display text-h3 font-semibold text-accent">{challenge.stake}</span>
        </div>
        <p className="text-body-sm text-fg-muted">{challenge.format}</p>
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
          <span className="text-fg">{challenge.timeWindow}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Expires</span>
          <span className="text-accent font-semibold">{challenge.expiresIn}</span>
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
