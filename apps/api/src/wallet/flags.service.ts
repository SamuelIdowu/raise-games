import { Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db, schema } from '../db/client';

/** Current rollout stage. Stage 1 unless the deployment says otherwise. */
export function currentStage(): string {
  return process.env.APP_STAGE ?? '1';
}

/**
 * Feature flags per stage and jurisdiction (F0.8 table; F13.4 semantics). A row for the
 * player's state overrides the default row (null jurisdiction); no row at all means off.
 * Gaming rules are state-level, so real-money features are enabled state by state.
 */
@Injectable()
export class FlagsService {
  private cache = new Map<string, { value: boolean; at: number }>();
  private static readonly TTL_MS = 30_000;

  async isEnabled(
    key: string,
    opts: { jurisdiction?: string | null; stage?: string } = {},
  ): Promise<boolean> {
    const stage = opts.stage ?? currentStage();
    const jurisdiction = opts.jurisdiction ?? null;
    const cacheKey = `${key}|${stage}|${jurisdiction ?? '*'}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < FlagsService.TTL_MS) return hit.value;

    const f = schema.featureFlags;
    const rows = await db
      .select({ jurisdiction: f.jurisdiction, enabled: f.enabled })
      .from(f)
      .where(
        and(
          eq(f.key, key),
          eq(f.stage, stage),
          jurisdiction
            ? or(eq(f.jurisdiction, jurisdiction), isNull(f.jurisdiction))
            : isNull(f.jurisdiction),
        ),
      );
    const specific = jurisdiction ? rows.find((r) => r.jurisdiction === jurisdiction) : undefined;
    const value = (specific ?? rows.find((r) => r.jurisdiction === null))?.enabled ?? false;
    this.cache.set(cacheKey, { value, at: Date.now() });
    return value;
  }

  /** Tests and the admin flag toggle call this so a change applies at once. */
  invalidate(): void {
    this.cache.clear();
  }
}
