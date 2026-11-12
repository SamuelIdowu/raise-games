'use client';

import { useState } from 'react';
import {
  Avatar,
  Banner,
  Button,
  CountUp,
  EmptyState,
  Icon,
  RankTierBadge,
  RatingBadge,
  ReputationBadge,
  Sheet,
  StatusChip,
} from '@/components/ui';

const SELECT_ARROW =
  'bg-[url(\'data:image/svg+xml;charset=utf-8,<svg xmlns%3D"http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg" width%3D"24" height%3D"24" viewBox%3D"0%200%2024%2024" fill%3D"none" stroke%3D"%25236B7788" stroke-width%3D"1.5" stroke-linecap%3D"square" stroke-linejoin%3D"miter"><path d%3D"M6%209l6%206%206-6"/></svg>\')]';

const selectClass =
  'h-11 w-full rounded-control border border-line bg-raised px-3 py-2 text-body text-fg focus:border-accent focus:outline-none appearance-none bg-no-repeat bg-right-3 bg-center pr-10 ' +
  SELECT_ARROW;

const MOCK_MATCHES = [
  {
    id: 'RZ-1042',
    game: 'FIFA 25',
    format: 'H2H • 90 min',
    state: 'awaiting_result' as const,
    opponent: {
      username: 'Chioma_O',
      rating: 1247,
      record: '12–3–1',
      reputation: 'trusted' as const,
      gameId: 'Chioma_O_FIFA',
    },
    myRating: 1180,
    myRecord: '10–4–1',
    timeLeft: 45 * 60,
    deadline: new Date(Date.now() + 45 * 60 * 1000),
    stake: 'Free',
  },
  {
    id: 'RZ-1043',
    game: 'Call of Duty',
    format: '1v1 • Best of 3',
    state: 'in_progress' as const,
    opponent: {
      username: 'TundePlays',
      rating: 980,
      record: '5–2–0',
      reputation: 'reliable' as const,
      gameId: 'Tunde_COD',
    },
    myRating: 1180,
    myRecord: '10–4–1',
    timeLeft: 12 * 60,
    deadline: new Date(Date.now() + 12 * 60 * 1000),
    stake: 'Free',
  },
  {
    id: 'RZ-1041',
    game: 'FIFA 25',
    format: 'H2H • 90 min',
    state: 'confirmed' as const,
    opponent: {
      username: 'Ade_Gamer',
      rating: 1102,
      record: '8–5–2',
      reputation: 'low' as const,
      gameId: 'Ade_FIFA',
    },
    myRating: 1180,
    myRecord: '10–4–1',
    timeLeft: 0,
    deadline: new Date(Date.now() - 3600 * 1000),
    stake: 'Free',
    ratingChange: +12,
    newRating: 1192,
  },
  {
    id: 'RZ-1044',
    game: 'Street Fighter 6',
    format: '1v1 • Best of 5',
    state: 'awaiting_confirmation' as const,
    opponent: {
      username: 'Bisi_Ball',
      rating: 1350,
      record: '15–4–0',
      reputation: 'trusted' as const,
      gameId: 'Bisi_SF6',
    },
    myRating: 1180,
    myRecord: '10–4–1',
    timeLeft: 30 * 60,
    deadline: new Date(Date.now() + 30 * 60 * 1000),
    stake: 'Free',
  },
];

const STATE_LABELS: Record<
  string,
  { label: string; variant: 'neutral' | 'accent' | 'win' | 'loss' | 'dispute' | 'muted' }
> = {
  open: { label: 'Open', variant: 'neutral' },
  accepted: { label: 'Accepted', variant: 'accent' },
  in_progress: { label: 'In progress', variant: 'accent' },
  awaiting_result: { label: 'Awaiting result', variant: 'accent' },
  awaiting_confirmation: { label: 'Awaiting confirmation', variant: 'neutral' },
  confirmed: { label: 'Confirmed', variant: 'win' },
  disputed: { label: 'Disputed', variant: 'dispute' },
  resolved: { label: 'Resolved', variant: 'win' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  expired: { label: 'Expired', variant: 'muted' },
  forfeited: { label: 'Forfeited', variant: 'loss' },
  voided: { label: 'Voided', variant: 'muted' },
};

export default function MatchesPage() {
  const [selectedMatch, setSelectedMatch] = useState<(typeof MOCK_MATCHES)[0] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'detail' | 'submit' | 'dispute' | 'result'>('detail');

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-h1 font-semibold text-fg">Matches</h1>
      </header>

      {MOCK_MATCHES.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No active matches"
          description="Accept a challenge or create your own to start playing"
          action={
            <a href="/play">
              <button className="btn-primary">Find a match</button>
            </a>
          }
        />
      ) : (
        <div className="space-y-3">
          {MOCK_MATCHES.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onClick={() => {
                setSelectedMatch(match);
                setSheetMode('detail');
                setSheetOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Match room" size="lg">
        {selectedMatch && (
          <>
            {sheetMode === 'detail' && (
              <MatchDetail
                match={selectedMatch}
                onSubmitResult={() => {
                  setSheetMode('submit');
                }}
                onOpenDispute={() => {
                  setSheetMode('dispute');
                }}
                onClose={() => setSheetOpen(false)}
              />
            )}
            {sheetMode === 'submit' && (
              <SubmitResultSheet
                onClose={() => {
                  setSheetMode('detail');
                }}
                onSubmit={() => {
                  setSheetMode('result');
                }}
              />
            )}
            {sheetMode === 'dispute' && (
              <DisputeSheet
                onClose={() => {
                  setSheetMode('detail');
                }}
              />
            )}
            {sheetMode === 'result' && (
              <ResultConfirmedSheet
                match={selectedMatch}
                onClose={() => {
                  setSheetOpen(false);
                }}
              />
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}

function MatchCard({ match, onClick }: { match: (typeof MOCK_MATCHES)[0]; onClick: () => void }) {
  const stateInfo = STATE_LABELS[match.state] ?? { label: match.state, variant: 'neutral' };
  const isActive = ['in_progress', 'awaiting_result', 'awaiting_confirmation'].includes(
    match.state,
  );

  return (
    <article
      onClick={onClick}
      className={`rounded-card border p-4 cursor-pointer transition-colors ${
        isActive
          ? 'border-accent bg-accent-subtle'
          : 'border-line bg-surface hover:border-line-strong'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-h3 font-semibold text-fg">{match.game}</span>
          <StatusChip label={match.format} variant="neutral" />
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-h3 font-semibold text-accent">{match.stake}</p>
          <StatusChip label={stateInfo.label} variant={stateInfo.variant} />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 p-3 rounded-card bg-raised border border-line">
        <Avatar username={match.opponent.username} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-body font-semibold text-fg truncate">
              {match.opponent.username}
            </p>
            <RatingBadge value={match.opponent.rating} />
            <ReputationBadge level={match.opponent.reputation} />
          </div>
          <p className="text-caption text-fg-muted mt-1">{match.opponent.gameId}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-caption text-fg-muted">Deadline</p>
          <p className="font-display text-body font-semibold text-fg">
            {match.timeLeft > 0 ? formatTimeLeft(match.timeLeft) : 'Passed'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-caption text-fg-muted">
          <Icon name="trophy" size={16} />
          <span>
            Your rating: {match.myRating} ({match.myRecord})
          </span>
        </div>
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-[2px] bg-accent-subtle px-2 py-1 text-caption text-accent animate-pulse">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            Live
          </span>
        )}
      </div>
    </article>
  );
}

function formatTimeLeft(seconds: number) {
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function MatchDetail({
  match,
  onSubmitResult,
  onOpenDispute,
  onClose,
}: {
  match: (typeof MOCK_MATCHES)[0];
  onSubmitResult: () => void;
  onOpenDispute: () => void;
  onClose: () => void;
}) {
  const stateInfo = STATE_LABELS[match.state] ?? { label: match.state, variant: 'neutral' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-h2 font-semibold text-fg">{match.game}</h2>
        <StatusChip label={stateInfo.label} variant={stateInfo.variant} />
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="label-caps mb-3 text-fg-muted">Opponent</h3>
        <div className="flex items-center gap-3">
          <Avatar username={match.opponent.username} size={32} />
          <div>
            <p className="font-display text-body font-semibold text-fg">
              {match.opponent.username}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <RatingBadge value={match.opponent.rating} />
              <span className="text-caption text-fg-muted">{match.opponent.record}</span>
              <ReputationBadge level={match.opponent.reputation} />
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(match.opponent.gameId)}
              className="mt-2 text-caption text-accent hover:underline flex items-center gap-1"
            >
              <Icon name="copy" size={14} /> Copy game ID
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-body-sm">
        <div className="flex justify-between p-3 rounded-card bg-raised border border-line">
          <span className="text-fg-muted">Status</span>
          <StatusChip label={stateInfo.label} variant={stateInfo.variant} />
        </div>
        <div className="flex justify-between p-3 rounded-card bg-raised border border-line">
          <span className="text-fg-muted">Time window</span>
          <span className="text-fg font-semibold">{formatTimeLeft(match.timeLeft)}</span>
        </div>
        <div className="flex justify-between p-3 rounded-card bg-raised border border-line">
          <span className="text-fg-muted">Stake</span>
          <span className="font-display text-accent font-semibold">{match.stake}</span>
        </div>
        <div className="flex justify-between p-3 rounded-card bg-raised border border-line">
          <span className="text-fg-muted">Format</span>
          <span className="text-fg">{match.format}</span>
        </div>
      </div>

      <Banner variant="system" className="text-sm">
        Submit your result within 30 minutes of match end. Auto-confirm triggers after 2 hours if
        opponent doesn&apos;t respond.
      </Banner>

      <div className="flex flex-col gap-2 pt-2">
        {match.state === 'in_progress' && (
          <Button fullWidth onClick={onSubmitResult}>
            Submit result
          </Button>
        )}
        {match.state === 'awaiting_result' && (
          <Button variant="secondary" fullWidth onClick={onOpenDispute}>
            Open dispute
          </Button>
        )}
        {match.state === 'awaiting_confirmation' && (
          <Button variant="secondary" fullWidth onClick={onOpenDispute}>
            Open dispute
          </Button>
        )}
        <Button variant="ghost" fullWidth onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function SubmitResultSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [outcome, setOutcome] = useState<'won' | 'lost' | 'draw'>('won');
  const [score, setScore] = useState('2-1');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      onSubmit();
    }, 1000);
  };

  return (
    <div className="space-y-4">
      <h3 className="label-caps text-fg-muted">Submit result</h3>

      <div className="space-y-2">
        <label className="text-body-sm text-fg-muted">Outcome</label>
        <div className="flex gap-2">
          {(['won', 'lost', 'draw'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={`flex-1 rounded-card border p-3 text-center font-display text-body font-semibold transition-colors ${
                outcome === o
                  ? 'border-accent bg-accent-subtle text-accent'
                  : 'border-line bg-surface text-fg hover:border-line-strong'
              }`}
            >
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-body-sm text-fg-muted">Score (e.g. 2-1)</label>
        <input
          type="text"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="mt-1 h-11 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="text-body-sm text-fg-muted">Screenshot (optional)</label>
        <div className="mt-1 rounded-card border border-line bg-raised p-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
            className="sr-only"
            id="screenshot-upload"
            ref={(el) => el?.click()}
          />
          <label
            htmlFor="screenshot-upload"
            className="flex items-center justify-center gap-2 cursor-pointer"
          >
            <Icon name="upload" size={20} className="text-fg-muted" />
            <span className="text-body-sm text-fg-muted">Upload screenshot</span>
          </label>
          {screenshot && (
            <div className="mt-2 flex items-center gap-2 text-caption text-fg">
              <Icon name="check-circle" size={16} className="text-win" />
              <span>
                {screenshot.name} ({(screenshot.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="text-body-sm text-fg-muted">Note (optional, max 200 chars)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          rows={3}
          className="mt-1 h-24 w-full rounded-control border border-line bg-raised px-3 py-2 text-body text-fg focus:border-accent focus:outline-none resize-none"
          placeholder="GG, close match!"
        />
      </div>

      <Banner variant="system" className="text-sm">
        By submitting, you confirm this result is accurate. Opponent has 2 hours to confirm or
        dispute. Auto-confirms after 2 hours.
      </Banner>

      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onClose}>
          Cancel
        </Button>
        <Button fullWidth loading={uploading} onClick={handleSubmit}>
          Submit result
        </Button>
      </div>
    </div>
  );
}

function DisputeSheet({ onClose }: { onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="space-y-4">
      <h3 className="label-caps text-fg-muted">Open dispute</h3>

      <div>
        <label className="text-body-sm text-fg-muted">Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={selectClass}>
          <option value="" disabled>
            Select reason
          </option>
          <option value="wrong_score">Wrong score reported</option>
          <option value="wrong_winner">Wrong winner reported</option>
          <option value="rules_violation">Rules violation</option>
          <option value="no_show">Opponent no-show</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="text-body-sm text-fg-muted">Additional details</label>
        <textarea
          rows={3}
          className="mt-1 h-24 w-full rounded-control border border-line bg-raised px-3 py-2 text-body text-fg focus:border-accent focus:outline-none resize-none"
          placeholder="Explain what happened..."
        />
      </div>

      <div>
        <label className="text-body-sm text-fg-muted">Evidence (screenshot/video)</label>
        <div className="mt-1 rounded-card border border-line bg-raised p-3">
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
            className="sr-only"
            id="dispute-evidence"
          />
          <label
            htmlFor="dispute-evidence"
            className="flex items-center justify-center gap-2 cursor-pointer"
          >
            <Icon name="upload" size={20} className="text-fg-muted" />
            <span className="text-body-sm text-fg-muted">
              {evidence ? evidence.name : 'Upload evidence'}
            </span>
          </label>
        </div>
      </div>

      <Banner variant="system" className="text-sm">
        Both sides see the same dispute tracker. A moderator will review within 24 hours. One appeal
        allowed per dispute.
      </Banner>

      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onClose}>
          Cancel
        </Button>
        <Button fullWidth loading={submitting} onClick={handleSubmit}>
          Open dispute
        </Button>
      </div>
    </div>
  );
}

function ResultConfirmedSheet({
  match,
  onClose,
}: {
  match: (typeof MOCK_MATCHES)[0];
  onClose: () => void;
}) {
  const ratingChange = match.ratingChange ?? 12;
  const newRating = match.newRating ?? match.myRating + ratingChange;

  return (
    <div className="space-y-4 text-center">
      <div className="rounded-full bg-win/10 p-4 inline-flex">
        <Icon name="check-circle" size={48} className="text-win" />
      </div>
      <h2 className="font-display text-h1 font-semibold text-fg">Result confirmed!</h2>
      <p className="text-body-sm text-fg-muted">Match {match.id} has been confirmed.</p>

      <div className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="label-caps text-fg-muted">Rating change</span>
          <span className="font-display text-stat-lg font-semibold text-fg tabular">
            {ratingChange > 0 ? '+' : ''}
            {ratingChange}
          </span>
        </div>
        <CountUp
          value={newRating}
          className="font-display text-stat-lg font-semibold text-fg tabular"
        />
        <p className="text-caption text-fg-muted mt-1">New rating</p>
      </div>

      <div className="space-y-2 text-body-sm">
        <div className="flex justify-between">
          <span className="text-fg-muted">Rank</span>
          <span className="text-fg">
            <RankTierBadge tier={2} />
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Record</span>
          <span className="text-fg">{match.myRecord}</span>
        </div>
      </div>

      <Banner variant="system" className="text-sm">
        Your rating has been updated. Payout view reserved for Stage 2.
      </Banner>

      <Button fullWidth onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
