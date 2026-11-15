import Link from 'next/link';
import type { MatchView } from '@raise/api-client';
import { Button } from '@/components/ui';
import { TERMINAL, viewerSubmitted } from '@/lib/match-status';

export interface PrimaryActionSpec {
  label: string;
  variant: 'primary' | 'secondary';
  /** Disabled actions always say why (Design §8: never disable silently). */
  disabledReason?: string;
  href?: string;
  secondary?: { label: string; disabledReason?: string };
}

/**
 * The single primary action that changes with match state (UX Flow 4). Result
 * submission, confirmation and disputes ship in Sprints 8–9; until then those actions
 * render in the right states with a reason instead of doing nothing silently.
 */
const SOON = 'Available once result reporting launches';

export function primaryAction(
  view: Pick<MatchView, 'status' | 'me' | 'viewerRole'>,
): PrimaryActionSpec | null {
  if (view.viewerRole !== 'participant') return null;
  if (TERMINAL.has(view.status)) {
    return { label: 'Back to matches', variant: 'secondary', href: '/matches' };
  }
  switch (view.status) {
    case 'accepted':
    case 'in_progress':
    case 'awaiting_result':
      if (viewerSubmitted(view)) {
        return {
          label: 'Waiting for opponent',
          variant: 'secondary',
          disabledReason: 'Your result is in. Your opponent has 24 hours to respond.',
        };
      }
      return {
        label: 'Submit result',
        variant: 'primary',
        disabledReason: SOON,
        secondary: { label: 'Report no-show', disabledReason: SOON },
      };
    case 'awaiting_confirmation':
      if (viewerSubmitted(view)) {
        return {
          label: 'Waiting for opponent',
          variant: 'secondary',
          disabledReason:
            'Your opponent has 24 hours to confirm. If they do not respond, the result is confirmed automatically.',
        };
      }
      return {
        label: 'Confirm result',
        variant: 'primary',
        disabledReason: SOON,
        secondary: { label: 'Open dispute', disabledReason: SOON },
      };
    case 'disputed':
      return {
        label: 'Dispute in review',
        variant: 'secondary',
        disabledReason: 'A moderator is reviewing both results and the chat.',
      };
    default:
      return null;
  }
}

export function PrimaryAction({ view }: { view: Pick<MatchView, 'status' | 'me' | 'viewerRole'> }) {
  const spec = primaryAction(view);
  if (!spec) return null;

  return (
    <div className="flex flex-col gap-2">
      {spec.href ? (
        <Link
          href={spec.href}
          className="inline-flex h-11 w-full items-center justify-center rounded-control border border-line-strong px-4 text-h3 text-fg hover:bg-overlay"
        >
          {spec.label}
        </Link>
      ) : (
        <Button
          fullWidth
          variant={spec.variant}
          disabled={Boolean(spec.disabledReason)}
          hint={spec.disabledReason}
        >
          {spec.label}
        </Button>
      )}
      {spec.secondary ? (
        <Button
          fullWidth
          variant="ghost"
          disabled={Boolean(spec.secondary.disabledReason)}
          // Same reason as the primary is already shown once just above.
          hint={
            spec.secondary.disabledReason !== spec.disabledReason
              ? spec.secondary.disabledReason
              : undefined
          }
          aria-label={
            spec.secondary.disabledReason
              ? `${spec.secondary.label} (${spec.secondary.disabledReason})`
              : undefined
          }
        >
          {spec.secondary.label}
        </Button>
      ) : null}
    </div>
  );
}
