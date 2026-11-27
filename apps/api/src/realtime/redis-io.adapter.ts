import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { env } from '../config/env.instance';

/**
 * socket.io adapter that fans events out across API instances through Redis pub/sub
 * (NestJS "Adapters" pattern, Sprint 7 F7.1).
 *
 * Deployment (decided): WebSocket-only transport — no long-polling, so no sticky
 * sessions are needed behind a load balancer (socket.io multi-node docs: Redis alone is
 * not enough when polling is enabled). Clients that cannot hold a socket fall back to
 * the HTTP polling endpoints, not to socket.io polling.
 *
 * If Redis is unreachable at boot the server keeps socket.io's in-memory adapter: a
 * single instance still works, cross-instance fan-out does not, and this logs loudly.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private clients: Redis[] = [];

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(url: string = env.REDIS_URL): Promise<boolean> {
    const pub = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 2,
    });
    const sub = pub.duplicate();
    try {
      await Promise.all([pub.connect(), sub.connect()]);
      this.clients = [pub, sub];
      this.adapterConstructor = createAdapter(pub, sub);
      return true;
    } catch (error) {
      pub.disconnect();
      sub.disconnect();
      this.log.error(
        `Redis unavailable (${(error as Error).message}); WebSocket fan-out is single-instance only`,
      );
      return false;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: { origin: env.WEB_ORIGIN.split(',').filter(Boolean), credentials: true },
    } as ServerOptions);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  async dispose(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit().catch(() => c.disconnect())));
    this.clients = [];
  }
}
