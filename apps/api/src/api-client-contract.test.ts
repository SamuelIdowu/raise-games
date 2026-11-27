/**
 * Audit B17: `packages/api-client` is hand-written (TA asks for a typed client generated
 * from OpenAPI). Until it is generated, this keeps it honest: every path the client calls
 * must exist in the API's own OpenAPI document, built from the real AppModule. A renamed or
 * removed route fails here instead of as a 404 in a player's browser.
 *
 * Paths are compared by shape: `/admin/users/${id}` and `/admin/users/{id}` both become
 * `/admin/users/{}`; query strings are ignored.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const CLIENT_SRC = path.resolve(__dirname, '../../../packages/api-client/src');
/** Web pages the client navigates to (not API routes). */
const WEB_ROUTES = ['/onboarding/'];

/** `/a/${x}/b${qs(q)}` → `/a/{}/b`; `/a/{id}` → `/a/{}`. */
export function shape(p: string): string {
  return (
    p
      // A ${...} not right after '/' builds a query string (${qs(q)}, ${page(opts)}, …).
      .replace(/([^/])\$\{.*$/, '$1')
      .split('?')[0]!
      .replace(/\$\{[^}]*\}/g, '{}')
      .replace(/\{[^}]*\}/g, '{}')
      .replace(/\/+$/, '') || '/'
  );
}

function clientPaths(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of readdirSync(CLIENT_SRC).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(path.join(CLIENT_SRC, file), 'utf8');
    for (const m of src.matchAll(/`(\/[^`]*)`|'(\/[a-z][^']*)'/g)) {
      const raw = m[1] ?? m[2]!;
      if (WEB_ROUTES.some((w) => raw.startsWith(w))) continue;
      found.set(shape(raw), `${file}: ${raw}`);
    }
  }
  return found;
}

describe('api-client ↔ API routes (audit B17)', () => {
  let app: NestFastifyApplication;
  let apiPaths: Set<string>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // No init(): Swagger reads routes from the module graph, so no database or Redis is needed.
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    apiPaths = new Set(Object.keys(doc.paths).map(shape));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('shape() normalises client templates and OpenAPI params alike', () => {
    expect(shape('/admin/users/${id}/sanctions')).toBe('/admin/users/{}/sanctions');
    expect(shape('/admin/users/{id}/sanctions')).toBe('/admin/users/{}/sanctions');
    expect(shape('/admin/audit${qs(q)}')).toBe('/admin/audit');
    expect(shape('/challenges?cursor=1')).toBe('/challenges');
    expect(shape('/notifications${before ? 1 : 2}')).toBe('/notifications');
  });

  it('every path the client calls exists on the API', () => {
    const client = clientPaths();
    expect(client.size).toBeGreaterThan(50);
    const missing = [...client.entries()]
      .filter(([p]) => !apiPaths.has(p))
      .map(([, where]) => where);
    expect(missing).toEqual([]);
  });
});
