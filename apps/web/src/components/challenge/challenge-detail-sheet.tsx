'use client';

import { useEffect, useState } from 'react';
import {
  challengesApi,
  reportsApi,
  type ChallengeCard as ChallengeCardData,
  type ReportReasonCode,
} from '@raise/api-client';
import {
  Avatar,
  Banner,
  Button,
  Icon,
  RatingBadge,
  ReputationBadge,
  Select,
  Sheet,
  Skeleton,
  useToast,
} from '@/components/ui';
import { formatAbsolute, formatTimeWindow } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import { isChallengeExpired } from './challenge-card';

const REPORT_REASONS: Array<{ value: ReportReasonCode; label: string }> = [
  { value: 'harassment', label: 'Abusive or insulting' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'cheating', label: 'Cheating or match fixing' },
  { value: 'off_platform', label: 'Asks for money or to move off RAISE' },
  { value: 'spam', label: 'Spam' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
];

type Mode = 'view' | 'confirm-cancel' | 'report';

/**
 * Challenge detail (F6.4): full rules, poster card, time window and expiry, the actions
 * for the viewer's role, a cancel confirmation whose button names the action, and a
 * report form (routed to the generic Report entity; triage is Sprint 12).
 */
export function ChallengeDetailSheet({
  challengeId,
  summary,
  onClose,
  onAccept,
  onDecline,
  onCancel,
  pending,
}: {
  challengeId: string;
  /** The card already on screen, shown while the detail loads. */
  summary?: ChallengeCardData;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => Promise<void>;
  pending: boolean;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<ChallengeCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [reason, setReason] = useState<ReportReasonCode>('harassment');
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let live = true;
    challengesApi
      .get(challengeId)
      .then((d) => live && setDetail(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [challengeId]);

  const now = useNow();
  const c = detail ?? summary;
  const expired = c ? isChallengeExpired(c, now) : false;
  const late = c?.status === 'accepted';

  const report = async () => {
    if (!c) return;
    setReporting(true);
    try {
      const res = await reportsApi.create({ subjectType: 'challenge', subjectId: c.id, reason });
      toast({
        title: res.alreadyReported ? 'Already reported' : 'Report sent',
        description: 'A moderator will review it.',
        variant: 'status',
      });
      setMode('view');
    } catch (e) {
      toast({
        title: 'Could not send report',
        description: (e as Error).message,
        variant: 'error',
      });
    } finally {
      setReporting(false);
    }
  };

  const title =
    mode === 'confirm-cancel'
      ? 'Cancel this challenge?'
      : mode === 'report'
        ? 'Report challenge'
        : 'Challenge details';

  const footer = !c ? null : mode === 'confirm-cancel' ? (
    <div className="flex flex-col gap-2">
      <Button
        fullWidth
        variant="danger"
        loading={pending}
        onClick={async () => {
          await onCancel();
          onClose();
        }}
      >
        Cancel challenge
      </Button>
      <Button fullWidth variant="ghost" onClick={() => setMode('view')} disabled={pending}>
        Keep challenge
      </Button>
    </div>
  ) : mode === 'report' ? (
    <div className="flex flex-col gap-2">
      <Button fullWidth loading={reporting} onClick={report}>
        Send report
      </Button>
      <Button fullWidth variant="ghost" onClick={() => setMode('view')}>
        Back
      </Button>
    </div>
  ) : c.isMine ? (
    c.status === 'open' || c.status === 'accepted' ? (
      <Button fullWidth variant="secondary" onClick={() => setMode('confirm-cancel')}>
        Cancel challenge
      </Button>
    ) : null
  ) : c.status === 'open' && !expired ? (
    <div className="flex gap-2">
      {c.isForMe ? (
        <Button fullWidth variant="secondary" onClick={onDecline} disabled={pending}>
          Decline
        </Button>
      ) : null}
      <Button fullWidth loading={pending} onClick={onAccept}>
        Accept challenge
      </Button>
    </div>
  ) : (
    <Button
      fullWidth
      disabled
      hint={expired ? 'This challenge is past its 48-hour window' : 'No longer open'}
    >
      Accept challenge
    </Button>
  );

  return (
    <Sheet open onClose={onClose} title={title} size="lg" footer={footer}>
      {!c ? (
        error ? (
          <Banner variant="system">{error}</Banner>
        ) : (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        )
      ) : mode === 'confirm-cancel' ? (
        <div className="space-y-3 text-body-sm text-fg">
          {late ? (
            <Banner variant="needs-action">
              Someone already accepted. Cancelling now ends the match and lowers your reputation.
            </Banner>
          ) : (
            <p>
              Nobody has accepted yet, so cancelling is free. It comes off the board straight away.
            </p>
          )}
        </div>
      ) : mode === 'report' ? (
        <div className="space-y-3">
          <Select
            label="What is wrong with it?"
            value={reason}
            options={REPORT_REASONS}
            onChange={(v) => setReason(v as ReportReasonCode)}
          />
          <p className="text-caption text-fg-muted">
            Reports are private. The poster is not told who reported them.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-h3 font-semibold text-fg">{c.game.name}</p>
              <p className="text-body-sm text-fg-muted">{c.format.name}</p>
            </div>
            <span className="font-display text-h3 font-semibold text-accent">
              {c.stake.display}
            </span>
          </div>

          <section aria-label="Posted by" className="rounded-card border border-line bg-raised p-3">
            <div className="flex items-center gap-3">
              <Avatar username={c.poster.username} size={32} />
              <div className="min-w-0">
                <p className="truncate font-display text-body font-semibold text-fg">
                  {c.poster.username}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <RatingBadge value={c.poster.rating} provisional={c.poster.provisional} />
                  <span className="text-caption text-fg-muted">{c.poster.rankLabel}</span>
                  <span className="text-caption text-fg-muted tabular">{c.poster.record}</span>
                  <ReputationBadge level={c.poster.reputation} />
                </div>
              </div>
            </div>
          </section>

          <dl className="space-y-2 text-body-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">When</dt>
              <dd className="text-right text-fg">
                {formatTimeWindow(c.timeWindow.startsAt, c.timeWindow.endsAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Open until</dt>
              <dd className="text-right text-fg">{formatAbsolute(c.expiresAt)}</dd>
            </div>
            {c.target ? (
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Sent to</dt>
                <dd className="text-right text-fg">{c.target.username}</dd>
              </div>
            ) : null}
          </dl>

          <section aria-label="Rules">
            <h3 className="label-caps mb-1 text-fg-muted">Rules</h3>
            {detail ? (
              <p className="whitespace-pre-wrap text-body-sm text-fg">
                {detail.rules || 'Standard format rules.'}
              </p>
            ) : (
              <Skeleton className="h-4 w-3/4" />
            )}
          </section>

          <p className="text-caption text-fg-muted">
            Submit your result within 24 hours of the start. Your opponent then has 24 hours to
            confirm; if they do not respond, it is confirmed automatically.
          </p>

          {!c.isMine ? (
            <button
              type="button"
              onClick={() => setMode('report')}
              className="inline-flex min-h-11 items-center gap-1 text-caption text-fg-muted hover:text-fg"
            >
              <Icon name="flag" size={14} aria-hidden /> Report this challenge
            </button>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
