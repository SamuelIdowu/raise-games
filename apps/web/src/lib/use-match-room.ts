'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClientEvents,
  ServerEvents,
  chatApi,
  matchesApi,
  type Ack,
  type ChatMessage,
  type MatchStateEvent,
  type MatchView,
  type SendResult,
} from '@raise/api-client';
import { getSocket } from './realtime';
import { statusDisplay } from './match-status';

export type DeliveryState = 'sending' | 'sent' | 'failed';

export interface ChatEntry extends ChatMessage {
  delivery: DeliveryState;
  error?: string;
}

export type Connection = 'connecting' | 'live' | 'polling';

export const POLL_INTERVAL_MS = 5000;
const SEND_TIMEOUT_MS = 8000;

function newClientId(): string {
  return crypto.randomUUID();
}

/** Server messages by id; local pending/failed sends by clientMsgId until confirmed. */
function mergeMessages(current: ChatEntry[], incoming: ChatMessage[]): ChatEntry[] {
  const byId = new Map<string, ChatEntry>();
  const pending: ChatEntry[] = [];
  for (const entry of current) {
    if (entry.delivery === 'sent') byId.set(entry.id, entry);
    else pending.push(entry);
  }
  for (const msg of incoming) byId.set(msg.id, { ...msg, delivery: 'sent' });
  const confirmed = new Set([...byId.values()].map((m) => m.clientMsgId).filter(Boolean));
  const stillPending = pending.filter((p) => !confirmed.has(p.clientMsgId));
  const sent = [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
  return [...sent, ...stillPending];
}

/**
 * Everything the match room needs: the hub view, live chat, delivery states, and a
 * polite announcement string for an aria-live region (Design §10). Live over the
 * shared socket; while the socket is down it polls the HTTP endpoints every 5s and
 * sends over HTTP, with the same clientMsgId dedupe.
 */
export function useMatchRoom(matchId: string) {
  const [view, setView] = useState<MatchView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [announcement, setAnnouncement] = useState('');
  const viewRef = useRef<MatchView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const refreshView = useCallback(async () => {
    try {
      const next = await matchesApi.get(matchId);
      setView((prev) => (prev && prev.version > next.version ? prev : next));
      setLoadError(null);
      return next;
    } catch (error) {
      setLoadError((error as Error).message);
      return null;
    }
  }, [matchId]);

  const refreshMessages = useCallback(async () => {
    try {
      const page = await chatApi.list(matchId, { limit: 50 });
      setMessages((prev) => mergeMessages(prev, page.messages));
    } catch {
      // Keep what we have; the next poll or reconnect retries.
    }
  }, [matchId]);

  // Initial load. The page keys this hook's component by match id, so state starts
  // fresh for each match without resetting it here.
  useEffect(() => {
    void refreshView();
    void refreshMessages();
  }, [refreshView, refreshMessages]);

  // Live socket, with polling fallback.
  useEffect(() => {
    const socket = getSocket();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      setConnection('polling');
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        void refreshView();
        void refreshMessages();
      }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    if (!socket) {
      startPolling();
      return stopPolling;
    }

    const subscribe = async () => {
      const ack = (await socket
        .timeout(SEND_TIMEOUT_MS)
        .emitWithAck(ClientEvents.MatchSubscribe, { matchId })
        .catch(() => null)) as Ack<{ version: number }> | null;
      if (!ack?.ok) return startPolling();
      stopPolling();
      setConnection('live');
      // Catch up on anything that changed while disconnected.
      if (!viewRef.current || ack.data.version > viewRef.current.version) void refreshView();
      void refreshMessages();
    };

    const onState = (event: MatchStateEvent) => {
      if (event.matchId !== matchId) return;
      const current = viewRef.current;
      if (current && event.version <= current.version) return;
      void refreshView().then((next) => {
        if (next) setAnnouncement(`Match status: ${statusDisplay(next).label}`);
      });
      // State changes can post system messages (e.g. "a dispute has been opened").
      void refreshMessages();
    };

    const onMessage = (msg: ChatMessage) => {
      if (msg.matchId !== matchId) return;
      setMessages((prev) => mergeMessages(prev, [msg]));
      const me = viewRef.current?.me?.userId;
      if (msg.kind === 'system') setAnnouncement(msg.body);
      else if (msg.senderId !== me) {
        const sender = viewRef.current?.players.find((p) => p.userId === msg.senderId);
        setAnnouncement(`New message from ${sender?.username ?? 'opponent'}`);
      }
    };

    const onLocked = (event: { matchId: string }) => {
      if (event.matchId === matchId) void refreshView();
    };

    const onDisconnect = () => startPolling();

    socket.on('connect', subscribe);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on(ServerEvents.MatchState, onState);
    socket.on(ServerEvents.ChatMessage, onMessage);
    socket.on(ServerEvents.ChatLocked, onLocked);
    if (socket.connected) void subscribe();
    else if (!socket.active) startPolling();

    return () => {
      stopPolling();
      socket.off('connect', subscribe);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off(ServerEvents.MatchState, onState);
      socket.off(ServerEvents.ChatMessage, onMessage);
      socket.off(ServerEvents.ChatLocked, onLocked);
      if (socket.connected) socket.emit(ClientEvents.MatchUnsubscribe, { matchId });
    };
  }, [matchId, refreshView, refreshMessages]);

  const deliver = useCallback(
    async (body: string, clientMsgId: string) => {
      const socket = getSocket();
      try {
        let result: SendResult;
        if (socket?.connected) {
          const ack = (await socket
            .timeout(SEND_TIMEOUT_MS)
            .emitWithAck(ClientEvents.ChatSend, { matchId, body, clientMsgId })) as Ack<SendResult>;
          if (!ack.ok) throw new Error(ack.error);
          result = ack.data;
        } else {
          result = await chatApi.send(matchId, body, clientMsgId);
        }
        setMessages((prev) => mergeMessages(prev, [result.message]));
      } catch (error) {
        const message = (error as Error).message;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === clientMsgId && m.delivery !== 'sent'
              ? {
                  ...m,
                  delivery: 'failed',
                  // Transport failures (socket ack timeout, fetch network error) read
                  // as "Not sent"; server refusals keep their message ("Chat is closed").
                  error:
                    message === 'operation has timed out' || error instanceof TypeError
                      ? 'Not sent'
                      : message,
                }
              : m,
          ),
        );
        if (message === 'Chat is closed') void refreshView();
      }
    },
    [matchId, refreshView],
  );

  const send = useCallback(
    (body: string) => {
      const me = viewRef.current?.me?.userId ?? null;
      const clientMsgId = newClientId();
      const optimistic: ChatEntry = {
        id: `local-${clientMsgId}`,
        matchId,
        conversationId: '',
        senderId: me,
        kind: 'user',
        body,
        clientMsgId,
        createdAt: new Date().toISOString(),
        delivery: 'sending',
      };
      setMessages((prev) => [...prev, optimistic]);
      void deliver(body, clientMsgId);
    },
    [deliver, matchId],
  );

  /** Resends with the same clientMsgId, so the server never stores it twice. */
  const retry = useCallback(
    (clientMsgId: string) => {
      const entry = messages.find((m) => m.clientMsgId === clientMsgId && m.delivery === 'failed');
      if (!entry) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMsgId === clientMsgId ? { ...m, delivery: 'sending', error: undefined } : m,
        ),
      );
      void deliver(entry.body, clientMsgId);
    },
    [deliver, messages],
  );

  return { view, loadError, messages, connection, announcement, send, retry, refreshView };
}

export { mergeMessages };
