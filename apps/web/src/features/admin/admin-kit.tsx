'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, adminApi, type MfaStatus } from '@raise/api-client';
import { Banner, Button, Icon, Input, Sheet, SkeletonCard } from '@/components/ui';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------- data

/** Loads admin data; `reload` refetches. Errors keep the last good data on screen. */
export function useAdminData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // `deps` (plus `reload`) decide when to fetch; `load` is re-created every render, so it
  // is deliberately not a dependency.
  useEffect(() => {
    let live = true;
    load()
      .then((d) => {
        if (live) {
          setData(d);
          setError(null);
        }
      })
      .catch(
        (e: unknown) =>
          live && setError(e instanceof Error ? e.message : 'Could not load this page.'),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

// ---------------------------------------------------------------- MFA

const StepUpContext = createContext<(<T>(action: () => Promise<T>) => Promise<T>) | null>(null);

/**
 * Wraps a sensitive admin action: if the API asks for a fresh code (`mfa_step_up`), the
 * code dialog opens and the action is retried once after a successful verify.
 */
export function useStepUp() {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUp must be used inside <AdminGate>');
  return ctx;
}

function CodeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <Input
      label="Authenticator code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      error={error}
      helper="The 6-digit code from your authenticator app."
    />
  );
}

/**
 * Staff MFA gate (Sprint 12, F12.1): set up TOTP on first visit, then a code every 12h;
 * sensitive actions ask again after 15 minutes via useStepUp.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState<{
    resolve: () => void;
    reject: (e: unknown) => void;
  } | null>(null);

  useEffect(() => {
    adminApi
      .mfaStatus()
      .then(setStatus)
      .catch((e: unknown) =>
        setFatal(
          e instanceof ApiError && e.status === 403
            ? 'Moderator tools are for staff accounts.'
            : 'Could not reach the server.',
        ),
      );
  }, []);

  const submit = async (fn: (c: string) => Promise<MfaStatus>) => {
    setBusy(true);
    setCodeError(undefined);
    try {
      setStatus(await fn(code));
      setCode('');
      return true;
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'That code did not work.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const withStepUp = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (e) {
      if (e instanceof ApiError && (e.reason === 'mfa_step_up' || e.reason === 'mfa_required')) {
        await new Promise<void>((resolve, reject) => setStepUp({ resolve, reject }));
        return action();
      }
      throw e;
    }
  }, []);

  if (fatal) return <Banner variant="system">{fatal}</Banner>;
  if (!status) return <SkeletonCard />;

  if (!status.enabled) {
    return (
      <section className="mx-auto flex max-w-[480px] flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <h1 className="font-display text-h2 font-semibold text-fg">
          Set up two-factor authentication
        </h1>
        <p className="text-body-sm text-fg-muted">
          Moderator tools need a second step. Add RAISE to an authenticator app, then enter the code
          it shows.
        </p>
        {!setup ? (
          <Button onClick={async () => setSetup(await adminApi.mfaSetup())}>Start setup</Button>
        ) : (
          <>
            <div className="flex flex-col gap-1 rounded-card border border-line bg-raised p-3">
              <span className="label-caps text-fg-muted">Setup key</span>
              <code className="break-all font-mono text-body text-fg">
                {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
              </code>
              <a href={setup.otpauthUri} className="text-body-sm text-accent hover:underline">
                Open in authenticator app
              </a>
            </div>
            <CodeField value={code} onChange={setCode} error={codeError} />
            <Button
              loading={busy}
              disabled={code.length !== 6}
              onClick={() => void submit(adminApi.mfaEnable)}
            >
              Turn on two-factor
            </Button>
          </>
        )}
      </section>
    );
  }

  if (!status.sessionValid) {
    return (
      <section className="mx-auto flex max-w-[480px] flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <h1 className="font-display text-h2 font-semibold text-fg">Confirm it’s you</h1>
        <CodeField value={code} onChange={setCode} error={codeError} />
        <Button
          loading={busy}
          disabled={code.length !== 6}
          onClick={() => void submit(adminApi.mfaVerify)}
        >
          Continue
        </Button>
      </section>
    );
  }

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <Sheet
        open={stepUp !== null}
        onClose={() => {
          stepUp?.reject(new Error('Cancelled'));
          setStepUp(null);
        }}
        title="Confirm this action"
        footer={
          <Button
            fullWidth
            loading={busy}
            disabled={code.length !== 6}
            onClick={async () => {
              if (await submit(adminApi.mfaVerify)) {
                stepUp?.resolve();
                setStepUp(null);
              }
            }}
          >
            Confirm
          </Button>
        }
      >
        <p className="mb-3 text-body-sm text-fg-muted">
          Sensitive actions need a code from the last 15 minutes.
        </p>
        <CodeField value={code} onChange={setCode} error={codeError} />
      </Sheet>
    </StepUpContext.Provider>
  );
}

// ---------------------------------------------------------------- bits

export function AdminHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-h1 font-semibold text-fg">{title}</h1>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </header>
  );
}

export function LoadState({
  error,
  loading,
  onRetry,
}: {
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (error)
    return (
      <Banner
        variant="system"
        action={
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {error}
      </Banner>
    );
  if (loading) return <SkeletonCard />;
  return null;
}

/** SLA clock: time left (or overdue) against the 24h target, never colour alone. */
export function SlaClock({ dueAt, breached }: { dueAt: string; breached: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now()); // eslint-disable-line react-hooks/set-state-in-effect
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <span className="tabular text-fg-muted">—</span>;
  const ms = new Date(dueAt).getTime() - now;
  const h = Math.floor(Math.abs(ms) / 3600_000);
  const m = Math.floor((Math.abs(ms) % 3600_000) / 60_000);
  const text = `${h}h ${m.toString().padStart(2, '0')}m`;
  const over = breached || ms < 0;
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular', over ? 'text-dispute' : 'text-fg')}
    >
      <Icon name={over ? 'alert-triangle' : 'clock'} size={16} />
      {over ? `Overdue ${text}` : `${text} left`}
    </span>
  );
}

export function Pager({
  hasMore,
  onMore,
  busy,
}: {
  hasMore: boolean;
  onMore: () => void;
  busy?: boolean;
}) {
  if (!hasMore) return null;
  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={onMore}>
      Load more
    </Button>
  );
}

export function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}
