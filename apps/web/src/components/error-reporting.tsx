'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@raise/api-client';

/**
 * Web crash reporting (Sprint 15, F15.4). Unhandled errors and promise rejections go to the
 * API's `/telemetry/client-errors`, which scrubs PII and forwards them to the error
 * reporter. No vendor SDK ships to the phone (bundle size on 3G, narrow CSP).
 *
 * At most 5 distinct reports per page load, sent with `keepalive` so a crash during
 * navigation still arrives. Reporting never throws.
 */
const MAX_REPORTS = 5;

export function ErrorReporting() {
  useEffect(() => {
    const seen = new Set<string>();
    const send = (kind: 'error' | 'unhandledrejection', message: string, stack?: string) => {
      const key = `${kind}:${message}`;
      if (seen.has(key) || seen.size >= MAX_REPORTS) return;
      seen.add(key);
      try {
        void fetch(`${API_BASE_URL}/telemetry/client-errors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            message: message.slice(0, 1000),
            stack: stack?.slice(0, 8000),
            route: window.location.pathname,
            release: process.env.NEXT_PUBLIC_RELEASE_SHA,
          }),
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // Reporting must never break the page.
      }
    };
    const onError = (e: ErrorEvent) => {
      // Cross-origin script errors arrive as "Script error." with nothing useful.
      if (!e.message || e.message === 'Script error.') return;
      send('error', e.message, e.error instanceof Error ? e.error.stack : undefined);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      send(
        'unhandledrejection',
        r instanceof Error ? r.message : String(r),
        r instanceof Error ? r.stack : undefined,
      );
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
