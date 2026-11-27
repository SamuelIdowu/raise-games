'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { gamesApi, isParticipantView, type Game } from '@raise/api-client';
import {
  Avatar,
  Button,
  Card,
  CountUp,
  Icon,
  RankTierBadge,
  RatingBadge,
  ReputationBadge,
  StatusChip,
  Tabs,
  tabPanelProps,
  useToast,
  type ReputationLevel,
  type TierLevel,
} from '@/components/ui';
import { DmActions } from '@/features/dm/dm-kit';
import { AppPage, SectionHeading } from '@/components/app/AppPage';
import { NextMatchRail } from '@/components/app/widgets';
import { CreateChallengeSheet } from '@/components/challenge/create-challenge-sheet';
import { useMatches } from '@/lib/app-data';
import { refresh } from '@/lib/use-api';
import { formatRelative } from '@/lib/datetime';
import { outcomeTag } from '@/lib/match-status';

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
  const [games, setGames] = useState<Game[]>([]);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const finished = useMatches('finished');

  useEffect(() => {
    gamesApi
      .list()
      .then(setGames)
      .catch(() => setGames([]));
  }, []);

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

  if (loading) return <div className="p-6 text-body-sm text-fg-muted">Loading profile…</div>;

  const p = profiles[Math.min(selected, Math.max(profiles.length - 1, 0))];
  const name = p?.displayName ?? 'Player';

  // Head-to-head: my finished matches against this player.
  const h2h = (finished.data?.items ?? [])
    .filter(isParticipantView)
    .filter((m) => m.opponent.userId === userId);
  const h2hRecord = h2h.reduce(
    (acc, m) => {
      if (m.outcomeForViewer === 'win') acc.w++;
      else if (m.outcomeForViewer === 'loss') acc.l++;
      else if (m.outcomeForViewer === 'draw') acc.d++;
      return acc;
    },
    { w: 0, l: 0, d: 0 },
  );

  return (
    <AppPage rail={<NextMatchRail />}>
      <Card as="header" className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar username={p?.displayName ?? p?.gameName ?? 'Player'} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[clamp(1.5rem,3.2vw,2.5rem)] font-black uppercase leading-none text-fg [overflow-wrap:anywhere]">
              {p?.displayName ?? p?.gameName ?? 'Player'}
            </h1>
            {p?.city || p?.campus ? (
              <p className="label-caps mt-2 text-fg-subtle">
                {[p?.campus, p?.city].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CountUp
            value={p?.rating ?? 1000}
            className="font-display text-stat-lg font-semibold text-fg tabular"
          />
          <Button arrow onClick={() => setChallengeOpen(true)} disabled={!p}>
            Challenge
          </Button>
        </div>
      </Card>

      {/* Sprint 14: friend / message / block. Nothing renders while DMs are off. */}
      <DmActions userId={userId} name={p?.displayName ?? 'this player'} />

      {profiles.length > 1 ? (
        <Tabs
          idPrefix={tabsId}
          aria-label="Games"
          items={profiles.map((profile) => ({ key: profile.gameKey, label: profile.gameName }))}
          value={p?.gameKey ?? ''}
          onChange={(key) => setSelected(profiles.findIndex((profile) => profile.gameKey === key))}
        />
      ) : null}

      <div
        {...(profiles.length > 1 ? tabPanelProps(tabsId, p?.gameKey ?? '') : {})}
        className="grid grid-cols-2 gap-4 md:grid-cols-3"
      >
        {/* Stat grid (Design §8 player profile header): rank, rating, record, streak, reputation. */}
        <dl className="contents">
          <div className="surface-card rounded-card p-4">
            <dt className="label-caps text-fg-subtle">Rank</dt>
            <dd className="mt-2">
              <RankTierBadge tier={TIER[p?.rankTier ?? 'challenger'] ?? 2} label={p?.rankLabel} />
            </dd>
          </div>
          <div className="surface-card rounded-card p-4">
            <dt className="label-caps text-fg-subtle">Rating</dt>
            <dd className="mt-1">
              <RatingBadge value={p?.rating ?? 1000} provisional={p?.provisional ?? true} />
              {p?.provisional ? (
                <span className="mt-1 block text-caption text-fg-muted">
                  Provisional · {p.ratedMatches} of 10 rated matches
                </span>
              ) : null}
            </dd>
          </div>
          <div className="surface-card rounded-card p-4">
            <dt className="label-caps text-fg-subtle">Record</dt>
            <dd
              className="mt-1 font-display text-stat-md font-semibold text-fg tabular"
              aria-label={`${p?.wins ?? 0} wins, ${p?.losses ?? 0} losses, ${p?.draws ?? 0} draws`}
            >
              {p?.wins ?? 0}–{p?.losses ?? 0}–{p?.draws ?? 0}
            </dd>
          </div>
          <div className="surface-card rounded-card p-4">
            <dt className="label-caps text-fg-subtle">Streak</dt>
            <dd className="mt-1 font-display text-stat-md font-semibold text-fg tabular">
              <span aria-hidden>{streakLabel(p?.streak ?? 0).text}</span>
              <span className="sr-only">{streakLabel(p?.streak ?? 0).sr}</span>
            </dd>
          </div>
          <div className="surface-card rounded-card p-4">
            <dt className="label-caps text-fg-subtle">Reputation</dt>
            <dd className="mt-2">
              <ReputationBadge level={p?.reputation ?? 'new'} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Game IDs</h3>
        </div>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.gameId}
              className="surface-card flex flex-wrap items-center justify-between gap-x-3 rounded-card px-4 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="font-display text-body-sm font-semibold text-fg">
                  {profile.gameName}
                </span>
                {profile.provisional ? <StatusChip label="Provisional" variant="neutral" /> : null}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-display text-body-sm font-semibold text-fg tabular">
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

      <section aria-labelledby="h2h" className="space-y-4">
        <SectionHeading id="h2h">
          {h2h.length > 0
            ? `You vs ${name} · ${h2hRecord.w}W ${h2hRecord.l}L ${h2hRecord.d}D`
            : `You vs ${name}`}
        </SectionHeading>
        {h2h.length > 0 ? (
          <ul className="surface-card divide-y divide-line rounded-card">
            {h2h.slice(0, 8).map((m) => {
              const tag = outcomeTag(m);
              return (
                <li key={m.id}>
                  <Link
                    href={`/matches/${m.id}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold text-fg">
                        {m.game.name} · {m.format.name}
                      </span>
                      {m.completedAt ? (
                        <span className="block text-caption text-fg-subtle">
                          {formatRelative(m.completedAt)}
                        </span>
                      ) : null}
                    </span>
                    {tag ? (
                      <StatusChip label={tag.label} variant={tag.variant} icon={tag.icon} />
                    ) : null}
                    {m.ratingDelta !== null ? (
                      <span
                        className={`w-12 text-right font-display text-body-sm font-bold tabular ${m.ratingDelta >= 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {m.ratingDelta >= 0 ? `+${m.ratingDelta}` : m.ratingDelta}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="surface-card flex flex-col items-start gap-3 rounded-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-sm text-fg-muted">
              You have not played {name} yet. Send a direct challenge and only they can accept it.
            </p>
            <Button arrow onClick={() => setChallengeOpen(true)} disabled={!p}>
              Challenge {name}
            </Button>
          </div>
        )}
      </section>

      {challengeOpen && p ? (
        <CreateChallengeSheet
          open
          games={games}
          target={{ userId, username: name, gameKey: p.gameKey }}
          onClose={() => setChallengeOpen(false)}
          onCreated={() => {
            setChallengeOpen(false);
            refresh('challenges');
            toast({ title: `Challenge sent to ${name}`, variant: 'status' });
          }}
        />
      ) : null}
    </AppPage>
  );
}
