import { ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import { CURRENT_CONSENT } from './consent.constants';
import type { AcceptConsent, ConsentStatus } from './consent.schemas';

@Injectable()
export class ConsentService {
  async status(userId: string): Promise<ConsentStatus> {
    const rows = await db
      .select()
      .from(schema.consentRecords)
      .where(eq(schema.consentRecords.userId, userId));

    const termsAccepted = rows.some(
      (r) => r.termsType === 'terms' && r.termsVersion === CURRENT_CONSENT.terms,
    );
    const privacyAccepted = rows.some(
      (r) => r.termsType === 'privacy' && r.termsVersion === CURRENT_CONSENT.privacy,
    );

    return {
      current: CURRENT_CONSENT,
      accepted: { terms: termsAccepted, privacy: privacyAccepted },
      playAllowed: termsAccepted && privacyAccepted,
    };
  }

  async accept(userId: string, data: AcceptConsent, ip?: string) {
    const version = data.termsType === 'terms' ? CURRENT_CONSENT.terms : CURRENT_CONSENT.privacy;
    if (data.termsVersion !== version) {
      throw new ForbiddenException('Consent version does not match current');
    }
    await db
      .insert(schema.consentRecords)
      .values({
        id: uuidv7(),
        userId,
        termsType: data.termsType,
        termsVersion: version,
        ip,
      })
      .onConflictDoNothing();
    return this.status(userId);
  }

  async assertPlayAllowed(userId: string): Promise<void> {
    const s = await this.status(userId);
    if (!s.playAllowed) {
      throw new ForbiddenException('Accept the current terms and privacy policy to play');
    }
  }

  async assertTermsAccepted(userId: string): Promise<void> {
    const s = await this.status(userId);
    if (!s.accepted.terms) {
      throw new ForbiddenException('Accept the current terms of service to continue');
    }
  }
}
