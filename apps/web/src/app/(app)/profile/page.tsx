'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  RankTierBadge,
  StatCard,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  tabPanelProps,
  useToast,
} from '@/components/ui';
import { profilesApi, matchesApi, type GameProfile, type MatchView } from '@raise/api-client';
import { formatRelative } from '@/lib/datetime';
import { outcomeTag } from '@/lib/match-status';
import { isParticipantView } from '@raise/api-client';

const ratingClass = (rating: number) =>
  'font-display font-semibold tabular ' +
  (rating > 0 ? 'text-success' : rating < 0 ? 'text-danger' : 'text-fg');

type ProfileTab = 'overview' | 'matches' | 'game-ids';

const PROFILE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'matches', label: 'Matches' },
  { key: 'game-ids', label: 'Game IDs' },
] as const;

function GameIdRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3 px-4">
      <div className="flex items-center gap-3">
        <span className="font-body text-body-sm font-bold uppercase tracking-[0.04em] text-fg">
          {label}
        </span>
        <StatusChip label="Verified" variant="win" />
      </div>
      <div className="flex items-center gap-1">
        <code className="rounded-xs bg-bg px-2 py-1 font-mono text-body-sm text-fg">{value}</code>
        <Button variant="ghost" size="sm" onClick={onCopy} aria-label={`Copy ${label} ID ${value}`}>
          <Icon name="copy" size={14} /> Copy
        </Button>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [gameIds, setGameIds] = useState<{ gameKey: string; label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    const load = async () => {
      try {
        const [prof, matchRes] = await Promise.all([
          profilesApi.listMine(),
          matchesApi.list('all'),
        ]);
        if (live) {
          setProfiles(prof);
          setMatches(matchRes.items.filter(isParticipantView));
          setGameIds(
            prof.map((p) => ({
              gameKey: p.gameKey,
              label: p.gameName,
              value: p.inGameId,
            })),
          );
          setError(null);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not load profile.');
      } finally {
        if (live) setLoading(false);
      }
    };

    void load();
    const id = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[880px] space-y-6" aria-busy="true">
        <div className="flex items-center gap-4">
          <div className="animate-shimmer h-16 w-16 rounded-xs" />
          <div className="space-y-2">
            <div className="animate-shimmer h-6 w-48 rounded-xs" />
            <div className="animate-shimmer h-4 w-64 rounded-xs" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="animate-shimmer chamfer-tr h-28" />
          <div className="animate-shimmer chamfer-tr h-28" />
          <div className="animate-shimmer chamfer-tr h-28" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-center text-fg-muted">{error}</p>
        <Button variant="secondary" onClick={() => router.refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  // Use the first profile as the main profile (or current game if available)
  const mainProfile = profiles[0];
  const rating = mainProfile
    ? {
        value: mainProfile.rating,
        tier: parseInt(mainProfile.rankTier) || 1,
        tierLabel: mainProfile.rankLabel,
        wins: mainProfile.wins,
        losses: mainProfile.losses,
        draws: mainProfile.draws,
        streak: mainProfile.streak,
        provisional: mainProfile.provisional,
      }
    : null;

  const user = mainProfile
    ? {
        username: mainProfile.displayName ?? mainProfile.inGameId,
        reputationLabel: mainProfile.reputation,
        createdAt: mainProfile.createdAt,
      }
    : null;

  const copy = (label: string, value: string) => {
    void navigator.clipboard.writeText(value);
    toast({ title: 'Copied', description: `${label} ID copied to clipboard` });
  };

  const joined = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '2026';

  const gameIdList =
    gameIds.length > 0 ? (
      <div className="space-y-2">
        {gameIds.map((g) => (
          <GameIdRow
            key={g.gameKey}
            label={g.label}
            value={g.value}
            onCopy={() => copy(g.label, g.value)}
          />
        ))}
      </div>
    ) : (
      <EmptyState
        icon="gamepad-2"
        title="No game IDs added"
        description="Add your game IDs so opponents can find you."
        action={<Button onClick={() => router.push('/settings?tab=game-ids')}>Add game ID</Button>}
      />
    );

  return (
    <div className="mx-auto max-w-[880px] space-y-8">
      <PageHeader
        eyebrow={`Joined ${joined}`}
        title="Profile"
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push('/settings')}>
            Edit profile
          </Button>
        }
      />

      {user && (
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <Avatar username={user.username} size={64} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate font-display text-h2 font-black uppercase text-fg">
                  {user.username}
                </h2>
                <StatusChip label="Active" variant="win" />
              </div>
              <div className="label-caps flex flex-wrap items-center gap-4 text-fg-subtle">
                <span className="flex items-center gap-1.5">
                  <Icon name="trophy" size={14} /> {rating?.tierLabel ?? 'Rookie'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="shield" size={14} /> {user.reputationLabel ?? 'New'}
                </span>
              </div>
            </div>
            <RankTierBadge
              tier={(rating?.tier ?? 1) as 1 | 2 | 3 | 4 | 5}
              label={rating?.tierLabel}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Rating" value={rating?.value ?? 0} icon="star" />
            <StatCard
              label="Record"
              value={`${rating?.wins ?? 0}-${rating?.losses ?? 0}-${rating?.draws ?? 0}`}
              icon="crown"
            />
            <StatCard label="Streak" value={`W${rating?.streak ?? 0}`} icon="flame" />
          </div>

          <Tabs
            idPrefix="profile"
            aria-label="Profile sections"
            items={PROFILE_TABS}
            value={activeTab}
            onChange={setActiveTab}
          />

          <div {...tabPanelProps('profile', activeTab)}>
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="eyebrow">Game IDs</h3>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('game-ids')}>
                    Edit
                  </Button>
                </div>
                {gameIdList}
              </div>
            )}

            {activeTab === 'matches' && (
              <Table>
                <TableHead>
                  <TableHeaderCell>Match</TableHeaderCell>
                  <TableHeaderCell>Game</TableHeaderCell>
                  <TableHeaderCell>Opponent</TableHeaderCell>
                  <TableHeaderCell numeric>Result</TableHeaderCell>
                  <TableHeaderCell numeric>Rating</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {matches.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-accent">{m.id}</TableCell>
                      <TableCell>{m.game.name}</TableCell>
                      <TableCell>{m.opponent?.username ?? '—'}</TableCell>
                      <TableCell numeric>
                        <StatusChip
                          label={outcomeTag(m)?.label ?? '—'}
                          variant={outcomeTag(m)?.variant ?? 'neutral'}
                        />
                      </TableCell>
                      <TableCell numeric>
                        <span className={ratingClass(m.ratingDelta ?? 0)}>
                          {m.ratingDelta && m.ratingDelta > 0 ? '+' : ''}
                          {m.ratingDelta ?? 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        {formatRelative(m.confirmedAt ?? new Date().toISOString())}
                      </TableCell>
                      <TableCell>
                        <StatusChip label="Confirmed" variant="win" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {activeTab === 'game-ids' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="eyebrow">Game IDs</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push('/settings?tab=game-ids')}
                  >
                    Add game ID
                  </Button>
                </div>
                {gameIdList}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
