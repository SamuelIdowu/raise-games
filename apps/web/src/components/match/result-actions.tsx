'use client';

import { useState } from 'react';
import type { MatchDetail } from '@raise/api-client';
import { Banner, Button, Icon, useToast } from '@/components/ui';
import { ConfirmPanel } from '@/features/results/confirm-panel';
import { ConfirmedSummary } from '@/features/results/confirmed-summary';
import { ResultSheet } from '@/features/results/result-sheet';
import { RESULT_RULES, resultCopy } from '@/lib/copy/results';
import { formatDateTime, formatRelative } from '@/lib/datetime';
import { useNow } from '@/lib/use-now';

/**
 * The match room's single primary action (UX Flow 4 + 5): it follows the server's
 * `nextAction` — submit result / report no-show, confirm or submit a different result,
 * waiting state with the auto-confirm time, dispute notice, or the confirmed summary.
 * Built on the Sprint 8 result components; shown to participants only.
 */
export function ResultActions({ match, onChanged }: { match: MatchDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState<null | 'result' | 'no_show'>(null);
  // Each opening remounts the sheet (fresh state and idempotency key).
  const [session, setSession] = useState(0);
  const openSheet = (mode: 'result' | 'no_show') => {
    setSession((n) => n + 1);
    setSheet(mode);
  };
  const now = useNow(15_000);
  const noShowOpen = now >= new Date(match.noShowAvailableAt).getTime();

  const afterSubmit = async () => {
    setSheet(null);
    toast({ title: resultCopy.submitted, variant: 'status' });
    onChanged();
  };

  let body: React.ReactNode;
  switch (match.nextAction) {
    case 'wait_for_start':
      body = (
        <Button size="lg" fullWidth disabled hint={resultCopy.waitForStart}>
          {resultCopy.submit}
        </Button>
      );
      break;
    case 'submit_result':
      body = (
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => openSheet('result')}>
            {resultCopy.submit}
          </Button>
          {noShowOpen ? (
            <Button variant="ghost" fullWidth onClick={() => openSheet('no_show')}>
              {resultCopy.noShowCta}
            </Button>
          ) : (
            <p className="text-center text-caption text-fg-muted">
              {resultCopy.noShowAvailable} {formatDateTime(match.noShowAvailableAt)}
            </p>
          )}
        </div>
      );
      break;
    case 'confirm_or_submit':
      body = (
        <ConfirmPanel
          match={match}
          onConfirmed={onChanged}
          onSubmitDifferent={() => openSheet('result')}
        />
      );
      break;
    case 'waiting_for_opponent':
      body = (
        <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 font-display text-h2 font-semibold text-fg">
            <Icon name="clock" size={20} className="text-fg-muted" aria-hidden />
            {resultCopy.waiting.title}
          </h2>
          <p className="text-body-sm text-fg-muted">
            {resultCopy.waiting.body(RESULT_RULES.confirmationWindowHours)}
          </p>
          {match.confirmationDeadline ? (
            <p className="text-body-sm text-fg">
              {resultCopy.waiting.autoConfirmAt}{' '}
              <time dateTime={match.confirmationDeadline}>
                {formatDateTime(match.confirmationDeadline)}
              </time>{' '}
              <span className="text-fg-muted">({formatRelative(match.confirmationDeadline)})</span>
            </p>
          ) : null}
        </section>
      );
      break;
    case 'disputed':
      body = (
        <section className="flex flex-col gap-2 rounded-card border border-dispute/40 bg-surface p-4">
          <h2 className="flex items-center gap-2 font-display text-h2 font-semibold text-fg">
            <Icon name="alert-triangle" size={20} className="text-dispute" aria-hidden />
            {resultCopy.disputed.title}
          </h2>
          <p className="text-body-sm text-fg-muted">{resultCopy.disputed.body}</p>
        </section>
      );
      break;
    case 'done':
      body = <ConfirmedSummary match={match} />;
      break;
    default:
      body = <Banner variant="system">{resultCopy.closed}</Banner>;
  }

  return (
    <>
      {body}
      <ResultSheet
        key={session}
        match={match}
        open={sheet !== null}
        initialChoice={sheet === 'no_show' ? 'no_show' : undefined}
        onClose={() => setSheet(null)}
        onSubmitted={afterSubmit}
      />
    </>
  );
}

/** Needs-your-action banner text (Design §7: always the accent). */
export function needsActionCopy(match: Pick<MatchDetail, 'nextAction'>): string | null {
  if (match.nextAction === 'submit_result')
    return 'Submit your result within 24 hours of the agreed start.';
  if (match.nextAction === 'confirm_or_submit') {
    return 'Your opponent submitted a result. Confirm it or submit your own.';
  }
  return null;
}
