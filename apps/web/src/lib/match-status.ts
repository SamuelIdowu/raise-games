import type { MatchStatus, MatchView } from '@raise/api-client';
import type { IconName, StatusChipVariant } from '@/components/ui';
import { matchStateIcon } from '@/components/ui';

/**
 * One status model for chips, the timeline and banners (Design §7). The server's
 * `nextAction` decides whether the viewer must act; the chip is accent only then.
 */
export interface StatusDisplay {
  label: string;
  variant: StatusChipVariant;
  icon: IconName;
  /** True when the viewer has the next required action. */
  viewerMustAct: boolean;
}

export const TERMINAL: ReadonlySet<MatchStatus> = new Set([
  'confirmed',
  'resolved',
  'cancelled',
  'expired',
  'forfeited',
  'voided',
]);

export const SIDE_EXITS: ReadonlySet<MatchStatus> = new Set([
  'cancelled',
  'expired',
  'forfeited',
  'voided',
]);

type StatusInput = Pick<MatchView, 'status' | 'nextAction'> &
  Partial<Pick<MatchView, 'viewerRole'>>;

export function statusDisplay(view: StatusInput): StatusDisplay {
  const icon = matchStateIcon(view.status) as IconName;
  const mustAct =
    view.viewerRole !== 'staff' &&
    (view.nextAction === 'submit_result' || view.nextAction === 'confirm_or_submit');
  const plain = (label: string, variant: StatusChipVariant = 'neutral'): StatusDisplay => ({
    label,
    variant,
    icon,
    viewerMustAct: false,
  });
  switch (view.status) {
    case 'accepted':
    case 'in_progress':
    case 'awaiting_result': {
      const label =
        view.status === 'accepted'
          ? 'Accepted'
          : view.status === 'in_progress'
            ? 'In progress'
            : 'Awaiting result';
      return { label, variant: mustAct ? 'accent' : 'neutral', icon, viewerMustAct: mustAct };
    }
    case 'awaiting_confirmation':
      if (view.viewerRole === 'staff') return plain('Awaiting confirmation');
      return mustAct
        ? { label: 'Needs confirmation', variant: 'accent', icon, viewerMustAct: true }
        : plain('Waiting for opponent');
    case 'confirmed':
      return plain('Confirmed');
    case 'disputed':
      return plain('Disputed', 'dispute');
    case 'resolved':
      return plain('Resolved');
    case 'cancelled':
      return plain('Cancelled', 'muted');
    case 'expired':
      return plain('Expired', 'muted');
    case 'forfeited':
      return plain('Forfeited', 'muted');
    case 'voided':
      return plain('Voided', 'muted');
    default:
      return plain('Open');
  }
}

/** Sprint 8 name for the same chip. */
export function matchChip(view: StatusInput): {
  label: string;
  variant: StatusChipVariant;
  icon: IconName;
} {
  const { label, variant, icon } = statusDisplay(view);
  return { label, variant, icon };
}

/** Win/Loss tag, only for finished matches (Design §7). */
export function outcomeTag(
  match: Pick<MatchView, 'outcomeForViewer'>,
): { label: string; variant: StatusChipVariant; icon: IconName } | null {
  if (match.outcomeForViewer === 'win') return { label: 'Win', variant: 'win', icon: 'trophy' };
  if (match.outcomeForViewer === 'loss') return { label: 'Loss', variant: 'loss', icon: 'x' };
  if (match.outcomeForViewer === 'draw')
    return { label: 'Draw', variant: 'neutral', icon: 'minus' };
  return null;
}

export const TIER_LEVEL: Record<string, 1 | 2 | 3 | 4 | 5> = {
  rookie: 1,
  challenger: 2,
  contender: 3,
  elite: 4,
  champion: 5,
};
