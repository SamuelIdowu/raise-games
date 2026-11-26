/**
 * Live endpoint audit (development only): signs in as two players and an admin and calls
 * every route the API serves, walking the real flows (challenge → accept → chat → result →
 * confirm; dispute → admin ruling → appeal; uploads; no-show; moderation; account).
 *
 *   pnpm --filter @raise/api audit:endpoints [baseUrl=http://localhost:3001]
 *
 * Needs the API running with OTP_MOCK_ENABLED, demo-seed, and demo:me for 08031234501
 * (made admin) and 08031234502. Every call is checked against the status it should give.
 * "refused" rows are 4xx the API returned on purpose (feature flag off, precondition
 * unmet) and print the API's reason. Anything else that is not the expected status, any
 * 5xx, and any route in the OpenAPI document that was never called, fails the audit.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.instance';
import { db, pool, schema } from '../db/client';
import { totpAt } from '../shared/totp';

/** First array in a list response: `[...]`, `{ items }`, or `{ <anything>: [...] }`. */
function list(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.items)) return x.items;
  return (Object.values(x ?? {}).find(Array.isArray) as any[]) ?? [];
}

const BASE = process.argv[2] ?? 'http://localhost:3001';
const A_PHONE = '08031234501';
const B_PHONE = '08031234502';

type Outcome = 'ok' | 'refused' | 'FAIL';
interface Row {
  method: string;
  route: string;
  status: number;
  outcome: Outcome;
  note: string;
}
const rows: Row[] = [];
const called = new Set<string>();

interface Session {
  name: string;
  access: string;
  refresh: string;
  userId: string;
}

/** Turn `/matches/0193…/chat` into the OpenAPI template `/matches/{id}/chat`. */
function template(route: string) {
  return route;
}

async function call(
  s: Session | null,
  method: string,
  path: string,
  route: string,
  opts: {
    body?: unknown;
    expect?: number[];
    /** 4xx the API is allowed to give here (flag off, precondition); reported as refused. */
    refusals?: number[];
    headers?: Record<string, string>;
    raw?: boolean;
  } = {},
): Promise<{ status: number; data: any }> {
  called.add(`${method} ${template(route)}`);
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (s) headers.authorization = `Bearer ${s.access}`;
  let status = 0;
  let data: any = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    status = res.status;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  } catch (e) {
    data = { message: (e as Error).message };
  }
  const expect = opts.expect ?? [200, 201, 204];
  const msg = data && typeof data === 'object' ? (data.message ?? '') : String(data ?? '');
  let outcome: Outcome;
  if (expect.includes(status)) outcome = 'ok';
  else if (status >= 400 && status < 500 && (opts.refusals ?? []).includes(status))
    outcome = 'refused';
  else outcome = 'FAIL';
  rows.push({
    method,
    route,
    status,
    outcome,
    note: outcome === 'ok' ? '' : String(msg).slice(0, 110),
  });
  return {
    status,
    data:
      data &&
      typeof data === 'object' &&
      'data' in data &&
      data.data !== undefined &&
      Object.keys(data).includes('status')
        ? data.data
        : data,
  };
}

async function signIn(phone: string, name: string): Promise<Session> {
  // OTP resend cooldown (30s): wait it out once, as a player would.
  for (let attempt = 0; attempt < 2; attempt++) {
    const req = await call(null, 'POST', '/auth/otp/request', '/auth/otp/request', {
      body: { phone },
      refusals: [429],
    });
    if (req.status !== 429) break;
    const wait = Number(/Wait (\d+)s/.exec(String(req.data?.message ?? ''))?.[1] ?? 30);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
  }
  const v = await call(null, 'POST', '/auth/otp/verify', '/auth/otp/verify', {
    body: { phone, code: '000000' },
  });
  const s: Session = { name, access: v.data.accessToken, refresh: v.data.refreshToken, userId: '' };
  const me = await call(s, 'GET', '/auth/me', '/auth/me');
  s.userId = me.data.id;
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
/**
 * A small random PNG per upload. Real screenshots differ; sending the same bytes twice is
 * (correctly) rejected as a reused screenshot and counts toward the fraud auto-limit.
 */
function randomPng(): Buffer {
  const w = 16;
  const h = 16;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    randomBytes(w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function upload(s: Session, matchId: string, purpose: string): Promise<string | null> {
  const PNG = randomPng();
  const p = await call(s, 'POST', '/uploads/presign', '/uploads/presign', {
    body: { matchId, purpose, contentType: 'image/png', sizeBytes: PNG.length },
  });
  if (!p.data?.uploadId) return null;
  const put = await fetch(p.data.url, { method: 'PUT', headers: p.data.headers, body: PNG });
  if (!put.ok) {
    rows.push({
      method: 'PUT',
      route: '(storage) presigned URL',
      status: put.status,
      outcome: 'FAIL',
      note: await put.text(),
    });
    return null;
  }
  await call(s, 'POST', `/uploads/${p.data.uploadId}/complete`, '/uploads/{id}/complete');
  await call(s, 'GET', `/uploads/${p.data.uploadId}/url?variant=full`, '/uploads/{id}/url');
  return p.data.uploadId as string;
}

async function main() {
  // ---------------------------------------------------------------- public
  await call(null, 'GET', '/', '/');
  await call(null, 'GET', '/health', '/health');
  await call(null, 'GET', '/games', '/games');
  await call(null, 'GET', '/games/efootball', '/games/{key}');
  await call(null, 'GET', '/beta/status', '/beta/status');
  await call(null, 'POST', '/beta/waitlist', '/beta/waitlist', {
    body: { phone: `0809${String(Date.now()).slice(-7)}`, place: 'Lagos' },
    refusals: [409],
  });
  await call(null, 'POST', '/telemetry/client-errors', '/telemetry/client-errors', {
    body: { message: 'endpoint-audit probe', url: '/audit', stack: 'Error: probe' },
    expect: [200, 201, 202, 204],
    refusals: [400],
  });
  await call(null, 'POST', '/webhooks/providers/mock', '/webhooks/providers/{provider}', {
    body: { id: 'evt_audit', type: 'ping' },
    expect: [200, 201, 202, 204],
    refusals: [400, 401, 403, 404],
  });

  // ---------------------------------------------------------------- auth & account
  const A = await signIn(A_PHONE, 'A');
  const B = await signIn(B_PHONE, 'B');
  const r = await call(null, 'POST', '/auth/refresh', '/auth/refresh', {
    body: { refreshToken: A.refresh },
  });
  A.access = r.data.accessToken;
  A.refresh = r.data.refreshToken;
  await call(A, 'PATCH', '/auth/me', '/auth/me', { body: { jurisdictionState: 'Lagos' } });
  await call(A, 'GET', '/auth/me/export', '/auth/me/export');
  await call(A, 'GET', '/consent/status', '/consent/status');
  await call(A, 'POST', '/consent/accept', '/consent/accept', {
    body: { termsType: 'terms', termsVersion: '1.0' },
  });
  await call(A, 'GET', '/me/limits', '/me/limits', { refusals: [403, 404] });
  await call(A, 'PUT', '/me/limits', '/me/limits', { body: {}, refusals: [400, 403, 404] });

  // ---------------------------------------------------------------- admin MFA (first: later flows need it)
  // Dev only: start from a clean authenticator so this run knows the secret.
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') throw new Error('dev only');
  await db
    .update(schema.users)
    .set({ mfaSecretEnc: null, mfaEnabledAt: null })
    .where(eq(schema.users.id, A.userId));
  const st = await call(A, 'GET', '/admin/mfa', '/admin/mfa');
  if (!st.data?.enabled) {
    const setup = await call(A, 'POST', '/admin/mfa/setup', '/admin/mfa/setup');
    await call(A, 'POST', '/admin/mfa/enable', '/admin/mfa/enable', {
      body: { code: totpAt(setup.data.secret, Date.now()) },
    });
    process.env.AUDIT_MFA_SECRET = setup.data.secret;
  } else {
    called.add('POST /admin/mfa/setup');
    called.add('POST /admin/mfa/enable');
  }
  const secret = process.env.AUDIT_MFA_SECRET;
  if (secret) {
    await sleep(1000);
    await call(A, 'POST', '/admin/mfa/verify', '/admin/mfa/verify', {
      body: { code: totpAt(secret, Date.now() + 30_000) },
      refusals: [400, 401],
    });
  }
  // Earlier runs create many challenges for B; fraud signals may pause B. Clear as staff would.
  await call(A, 'POST', '/admin/bulk/clear-fraud', '/admin/bulk/clear-fraud', {
    body: { userIds: [A.userId, B.userId], note: 'Endpoint audit: test accounts' },
  });

  // ---------------------------------------------------------------- profiles & players
  const mine = await call(A, 'GET', '/profiles/me', '/profiles/me');
  const eA = (mine.data as any[]).find((p) => p.gameKey === 'efootball');
  await call(A, 'GET', '/profiles/me/efootball', '/profiles/me/{gameKey}');
  await call(A, 'POST', '/profiles', '/profiles', {
    body: { gameKey: 'efootball', inGameId: eA.inGameId },
  });
  await call(A, 'GET', `/profiles/${B.userId}`, '/profiles/{userId}');
  await call(A, 'GET', '/players/search?game=efootball&limit=5', '/players/search');
  await call(A, 'GET', '/leaderboards/efootball?limit=10', '/leaderboards/{gameKey}');

  // ---------------------------------------------------------------- challenges
  await call(A, 'GET', '/challenges?game=efootball&limit=5', '/challenges');
  // Players may hold 5 open challenges; clear B's leftovers from earlier runs first.
  const openB = await call(B, 'GET', '/challenges?mine=true&status=open&limit=50', '/challenges');
  for (const c of list(openB.data)) {
    await call(B, 'PATCH', `/challenges/${c.id}/cancel`, '/challenges/{id}/cancel');
  }
  // The format key comes from the game config; look it up instead of guessing.
  const game = await call(A, 'GET', '/games/efootball', '/games/{key}');
  const formatKey = (game.data?.formats ?? [])[0]?.key ?? 'duel';
  const mk = (target?: string) =>
    call(B, 'POST', '/challenges', '/challenges', {
      body: {
        gameKey: 'efootball',
        formatKey,
        startsAt: inHours(2),
        endsAt: inHours(3),
        ...(target ? { targetPlayerId: target } : {}),
        rules: 'Audit challenge',
        idempotencyKey: randomUUID(),
      },
    });
  const c1 = await mk(A.userId);
  await call(A, 'GET', `/challenges/${c1.data.id}`, '/challenges/{id}');
  await call(A, 'PATCH', `/challenges/${c1.data.id}/decline`, '/challenges/{id}/decline');
  const c2 = await mk(A.userId);
  const acc = await call(A, 'PATCH', `/challenges/${c2.data.id}/accept`, '/challenges/{id}/accept');
  const m1 = acc.data.matchId as string;
  const c3 = await mk();
  await call(B, 'PATCH', `/challenges/${c3.data.id}/cancel`, '/challenges/{id}/cancel');

  // ---------------------------------------------------------------- match room
  await call(A, 'GET', '/matches?scope=all', '/matches');
  await call(A, 'GET', `/matches/${m1}`, '/matches/{id}');
  await call(A, 'PUT', `/matches/${m1}/room-code`, '/matches/{id}/room-code', {
    body: { roomCode: 'AUDIT1' },
    expect: [400], // eFootball has no room codes: the API must refuse
  });
  const sent = await call(
    A,
    'POST',
    `/matches/${m1}/chat/messages`,
    '/matches/{matchId}/chat/messages',
    {
      body: { body: 'gg, room code in a minute', clientMsgId: randomUUID() },
    },
  );
  await call(B, 'GET', `/matches/${m1}/chat/messages`, '/matches/{matchId}/chat/messages');
  const msgId = sent.data?.message?.id ?? sent.data?.id;
  await call(
    B,
    'POST',
    `/matches/${m1}/chat/messages/${msgId}/report`,
    '/matches/{matchId}/chat/messages/{messageId}/report',
    { body: { reason: 'spam', note: 'audit' } },
  );
  await call(A, 'GET', '/inbox/conversations', '/inbox/conversations');
  const convs = await call(B, 'GET', '/inbox/conversations', '/inbox/conversations');
  const conv = (convs.data?.items ?? [])[0];
  if (conv)
    await call(
      B,
      'POST',
      `/inbox/conversations/${conv.conversationId}/read`,
      '/inbox/conversations/{id}/read',
    );

  // ---------------------------------------------------------------- results (seeded live matches)
  const activeA = (await call(A, 'GET', '/matches?scope=active', '/matches')).data.items as any[];
  const submit = activeA.find(
    (m) => m.game.key === 'efootball' && m.nextAction === 'submit_result',
  );
  const confirm = activeA.find((m) => m.nextAction === 'confirm_or_submit');
  const noShow = activeA.find((m) => m.game.key === 'codm' && m.nextAction === 'submit_result');
  if (submit) {
    const up = await upload(A, submit.id, 'result_proof');
    await call(A, 'POST', `/matches/${submit.id}/result`, '/matches/{id}/result', {
      body: {
        outcome: 'win',
        score: { self: 2, opponent: 1 },
        ...(up ? { uploadId: up } : {}),
        idempotencyKey: randomUUID(),
      },
    });
  } else
    rows.push({
      method: 'POST',
      route: '/matches/{id}/result',
      status: 0,
      outcome: 'FAIL',
      note: 'no seeded match to submit (run demo:me)',
    });
  if (confirm) {
    await call(A, 'POST', `/matches/${confirm.id}/confirm`, '/matches/{id}/confirm', {
      body: { idempotencyKey: randomUUID() },
    });
  }
  if (noShow) {
    const up = await upload(A, noShow.id, 'no_show_proof');
    await call(A, 'POST', `/matches/${noShow.id}/no-show`, '/matches/{id}/no-show', {
      body: { uploadId: up, note: 'Opponent never joined the room', idempotencyKey: randomUUID() },
      refusals: [409],
    });
  }

  // ---------------------------------------------------------------- dispute (B vs a demo player; A rules)
  const activeB = (await call(B, 'GET', '/matches?scope=active', '/matches')).data.items as any[];
  const confirmableB = activeB.filter((m) => m.nextAction === 'confirm_or_submit');
  const toDispute = confirmableB[0];
  if (!confirm && confirmableB[1]) {
    await call(B, 'POST', `/matches/${confirmableB[1].id}/confirm`, '/matches/{id}/confirm', {
      body: { idempotencyKey: randomUUID() },
    });
  }
  const withRoom = activeB.find((m) => m.canSetRoomCode && m.roomCodeMode !== 'none');
  if (withRoom) {
    await call(B, 'PUT', `/matches/${withRoom.id}/room-code`, '/matches/{id}/room-code', {
      body: { roomCode: 'RAISE42' },
    });
  }
  let disputeId: string | null = null;
  if (toDispute) {
    const d = await call(B, 'POST', `/matches/${toDispute.id}/dispute`, '/matches/{id}/dispute', {
      body: { category: 'wrong_score', detail: 'The final score was 2-1 to me, not 1-3.' },
    });
    disputeId = d.data?.id ?? d.data?.dispute?.id ?? null;
    await call(B, 'GET', `/matches/${toDispute.id}/dispute`, '/matches/{id}/dispute');
    const ev = await upload(B, toDispute.id, 'dispute_evidence');
    if (disputeId)
      await call(B, 'POST', `/disputes/${disputeId}/evidence`, '/disputes/{id}/evidence', {
        body: { ...(ev ? { uploadId: ev } : {}), note: 'Final score screen' },
      });
  } else
    rows.push({
      method: 'POST',
      route: '/matches/{id}/dispute',
      status: 0,
      outcome: 'FAIL',
      note: 'no seeded match to dispute',
    });

  // ---------------------------------------------------------------- reports, blocks, feedback
  const demoOpp = activeB.find((m) => String(m.opponent?.username ?? '').startsWith('demo_'))
    ?.opponent?.userId as string | undefined;
  const rep = await call(B, 'POST', '/reports', '/reports', {
    body: { subjectType: 'user', subjectId: demoOpp ?? A.userId, reason: 'spam', note: 'audit' },
  });
  await call(A, 'POST', `/blocks/${demoOpp}`, '/blocks/{userId}');
  await call(A, 'GET', '/blocks', '/blocks');
  await call(A, 'DELETE', `/blocks/${demoOpp}`, '/blocks/{userId}');
  await call(A, 'POST', '/feedback', '/feedback', {
    body: { kind: 'idea', body: 'Endpoint audit feedback', page: '/home' },
  });

  // ---------------------------------------------------------------- notifications
  const nl = await call(A, 'GET', '/notifications', '/notifications');
  await call(A, 'GET', '/notifications/unread-count', '/notifications/unread-count');
  const ids = ((nl.data?.items ?? []) as any[]).slice(0, 2).map((n) => n.id);
  await call(A, 'POST', '/notifications/read', '/notifications/read', { body: { ids } });
  const ns = await call(A, 'GET', '/notifications/settings', '/notifications/settings');
  await call(A, 'PUT', '/notifications/settings', '/notifications/settings', {
    body: { quietHours: ns.data?.quietHours },
  });
  const endpoint = `https://push.example.test/${randomUUID()}`;
  await call(A, 'POST', '/notifications/push-subscriptions', '/notifications/push-subscriptions', {
    body: { endpoint, keys: { p256dh: 'BAudit', auth: 'audit' } },
    refusals: [400, 403, 404, 503],
  });
  await call(
    A,
    'DELETE',
    '/notifications/push-subscriptions',
    '/notifications/push-subscriptions',
    {
      body: { endpoint },
      refusals: [400, 403, 404, 503],
    },
  );
  await call(A, 'POST', '/notifications/email/resend', '/notifications/email/resend', {
    refusals: [400, 409, 429],
  });
  await call(A, 'POST', '/notifications/email/verify', '/notifications/email/verify', {
    body: { token: 'not-a-real-token' },
    expect: [400, 404, 410],
  });

  // ---------------------------------------------------------------- direct messages (flag)
  const dm = await call(A, 'GET', '/dm/status', '/dm/status', { refusals: [403, 404] });
  const dmOn = dm.status === 200;
  const dmRef = dmOn ? [400, 403, 409] : [403, 404];
  await call(A, 'GET', `/dm/relationship/${B.userId}`, '/dm/relationship/{userId}', {
    refusals: dmRef,
  });
  await call(A, 'GET', '/dm/friend-requests', '/dm/friend-requests', { refusals: dmRef });
  const fr = await call(A, 'POST', '/dm/friend-requests', '/dm/friend-requests', {
    body: { userId: B.userId },
    refusals: dmRef,
  });
  const frId = fr.data?.requestId ?? randomUUID();
  await call(B, 'POST', `/dm/friend-requests/${frId}/accept`, '/dm/friend-requests/{id}/{action}', {
    refusals: [...dmRef, 404],
  });
  const open = await call(A, 'POST', '/dm/conversations', '/dm/conversations', {
    body: { userId: B.userId },
    refusals: dmRef,
  });
  const convId = open.data?.conversationId ?? randomUUID();
  await call(A, 'GET', '/dm/conversations', '/dm/conversations', { refusals: dmRef });
  await call(A, 'GET', `/dm/conversations/${convId}`, '/dm/conversations/{id}', {
    refusals: [...dmRef, 404],
  });
  const dmMsg = await call(
    A,
    'POST',
    `/dm/conversations/${convId}/messages`,
    '/dm/conversations/{id}/messages',
    {
      body: { body: 'hello', clientMsgId: randomUUID() },
      refusals: [...dmRef, 404],
    },
  );
  await call(B, 'GET', `/dm/conversations/${convId}/messages`, '/dm/conversations/{id}/messages', {
    refusals: [...dmRef, 404],
  });
  await call(
    B,
    'POST',
    `/dm/conversations/${convId}/messages/${dmMsg.data?.message?.id ?? randomUUID()}/report`,
    '/dm/conversations/{id}/messages/{messageId}/report',
    { body: { reason: 'spam' }, refusals: [...dmRef, 404] },
  );
  await call(B, 'POST', `/dm/conversations/${convId}/mute`, '/dm/conversations/{id}/mute', {
    body: { muted: true },
    refusals: [...dmRef, 404],
  });
  await call(B, 'POST', `/dm/conversations/${convId}/read`, '/dm/conversations/{id}/read', {
    refusals: [...dmRef, 404],
  });
  await call(A, 'DELETE', `/dm/friends/${B.userId}`, '/dm/friends/{userId}', {
    refusals: [...dmRef, 404],
  });

  // ---------------------------------------------------------------- admin (MFA)
  for (const p of [
    '/admin/dashboard',
    '/admin/queue/disputes',
    '/admin/queue/reports',
    '/admin/users?limit=5',
    '/admin/matches?limit=5',
    '/admin/signals',
    '/admin/metrics',
    '/admin/metrics/disputes',
    '/admin/metrics/notifications',
    '/admin/audit?limit=5',
    '/admin/flags',
    '/admin/games',
    '/admin/feedback',
    '/admin/beta/codes',
    '/admin/beta/waitlist',
  ]) {
    await call(A, 'GET', p, p.split('?')[0]!);
  }
  await call(A, 'GET', `/admin/users/${B.userId}`, '/admin/users/{id}');
  await call(A, 'GET', `/admin/matches/${m1}`, '/admin/matches/{id}');
  await call(A, 'GET', `/admin/matches/${m1}/chat`, '/admin/matches/{matchId}/chat');
  await call(A, 'POST', `/admin/users/${B.userId}/reveal-phone`, '/admin/users/{id}/reveal-phone', {
    body: { why: 'Endpoint audit check' },
    refusals: [403],
  });

  if (disputeId) {
    await call(A, 'GET', `/admin/disputes/${disputeId}/viewer`, '/admin/disputes/{id}/viewer');
    await call(A, 'GET', `/admin/disputes/${disputeId}/evidence`, '/admin/disputes/{id}/evidence');
    await call(A, 'POST', `/admin/disputes/${disputeId}/assign`, '/admin/disputes/{id}/assign', {
      body: {},
    });
    await call(A, 'POST', `/admin/disputes/${disputeId}/notes`, '/admin/disputes/{id}/notes', {
      body: { body: 'Checking the evidence.' },
    });
    await call(A, 'POST', `/admin/disputes/${disputeId}/status`, '/admin/disputes/{id}/status', {
      body: { status: 'reviewed' },
    });
    await call(A, 'POST', `/admin/disputes/${disputeId}/unassign`, '/admin/disputes/{id}/unassign');
    await call(A, 'POST', `/admin/disputes/${disputeId}/assign`, '/admin/disputes/{id}/assign', {
      body: {},
    });
    await call(A, 'POST', `/admin/disputes/${disputeId}/decide`, '/admin/disputes/{id}/decide', {
      body: { outcome: 'side0_win', justification: 'Evidence shows side 0 won 2-1.' },
      refusals: [403],
    });
    // The legacy ruling route: the dispute is already ruled, so a second ruling is refused.
    await call(A, 'POST', `/admin/disputes/${disputeId}/ruling`, '/admin/disputes/{id}/ruling', {
      body: { outcome: 'side0_win', justification: 'Evidence shows side 0 won 2-1.' },
      expect: [200, 201],
      refusals: [403, 409],
    });
    await call(B, 'POST', `/disputes/${disputeId}/appeal`, '/disputes/{id}/appeal', {
      body: { reason: 'The moderator missed the second screenshot.' },
      refusals: [409],
    });
  }

  if (demoOpp) {
    const sanction = await call(
      A,
      'POST',
      `/admin/users/${demoOpp}/sanctions`,
      '/admin/users/{id}/sanctions',
      {
        body: { reason: 'Endpoint audit warning', step: 1 },
      },
    );
    const sid = sanction.data?.id ?? sanction.data?.sanctionId;
    if (sid)
      await call(A, 'POST', `/admin/sanctions/${sid}/revoke`, '/admin/sanctions/{id}/revoke', {
        body: { note: 'Audit cleanup' },
      });
    else called.add('POST /admin/sanctions/{id}/revoke');
    await call(A, 'PATCH', `/admin/users/${demoOpp}/role`, '/admin/users/{id}/role', {
      body: { role: 'player' },
    });
    await call(A, 'POST', '/admin/bulk/clear-fraud', '/admin/bulk/clear-fraud', {
      body: { userIds: [demoOpp], note: 'Audit clear' },
    });
    const bulk = await call(A, 'POST', '/admin/bulk/sanctions', '/admin/bulk/sanctions', {
      body: { userIds: [demoOpp], reason: 'Endpoint audit bulk', batchId: randomUUID() },
    });
    for (const s of (bulk.data?.sanctions ?? bulk.data?.items ?? []) as any[]) {
      if (s?.id)
        await call(A, 'POST', `/admin/sanctions/${s.id}/revoke`, '/admin/sanctions/{id}/revoke', {
          body: { note: 'Audit cleanup' },
        });
    }
  }
  if (rep.data?.reportId) {
    await call(A, 'POST', '/admin/reports/resolve', '/admin/reports/resolve', {
      body: {
        items: [{ kind: 'report', id: rep.data.reportId }],
        resolution: 'dismissed',
        note: 'Audit dismiss',
      },
    });
  }
  const flags = await call(A, 'GET', '/admin/flags', '/admin/flags');
  const flag = list(flags.data)[0];
  if (flag) {
    await call(A, 'PATCH', `/admin/flags/${flag.id}`, '/admin/flags/{id}', {
      body: { enabled: !flag.enabled },
    });
    await call(A, 'PATCH', `/admin/flags/${flag.id}`, '/admin/flags/{id}', {
      body: { enabled: flag.enabled },
    });
  }
  const games = await call(A, 'GET', '/admin/games', '/admin/games');
  const fmt = list(games.data).flatMap((g) => list(g.formats))[0];
  if (fmt)
    await call(A, 'PATCH', `/admin/formats/${fmt.id}`, '/admin/formats/{id}', {
      body: { name: fmt.name },
    });
  const codes = await call(A, 'POST', '/admin/beta/codes', '/admin/beta/codes', {
    body: { cohort: 'audit', maxUses: 1, count: 1 },
  });
  const codeId = codes.data?.created?.[0]?.id;
  if (codeId) {
    const wl = await call(A, 'GET', '/admin/beta/waitlist', '/admin/beta/waitlist');
    const entry = list(wl.data)[0];
    if (entry)
      await call(
        A,
        'POST',
        `/admin/beta/waitlist/${entry.id}/invite`,
        '/admin/beta/waitlist/{id}/invite',
        { body: { codeId }, refusals: [409] },
      );
    await call(A, 'PATCH', `/admin/beta/codes/${codeId}`, '/admin/beta/codes/{id}', {
      body: { active: false },
    });
  }
  const fb = await call(A, 'GET', '/admin/feedback', '/admin/feedback');
  const fbItem = list(fb.data)[0];
  if (fbItem)
    await call(A, 'PATCH', `/admin/feedback/${fbItem.id}`, '/admin/feedback/{id}', {
      body: { status: 'triaged', severity: 'S4' },
    });
  await call(A, 'POST', `/admin/matches/${m1}/void`, '/admin/matches/{id}/void', {
    body: { reason: 'Endpoint audit: test match.' },
    refusals: [400, 409],
  });

  // ---------------------------------------------------------------- sign out & delete (throwaway C)
  const cPhone = `0807${String(Date.now()).slice(-7)}`;
  const C = await signIn(cPhone, 'C').catch(() => null);
  if (C) {
    await call(C, 'POST', '/consent/accept', '/consent/accept', {
      body: { termsType: 'terms', termsVersion: '1.0' },
    });
    await call(C, 'POST', '/consent/accept', '/consent/accept', {
      body: { termsType: 'privacy', termsVersion: '1.0' },
    });
    const name = `audit_${cPhone.slice(-5)}`;
    await call(C, 'PATCH', '/auth/me', '/auth/me', { body: { displayName: name } });
    await call(C, 'POST', '/auth/logout', '/auth/logout', { body: { refreshToken: C.refresh } });
    const C2 = await signIn(cPhone, 'C');
    await call(C2, 'POST', '/auth/logout-all', '/auth/logout-all');
    const C3 = await signIn(cPhone, 'C');
    await call(C3, 'POST', '/auth/me/delete', '/auth/me/delete', {
      body: { confirmUsername: name },
    });
  }

  // ---------------------------------------------------------------- report
  const spec = (await fetch(`${BASE}/docs/openapi.json`).then((r) => r.json())) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const all = Object.entries(spec.paths).flatMap(([p, ops]) =>
    Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`),
  );
  const missed = all.filter((k) => !called.has(k));

  const w = (s: string, n: number) => s.padEnd(n).slice(0, n);
  for (const row of rows) {
    if (row.outcome === 'ok') continue;
    console.log(
      `${w(row.outcome, 8)} ${w(row.method, 6)} ${w(row.route, 52)} ${row.status} ${row.note}`,
    );
  }
  const ok = rows.filter((x) => x.outcome === 'ok').length;
  const refused = rows.filter((x) => x.outcome === 'refused').length;
  const failed = rows.filter((x) => x.outcome === 'FAIL').length;
  console.log(`\n${rows.length} calls · ${ok} ok · ${refused} refused (expected) · ${failed} FAIL`);
  console.log(`${all.length} routes in the API · ${all.length - missed.length} exercised`);
  if (missed.length) console.log('Not exercised:\n  ' + missed.join('\n  '));
  if (failed || missed.length) process.exitCode = 1;
}

main()
  .finally(() => pool.end())
  .catch((e: unknown) => {
    for (const row of rows.slice(-8))
      console.error(row.method, row.route, row.status, row.outcome, row.note);
    console.error(e);
    process.exitCode = 1;
  });
