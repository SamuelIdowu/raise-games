/**
 * OpenTelemetry tracing (Sprint 15, F15.4; TA §Observability). Preloaded before the app so
 * HTTP, Fastify, Postgres and Redis are instrumented:
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com OTEL_SERVICE_NAME=raise-api \
 *     node --require ./dist/instrument.js dist/main.js
 *
 * Without the endpoint this file does nothing, so local runs and tests never need a
 * collector. Health checks are not traced. SQL text is recorded without parameter values.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NodeSDK } =
    require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } =
    require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } =
    require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'raise-api',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noise or not used.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => req.url === '/health',
        },
        '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: false },
      }),
    ],
  });
  sdk.start();
  const shutdown = () => {
    void sdk.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
}

export {};
