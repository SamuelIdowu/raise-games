'use client';

import { useId, useMemo, useState } from 'react';
import { challengesApi, type Game } from '@raise/api-client';
import { Banner, Button, Icon, Select, Sheet, useToast } from '@/components/ui';
import { formatTimeWindow } from '@/lib/time';
import { useNow } from '@/lib/use-now';

export const RULES_MAX = 2000;
const DURATIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
];

export interface DirectTarget {
  userId: string;
  username: string;
  gameKey: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Next half hour, at least 15 minutes from now, as local date + time input values. */
function defaultStart(now = new Date()): { date: string; time: string } {
  const d = new Date(now.getTime() + 15 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Local date + time inputs → Date (interpreted in the browser's timezone). */
export function toStart(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Create challenge sheet (Design §8, UX Flow 2): game and format pre-selected from the
 * board's game switcher, rules, time window, the stake slot locked to Free with the
 * reason, then a summary step whose button names the action ("Post challenge"). One
 * idempotency key per opened sheet, so a retry after a dropped response never posts twice.
 */
export function CreateChallengeSheet({
  open,
  onClose,
  onCreated,
  games,
  initialGameKey,
  target,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (challengeId: string) => void;
  games: Game[];
  initialGameKey?: string;
  target?: DirectTarget;
}) {
  const { toast } = useToast();
  const ids = useId();
  const firstGame =
    target?.gameKey ??
    (initialGameKey && initialGameKey !== 'all' ? initialGameKey : games[0]?.key) ??
    '';
  const [gameKey, setGameKey] = useState(firstGame);
  const game = games.find((g) => g.key === gameKey);
  const [formatKey, setFormatKey] = useState(game?.formats[0]?.key ?? '');
  const initial = useMemo(() => defaultStart(), []);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(60);
  const [rules, setRules] = useState('');
  const [step, setStep] = useState<'form' | 'summary'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const now = useNow(15_000);
  const startsAt = toStart(date, time);
  const endsAt = startsAt ? new Date(startsAt.getTime() + duration * 60_000) : null;
  const format = game?.formats.find((f) => f.key === formatKey);
  const startError = !startsAt
    ? 'Pick a date and start time'
    : startsAt.getTime() <= now + 5 * 60_000
      ? 'Start at least 5 minutes from now'
      : null;
  const rulesTooLong = [...rules].length > RULES_MAX;
  const canReview = Boolean(game && format && !startError && !rulesTooLong);

  const submit = async () => {
    if (!startsAt || !endsAt || !game || !format) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await challengesApi.create({
        gameKey: game.key,
        formatKey: format.key,
        rules: rules.trim() || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        targetPlayerId: target?.userId,
        idempotencyKey,
      });
      toast({
        title: target ? `Challenge sent to ${target.username}` : 'Challenge posted',
        description: 'It stays open for 48 hours.',
        variant: 'status',
      });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the challenge');
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  const title = target ? `Challenge ${target.username}` : 'Create challenge';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        step === 'form' ? (
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={onClose}>
              Close
            </Button>
            <Button
              fullWidth
              disabled={!canReview}
              hint={
                !canReview
                  ? (startError ?? (rulesTooLong ? 'Rules are too long' : undefined))
                  : undefined
              }
              onClick={() => setStep('summary')}
            >
              Review
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setStep('form')} disabled={busy}>
              Back
            </Button>
            <Button fullWidth loading={busy} onClick={submit}>
              {target ? 'Send challenge' : 'Post challenge'}
            </Button>
          </div>
        )
      }
    >
      {error ? (
        <Banner variant="system" className="mb-4">
          <span className="inline-flex items-center gap-1.5 text-loss">
            <Icon name="alert-triangle" size={16} aria-hidden /> {error}
          </span>
        </Banner>
      ) : null}

      {step === 'form' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Game"
              value={gameKey}
              disabled={Boolean(target)}
              options={games.map((g) => ({ value: g.key, label: g.name }))}
              onChange={(v) => {
                setGameKey(v);
                const next = games.find((g) => g.key === v);
                setFormatKey(next?.formats[0]?.key ?? '');
              }}
            />
            <Select
              label="Format"
              value={formatKey}
              options={(game?.formats ?? []).map((f) => ({ value: f.key, label: f.name }))}
              onChange={setFormatKey}
            />
          </div>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-1 text-body-sm text-fg">When you will play</legend>
            <div>
              <label htmlFor={`${ids}-date`} className="mb-1 block text-caption text-fg-muted">
                Date
              </label>
              <input
                id={`${ids}-date`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 lg:h-10 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor={`${ids}-time`} className="mb-1 block text-caption text-fg-muted">
                Start
              </label>
              <input
                id={`${ids}-time`}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={Boolean(startError) || undefined}
                aria-describedby={startError ? `${ids}-start-err` : undefined}
                className="h-11 lg:h-10 w-full rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
              />
            </div>
            <Select
              label="Window"
              value={String(duration)}
              options={DURATIONS.map((d) => ({ value: String(d.minutes), label: d.label }))}
              onChange={(v) => setDuration(Number(v))}
            />
            {startError ? (
              <p
                id={`${ids}-start-err`}
                className="flex items-center gap-1 text-caption text-loss sm:col-span-3"
              >
                <Icon name="alert-triangle" size={12} aria-hidden /> {startError}
              </p>
            ) : null}
          </fieldset>

          <div>
            <label htmlFor={`${ids}-rules`} className="mb-1 block text-body-sm text-fg">
              Rules <span className="text-fg-muted">(optional)</span>
            </label>
            <textarea
              id={`${ids}-rules`}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={3}
              placeholder="e.g. Best of one. 6-minute halves. No pausing."
              aria-invalid={rulesTooLong || undefined}
              className="block w-full rounded-control border border-line bg-raised px-3 py-2.5 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            <p
              className={`mt-1 text-right text-caption tabular ${rulesTooLong ? 'text-loss' : 'text-fg-subtle'}`}
            >
              {[...rules].length}/{RULES_MAX}
            </p>
          </div>

          <div className="rounded-card border border-line bg-raised p-3">
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-fg">Stake</span>
              <span className="font-display text-h3 font-black uppercase text-accent">Free</span>
            </div>
            <p className="mt-1 text-caption text-fg-muted">
              All matches are free during the founding season. Ratings and reputation still count.
            </p>
          </div>
        </div>
      ) : (
        <dl className="space-y-3 text-body-sm">
          {target ? (
            <Row label="Opponent" value={target.username} />
          ) : (
            <Row label="Who can accept" value="Anyone on the board" />
          )}
          <Row label="Game" value={`${game?.name} · ${format?.name}`} />
          {startsAt && endsAt ? (
            <Row
              label="When"
              value={formatTimeWindow(startsAt.toISOString(), endsAt.toISOString())}
            />
          ) : null}
          <Row label="Stake" value="Free" />
          <Row label="Rules" value={rules.trim() || 'Standard format rules'} />
          <p className="pt-2 text-caption text-fg-muted">
            The challenge stays open for 48 hours. You can cancel it until someone accepts;
            cancelling after that costs reputation.
          </p>
        </dl>
      )}
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-right text-fg">{value}</dd>
    </div>
  );
}
