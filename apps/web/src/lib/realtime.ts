'use client';

import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, ServerEvents, getAccessToken, refreshAccessToken } from '@raise/api-client';

/**
 * One shared WebSocket for the whole app (TA: one connection carries chat, live match
 * state and notifications). WebSocket-only transport: when it cannot connect, screens
 * fall back to HTTP polling instead of socket.io long-polling.
 *
 * Auth: the handshake reads the current access token each time it connects, so a
 * reconnect after a token refresh uses the new token. A server-side refusal does not
 * auto-retry in socket.io, so expired/unauthenticated refusals refresh and reconnect
 * here, at most once per refusal.
 */
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;
  if (!getAccessToken()) return null;

  const s = io(API_BASE_URL, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: getAccessToken() }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  let lastReauth = 0;
  const reauth = async () => {
    // Guard against a loop if the refresh succeeds but the server still refuses.
    if (Date.now() - lastReauth < 10_000) return;
    lastReauth = Date.now();
    if (await refreshAccessToken()) s.connect();
  };

  s.on('connect_error', (err) => {
    if (err.message === 'unauthenticated' || err.message === 'session_expired') void reauth();
  });
  s.on(ServerEvents.AuthRevoked, () => void reauth());

  socket = s;
  return s;
}

/** For logout: drop the socket so the next login opens a fresh one. */
export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}
