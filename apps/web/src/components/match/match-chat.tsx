'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { chatApi, type MatchPlayer, type ReportReason } from '@raise/api-client';
import { Banner, Button, Icon, Sheet, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/time';
import type { ChatEntry } from '@/lib/use-match-room';

export const CHAT_MAX_CHARS = 500;

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'harassment', label: 'Harassment or insults' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'cheating', label: 'Cheating or match fixing' },
  { value: 'off_platform', label: 'Asking for money or to move off RAISE' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

function charCount(text: string): number {
  return [...text].length;
}

/**
 * Match chat (Design §8): radius-4 bubbles — own right-aligned on accent-subtle,
 * others on bg-2, system messages centred caption text. Delivery states sending /
 * sent / failed with retry. Plain text only: no link previews, links are not linkified.
 * Report and block live in each message's overflow menu. When locked, a banner replaces
 * the composer.
 */
export function MatchChat({
  matchId,
  meId,
  players,
  messages,
  locked,
  canSend,
  onSend,
  onRetry,
  heading = 'Match chat',
  emptyText = 'No messages yet. Agree a time and share the room code here.',
  lockedText = 'Chat is closed',
  onReport,
  blockNote,
  reportNote = 'Moderators can read this match chat when reviewing reports and disputes.',
  onBlocked,
}: {
  matchId: string | null;
  meId: string | null;
  players: Array<Pick<MatchPlayer, 'userId' | 'username'>>;
  messages: ChatEntry[];
  locked: boolean;
  /** False for staff viewers: read-only. */
  canSend: boolean;
  onSend: (body: string) => void;
  onRetry: (clientMsgId: string) => void;
  /** Sprint 14: the same panel renders direct messages; these override match wording. */
  heading?: string;
  emptyText?: string;
  /** Shown instead of the composer when `locked`. */
  lockedText?: string;
  /** Defaults to the match-chat report endpoint. */
  onReport?: (messageId: string, reason: ReportReason) => Promise<unknown>;
  blockNote?: string;
  reportNote?: string;
  onBlocked?: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);
  const [draft, setDraft] = useState('');
  const [action, setAction] = useState<{ entry: ChatEntry; mode: 'report' | 'block' } | null>(null);
  const composerId = useId();
  const counterId = useId();
  const nameOf = (id: string | null) => players.find((p) => p.userId === id)?.username ?? 'Player';

  // Keep pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const count = charCount(draft);
  const overLimit = count > CHAT_MAX_CHARS;
  const submit = () => {
    const body = draft.trim();
    if (!body || overLimit) return;
    stickToBottom.current = true;
    onSend(body);
    setDraft('');
  };

  return (
    <section
      aria-labelledby="chat-heading"
      className="flex min-h-[420px] flex-col rounded-card border border-line bg-surface"
    >
      <h2 id="chat-heading" className="label-caps border-b border-line px-4 py-3 text-fg-muted">
        {heading}
      </h2>

      <ol
        ref={listRef}
        onScroll={onScroll}
        aria-label="Messages"
        className="flex-1 space-y-2 overflow-y-auto px-4 py-3"
        style={{ maxHeight: '55vh' }}
      >
        {messages.length === 0 ? (
          <li className="py-8 text-center text-caption text-fg-muted">{emptyText}</li>
        ) : null}
        {messages.map((m) =>
          m.kind === 'system' ? (
            <li key={m.id} className="py-1 text-center text-caption text-fg-muted">
              {m.body}
            </li>
          ) : (
            <MessageBubble
              key={m.clientMsgId ?? m.id}
              entry={m}
              own={m.senderId === meId}
              senderName={nameOf(m.senderId)}
              onRetry={onRetry}
              onAction={
                canSend && m.senderId !== meId && m.delivery === 'sent'
                  ? (mode) => setAction({ entry: m, mode })
                  : undefined
              }
            />
          ),
        )}
      </ol>

      {locked ? (
        <div className="border-t border-line p-3">
          <Banner variant="system">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="lock" size={16} aria-hidden /> {lockedText}
            </span>
          </Banner>
        </div>
      ) : canSend ? (
        <form
          className="flex items-start gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex-1">
            <label htmlFor={composerId} className="sr-only">
              Message
            </label>
            <textarea
              id={composerId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Message"
              aria-describedby={counterId}
              aria-invalid={overLimit || undefined}
              className={cn(
                'block min-h-11 w-full resize-none rounded-control border bg-raised px-3 py-2.5 text-body text-fg placeholder:text-fg-subtle focus:outline-none',
                overLimit ? 'border-loss' : 'border-line focus:border-accent',
              )}
            />
            <p
              id={counterId}
              className={cn(
                'mt-1 text-right text-caption tabular',
                overLimit ? 'text-loss' : 'text-fg-subtle',
              )}
            >
              {overLimit ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="alert-triangle" size={12} aria-hidden /> {count}/{CHAT_MAX_CHARS} —
                  too long
                </span>
              ) : count > CHAT_MAX_CHARS - 50 ? (
                `${count}/${CHAT_MAX_CHARS}`
              ) : (
                <span className="sr-only">{`${count} of ${CHAT_MAX_CHARS} characters`}</span>
              )}
            </p>
          </div>
          <Button type="submit" disabled={!draft.trim() || overLimit} aria-label="Send message">
            Send
          </Button>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-caption text-fg-muted">
          Viewing as staff. Read-only.
        </p>
      )}

      {action?.mode === 'report' ? (
        <ReportSheet
          entry={action.entry}
          senderName={nameOf(action.entry.senderId)}
          note={reportNote}
          submitReport={
            onReport ??
            ((messageId, reason) =>
              matchId ? chatApi.report(matchId, messageId, reason) : Promise.resolve(null))
          }
          onClose={() => setAction(null)}
        />
      ) : null}
      {action?.mode === 'block' && action.entry.senderId ? (
        <BlockSheet
          userId={action.entry.senderId}
          name={nameOf(action.entry.senderId)}
          note={blockNote}
          onBlocked={onBlocked}
          onClose={() => setAction(null)}
        />
      ) : null}
    </section>
  );
}

function MessageBubble({
  entry,
  own,
  senderName,
  onRetry,
  onAction,
}: {
  entry: ChatEntry;
  own: boolean;
  senderName: string;
  onRetry: (clientMsgId: string) => void;
  onAction?: (mode: 'report' | 'block') => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !menuRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <li className={cn('flex flex-col', own ? 'items-end' : 'items-start')}>
      <div className={cn('group flex max-w-[85%] items-start gap-1', own && 'flex-row-reverse')}>
        <div
          className={cn(
            'rounded-card px-3 py-2 text-body text-fg',
            own ? 'bg-accent-subtle' : 'bg-raised',
            entry.delivery === 'failed' && 'border border-loss/60',
          )}
        >
          <span className="sr-only">{own ? 'You' : senderName}: </span>
          <p className="whitespace-pre-wrap break-words">{entry.body}</p>
        </div>
        {onAction ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label={`Message actions for message from ${senderName}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-11 items-center justify-center rounded-control text-fg-muted hover:bg-overlay"
            >
              <Icon name="menu" size={16} aria-hidden />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-11 z-20 min-w-40 rounded-card border border-line bg-raised py-1 shadow-lg"
              >
                {(
                  [
                    { mode: 'report', label: 'Report', icon: 'flag' },
                    { mode: 'block', label: `Block ${senderName}`, icon: 'ban' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    role="menuitem"
                    className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-body-sm text-fg hover:bg-overlay"
                    onClick={() => {
                      setMenuOpen(false);
                      onAction(item.mode);
                    }}
                  >
                    <Icon name={item.icon} size={14} aria-hidden /> {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="mt-0.5 flex items-center gap-1 px-1 text-caption text-fg-subtle">
        {entry.delivery === 'sending' ? (
          <>
            <Icon name="loader" size={12} className="animate-spin" aria-hidden /> Sending
          </>
        ) : entry.delivery === 'failed' ? (
          <>
            <Icon name="alert-triangle" size={12} className="text-loss" aria-hidden />
            <span className="text-loss">{entry.error ?? 'Not sent'}</span>
            {entry.clientMsgId ? (
              <button
                type="button"
                onClick={() => onRetry(entry.clientMsgId!)}
                className="ml-1 min-h-11 px-1 font-semibold text-accent hover:underline"
              >
                Retry
              </button>
            ) : null}
          </>
        ) : (
          <time dateTime={entry.createdAt}>{formatClock(entry.createdAt)}</time>
        )}
      </p>
    </li>
  );
}

function ReportSheet({
  entry,
  senderName,
  note,
  submitReport,
  onClose,
}: {
  entry: ChatEntry;
  senderName: string;
  note: string;
  submitReport: (messageId: string, reason: ReportReason) => Promise<unknown>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [busy, setBusy] = useState(false);
  const groupId = useId();

  const submit = async () => {
    setBusy(true);
    try {
      await submitReport(entry.id, reason);
      toast({
        title: 'Report sent',
        description: 'A moderator will review it.',
        variant: 'status',
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Could not send report',
        description: (error as Error).message,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Report message from ${senderName}`}
      footer={
        <div className="flex flex-col gap-2">
          <Button fullWidth loading={busy} onClick={submit}>
            Report message
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <blockquote className="mb-4 rounded-card border border-line bg-raised px-3 py-2 text-body-sm text-fg-muted whitespace-pre-wrap break-words">
        {entry.body}
      </blockquote>
      <fieldset aria-describedby={`${groupId}-help`}>
        <legend className="mb-2 text-body-sm font-semibold text-fg">What is wrong with it?</legend>
        <p id={`${groupId}-help`} className="sr-only">
          Choose one reason
        </p>
        <div className="space-y-1">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-overlay"
            >
              <input
                type="radio"
                name={`${groupId}-reason`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="size-4 accent-[var(--accent)]"
              />
              <span className="text-body-sm text-fg">{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-caption text-fg-muted">{note}</p>
    </Sheet>
  );
}

function BlockSheet({
  userId,
  name,
  note,
  onBlocked,
  onClose,
}: {
  userId: string;
  name: string;
  note?: string;
  onBlocked?: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await chatApi.block(userId);
      toast({ title: `${name} blocked`, variant: 'status' });
      onBlocked?.();
      onClose();
    } catch (error) {
      toast({ title: 'Could not block', description: (error as Error).message, variant: 'error' });
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
      <p className="text-body-sm text-fg">
        {note ??
          `${name} goes on your block list. This match chat stays open so you can finish the match or report messages.`}
      </p>
    </Sheet>
  );
}
