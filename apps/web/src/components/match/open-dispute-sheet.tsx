'use client';

import { useId, useState } from 'react';
import { disputesApi, type DisputeCategory } from '@raise/api-client';
import { Banner, Button, Icon, ProofUpload, Select, Sheet, useToast } from '@/components/ui';
import { DISPUTE_CATEGORY_LABELS, disputeCopy } from '@/lib/copy/disputes';
import { resultCopy } from '@/lib/copy/results';
import { useProofUpload } from '@/lib/use-proof-upload';

const CATEGORIES = Object.entries(DISPUTE_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Open-dispute sheet (UX Flow 6, F9.2): reason category, detail, optional screenshot,
 * the consequence stated before confirming, and a button that names the action.
 * Remount with a new `key` per opening for fresh state.
 */
export function OpenDisputeSheet({
  matchId,
  open,
  onClose,
  onOpened,
}: {
  matchId: string;
  open: boolean;
  onClose: () => void;
  onOpened: () => void;
}) {
  const { toast } = useToast();
  const detailId = useId();
  const [category, setCategory] = useState<DisputeCategory>('wrong_score');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evidence = useProofUpload(matchId, 'dispute_evidence');
  const uploading = ['compressing', 'uploading', 'processing'].includes(evidence.state.status);
  const tooShort = detail.trim().length < 10;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await disputesApi.open(matchId, {
        category,
        detail: detail.trim(),
        uploadIds: evidence.state.status === 'ready' ? [evidence.state.uploadId] : undefined,
      });
      toast({ title: disputeCopy.open.opened, variant: 'status' });
      onOpened();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the dispute');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={disputeCopy.open.title}
      size="lg"
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-caption text-fg-muted">{disputeCopy.open.confirm}</p>
          <Button
            fullWidth
            variant="danger"
            loading={busy}
            disabled={tooShort || uploading}
            hint={
              tooShort
                ? disputeCopy.open.detailHelp
                : uploading
                  ? resultCopy.waitForUpload
                  : undefined
            }
            onClick={submit}
          >
            {disputeCopy.open.submit}
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-body-sm text-fg-muted">{disputeCopy.open.intro}</p>
        {error ? (
          <Banner variant="system">
            <span className="inline-flex items-center gap-1.5 text-loss">
              <Icon name="alert-triangle" size={16} aria-hidden /> {error}
            </span>
          </Banner>
        ) : null}
        <Select
          label={disputeCopy.open.category}
          value={category}
          options={CATEGORIES}
          onChange={(v) => setCategory(v as DisputeCategory)}
        />
        <div>
          <label htmlFor={detailId} className="mb-1 block text-body-sm text-fg">
            {disputeCopy.open.detail}
          </label>
          <textarea
            id={detailId}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={4}
            maxLength={1000}
            aria-describedby={`${detailId}-help`}
            className="block w-full rounded-control border border-line bg-raised px-3 py-2.5 text-body text-fg focus:border-accent focus:outline-none"
          />
          <p id={`${detailId}-help`} className="mt-1 text-caption text-fg-muted">
            {disputeCopy.open.detailHelp} <span className="tabular">{detail.length}/1000</span>
          </p>
        </div>
        <ProofUpload
          label={disputeCopy.open.evidence}
          help="A screenshot of the final score or anything that shows what happened."
          state={evidence.state}
          copy={resultCopy.upload}
          onPick={evidence.pick}
          onRetry={evidence.retry}
          onRemove={evidence.remove}
        />
      </div>
    </Sheet>
  );
}
