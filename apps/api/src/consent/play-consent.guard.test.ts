import { describe, expect, it } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { CONSENT_REQUIRED, PlayConsentGuard } from './play-consent.guard';
import type { ConsentStatus } from './consent.schemas';

function contextFor(user?: { sub: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(playAllowed: boolean): PlayConsentGuard {
  const guard = new PlayConsentGuard();
  const status = { playAllowed } as ConsentStatus;
  (guard as unknown as { consent: { status: () => Promise<ConsentStatus> } }).consent = {
    status: async () => status,
  };
  return guard;
}

describe('PlayConsentGuard (audit #2)', () => {
  it('lets a player who accepted the current terms and privacy through', async () => {
    await expect(guardWith(true).canActivate(contextFor({ sub: 'u1' }))).resolves.toBe(true);
  });

  it('refuses with consent_required when the current versions are not accepted', async () => {
    const attempt = guardWith(false).canActivate(contextFor({ sub: 'u1' }));
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await attempt.catch((error: ForbiddenException) => {
      expect(error.getResponse()).toMatchObject({ code: CONSENT_REQUIRED });
    });
  });

  it('refuses an unauthenticated request', async () => {
    await expect(guardWith(true).canActivate(contextFor(undefined))).resolves.toBe(false);
  });
});
