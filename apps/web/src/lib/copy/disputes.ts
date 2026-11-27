import type { DisputeCategory, RulingOutcome } from '@raise/api-client';

/**
 * Dispute copy (Design §9 voice: plain words, say "dispute" not "complaint"). Kept in one
 * catalogue so it can be localised; strings leave ~30% headroom for longer languages.
 */
export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  wrong_score: 'The score is wrong',
  wrong_winner: 'The wrong player is marked as the winner',
  opponent_cheated: 'My opponent cheated',
  no_show: 'My opponent did not show up',
  disconnect: 'The match was interrupted',
  other: 'Something else',
};

export const disputeCopy = {
  open: {
    cta: 'Open dispute',
    title: 'Open a dispute',
    intro:
      'A moderator reviews both results, the evidence and the match chat, then records a ruling with a reason.',
    category: 'What went wrong?',
    detail: 'Tell the moderator what happened',
    detailHelp: 'At least 10 characters. Stick to facts: scores, times, what you saw.',
    evidence: 'Screenshot (optional)',
    confirm: 'Opening a dispute stops the 24-hour auto-confirm. Both players see the same status.',
    submit: 'Open dispute',
    opened: 'Dispute opened',
  },
  panel: {
    title: 'Dispute',
    openedBySystem: 'Opened automatically because the two results do not match.',
    openedByYou: 'You opened this dispute.',
    openedByOpponent: 'Your opponent opened this dispute.',
    evidenceMine: (n: number) => `${n} piece${n === 1 ? '' : 's'} of evidence from you`,
    evidenceTheirs: (n: number) => `${n} from your opponent`,
    addEvidence: 'Add evidence',
    evidenceNote: 'Note (optional)',
    evidenceAdded: 'Evidence added',
    evidenceLeft: (n: number) => `You can add ${n} more.`,
  },
  ruling: {
    title: 'Ruling',
    appealTitle: 'Ruling on appeal',
    reason: "Moderator's reason",
    sanction: 'Action taken',
    previous: 'First ruling',
  },
  appeal: {
    cta: 'Appeal ruling',
    title: 'Appeal the ruling',
    intro:
      'Each dispute can be appealed once. A moderator reviews it again and that ruling is final.',
    reason: 'Why is the ruling wrong?',
    submit: 'Send appeal',
    sent: 'Appeal sent',
  },
};

export function outcomeLabel(
  outcome: 'win' | 'loss' | 'draw' | 'void' | null,
  raw: RulingOutcome,
): string {
  if (outcome === 'win') return 'You won';
  if (outcome === 'loss') return 'You lost';
  if (outcome === 'draw' || raw === 'draw') return 'Draw';
  if (outcome === 'void' || raw === 'void') return 'Match voided';
  return raw === 'side0_win' ? 'Challenger won' : 'Opponent won';
}
