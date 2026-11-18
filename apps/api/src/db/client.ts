import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as coreSchema from './schema';
import * as socialSchema from './schema-social';
import { env } from '../config/env.instance';

/** Core tables plus Sprint 14 social tables (kept in their own file). */
const schema = { ...coreSchema, ...socialSchema };

export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
