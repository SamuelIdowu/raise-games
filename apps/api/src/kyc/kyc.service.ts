import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { KycResult } from './kyc-provider.port';
import { nextIdentityState } from './kyc.rules';

/**
 * Applies verified KYC results to a player's identity (audit B31). Stage 2's provider callback
 * calls `applyResult` after checking the signature; stake caps follow the new tier through
 * `stake_limit_rules` with no further code.
 *
 * The tier change, its audit row and a `kyc.result` outbox event (Stage 2 notification
 * catalog: "KYC result") commit in one transaction, with the user row locked so two
 * callbacks cannot interleave.
 */
@Injectable()
export class KycService {
  async applyResult(result: KycResult): Promise<void> {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select({
          tier: schema.users.identityTier,
          kycStatus: schema.users.kycStatus,
          ageStatus: schema.users.ageVerificationStatus,
        })
        .from(schema.users)
        .where(eq(schema.users.id, result.userId))
        .for('update');
      if (!user) throw new NotFoundException('Player not found');

      const next = nextIdentityState(user, result);
      await tx
        .update(schema.users)
        .set({
          identityTier: next.tier,
          kycStatus: next.kycStatus,
          ageVerificationStatus: next.ageStatus,
        })
        .where(eq(schema.users.id, result.userId));

      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: null,
        action: 'kyc.result_applied',
        objectType: 'user',
        objectId: result.userId,
        before: user,
        after: { ...next, provider: result.provider, reference: result.reference },
      });
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'kyc.result',
        subjectId: result.userId,
        payload: { userId: result.userId, outcome: result.outcome, tier: next.tier },
      });
    });
  }
}
