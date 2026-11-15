'use client';

import { useMemo, useState } from 'react';
import { SCORE_BOUNDS, RESULT_ERROR_MESSAGES, validateResult } from '@raise/game-configs/results';
import { matchesApi, type MatchDetail, type MatchOutcome } from '@raise/api-client';
import {
  Banner,
  Button,
  Icon,
  OutcomeSelector,
  ProofUpload,
  ScoreStepper,
  Sheet,
  type OutcomeOption,
} from '@/components/ui';
import { RESULT_RULES, resultCopy } from '@/lib/copy/results';
import { formatDateTime } from '@/lib/datetime';
import { track } from '@/lib/analytics';
import { useProofUpload } from '@/lib/use-proof-upload';
import { useNow } from '@/lib/use-now';

type Choice = MatchOutcome | 'no_show';

export interface ResultSheetProps {
  match: MatchDetail;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  /** Open straight on the no-show option (from the "Report no-show" action). */
  initialChoice?: Choice;
}

/**
 * Result submission sheet (Design §8; UX Flow 5): outcome rows, score steppers
 * from the game config, screenshot upload, optional note, and a summary line
 * that explains auto-confirm before the user submits.
 */
export function ResultSheet({
  match,
  open,
  onClose,
  onSubmitted,
  initialChoice,
}: ResultSheetProps) {
  const schema = match.format.resultSchema;
  const bounds = SCORE_BOUNDS[schema.scoreModel];
  const defaultScore = bounds.min;

  const [choice, setChoice] = useState<Choice | null>(initialChoice ?? null);
  const [self, setSelf] = useState(defaultScore);
  const [opponent, setOpponent] = useState(defaultScore);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  // One key per sheet session: a retried submit after a dropped response is a replay, not a duplicate.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const resultProof = useProofUpload(match.id, 'result_proof');
  const noShowProof = useProofUpload(match.id, 'no_show_proof');
  const isNoShow = choice === 'no_show';
  const proof = isNoShow ? noShowProof : resultProof;

  // State resets per opening: the parent remounts this sheet with a new `key` each time.
  const now = useNow(15_000);
  const noShowOpen = now >= new Date(match.noShowAvailableAt).getTime();
  const options: OutcomeOption<Choice>[] = useMemo(() => {
    const list: OutcomeOption<Choice>[] = [
      { value: 'win', label: resultCopy.outcomes.win },
      { value: 'loss', label: resultCopy.outcomes.loss },
    ];
    if (schema.drawAllowed) list.push({ value: 'draw', label: resultCopy.outcomes.draw });
    if (noShowOpen) list.push({ value: 'no_show', label: resultCopy.outcomes.no_show });
    return list;
  }, [schema.drawAllowed, noShowOpen]);

  const scoreError = useMemo(() => {
    if (!choice || isNoShow) return null;
    const v = validateResult(schema, choice, { self, opponent });
    return v.ok ? null : RESULT_ERROR_MESSAGES[v.error];
  }, [choice, isNoShow, schema, self, opponent]);

  const proofRequired = isNoShow || match.format.requiredProof.includes('screenshot');
  const proofReady = proof.state.status === 'ready';
  const proofBusy = ['compressing', 'uploading', 'processing'].includes(proof.state.status);
  const blockReason = !choice
    ? null
    : scoreError
      ? scoreError
      : proofRequired && proofBusy
        ? resultCopy.waitForUpload
        : proofRequired && !proofReady
          ? resultCopy.needScreenshot
          : null;

  const submit = async () => {
    setTouched(true);
    if (!choice || blockReason) return;
    setSubmitting(true);
    setError(null);
    try {
      const uploadId = proof.state.status === 'ready' ? proof.state.uploadId : undefined;
      if (isNoShow) {
        await matchesApi.reportNoShow(match.id, {
          uploadId: uploadId!,
          note: note || undefined,
          idempotencyKey,
        });
      } else {
        await matchesApi.submitResult(match.id, {
          outcome: choice,
          score: { self, opponent },
          uploadId,
          note: note || undefined,
          idempotencyKey,
        });
      }
      track('result_submitted', {
        kind: isNoShow ? 'no_show' : 'result',
        side: match.me.side,
        game: match.game.key,
        had_opponent_submission: match.opponent.submission !== null,
      });
      onSubmitted();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'Failed to fetch'
          ? err.message
          : resultCopy.submitFailed,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const summary = isNoShow
    ? resultCopy.noShowSummary(RESULT_RULES.confirmationWindowHours)
    : resultCopy.summary(RESULT_RULES.confirmationWindowHours);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNoShow ? resultCopy.noShowTitle : resultCopy.sheetTitle}
      footer={
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-body-sm text-fg-muted">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <span>{summary}</span>
          </p>
          <Button
            size="lg"
            fullWidth
            loading={submitting}
            disabled={!choice || (touched && !!blockReason)}
            hint={touched && blockReason ? blockReason : undefined}
            onClick={submit}
          >
            {isNoShow ? resultCopy.submitNoShow : resultCopy.submit}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <div role="alert">
            <Banner variant="system" className="border-loss/50">
              {error}
            </Banner>
          </div>
        ) : null}

        <OutcomeSelector
          legend={resultCopy.outcomeLegend}
          options={options}
          value={choice}
          onChange={setChoice}
        />
        {!noShowOpen ? (
          <p className="-mt-4 text-caption text-fg-muted">
            {resultCopy.noShowAvailable} {formatDateTime(match.noShowAvailableAt)}
          </p>
        ) : null}

        {choice && !isNoShow ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-sm text-fg-muted">
              {resultCopy.scoreLegend} · {bounds.label}
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <ScoreStepper
                label={resultCopy.you}
                unit={bounds.label.toLowerCase()}
                min={bounds.min}
                max={bounds.max}
                value={self}
                onChange={setSelf}
              />
              <ScoreStepper
                label={resultCopy.opponent}
                unit={bounds.label.toLowerCase()}
                min={bounds.min}
                max={bounds.max}
                value={opponent}
                onChange={setOpponent}
              />
            </div>
            {scoreError ? (
              <p className="flex items-center gap-1 text-caption text-loss" role="alert">
                <Icon name="alert-triangle" size={16} />
                {scoreError}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {choice ? (
          <ProofUpload
            label={resultCopy.screenshot}
            help={isNoShow ? resultCopy.noShowScreenshotHelp : resultCopy.screenshotHelp}
            state={proof.state}
            copy={resultCopy.upload}
            onPick={proof.pick}
            onRetry={proof.retry}
            onRemove={proof.remove}
            error={
              touched && proofRequired && proof.state.status === 'idle'
                ? resultCopy.needScreenshot
                : undefined
            }
          />
        ) : null}

        {choice ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="result-note" className="text-body-sm text-fg-muted">
              {resultCopy.note}
            </label>
            <textarea
              id="result-note"
              value={note}
              maxLength={RESULT_RULES.noteMaxLength}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder={resultCopy.notePlaceholder}
              aria-describedby="result-note-count"
              className="min-h-24 w-full resize-none rounded-card border border-line bg-raised px-3 py-2 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            <p id="result-note-count" className="self-end text-caption text-fg-muted tabular">
              {note.length}/{RESULT_RULES.noteMaxLength}
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
