/**
 * Audit #2 / B1: the terms gate, against the real database and the real route wiring.
 * The unit test stubs the consent lookup; this proves the guard reads consent_records
 * correctly and that every play route actually carries it (and the defensive ones do not).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from './db/client';
import { ChallengesController } from './challenges/challenges.controller';
import { CONSENT_REQUIRED, PlayConsentGuard } from './consent/play-consent.guard';
import { CURRENT_CONSENT } from './consent/consent.constants';
import { DisputesController } from './disputes/disputes.controller';
import { DmController } from './dm/dm.controller';
import { MatchesController } from './matches/matches.controller';

const userIds: string[] = [];
let phone = Math.floor(Math.random() * 90_000_000);

async function player(consents: Array<{ type: 'terms' | 'privacy'; version: string }>) {
  const id = uuidv7();
  await db.insert(schema.users).values({
    id,
    phone: `+23493${(phone++).toString().padStart(8, '0')}`,
    displayName: `gate_${id.slice(-6)}`,
  });
  userIds.push(id);
  if (consents.length) {
    await db.insert(schema.consentRecords).values(
      consents.map((c) => ({
        id: uuidv7(),
        userId: id,
        termsType: c.type,
        termsVersion: c.version,
      })),
    );
  }
  return id;
}

const ctx = (sub: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { sub } }) }),
  }) as unknown as ExecutionContext;

/** Guards declared on a handler or its class. */
function guardsOf(controller: object, handler: string): unknown[] {
  const proto = (controller as { prototype: Record<string, unknown> }).prototype;
  return [
    ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, proto[handler] as object) as unknown[]) ?? []),
  ];
}

describe('terms gate against the database (audit #2)', () => {
  afterAll(async () => {
    if (userIds.length) {
      await db.delete(schema.consentRecords).where(inArray(schema.consentRecords.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
  });

  const guard = new PlayConsentGuard();

  it('refuses a player who accepted nothing, or an old version, or only one of the two', async () => {
    for (const consents of [
      [],
      [
        { type: 'terms' as const, version: '0.9' },
        { type: 'privacy' as const, version: '0.9' },
      ],
      [{ type: 'terms' as const, version: CURRENT_CONSENT.terms }],
    ]) {
      const id = await player(consents);
      await expect(guard.canActivate(ctx(id))).rejects.toMatchObject({
        response: { code: CONSENT_REQUIRED },
      });
    }
  });

  it('lets a player with the current terms and privacy through', async () => {
    const id = await player([
      { type: 'terms', version: CURRENT_CONSENT.terms },
      { type: 'privacy', version: CURRENT_CONSENT.privacy },
    ]);
    await expect(guard.canActivate(ctx(id))).resolves.toBe(true);
  });

  it('is wired on every play route, and deliberately not on defensive ones', () => {
    const gated: Array<[object, string]> = [
      [ChallengesController, 'create'],
      [ChallengesController, 'accept'],
      [MatchesController, 'submit'],
      [MatchesController, 'noShow'],
      [DmController, 'request'],
      [DmController, 'open'],
    ];
    for (const [controller, handler] of gated) {
      expect(guardsOf(controller, handler), `${handler}`).toContain(PlayConsentGuard);
    }
    // Backing out and contesting a result must never be blocked by a re-accept prompt.
    const open: Array<[object, string]> = [
      [ChallengesController, 'decline'],
      [MatchesController, 'confirm'],
      [DisputesController, 'open'],
      [DisputesController, 'appeal'],
    ];
    for (const [controller, handler] of open) {
      expect(guardsOf(controller, handler), `${handler}`).not.toContain(PlayConsentGuard);
    }
  });
});
