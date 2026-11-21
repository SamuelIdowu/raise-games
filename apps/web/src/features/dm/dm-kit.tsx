'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { chatApi, dmApi, type DmRelationship } from '@raise/api-client';
import { Button, Icon, Sheet, useToast } from '@/components/ui';

/**
 * Whether restricted DMs exist for this player (`messaging.dm`, Sprint 14). `undefined`
 * while loading, `false` when the flag is off: callers render no DM affordance at all.
 */
export function useDmEnabled(): { enabled: boolean | undefined; incomingRequests: number } {
  const [state, setState] = useState<{ enabled: boolean | undefined; incomingRequests: number }>({
    enabled: undefined,
    incomingRequests: 0,
  });
  useEffect(() => {
    let live = true;
    dmApi
      .status()
      .then((s) => live && setState({ enabled: !!s, incomingRequests: s?.incomingRequests ?? 0 }))
      .catch(() => live && setState({ enabled: false, incomingRequests: 0 }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** Block confirmation (F14.4). Neutral copy; the other player is never told. */
export function BlockSheet({
  userId,
  name,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await chatApi.block(userId);
      toast({ title: `${name} blocked`, variant: 'status' });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: 'Could not block', description: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Block ${name}?`}
      footer={
        <div className="flex flex-col gap-2">
          <Button fullWidth variant="danger" loading={busy} onClick={confirm}>
            Block {name}
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-body-sm text-fg">
        <li>Neither of you can message the other or send friend requests.</li>
        <li>If you are friends, the friendship ends.</li>
        <li>{name} is not told. Your past messages are kept for reports and disputes.</li>
      </ul>
      <p className="mt-3 text-caption text-fg-muted">
        Blocked by mistake? You can unblock from{' '}
        <Link href="/messages/blocked" className="text-accent hover:underline">
          Blocked players
        </Link>
        .
      </p>
    </Sheet>
  );
}

/**
 * Profile DM actions (F14.2/F14.3): friend request lifecycle, the Message button (only for
 * eligible pairs), and block/unblock. Renders nothing while the flag is off.
 */
export function DmActions({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { enabled } = useDmEnabled();
  const [rel, setRel] = useState<DmRelationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    dmApi
      .relationship(userId)
      .then((r) => live && setRel(r))
      .catch(() => live && setRel(null));
    return () => {
      live = false;
    };
  }, [enabled, userId, tick]);

  if (!enabled || !rel || rel.self) return null;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast({ title: done, variant: 'status' });
      setTick((t) => t + 1);
    } catch (e) {
      toast({ title: 'Something went wrong', description: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const message = async () => {
    setBusy(true);
    try {
      const { conversationId } = await dmApi.open(userId);
      router.push(`/messages/${conversationId}`);
    } catch (e) {
      toast({
        title: 'Could not open messages',
        description: (e as Error).message,
        variant: 'error',
      });
      setBusy(false);
    }
  };

  return (
    <section aria-label={`You and ${name}`} className="flex flex-wrap items-center gap-2">
      {rel.blockedByMe ? (
        <>
          <span className="text-body-sm text-fg-muted">You blocked {name}.</span>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => void run(() => chatApi.unblock(userId), `${name} unblocked`)}
          >
            Unblock
          </Button>
        </>
      ) : (
        <>
          {rel.canMessage ? (
            <Button size="sm" loading={busy} onClick={() => void message()}>
              <Icon name="mail" size={16} aria-hidden /> Message
            </Button>
          ) : null}
          {rel.friend === 'none' ? (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => void run(() => dmApi.requestFriend(userId), 'Friend request sent')}
            >
              <Icon name="user-plus" size={16} aria-hidden /> Add friend
            </Button>
          ) : rel.friend === 'outgoing' ? (
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={() =>
                void run(() => dmApi.respond(rel.requestId!, 'cancel'), 'Request cancelled')
              }
            >
              Request sent · Cancel
            </Button>
          ) : rel.friend === 'incoming' ? (
            <>
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  void run(() => dmApi.respond(rel.requestId!, 'accept'), 'You are now friends')
                }
              >
                Accept friend request
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() => void run(() => dmApi.respond(rel.requestId!, 'decline'))}
              >
                Decline
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={() => void run(() => dmApi.unfriend(userId), 'Removed from friends')}
            >
              Friends · Remove
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setBlocking(true)}>
            <Icon name="ban" size={16} aria-hidden /> Block
          </Button>
        </>
      )}
      {blocking ? (
        <BlockSheet
          userId={userId}
          name={name}
          onClose={() => setBlocking(false)}
          onDone={() => setTick((t) => t + 1)}
        />
      ) : null}
    </section>
  );
}
