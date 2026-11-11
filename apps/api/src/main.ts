import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { env } from './config/env.instance';

process.on('unhandledRejection', (reason) => {
  throw reason;
});

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').filter(Boolean),
    credentials: true,
  });

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
