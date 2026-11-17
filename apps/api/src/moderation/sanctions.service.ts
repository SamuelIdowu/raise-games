import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import {
  LADDER,
  LADDER_MEMORY_MS,
  nextStep,
  sanctionSummary,
  windowFor,
  type LadderStep,
} from './ladder';

export type SanctionSource = 'dispute' | 'report' | 'manual' | 'bulk';

export interface ApplyInput {
  userId: string;
  reason: string;
  source: SanctionSource;
  sourceId?: string | null;
  /** Override the computed next step (admins only; e.g. straight to a ban for fraud). */
  step?: LadderStep;
}

export interface AppliedSanction {
  id: string;
  userId: string;
  step: LadderStep;
  type: string;
  endsAt: string | null;
  summary: string;
}

/**
 * Sanction ladder (Sprint 12, F12.3). Every application writes the sanction, an audit
 * row and a `sanction.applied` event (Sprint 11 notifies the player, even when
 * suspended), in one transaction; a permanent ban also revokes every session at once.
 */
@Injectable()
export class SanctionsService {
  /** Ladder steps on record in the last year (revoked ones do not count). */
  async priorSteps(conn: Tx | typeof db, userId: string, now = new Date()): Promise<number[]> {
    const rows = await conn
      .select({ step: schema.sanctions.step })
      .from(schema.sanctions)
      .where(
        and(
          eq(schema.sanctions.userId, userId),
          isNull(schema.sanctions.revokedAt),
          gt(schema.sanctions.createdAt, new Date(now.getTime() - LADDER_MEMORY_MS)),
        ),
      );
    return rows.map((r) => r.step ?? 0);
  }

  async preview(userId: string) {
    return LADDER[nextStep(await this.priorSteps(db, userId))];
  }

  async apply(staff: AuthedUser, input: ApplyInput, conn?: Tx): Promise<AppliedSanction> {
    if (
      input.step &&
      staff.role !== 'admin' &&
      input.step !== nextStep(await this.priorSteps(conn ?? db, input.userId))
    ) {
      throw new BadRequestException('Only admins can skip ladder steps');
    }
    const run = async (tx: Tx) => {
      const [target] = await tx
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, input.userId))
        .for('update');
      if (!target) throw new NotFoundException('Player not found');
      if (target.role !== 'player' && staff.role !== 'admin') {
        throw new BadRequestException('Only admins can sanction staff accounts');
      }
      if (target.id === staff.sub) throw new BadRequestException('You cannot sanction yourself');

      const now = new Date();
      const step = input.step ?? nextStep(await this.priorSteps(tx, input.userId, now));
      const spec = LADDER[step];
      const window = windowFor(step, now);
      const id = uuidv7();
      await tx.insert(schema.sanctions).values({
        id,
        userId: input.userId,
        type: spec.type,
        reason: input.reason,
        step,
        source: input.source,
        sourceId: input.sourceId ?? null,
        issuedById: staff.sub,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      });
      if (spec.type === 'permanent_ban') {
        await tx
          .update(schema.sessions)
          .set({ revokedAt: now })
          .where(and(eq(schema.sessions.userId, input.userId), isNull(schema.sessions.revokedAt)));
      }
      const summary = sanctionSummary(step, window.endsAt);
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'sanction.applied',
        subjectId: input.userId,
        payload: { userId: input.userId, sanctionId: id, step, type: spec.type, summary },
      });
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: staff.sub,
        action: 'sanction.applied',
        objectType: 'user',
        objectId: input.userId,
        after: {
          sanctionId: id,
          step,
          type: spec.type,
          source: input.source,
          sourceId: input.sourceId ?? null,
          reason: input.reason,
        },
      });
      return {
        id,
        userId: input.userId,
        step,
        type: spec.type,
        endsAt: window.endsAt?.toISOString() ?? null,
        summary,
      };
    };
    return conn ? run(conn) : db.transaction(run);
  }

  async revoke(staff: AuthedUser, sanctionId: string, note: string) {
    return db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(schema.sanctions)
        .where(eq(schema.sanctions.id, sanctionId))
        .for('update');
      if (!s) throw new NotFoundException('Sanction not found');
      if (s.revokedAt) return { id: s.id, revoked: true };
      const now = new Date();
      await tx
        .update(schema.sanctions)
        .set({ revokedAt: now, revokedById: staff.sub })
        .where(eq(schema.sanctions.id, sanctionId));
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: staff.sub,
        action: 'sanction.revoked',
        objectType: 'user',
        objectId: s.userId,
        before: { sanctionId, type: s.type, step: s.step },
        after: { note },
      });
      return { id: s.id, revoked: true };
    });
  }

  /** Bulk: one transaction per player (idempotent per player via `sourceId` = batch id). */
  async bulkApply(staff: AuthedUser, userIds: string[], reason: string, batchId: string) {
    const results: Array<{ userId: string; ok: boolean; step?: number; error?: string }> = [];
    for (const userId of [...new Set(userIds)]) {
      const [done] = await db
        .select({ step: schema.sanctions.step })
        .from(schema.sanctions)
        .where(and(eq(schema.sanctions.userId, userId), eq(schema.sanctions.sourceId, batchId)))
        .limit(1);
      if (done) {
        results.push({ userId, ok: true, step: done.step ?? undefined });
        continue;
      }
      try {
        const s = await this.apply(staff, { userId, reason, source: 'bulk', sourceId: batchId });
        results.push({ userId, ok: true, step: s.step });
      } catch (e) {
        results.push({ userId, ok: false, error: e instanceof Error ? e.message : 'failed' });
      }
    }
    return { batchId, results };
  }

  async history(userId: string) {
    return db
      .select()
      .from(schema.sanctions)
      .where(eq(schema.sanctions.userId, userId))
      .orderBy(desc(schema.sanctions.createdAt));
  }

  async activeFor(userIds: string[]) {
    if (!userIds.length) return [];
    return db
      .select({
        userId: schema.sanctions.userId,
        type: schema.sanctions.type,
        endsAt: schema.sanctions.endsAt,
      })
      .from(schema.sanctions)
      .where(and(inArray(schema.sanctions.userId, userIds), isNull(schema.sanctions.revokedAt)));
  }
}
