import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as coreSchema from './schema';
import * as socialSchema from './schema-social';
import * as betaSchema from './schema-beta';
import { env } from '../config/env.instance';

/** Core tables plus Sprint 14 social and Sprint 16 beta tables (kept in their own files). */
const schema = { ...coreSchema, ...socialSchema, ...betaSchema };

/**
 * Timeouts so a slow or stuck database cannot hold the 10 connections forever (pre-deploy
 * audit 2026-11-27): waiting for a connection fails after 5 s instead of queueing without
 * limit, and each new connection caps statements and idle open transactions server-side.
 * They are set with SET on connect rather than as startup parameters, because poolers such
 * as PgBouncer refuse unknown startup parameters. Migrations use their own pool (migrate.ts),
 * so long index builds are not affected.
 */
export const STATEMENT_TIMEOUT_MS = 30_000;
export const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
});

pool.on('connect', (client) => {
  // Queued on the client before any caller's query, so it runs first.
  client
    .query(
      `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}; SET idle_in_transaction_session_timeout = ${IDLE_IN_TRANSACTION_TIMEOUT_MS}`,
    )
    .catch(() => undefined);
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
