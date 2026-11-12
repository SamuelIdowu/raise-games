'use client';

import { useState } from 'react';
import {
  Avatar,
  Button,
  CountUp,
  Icon,
  RankTierBadge,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';

const MOCK_RECENT_MATCHES = [
  {
    id: 'RZ-1042',
    game: 'FIFA 25',
    opponent: 'Chioma_O',
    result: 'W',
    rating: +12,
    date: '2026-11-08',
    state: 'confirmed',
  },
  {
    id: 'RZ-1041',
    game: 'FIFA 25',
    opponent: 'Ade_Gamer',
    result: 'W',
    rating: +8,
    date: '2026-11-05',
    state: 'confirmed',
  },
  {
    id: 'RZ-1040',
    game: 'Call of Duty',
    opponent: 'TundePlays',
    result: 'L',
    rating: -6,
    date: '2026-11-02',
    state: 'confirmed',
  },
  {
    id: 'RZ-1039',
    game: 'Tekken 8',
    opponent: 'Bisi_Ball',
    result: 'W',
    rating: +15,
    date: '2026-10-30',
    state: 'confirmed',
  },
  {
    id: 'RZ-1038',
    game: 'FIFA 25',
    opponent: 'Emeka_Plays',
    result: 'D',
    rating: 0,
    date: '2026-10-28',
    state: 'confirmed',
  },
];

const MOCK_GAME_IDS = [
  { game: 'FIFA 25', id: 'AdePlays23' },
  { game: 'Call of Duty', id: 'AdePlays#1234567' },
  { game: 'Tekken 8', id: 'AdePlays_T8' },
  { game: 'Street Fighter 6', id: 'AdePlays_SF6' },
];

const tabClass = (active: boolean) =>
  'flex-1 py-2 px-4 font-display text-body-sm font-semibold rounded-t-card transition-colors ' +
  (active ? 'text-accent border-b-2 border-accent' : 'text-fg-muted hover:text-fg');

const ratingClass = (rating: number) =>
  'font-display font-semibold tabular ' +
  (rating > 0 ? 'text-win' : rating < 0 ? 'text-loss' : 'text-fg');

const statTrendClass = (trend?: 'up' | 'down') =>
  'mt-1 text-caption font-semibold ' + (trend === 'up' ? 'text-win' : 'text-loss');

function StatCard({
  label,
  value,
  change,
  trend,
}: {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="label-caps text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-stat-lg font-semibold text-fg tabular">{value}</p>
      {change && (
        <p className={statTrendClass(trend)}>
          {trend === 'up' ? '+' : ''}
          {change} vs last week
        </p>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'matches' | 'game-ids'>('overview');

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-h1 font-semibold text-fg">Profile</h1>
          <p className="text-body-sm text-fg-muted">ade_plays · Joined Nov 2026</p>
        </div>
        <Button variant="secondary" size="sm">
          Edit profile
        </Button>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-card border border-line bg-surface">
          <Avatar username="Ade" size={64} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-h1 font-semibold text-fg">ade_plays</h2>
              <StatusChip label="Active" variant="win" />
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap text-body-sm text-fg-muted">
              <span className="flex items-center gap-1">
                <Icon name="trophy" size={16} /> Elite
              </span>
              <span className="flex items-center gap-1">
                <Icon name="star" size={16} /> 1,180
              </span>
              <span className="flex items-center gap-1">
                <Icon name="shield" size={16} /> Reliable
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CountUp
              value={1180}
              className="font-display text-stat-lg font-semibold text-fg tabular"
            />
            <RankTierBadge tier={3} />
          </div>
        </div>

        <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
          <StatCard label="Rating" value="1,180" change="+12" trend="up" />
          <StatCard label="Record" value="20–5–1" />
          <StatCard label="Streak" value="W3" change="+3" trend="up" />
        </div>

        <div className="flex gap-2 border-b border-line">
          {(['overview', 'matches', 'game-ids'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={tabClass(activeTab === tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-h3 font-semibold text-fg">Game IDs</h3>
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            </div>
            <div className="space-y-2">
              {MOCK_GAME_IDS.map((g) => (
                <div
                  key={g.game}
                  className="flex items-center justify-between p-3 rounded-card bg-surface border border-line"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-display text-body-sm font-semibold text-fg">
                      {g.game}
                    </span>
                    <StatusChip label="Verified" variant="win" />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-body-sm text-fg bg-raised px-2 py-1 rounded-[2px]">
                      {g.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(g.id)}
                      className="text-caption text-accent hover:underline flex items-center gap-1"
                    >
                      <Icon name="copy" size={14} /> Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
              {MOCK_RECENT_MATCHES.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-display text-accent">{m.id}</TableCell>
                  <TableCell>{m.game}</TableCell>
                  <TableCell>{m.opponent}</TableCell>
                  <TableCell numeric>
                    <StatusChip
                      label={m.result === 'W' ? 'Win' : m.result === 'L' ? 'Loss' : 'Draw'}
                      variant={m.result === 'W' ? 'win' : m.result === 'L' ? 'loss' : 'neutral'}
                    />
                  </TableCell>
                  <TableCell numeric>
                    <span className={ratingClass(m.rating)}>
                      {m.rating > 0 ? '+' : ''}
                      {m.rating}
                    </span>
                  </TableCell>
                  <TableCell>{m.date}</TableCell>
                  <TableCell>
                    <StatusChip label="Confirmed" variant="win" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {activeTab === 'game-ids' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-h3 font-semibold text-fg">Game IDs</h3>
              <Button variant="secondary" size="sm">
                Add game ID
              </Button>
            </div>
            <div className="space-y-2">
              {MOCK_GAME_IDS.map((g) => (
                <div
                  key={g.game}
                  className="flex items-center justify-between p-3 rounded-card bg-surface border border-line"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display text-body-sm font-semibold text-fg">
                      {g.game}
                    </span>
                    <StatusChip label="Verified" variant="win" />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-body-sm text-fg bg-raised px-2 py-1 rounded-[2px]">
                      {g.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(g.id)}
                      className="text-caption text-accent hover:underline flex items-center gap-1"
                    >
                      <Icon name="copy" size={14} /> Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
