'use client';

import { useEffect, useId, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Avatar,
  Button,
  CountUp,
  Icon,
  RankTierBadge,
  RatingBadge,
  ReputationBadge,
  StatusChip,
  useToast,
  type ReputationLevel,
  type TierLevel,
} from '@/components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface GameProfileDto {
  id: string;
  displayName: string | null;
  gameId: string;
  gameKey: string;
  gameName: string;
  inGameId: string;
  city: string | null;
  campus: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  provisional: boolean;
  ratedMatches: number;
  rankTier: string;
  rankLabel: string;
  reputation: ReputationLevel;
}

const TIER: Record<string, TierLevel> = {
  rookie: 1,
  challenger: 2,
  contender: 3,
  elite: 4,
  champion: 5,
};

/** "W3", "L2" or "—": streak sign carries win/loss, the letter keeps it readable. */
function streakLabel(streak: number): { text: string; sr: string } {
  if (streak > 0) return { text: `W${streak}`, sr: `${streak} win streak` };
  if (streak < 0) return { text: `L${-streak}`, sr: `${-streak} loss streak` };
  return { text: '—', sr: 'No streak' };
}

async function fetchProfile(userId: string): Promise<GameProfileDto[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}/profiles/${userId}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return [];
  return res.json();
}

export function ProfileClient() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [profiles, setProfiles] = useState<GameProfileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const tabsId = useId();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchProfile(userId).then((data) => {
      if (cancelled) return;
      setProfiles(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast({ title: 'Game ID copied', description: id });
    } catch {
      toast({ title: 'Could not copy', variant: 'error' });
    }
  };

  if (loading)
    return <div className="mx-auto max-w-2xl p-6 text-body-sm text-fg-muted">Loading profile…</div>;

  const p = profiles[Math.min(selected, Math.max(profiles.length - 1, 0))];

  // Per-game tabs (Design §8 player profile header): WAI-ARIA tabs with arrow-key roving focus.
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = profiles.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    document.getElementById(`${tabsId}-tab-${next}`)?.focus();
  };

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-card border border-line bg-surface">
        <div className="flex items-center gap-3">
          <Avatar username={p?.displayName ?? p?.gameName ?? 'Player'} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-h1 font-semibold text-fg">
              {p?.displayName ?? p?.gameName ?? 'Player'}
            </h1>
            <p className="text-body-sm text-fg-muted">{p?.city ?? 'Unknown city'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CountUp
            value={p?.rating ?? 1000}
            className="font-display text-stat-lg font-semibold text-fg tabular"
          />
          <Button>Challenge</Button>
        </div>
      </header>

      {profiles.length > 1 ? (
        <div role="tablist" aria-label="Games" className="flex gap-2 border-b border-line">
          {profiles.map((profile, index) => {
            const active = index === selected;
            return (
              <button
                key={profile.gameKey}
                id={`${tabsId}-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${tabsId}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={`min-h-11 flex-1 border-b-2 px-4 py-2 font-display text-body-sm font-semibold transition-colors ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-fg-muted hover:text-fg'
                }`}
              >
                {profile.gameName}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={`${tabsId}-panel`}
        role={profiles.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={profiles.length > 1 ? `${tabsId}-tab-${selected}` : undefined}
        className="grid grid-cols-2 gap-4 md:grid-cols-3"
      >
        {/* Stat grid (Design §8 player profile header): rank, rating, record, streak, reputation. */}
        <dl className="contents">
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="label-caps text-fg-muted">Rank</dt>
            <dd className="mt-2">
              <RankTierBadge tier={TIER[p?.rankTier ?? 'challenger'] ?? 2} label={p?.rankLabel} />
            </dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="label-caps text-fg-muted">Rating</dt>
            <dd className="mt-1">
              <RatingBadge value={p?.rating ?? 1000} provisional={p?.provisional ?? true} />
              {p?.provisional ? (
                <span className="mt-1 block text-caption text-fg-muted">
                  Provisional · {p.ratedMatches} of 10 rated matches
                </span>
              ) : null}
            </dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="label-caps text-fg-muted">Record</dt>
            <dd
              className="mt-1 font-display text-stat-md font-semibold text-fg tabular"
              aria-label={`${p?.wins ?? 0} wins, ${p?.losses ?? 0} losses, ${p?.draws ?? 0} draws`}
            >
              {p?.wins ?? 0}–{p?.losses ?? 0}–{p?.draws ?? 0}
            </dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="label-caps text-fg-muted">Streak</dt>
            <dd className="mt-1 font-display text-stat-md font-semibold text-fg tabular">
              <span aria-hidden>{streakLabel(p?.streak ?? 0).text}</span>
              <span className="sr-only">{streakLabel(p?.streak ?? 0).sr}</span>
            </dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <dt className="label-caps text-fg-muted">Reputation</dt>
            <dd className="mt-2">
              <ReputationBadge level={p?.reputation ?? 'new'} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-h3 font-semibold text-fg">Game IDs</h3>
          <Button variant="ghost" size="sm">
            Add game ID
          </Button>
        </div>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.gameId}
              className="flex items-center justify-between p-3 rounded-card bg-surface border border-line"
            >
              <div className="flex items-center gap-3">
                <span className="font-display text-body-sm font-semibold text-fg">
                  {profile.gameName}
                </span>
                <StatusChip
                  label={profile.provisional ? 'Provisional' : 'Verified'}
                  variant="neutral"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-body-sm font-semibold text-fg tabular">
                  {profile.inGameId}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy(profile.inGameId)}
                  aria-label={`Copy ${profile.gameName} ID ${profile.inGameId}`}
                  className="flex min-h-11 min-w-11 items-center justify-center gap-1 px-2 text-caption text-accent hover:underline"
                >
                  <Icon name="copy" size={14} /> Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="font-display text-h3 font-semibold text-fg">Recent matches</h3>
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center">
          <Icon name="trophy" size={32} className="text-fg-subtle" />
          <h3 className="font-display text-h3 font-semibold text-fg">No matches yet</h3>
          <p className="text-body-sm text-fg-muted">Play your first match to see results here.</p>
          <Button>Find a challenge</Button>
        </div>
      </div>

      <div className="hidden sm:block">
        <Button>Challenge</Button>
      </div>
    </div>
  );
}
