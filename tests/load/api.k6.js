/**
 * API load test (Sprint 15, F15.2). PRD acceptance: p95 API latency under 500 ms at 500
 * concurrent users.
 *
 *   PROFILE=smoke (CI default): 50 VUs for 1 minute against the local stack
 *   PROFILE=full  (staging):    ramp to 500 VUs, hold 5 minutes
 *
 * Tokens come from `apps/api/src/scripts/load-seed.ts`. Each VU acts as one player and
 * walks the screens a player actually opens, at a human pace, staying inside the per-user
 * rate limits (a 429 counts as an error).
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE = __ENV.API_URL || 'http://localhost:3301';
const PROFILE = __ENV.PROFILE || 'smoke';
const players = new SharedArray(
  'players',
  () => JSON.parse(open(__ENV.TOKENS || '/load/tokens.json')).players,
);

export const options = {
  scenarios:
    PROFILE === 'full'
      ? {
          players: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              { duration: '2m', target: 500 },
              { duration: '5m', target: 500 },
              { duration: '1m', target: 0 },
            ],
          },
        }
      : { players: { executor: 'constant-vus', vus: 50, duration: '1m' } },
  thresholds: {
    // The PRD number.
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const p = players[(__VU - 1) % players.length];
  const auth = { headers: { Authorization: `Bearer ${p.token}` } };
  const ok = (res, name) =>
    check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });

  group('home', () => {
    ok(http.get(`${BASE}/notifications/unread-count`, auth), 'unread');
    ok(http.get(`${BASE}/matches?scope=active`, auth), 'active matches');
  });
  sleep(1 + Math.random());

  group('play board', () => {
    ok(http.get(`${BASE}/games`, auth), 'games');
    ok(http.get(`${BASE}/challenges?limit=20`, auth), 'board');
  });
  sleep(1 + Math.random());

  group('match room', () => {
    ok(http.get(`${BASE}/matches/${p.matchId}`, auth), 'match');
    ok(http.get(`${BASE}/matches/${p.matchId}/chat`, auth), 'chat history');
  });
  sleep(2 + Math.random() * 2);
}
