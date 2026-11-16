import type { db } from './client';

/** A Drizzle transaction handle (what `db.transaction(async (tx) => …)` passes in). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
