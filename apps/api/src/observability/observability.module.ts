import { Body, Controller, HttpCode, Module, OnModuleInit, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { OutboxRelay } from '../realtime/outbox-relay';
import { enforceRateLimit } from '../shared/rate-limit';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { ANALYTICS_EVENT_TYPES, AnalyticsService } from './analytics';
import { errorReporter } from './error-reporter';
import { scrub, scrubString } from './scrub';

const clientError = z.object({
  message: z.string().min(1).max(1000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(300).optional(),
  requestId: z.string().max(64).optional(),
  release: z.string().max(64).optional(),
  kind: z.enum(['error', 'unhandledrejection', 'react']).default('error'),
});

/**
 * Web error intake (F15.4). The browser reports crashes here instead of shipping a vendor
 * SDK to every phone: smaller bundles on 3G, one place to scrub PII, and the CSP stays
 * narrow. Unauthenticated (a crash may happen before sign-in), so it is rate-limited per
 * IP and everything is scrubbed before it reaches the error reporter.
 */
@Controller('telemetry')
export class TelemetryController {
  @Post('client-errors')
  @HttpCode(204)
  async clientError(
    @Body(new ZodValidationPipe(clientError)) body: z.infer<typeof clientError>,
    @Req() req: FastifyRequest,
  ) {
    await enforceRateLimit(`rl:telemetry:${req.ip ?? 'unknown'}`, 30, 60_000);
    const err = new Error(scrubString(body.message));
    err.name = `WebClient${body.kind === 'react' ? 'Render' : ''}Error`;
    if (body.stack) err.stack = scrubString(body.stack);
    errorReporter().capture(err, {
      source: 'web',
      route: body.route ? scrubString(body.route) : undefined,
      requestId: body.requestId,
      extra: scrub({ kind: body.kind, release: body.release ?? null }),
    });
  }
}

@Module({
  imports: [RealtimeCoreModule],
  controllers: [TelemetryController],
  providers: [AnalyticsService],
})
export class ObservabilityModule implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Analytics is an outbox consumer with its own delivery state (retries, no blocking). */
  onModuleInit(): void {
    if (!this.analytics.enabled) return;
    this.relay.register({
      name: 'analytics',
      matches: (type) => (ANALYTICS_EVENT_TYPES as readonly string[]).includes(type),
      handle: (event) => this.analytics.handle(event),
    });
  }
}
