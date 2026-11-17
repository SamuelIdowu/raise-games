import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import pg from 'pg';
import type { BrowserContext } from '@playwright/test';
import { clearOtpIpLimit } from './otp-limit';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://raise:raise@localhost:5432/raise_test';

export interface Player {
  userId: string;
  accessToken: string;
  refreshToken: string;
  name: string;
}

export async function api<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
  });
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : res.json()) as T;
}

/** Signs up through the real OTP flow (mock code), accepts terms, adds an eFootball profile. */
export async function createPlayer(prefix: string): Promise<Player> {
  const phone = `+234809${randomInt(0, 9_999_999).toString().padStart(7, '0')}`;
  // All signups share one IP; keep the per-IP OTP limit from tripping mid-suite.
  await clearOtpIpLimit();
  await api('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  const session = await api<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code: '000000' }),
  });
  const token = session.accessToken;
  const me = await api<{ id: string }>('/auth/me', { token });
  const status = await api<{ current: { terms: string; privacy: string } }>('/consent/status', {
    token,
  });
  for (const termsType of ['terms', 'privacy'] as const) {
    await api('/consent/accept', {
      method: 'POST',
      token,
      body: JSON.stringify({ termsType, termsVersion: status.current[termsType] }),
    });
  }
  const name = `${prefix}_${randomBytes(3).toString('hex')}`;
  await api('/auth/me', { method: 'PATCH', token, body: JSON.stringify({ displayName: name }) });
  await api('/profiles', {
    method: 'POST',
    token,
    body: JSON.stringify({ gameKey: 'efootball', inGameId: `${name}_konami` }),
  });
  return { userId: me.id, accessToken: token, refreshToken: session.refreshToken, name };
}

/**
 * Real challenge → accept flow, then time-travels the agreed start into the past
 * (the API rightly refuses challenges that start in the past).
 */
export async function createStartedMatch(
  a: Player,
  b: Player,
  startedMinutesAgo = 30,
): Promise<string> {
  const startsAt = new Date(Date.now() + 60 * 60_000);
  const { id: challengeId } = await api<{ id: string }>('/challenges', {
    method: 'POST',
    token: a.accessToken,
    body: JSON.stringify({
      gameKey: 'efootball',
      formatKey: '1v1_duel',
      rules: 'Standard settings, 6-minute halves.',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      targetPlayerId: b.userId,
    }),
  });
  const { matchId } = await api<{ matchId: string }>(`/challenges/${challengeId}/accept`, {
    method: 'PATCH',
    token: b.accessToken,
  });
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE challenges SET starts_at = now() - make_interval(mins => $2) WHERE id = $1`,
      [challengeId, startedMinutesAgo],
    );
    // Sprint 6 copies the agreed start onto the match row; keep them in step.
    await client.query(
      `UPDATE matches SET scheduled_start_at = now() - make_interval(mins => $2) WHERE id = $1`,
      [matchId, startedMinutesAgo],
    );
  } finally {
    await client.end();
  }
  return matchId;
}

/** Puts the player's tokens where the web app's API client reads them. */
export async function signIn(context: BrowserContext, player: Player) {
  await context.addInitScript(
    ([access, refresh]) => {
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
    },
    [player.accessToken, player.refreshToken] as const,
  );
}

// ---- Unique PNG screenshots (random pixels), so reuse detection never trips across tests.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function uniquePng(
  width = 640,
  height = 360,
): { name: string; mimeType: string; buffer: Buffer } {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  // Blocky random pattern (16px cells) so it survives JPEG compression as a distinct image.
  const cells = randomBytes(Math.ceil(width / 16) * Math.ceil(height / 16) * 3);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const cell = (Math.floor(y / 16) * Math.ceil(width / 16) + Math.floor(x / 16)) * 3;
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = cells[cell]!;
      raw[o + 1] = cells[cell + 1]!;
      raw[o + 2] = cells[cell + 2]!;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return {
    name: `result-${randomBytes(4).toString('hex')}.png`,
    mimeType: 'image/png',
    buffer: png,
  };
}

/**
 * Promotes a fixture player to moderator. Staff routes need MFA (Sprint 12), so by default
 * the account is marked enrolled and its sessions verified; pass `{ mfa: false }` to leave
 * MFA for the test to set up through the admin UI.
 */
export async function makeModerator(player: Player, opts: { mfa?: boolean } = {}): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE users SET role = 'moderator' WHERE id = $1`, [player.userId]);
    if (opts.mfa !== false) {
      await client.query(`UPDATE users SET mfa_enabled_at = now() WHERE id = $1`, [player.userId]);
      await client.query(`UPDATE sessions SET mfa_verified_at = now() WHERE user_id = $1`, [
        player.userId,
      ]);
    }
  } finally {
    await client.end();
  }
}

/** RFC 6238 TOTP (SHA-1, 30s, 6 digits) from a base32 secret, as an authenticator app would. */
export function totp(secretB32: string, atMs = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secretB32.replace(/\s+/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = mac[mac.length - 1]! & 15;
  const code = ((mac[o]! & 127) << 24) | (mac[o + 1]! << 16) | (mac[o + 2]! << 8) | mac[o + 3]!;
  return (code % 1_000_000).toString().padStart(6, '0');
}

/** A disputed match between two fixture players, opened by `b` (Sprint 12 seeded dispute). */
export async function seedDispute(
  a: Player,
  b: Player,
): Promise<{ matchId: string; disputeId: string }> {
  const matchId = await createStartedMatch(a, b);
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE matches SET status = 'disputed', disputed_at = now() WHERE id = $1`,
      [matchId],
    );
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO disputes (id, match_id, raised_by_id, source, reason, category, detail, status)
       VALUES (gen_random_uuid(), $1, $2, 'player', 'wrong_winner', 'wrong_winner', 'They reported the wrong winner.', 'open')
       RETURNING id`,
      [matchId, b.userId],
    );
    return { matchId, disputeId: rows[0]!.id };
  } finally {
    await client.end();
  }
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}
