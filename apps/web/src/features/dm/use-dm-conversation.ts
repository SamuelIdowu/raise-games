'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  ServerEvents,
  dmApi,
  type ChatMessage,
  type DmConversation,
} from '@raise/api-client';
import { getSocket } from '@/lib/realtime';
import { POLL_INTERVAL_MS, mergeMessages, type ChatEntry } from '@/lib/use-match-room';

/**
 * One DM conversation (Sprint 14, F14.3). Live over the shared socket (`dm:message` on the
 * user room), polling every 5s while it is down. Sends go over HTTP with a client message
 * id, so a retry never stores a message twice.
 *
 * `missing` is true when the API answers 404: the flag is off or this is not the caller's
 * conversation. The page turns that into a not-found screen.
 */
export function useDmConversation(conversationId: string, meId: string | null) {
  const [conversation, setConversation] = useState<DmConversation | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const nameRef = useRef('Player');

  const refreshHeader = useCallback(async () => {
    try {
      const next = await dmApi.get(conversationId);
      nameRef.current = next.other.name;
      setConversation(next);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError((e as Error).message);
    }
  }, [conversationId]);

  const refreshMessages = useCallback(async () => {
    try {
      const page = await dmApi.messages(conversationId, { limit: 50 });
      setMessages((prev) => mergeMessages(prev, page.messages));
      void dmApi.markRead(conversationId).catch(() => undefined);
    } catch {
      // Keep what we have; the next poll or live event retries.
    }
  }, [conversationId]);

  useEffect(() => {
    // Both set state only after their fetch resolves; the rule cannot see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHeader();
    void refreshMessages();
  }, [refreshHeader, refreshMessages]);

  useEffect(() => {
    const socket = getSocket();
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () => {
      if (timer) return;
      timer = setInterval(() => void refreshMessages(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (!socket) {
      poll();
      return stop;
    }
    const onMessage = (msg: ChatMessage) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) => mergeMessages(prev, [msg]));
      if (msg.senderId !== meId) {
        setAnnouncement(`New message from ${nameRef.current}`);
        void dmApi.markRead(conversationId).catch(() => undefined);
      }
    };
    const onConnect = () => {
      stop();
      void refreshMessages();
    };
    socket.on(ServerEvents.DmMessage, onMessage);
    socket.on('connect', onConnect);
    socket.on('disconnect', poll);
    socket.on('connect_error', poll);
    if (!socket.connected && !socket.active) poll();
    return () => {
      stop();
      socket.off(ServerEvents.DmMessage, onMessage);
      socket.off('connect', onConnect);
      socket.off('disconnect', poll);
      socket.off('connect_error', poll);
    };
  }, [conversationId, meId, refreshMessages]);

  const deliver = useCallback(
    async (body: string, clientMsgId: string) => {
      try {
        const result = await dmApi.send(conversationId, body, clientMsgId);
        setMessages((prev) => mergeMessages(prev, [result.message]));
      } catch (e) {
        const message = e instanceof TypeError ? 'Not sent' : (e as Error).message;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === clientMsgId && m.delivery !== 'sent'
              ? { ...m, delivery: 'failed', error: message }
              : m,
          ),
        );
        // A block or unfriend since the page loaded: refresh so the composer gives way.
        if (e instanceof ApiError && e.status === 403) void refreshHeader();
      }
    },
    [conversationId, refreshHeader],
  );

  const send = useCallback(
    (body: string) => {
      const clientMsgId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${clientMsgId}`,
          matchId: null,
          conversationId,
          senderId: meId,
          kind: 'user',
          body,
          clientMsgId,
          createdAt: new Date().toISOString(),
          delivery: 'sending',
        },
      ]);
      void deliver(body, clientMsgId);
    },
    [conversationId, deliver, meId],
  );

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

  return {
    conversation,
    messages,
    missing,
    error,
    announcement,
    send,
    retry,
    refresh: refreshHeader,
    setConversation,
  };
}
