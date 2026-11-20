import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as coreSchema from './schema';
import * as socialSchema from './schema-social';
import * as betaSchema from './schema-beta';
import { env } from '../config/env.instance';

/** Core tables plus Sprint 14 social and Sprint 16 beta tables (kept in their own files). */
const schema = { ...coreSchema, ...socialSchema, ...betaSchema };

export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
