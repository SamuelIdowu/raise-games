import type { MatchStatus, MatchView } from '@raise/api-client';
import { Icon, type IconName } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SIDE_EXITS, statusDisplay } from '@/lib/match-status';
import { DeadlineCountdown } from './deadline-countdown';

/**
 * Match timeline (Design §8): Accepted → Play → Submit result → Confirm → Done.
 * Step states: done (check), current (accent marker + countdown), upcoming (text-3),
 * blocked (dispute marker with an inline Dispute branch). Vertical on desktop, with a
 * compact horizontal summary on mobile. Every state carries an icon and text, never
 * colour alone.
 */
export const STEPS = ['Accepted', 'Play', 'Submit result', 'Confirm', 'Done'] as const;

export type StepState = 'done' | 'current' | 'upcoming' | 'blocked';

/** Index of the current step for each live status; terminal outcomes mark all done. */
const CURRENT: Partial<Record<MatchStatus, number>> = {
  accepted: 1,
  in_progress: 1,
  awaiting_result: 2,
  awaiting_confirmation: 3,
  disputed: 3,
};

export function stepStates(status: MatchStatus): StepState[] {
  if (status === 'confirmed' || status === 'resolved') return STEPS.map(() => 'done');
  if (SIDE_EXITS.has(status)) return STEPS.map((_, i) => (i === 0 ? 'done' : 'upcoming'));
  const current = CURRENT[status] ?? 0;
  return STEPS.map((_, i) => {
    if (i < current) return 'done';
    if (i === current) return status === 'disputed' ? 'blocked' : 'current';
    return 'upcoming';
  });
}

const MARKER: Record<StepState, { icon: IconName | null; className: string; srLabel: string }> = {
  done: { icon: 'check', className: 'border-fg-muted text-fg-muted', srLabel: 'done' },
  current: {
    icon: null,
    className: 'border-accent bg-accent text-on-accent',
    srLabel: 'current step',
  },
  upcoming: { icon: null, className: 'border-line text-fg-subtle', srLabel: 'upcoming' },
  blocked: {
    icon: 'alert-triangle',
    className: 'border-dispute text-dispute',
    srLabel: 'blocked by a dispute',
  },
};

type TimelineView = Pick<MatchView, 'status' | 'deadline' | 'me' | 'viewerRole' | 'nextAction'>;

function deadlineLabel(view: TimelineView): string {
  return view.deadline?.kind === 'confirm_result' ? 'Confirm by' : 'Submit by';
}

export function MatchTimeline({ view, now }: { view: TimelineView; now?: number }) {
  const states = stepStates(view.status);
  const sideExit = SIDE_EXITS.has(view.status);
  const display = statusDisplay(view);

  return (
    <section
      aria-labelledby="timeline-heading"
      className="rounded-card border border-line bg-surface p-4"
    >
      <h2 id="timeline-heading" className="label-caps mb-3 text-fg-muted">
        Match progress
      </h2>

      {/* Mobile: compact horizontal summary */}
      <ol className="flex items-center gap-1 md:hidden" aria-label="Match progress summary">
        {STEPS.map((step, i) => (
          <li key={step} className="flex flex-1 flex-col items-center gap-1">
            <span
              aria-hidden
              className={cn(
                'h-1 w-full rounded-full',
                states[i] === 'done' && 'bg-fg-muted',
                states[i] === 'current' && 'bg-accent',
                states[i] === 'blocked' && 'bg-dispute',
                states[i] === 'upcoming' && 'bg-line',
              )}
            />
            <span className="sr-only">
              {step}, {MARKER[states[i]!].srLabel}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 flex items-center gap-1.5 text-body-sm text-fg md:hidden">
        <Icon name={display.icon} size={16} aria-hidden />
        <span>{display.label}</span>
      </p>

      {/* Desktop: vertical stepper */}
      <ol className="hidden md:block" aria-label="Match progress">
        {STEPS.map((step, i) => {
          const state = states[i]!;
          const marker = MARKER[state];
          const isLast = i === STEPS.length - 1;
          return (
            <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px',
                    state === 'done' ? 'bg-fg-muted' : 'bg-line',
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                  marker.className,
                )}
              >
                {marker.icon ? <Icon name={marker.icon} size={14} /> : null}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    'text-body-sm',
                    state === 'current' && 'font-semibold text-fg',
                    state === 'done' && 'text-fg-muted',
                    state === 'upcoming' && 'text-fg-subtle',
                    state === 'blocked' && 'font-semibold text-dispute',
                  )}
                >
                  {step}
                  <span className="sr-only">, {marker.srLabel}</span>
                </p>
                {state === 'current' && view.deadline ? (
                  <DeadlineCountdown at={view.deadline.at} label={deadlineLabel(view)} now={now} />
                ) : null}
                {state === 'blocked' ? (
                  <p className="mt-1 flex items-center gap-1.5 text-caption text-dispute">
                    <Icon name="alert-triangle" size={14} aria-hidden />
                    Dispute open — a moderator is reviewing both results
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {sideExit ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-body-sm text-fg-muted">
          <Icon name={display.icon} size={16} aria-hidden />
          Match {display.label.toLowerCase()}
        </p>
      ) : null}

      {/* Mobile countdown sits under the summary */}
      {view.deadline && !sideExit ? (
        <div className="mt-1 md:hidden">
          <DeadlineCountdown at={view.deadline.at} label={deadlineLabel(view)} now={now} />
        </div>
      ) : null}
    </section>
  );
}
