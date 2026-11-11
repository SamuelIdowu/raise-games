'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Banner, Skeleton, StatusChip } from '@/components/ui';

interface HealthResponse {
  status: 'ok' | 'degraded';
  checks: {
    api: boolean;
    database: boolean;
    redis: boolean;
  };
  env: string;
  otpMock: boolean;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-b-0">
      <dt className="text-body-sm text-fg-muted">{label}</dt>
      <dd className="font-display text-body-sm text-fg">{value}</dd>
    </div>
  );
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

    async function fetchHealth() {
      try {
        const res = await fetch(`${apiBase}/health`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setHealth(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to connect');
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <span className="font-display text-display font-bold uppercase tracking-tight text-accent">
            Raise
          </span>
          <p className="mt-1 text-body-sm text-fg-muted">Checking connection…</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-5">
          <Skeleton className="mb-4 h-5 w-2/5" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </main>
    );
  }

  const healthy = health?.status === 'ok';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="font-display text-display font-bold uppercase tracking-tight text-fg">
          Raise
        </h1>
        <p className="mt-1 text-body-sm text-fg-muted">Competitive gaming challenges</p>
        <p className="label-caps mt-2 text-fg-subtle">Stage 1 · Sprint 0 foundations</p>
      </header>

      <section className="animate-in rounded-card border border-line bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-h2 font-semibold text-fg">API health</h2>
          <StatusChip
            label={healthy ? 'Healthy' : 'Degraded'}
            variant={healthy ? 'win' : 'dispute'}
            icon={healthy ? 'check-circle' : 'alert-triangle'}
          />
        </div>

        <dl>
          <Row
            label="API"
            value={
              <span className={health?.checks.api ? 'text-win' : 'text-loss'}>
                {health?.checks.api ? 'Online' : 'Offline'}
              </span>
            }
          />
          <Row
            label="Database"
            value={
              <span className={health?.checks.database ? 'text-win' : 'text-loss'}>
                {health?.checks.database ? 'Connected' : 'Disconnected'}
              </span>
            }
          />
          <Row
            label="Redis"
            value={
              <span className={health?.checks.redis ? 'text-win' : 'text-fg-subtle'}>
                {health?.checks.redis ? 'Connected' : 'Unavailable'}
              </span>
            }
          />
          <Row label="Environment" value={<span className="label-caps">{health?.env}</span>} />
          <Row label="OTP mock" value={health?.otpMock ? 'Enabled (dev)' : 'Disabled'} />
        </dl>

        {error ? (
          <Banner variant="offline" className="mt-3">
            Can&apos;t reach the API — {error}
          </Banner>
        ) : null}
      </section>

      <nav className="flex flex-col gap-2">
        <Link
          href="/design"
          className="inline-flex h-11 items-center justify-center rounded-control border border-transparent bg-accent px-4 font-display text-h3 font-semibold text-on-accent transition-colors duration-[var(--motion-micro)] hover:bg-accent-hover"
        >
          Open design system
        </Link>
        <a
          href="http://localhost:3001/docs/openapi.json"
          target="_blank"
          rel="noopener"
          className="inline-flex h-11 items-center justify-center rounded-control border border-line-strong px-4 font-display text-h3 font-semibold text-fg transition-colors duration-[var(--motion-micro)] hover:bg-overlay"
        >
          API reference
        </a>
      </nav>

      <footer className="text-center text-caption text-fg-subtle">
        Next.js 16 · NestJS 11 · Drizzle · Postgres 17 · Redis
      </footer>
    </main>
  );
}
