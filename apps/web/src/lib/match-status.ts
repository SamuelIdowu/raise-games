import type { MatchStatus, MatchView } from '@raise/api-client';
import type { IconName, StatusChipVariant } from '@/components/ui';

/**
 * One status model for chips, the timeline and banners (Design §7). The viewer matters
 * for the Awaiting states: the chip is accent only when the viewer must act.
 */
export interface StatusDisplay {
  label: string;
  variant: StatusChipVariant;
  icon: IconName;
  /** True when the viewer has the next required action. */
  viewerMustAct: boolean;
}

const ICONS: Record<MatchStatus, IconName> = {
  open: 'circle',
  accepted: 'check',
  in_progress: 'play',
  awaiting_result: 'clock',
  awaiting_confirmation: 'clock',
  confirmed: 'check-circle',
  disputed: 'alert-triangle',
  resolved: 'check-circle',
  cancelled: 'ban',
  expired: 'hourglass',
  forfeited: 'flag',
  voided: 'undo',
};

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

/** Did the viewer already submit a result for this match? */
export function viewerSubmitted(view: Pick<MatchView, 'me'>): boolean {
  return Boolean(view.me?.submittedAt);
}

export function statusDisplay(
  view: Pick<MatchView, 'status' | 'me' | 'viewerRole'>,
): StatusDisplay {
  const icon = ICONS[view.status];
  const participant = view.viewerRole === 'participant';
  switch (view.status) {
    case 'open':
      return { label: 'Open', variant: 'neutral', icon, viewerMustAct: false };
    case 'accepted':
      return { label: 'Accepted', variant: 'neutral', icon, viewerMustAct: false };
    case 'in_progress':
      return { label: 'In progress', variant: 'neutral', icon, viewerMustAct: false };
    case 'awaiting_result': {
      const act = participant && !viewerSubmitted(view);
      return {
        label: 'Awaiting result',
        variant: act ? 'accent' : 'neutral',
        icon,
        viewerMustAct: act,
      };
    }
    case 'awaiting_confirmation': {
      const act = participant && !viewerSubmitted(view);
      return {
        label: act
          ? 'Needs confirmation'
          : participant
            ? 'Waiting for opponent'
            : 'Awaiting confirmation',
        variant: act ? 'accent' : 'neutral',
        icon,
        viewerMustAct: act,
      };
    }
    case 'confirmed':
      return { label: 'Confirmed', variant: 'neutral', icon, viewerMustAct: false };
    case 'disputed':
      return { label: 'Disputed', variant: 'dispute', icon, viewerMustAct: false };
    case 'resolved':
      return { label: 'Resolved', variant: 'neutral', icon, viewerMustAct: false };
    default: {
      const label = view.status.charAt(0).toUpperCase() + view.status.slice(1);
      return { label, variant: 'muted', icon, viewerMustAct: false };
    }
  }
}
