#!/usr/bin/env node
// Lagos latency probe (audit B10; Sprint 0 F0.10; TA "pick region after measuring latency
// from Lagos"). Run it FROM Lagos, on the networks players use (MTN, Airtel, Glo, a home
// fibre line), at peak evening hours:
//
//   node infra/latency-probe.mjs            # 20 rounds per region
//   ROUNDS=50 node infra/latency-probe.mjs
//
// Each round times a fresh HTTPS request (DNS + TCP + TLS + first byte) to a public
// endpoint inside each candidate region, which is close to what a player's first API call
// costs. It prints a Markdown table to paste into docs/decisions/0008-hosting.md.
// No dependencies; Node 18+.

const ROUNDS = Number(process.env.ROUNDS ?? 20);
const TIMEOUT_MS = 8000;

/** Public, unauthenticated endpoints located in each region. Add or remove as needed. */
const CANDIDATES = [
  {
    provider: 'AWS',
    region: 'af-south-1 (Cape Town)',
    url: 'https://ec2.af-south-1.amazonaws.com/ping',
  },
  {
    provider: 'AWS',
    region: 'eu-west-2 (London)',
    url: 'https://ec2.eu-west-2.amazonaws.com/ping',
  },
  {
    provider: 'AWS',
    region: 'eu-west-1 (Ireland)',
    url: 'https://ec2.eu-west-1.amazonaws.com/ping',
  },
  {
    provider: 'AWS',
    region: 'eu-central-1 (Frankfurt)',
    url: 'https://ec2.eu-central-1.amazonaws.com/ping',
  },
  {
    provider: 'AWS',
    region: 'eu-south-2 (Spain)',
    url: 'https://ec2.eu-south-2.amazonaws.com/ping',
  },
  {
    provider: 'Google Cloud',
    region: 'africa-south1 (Johannesburg)',
    url: 'https://africa-south1-docker.pkg.dev',
  },
  {
    provider: 'Google Cloud',
    region: 'europe-west2 (London)',
    url: 'https://europe-west2-docker.pkg.dev',
  },
  {
    provider: 'Google Cloud',
    region: 'europe-west1 (Belgium)',
    url: 'https://europe-west1-docker.pkg.dev',
  },
  { provider: 'DigitalOcean', region: 'lon1 (London)', url: 'https://lon1.digitaloceanspaces.com' },
  {
    provider: 'DigitalOcean',
    region: 'fra1 (Frankfurt)',
    url: 'https://fra1.digitaloceanspaces.com',
  },
  {
    provider: 'DigitalOcean',
    region: 'ams3 (Amsterdam)',
    url: 'https://ams3.digitaloceanspaces.com',
  },
];

async function timeOnce(url) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // A fresh connection each time: the cache-buster defeats any intermediate cache, and
    // 'connection: close' stops keep-alive from hiding the TCP and TLS cost.
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
      method: 'GET',
      headers: { connection: 'close' },
      signal: ctrl.signal,
      redirect: 'manual',
    });
    await res.arrayBuffer().catch(() => undefined);
    return performance.now() - started;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pct(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const rows = [];
for (const c of CANDIDATES) {
  const samples = [];
  let failures = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const ms = await timeOnce(c.url);
    if (ms === null) failures++;
    else samples.push(ms);
  }
  samples.sort((a, b) => a - b);
  rows.push({ ...c, p50: pct(samples, 50), p95: pct(samples, 95), failures });
  process.stderr.write(`${c.provider} ${c.region}: p50 ${Math.round(pct(samples, 50))} ms\n`);
}

rows.sort((a, b) => a.p95 - b.p95);
const when = new Date().toISOString();
console.log(
  `\nMeasured ${when}, ${ROUNDS} rounds per region. Network: <fill in: operator, 4G/fibre, area>\n`,
);
console.log('| Provider | Region | p50 (ms) | p95 (ms) | Failed |');
console.log('| --- | --- | ---: | ---: | ---: |');
for (const r of rows) {
  const f = (n) => (Number.isFinite(n) ? Math.round(n) : '—');
  console.log(
    `| ${r.provider} | ${r.region} | ${f(r.p50)} | ${f(r.p95)} | ${r.failures}/${ROUNDS} |`,
  );
}
