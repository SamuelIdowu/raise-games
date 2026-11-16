'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Banner, EmptyState, Icon, SkeletonCard, StatusChip } from '@/components/ui';
import { MatchChat } from '@/components/match/match-chat';
import { MatchTimeline } from '@/components/match/match-timeline';
import { OpponentCard } from '@/components/match/opponent-card';
import { ResultActions, needsActionCopy } from '@/components/match/result-actions';
import { isParticipantView } from '@raise/api-client';
import { RoomCodePanel } from '@/components/match/room-code-panel';
import { DisputePanel } from '@/components/match/dispute-panel';
import { statusDisplay } from '@/lib/match-status';
import { useMatchRoom } from '@/lib/use-match-room';

/**
 * Match room — the hub (UX Flow 4, Sprint 7 F7.2): status timeline, opponent card,
 * deadline countdown, room code, rules, chat, and one primary action that changes
 * with state. Live over the shared WebSocket; polls when the socket is down.
 */
export function MatchRoomClient() {
  const { id } = useParams<{ id: string }>();
  // Keyed so moving between matches remounts with fresh state.
  return <MatchRoom key={id} id={id} />;
}

function MatchRoom({ id }: { id: string }) {
  const {
    view,
    loadError,
    messages,
    connection,
    announcement,
    liveTick,
    send,
    retry,
    refreshView,
  } = useMatchRoom(id);

  if (!view) {
    if (loadError) {
      return (
        <EmptyState
          icon="alert-triangle"
          title="Match not found"
          description="It may have been removed, or you are not one of its players."
          action={
            <Link href="/matches" className="text-accent hover:underline">
              Back to matches
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading match">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const display = statusDisplay(view);
  const opponent = view.me ? view.players.find((p) => p.userId !== view.me!.userId) : undefined;
  const isStaff = view.viewerRole === 'staff';

  return (
    <div className="space-y-4">
      {/* Polite announcements for socket-driven updates (Design §10). Never steals focus. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/matches"
            className="inline-flex min-h-11 items-center gap-1 text-caption text-fg-muted hover:text-fg"
          >
            <Icon name="chevron-left" size={14} aria-hidden /> Matches
          </Link>
          <h1 className="font-display text-h1 font-semibold text-fg">{view.game.name}</h1>
          <p className="text-body-sm text-fg-muted">
            {view.format.name} · <span className="tabular">#{view.id.slice(-6).toUpperCase()}</span>
          </p>
        </div>
        <StatusChip label={display.label} variant={display.variant} icon={display.icon} />
      </header>

      {connection === 'polling' ? (
        <Banner variant="offline">Live updates paused. Refreshing every few seconds.</Banner>
      ) : null}
      {display.viewerMustAct && needsActionCopy(view) ? (
        <Banner variant="needs-action">{needsActionCopy(view)}</Banner>
      ) : null}
      {isStaff ? <Banner variant="system">Viewing as staff. This view is audited.</Banner> : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <MatchTimeline view={view} />

          {isStaff ? (
            view.players.map((p) => (
              <OpponentCard
                key={p.userId}
                player={p}
                heading={p.isPoster ? 'Challenger' : 'Accepted by'}
              />
            ))
          ) : opponent ? (
            <OpponentCard player={opponent} />
          ) : null}

          <RoomCodePanel view={view} onSaved={() => void refreshView()} />

          {view.rules ? (
            <section aria-label="Rules" className="rounded-card border border-line bg-surface p-4">
              <h2 className="label-caps mb-2 text-fg-muted">Rules</h2>
              <p className="whitespace-pre-wrap text-body-sm text-fg">{view.rules}</p>
            </section>
          ) : null}

          {['disputed', 'resolved', 'voided'].includes(view.status) ? (
            <DisputePanel
              matchId={view.id}
              refreshKey={liveTick + view.version}
              onChanged={() => {
                void refreshView();
              }}
            />
          ) : null}

          {isParticipantView(view) ? (
            <ResultActions
              match={view}
              onChanged={() => {
                void refreshView();
              }}
            />
          ) : null}
        </div>

        <MatchChat
          matchId={view.id}
          meId={view.me?.userId ?? null}
          players={view.players}
          messages={messages}
          locked={view.chat.locked}
          canSend={!isStaff}
          onSend={send}
          onRetry={retry}
        />
      </div>
    </div>
  );
}
