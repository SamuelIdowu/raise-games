/**
 * WebSocket gateway load test (Sprint 15, F15.3). TA: "load-test the gateway with Redis
 * pub/sub at several thousand concurrent connections".
 *
 * Opens SOCKETS connections spread round-robin across the API instances in WS_URLS (so
 * fan-out has to cross the Redis adapter), each authenticated as a load player and
 * subscribed to that player's match room. Then, for ROUNDS rounds, one player of every
 * match sends a chat message and the script times delivery to every socket of both
 * players in that room.
 *
 *   SOCKETS=200 ROUNDS=5 WS_URLS=http://localhost:3301,http://localhost:3302 \
 *     tsx src/scripts/ws-load.ts load-tokens.json
 *
 * Pass/fail (exit code): connect failures under 1%, p95 connect under 2 s, p95 fan-out
 * under 1 s, no missed deliveries. Full staging run: SOCKETS=3000.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

interface Player {
  userId: string;
  token: string;
  matchId: string;
  role: 'a' | 'b';
}

const tokensFile = process.argv[2] ?? 'load-tokens.json';
const SOCKETS = Number(process.env.SOCKETS ?? 200);
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const URLS = (process.env.WS_URLS ?? 'http://localhost:3301,http://localhost:3302').split(',');
const CONNECT_CONCURRENCY = Number(process.env.CONNECT_CONCURRENCY ?? 50);

const players: Player[] = JSON.parse(readFileSync(tokensFile, 'utf8')).players;

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

interface Conn {
  socket: Socket;
  player: Player;
  received: Map<string, number>;
}

async function open(i: number): Promise<{ conn?: Conn; ms: number; error?: string }> {
  const player = players[i % players.length]!;
  const url = URLS[i % URLS.length]!;
  const t0 = performance.now();
  const socket = io(url, {
    transports: ['websocket'],
    auth: { token: player.token },
    reconnection: false,
    forceNew: true,
    timeout: 10_000,
  });
  const received = new Map<string, number>();
  socket.on('chat:message', (m: { clientMsgId?: string; body?: string }) => {
    const id = m.body?.startsWith('load:') ? m.body.slice(5) : undefined;
    if (id && !received.has(id)) received.set(id, performance.now());
  });
  return new Promise((resolve) => {
    socket.once('connect', async () => {
      const ms = performance.now() - t0;
      const ack = await socket
        .timeout(10_000)
        .emitWithAck('match:subscribe', { matchId: player.matchId })
        .catch((e: Error) => ({ ok: false, error: { message: e.message } }));
      if (!(ack as { ok?: boolean }).ok) {
        socket.close();
        return resolve({ ms, error: `subscribe: ${JSON.stringify(ack)}` });
      }
      resolve({ conn: { socket, player, received }, ms });
    });
    socket.once('connect_error', (e) => {
      socket.close();
      resolve({ ms: performance.now() - t0, error: e.message });
    });
  });
}

async function main() {
  console.log(`opening ${SOCKETS} sockets across ${URLS.length} instance(s)…`);
  const conns: Conn[] = [];
  const connectMs: number[] = [];
  const errors = new Map<string, number>();
  for (let i = 0; i < SOCKETS; i += CONNECT_CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(CONNECT_CONCURRENCY, SOCKETS - i) }, (_, k) => open(i + k)),
    );
    for (const r of batch) {
      connectMs.push(r.ms);
      if (r.conn) conns.push(r.conn);
      else errors.set(r.error ?? 'unknown', (errors.get(r.error ?? 'unknown') ?? 0) + 1);
    }
  }
  const failed = SOCKETS - conns.length;

  // One sender socket per match (role 'a'); every socket of both players should receive.
  const byMatch = new Map<string, Conn[]>();
  for (const c of conns)
    byMatch.set(c.player.matchId, [...(byMatch.get(c.player.matchId) ?? []), c]);

  const fanoutMs: number[] = [];
  let missed = 0;
  let sendErrors = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const sent: Array<{ id: string; t0: number; room: Conn[] }> = [];
    await Promise.all(
      [...byMatch.values()].map(async (room) => {
        const sender = room.find((c) => c.player.role === 'a') ?? room[0]!;
        const id = randomUUID();
        const t0 = performance.now();
        const ack = (await sender.socket
          .timeout(10_000)
          .emitWithAck('chat:send', {
            matchId: sender.player.matchId,
            body: `load:${id}`,
            clientMsgId: id,
          })
          .catch(() => ({ ok: false }))) as { ok?: boolean };
        if (!ack.ok) sendErrors++;
        else sent.push({ id, t0, room });
      }),
    );
    await new Promise((r) => setTimeout(r, 3000)); // delivery window
    for (const s of sent) {
      for (const c of s.room) {
        const at = c.received.get(s.id);
        if (at === undefined) missed++;
        else fanoutMs.push(at - s.t0);
      }
    }
    // Stay under the chat burst limit (8 per 10 s per player).
    await new Promise((r) => setTimeout(r, 1500));
  }

  for (const c of conns) c.socket.close();

  const report = {
    sockets: SOCKETS,
    instances: URLS.length,
    connected: conns.length,
    connectFailures: failed,
    connectErrors: Object.fromEntries(errors),
    connectP95Ms: Math.round(pct(connectMs, 95)),
    rooms: byMatch.size,
    rounds: ROUNDS,
    deliveries: fanoutMs.length,
    missed,
    sendErrors,
    fanoutP50Ms: Math.round(pct(fanoutMs, 50)),
    fanoutP95Ms: Math.round(pct(fanoutMs, 95)),
    fanoutMaxMs: Math.round(Math.max(0, ...fanoutMs)),
  };
  const ok =
    failed / SOCKETS < 0.01 &&
    report.connectP95Ms < 2000 &&
    report.fanoutP95Ms < 1000 &&
    missed === 0 &&
    sendErrors === 0;
  console.log(JSON.stringify({ ok, ...report }, null, 2));
  process.exit(ok ? 0 : 1);
}

void main();
