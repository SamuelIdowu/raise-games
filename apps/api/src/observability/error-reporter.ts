import { Logger } from '@nestjs/common';
import { scrub, scrubString } from './scrub';

/**
 * Error reporting port (TA §Third-party: "each sits behind an adapter"; Sprint 15 F15.4).
 * Sentry when SENTRY_DSN is set, otherwise a no-op (the error is already in the logs).
 * Everything sent is scrubbed of phone numbers, emails and tokens.
 */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  route?: string;
  source?: 'api' | 'web';
  extra?: Record<string, unknown>;
}

export interface ErrorReporter {
  capture(error: unknown, ctx?: ErrorContext): void;
}

class NoopReporter implements ErrorReporter {
  capture(): void {}
}

class SentryReporter implements ErrorReporter {
  constructor(private readonly sentry: typeof import('@sentry/node')) {}

  capture(error: unknown, ctx: ErrorContext = {}): void {
    this.sentry.withScope((scope) => {
      if (ctx.requestId) scope.setTag('request_id', ctx.requestId);
      if (ctx.route) scope.setTag('route', ctx.route);
      scope.setTag('source', ctx.source ?? 'api');
      // Pseudonymous id only: never phone or display name.
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      if (ctx.extra) scope.setContext('extra', scrub(ctx.extra));
      this.sentry.captureException(error);
    });
  }
}

let reporter: ErrorReporter = new NoopReporter();
let initialised = false;

/** Called once at boot (main.ts). Safe to call when no DSN is configured. */
export async function initErrorReporter(): Promise<ErrorReporter> {
  if (initialised) return reporter;
  initialised = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return reporter;
  try {
    const sentry = await import('@sentry/node');
    sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.RELEASE_SHA,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // Our own OpenTelemetry SDK owns tracing when it is enabled (src/instrument.ts).
      skipOpenTelemetrySetup: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
      beforeSend(event) {
        if (event.message) event.message = scrubString(event.message);
        for (const ex of event.exception?.values ?? []) {
          if (ex.value) ex.value = scrubString(ex.value);
        }
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          event.request.headers = scrub(event.request.headers ?? {});
          if (event.request.url) event.request.url = scrubString(event.request.url);
        }
        if (event.extra) event.extra = scrub(event.extra);
        return event;
      },
    });
    reporter = new SentryReporter(sentry);
    new Logger('ErrorReporter').log('Sentry error reporting on');
  } catch (error) {
    new Logger('ErrorReporter').error(`Sentry init failed: ${(error as Error).message}`);
  }
  return reporter;
}

export function errorReporter(): ErrorReporter {
  return reporter;
}

/** Tests swap in a recorder. */
export function setErrorReporter(r: ErrorReporter): void {
  reporter = r;
  initialised = true;
}
