import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { env } from './config/env.instance';
import { initErrorReporter } from './observability/error-reporter';

process.on('unhandledRejection', (reason) => {
  throw reason;
});

async function bootstrap() {
  // Sprint 15 (F15.4): Sentry when SENTRY_DSN is set; a no-op otherwise.
  await initErrorReporter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    // Provider webhook signatures are computed over the exact bytes received (Sprint 13).
    { rawBody: true },
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').filter(Boolean),
    credentials: true,
    // @fastify/cors v10+ defaults to GET/HEAD/POST; the API also uses PUT, PATCH and DELETE.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // The web app quotes it in error reports so a user's problem can be found in the logs.
    exposedHeaders: ['x-request-id'],
  });

  // WebSocket gateway with Redis fan-out across instances (Sprint 7, F7.1).
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  const swagger = await import('@nestjs/swagger');
  const config = new swagger.DocumentBuilder()
    .setTitle('RAISE API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = swagger.SwaggerModule.createDocument(app, config);
  swagger.SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  await app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  console.log(`RAISE API listening on :${env.PORT} (${env.NODE_ENV})`);
}

void bootstrap();
