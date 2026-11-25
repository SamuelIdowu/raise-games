'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { challengesApi, type ChallengeCard } from '@raise/api-client';
import { useToast } from '@/components/ui';
import { refresh } from '@/lib/use-api';

/**
 * Accept / decline / cancel with one pending id, toasts, and a refresh of every
 * challenge and match list on screen. Accepting opens the match room.
 */
export function useChallengeActions(onChanged?: () => void) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const run = async (
    c: ChallengeCard,
    action: () => Promise<unknown>,
    done: string,
    failed: string,
  ) => {
    setPendingId(c.id);
    try {
      const result = await action();
      refresh('challenges');
      refresh('matches');
      onChanged?.();
      toast({ title: done, variant: 'status' });
      return result;
    } catch (e) {
      toast({ title: failed, description: (e as Error).message, variant: 'error' });
      refresh('challenges');
      onChanged?.();
      return null;
    } finally {
      setPendingId(null);
    }
  };

  return {
    pendingId,
    accept: async (c: ChallengeCard) => {
      const res = (await run(
        c,
        () => challengesApi.accept(c.id),
        'Challenge accepted',
        'Could not accept',
      )) as { matchId: string } | null;
      if (res?.matchId) router.push(`/matches/${res.matchId}`);
    },
    decline: (c: ChallengeCard) =>
      run(c, () => challengesApi.decline(c.id), 'Challenge declined', 'Could not decline'),
    cancel: (c: ChallengeCard) =>
      run(c, () => challengesApi.cancel(c.id), 'Challenge cancelled', 'Could not cancel'),
  };
}
