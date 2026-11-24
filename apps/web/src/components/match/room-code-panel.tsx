'use client';

import { useId, useState } from 'react';
import { matchesApi, type MatchView } from '@raise/api-client';
import { Button, Icon, useToast } from '@/components/ui';

/**
 * Room code (F6.5 / F7.2). Shown for games that use a custom room (games.json `roomCode`).
 * Either player can set or change it while the match is live; only the two players ever
 * see it. A required code that is still missing is called out.
 */
export function RoomCodePanel({
  view,
  onSaved,
}: {
  view: Pick<MatchView, 'id' | 'roomCode' | 'roomCodeMode' | 'canSetRoomCode'>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(view.roomCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view.roomCodeMode === 'none' && !view.roomCode) return null;
  if (!view.canSetRoomCode && !view.roomCode) return null;

  const copy = async () => {
    if (!view.roomCode) return;
    try {
      await navigator.clipboard.writeText(view.roomCode);
      toast({ title: 'Room code copied', variant: 'status' });
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Select the code and copy it manually.',
        variant: 'error',
      });
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await matchesApi.setRoomCode(view.id, draft);
      setEditing(false);
      toast({ title: 'Room code shared', variant: 'status' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the room code');
    } finally {
      setBusy(false);
    }
  };

  const showForm = view.canSetRoomCode && (editing || !view.roomCode);

  return (
    <section aria-label="Room code" className="surface-card rounded-card p-4">
      <h2 className="label-caps mb-2 text-fg-muted">Room code</h2>
      {showForm ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {!view.roomCode && view.roomCodeMode === 'required' ? (
            <p className="flex items-center gap-1.5 text-body-sm text-fg">
              <Icon name="info" size={16} className="text-accent" aria-hidden />
              This game is played in a custom room. Create it, then share the code here.
            </p>
          ) : null}
          <label htmlFor={inputId} className="block text-caption text-fg-muted">
            Code
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. 7Q2K-91"
              autoComplete="off"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? `${inputId}-err` : undefined}
              className="h-11 min-w-0 flex-1 rounded-control border border-line bg-raised px-3 font-mono text-body text-fg focus:border-accent focus:outline-none"
            />
            <Button type="submit" loading={busy} disabled={!draft.trim()}>
              Share
            </Button>
          </div>
          {error ? (
            <p id={`${inputId}-err`} className="flex items-center gap-1 text-caption text-loss">
              <Icon name="alert-triangle" size={12} aria-hidden /> {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-h3 text-fg tabular">{view.roomCode}</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-caption text-accent hover:underline"
          >
            <Icon name="copy" size={14} aria-hidden /> Copy
          </button>
          {view.canSetRoomCode ? (
            <button
              type="button"
              onClick={() => {
                setDraft(view.roomCode ?? '');
                setEditing(true);
              }}
              className="inline-flex min-h-11 items-center px-2 text-caption text-fg-muted hover:text-fg"
            >
              Change
            </button>
          ) : null}
        </div>
      )}
      <p className="mt-1 text-caption text-fg-muted">Only you and your opponent can see this.</p>
    </section>
  );
}
