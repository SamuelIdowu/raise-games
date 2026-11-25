'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { authApi, dmApi } from '@raise/api-client';
import { Banner, Button, Icon, SkeletonCard, useToast } from '@/components/ui';
import { MatchChat } from '@/components/match/match-chat';
import { BlockSheet } from '@/features/dm/dm-kit';
import { useDmConversation } from '@/features/dm/use-dm-conversation';

export function ConversationClient() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [meId, setMeId] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [muting, setMuting] = useState(false);
  const dm = useDmConversation(id, meId);

  useEffect(() => {
    authApi
      .me()
      .then((me) => setMeId(me.id))
      .catch(() => setMeId(null));
  }, []);

  // Flag off, or not this player's conversation: the page does not exist.
  if (dm.missing) notFound();
  if (!dm.conversation) {
    return dm.error ? (
      <Banner variant="offline">Could not load this conversation. {dm.error}</Banner>
    ) : (
      <SkeletonCard />
    );
  }

  const c = dm.conversation;
  const toggleMute = async () => {
    setMuting(true);
    try {
      const r = await dmApi.mute(c.conversationId, !c.muted);
      dm.setConversation({ ...c, muted: r.muted });
      toast({
        title: r.muted ? 'Conversation muted' : 'Conversation unmuted',
        description: r.muted ? 'No notifications from this conversation.' : undefined,
        variant: 'status',
      });
    } catch (e) {
      toast({
        title: 'Could not change mute',
        description: (e as Error).message,
        variant: 'error',
      });
    } finally {
      setMuting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <Link
          href="/inbox?tab=messages"
          aria-label="Back to messages"
          className="flex size-11 items-center justify-center rounded-control text-fg-muted hover:bg-overlay"
        >
          <Icon name="chevron-left" size={20} aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-h2 font-black uppercase text-fg">
          <Link href={`/profile/${c.other.userId}`} className="hover:underline">
            {c.other.name}
          </Link>
        </h1>
        <Button
          size="sm"
          variant="ghost"
          loading={muting}
          aria-pressed={c.muted}
          onClick={() => void toggleMute()}
        >
          <Icon name={c.muted ? 'bell-off' : 'mail'} size={16} aria-hidden />
          {c.muted ? 'Muted' : 'Mute'}
        </Button>
        {!c.blockedByMe ? (
          <Button size="sm" variant="ghost" onClick={() => setBlocking(true)}>
            <Icon name="ban" size={16} aria-hidden /> Block
          </Button>
        ) : null}
      </header>

      {c.blockedByMe ? (
        <Banner variant="system">
          You blocked {c.other.name}. Manage this in{' '}
          <Link href="/messages/blocked" className="text-accent hover:underline">
            Blocked players
          </Link>
          .
        </Banner>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {dm.announcement}
      </p>

      <MatchChat
        matchId={null}
        meId={meId}
        players={[{ userId: c.other.userId, username: c.other.name }]}
        messages={dm.messages}
        locked={!c.canSend}
        lockedText={c.notice ?? 'You can’t send messages in this conversation.'}
        canSend={c.canSend}
        onSend={dm.send}
        onRetry={dm.retry}
        heading="Messages"
        emptyText={`Say hello to ${c.other.name}. Keep it about the game: no payments or moving off RAISE.`}
        onReport={(messageId, reason) => dmApi.report(c.conversationId, messageId, reason)}
        reportNote="Moderators see this message and the conversation around it."
        blockNote={`Neither of you can message the other. ${c.other.name} is not told.`}
        onBlocked={() => void dm.refresh()}
      />

      {blocking ? (
        <BlockSheet
          userId={c.other.userId}
          name={c.other.name}
          onClose={() => setBlocking(false)}
          onDone={() => void dm.refresh()}
        />
      ) : null}
    </div>
  );
}
