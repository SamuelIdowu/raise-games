import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { DM_FLAG_KEY } from './dm.rules';

/**
 * `messaging.dm` (Sprint 14, F14.1). Default off: no row, or a disabled row, means off.
 * Read on every request (one indexed lookup) so an admin toggle applies at once and a
 * "no" from the owner turns the whole feature off without a deploy.
 */
export async function dmEnabled(): Promise<boolean> {
  const f = schema.featureFlags;
  const [row] = await db
    .select({ enabled: f.enabled })
    .from(f)
    .where(
      and(
        eq(f.key, DM_FLAG_KEY),
        eq(f.stage, process.env.APP_STAGE ?? '1'),
        isNull(f.jurisdiction),
      ),
    )
    .limit(1);
  return row?.enabled ?? false;
}

/**
 * Every DM route sits behind this. Off means 404 (not 403): the feature does not exist,
 * so deep links and probes learn nothing about it.
 */
@Injectable()
export class DmEnabledGuard implements CanActivate {
  async canActivate(): Promise<boolean> {
    if (!(await dmEnabled())) throw new NotFoundException();
    return true;
  }
}
