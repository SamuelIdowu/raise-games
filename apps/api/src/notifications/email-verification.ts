import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { env } from '../config/env.instance';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import { enforceRateLimit } from '../shared/rate-limit';
import type { EmailChannel } from './channels';

/** Confirmation emails per player per hour (changes and resends together): no mail bombing. */
export const EMAIL_VERIFY_PER_HOUR = 5;

/** How long a confirmation link stays valid. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 3600_000;

export const EMAIL_VERIFY_COPY = {
  title: 'Confirm your email for RAISE',
  body: 'Tap the link to confirm this address for RAISE notifications. If you did not ask for this, ignore this email and nothing will be sent to you.',
  invalid:
    'This link has expired or was already used. Send a new one from your notification settings.',
} as const;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 256-bit random token, URL-safe. Only its hash is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/**
 * Starts a confirmation for `email` inside the caller's transaction (replacing any pending
 * one) and returns the token to email after commit.
 */
export async function startVerification(
  tx: Tx,
  userId: string,
  email: string,
  now = new Date(),
): Promise<string> {
  // Throws 429 inside the caller's transaction, so a refused change rolls back.
  await enforceRateLimit(`rl:email:verify:${userId}`, EMAIL_VERIFY_PER_HOUR, 3_600_000);
  const { token, hash } = newToken();
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
  await tx
    .insert(schema.emailVerifications)
    .values({ userId, email, tokenHash: hash, expiresAt, createdAt: now })
    .onConflictDoUpdate({
      target: schema.emailVerifications.userId,
      set: { email, tokenHash: hash, expiresAt, createdAt: now },
    });
  return token;
}

export async function sendVerificationEmail(
  channel: EmailChannel,
  email: string,
  token: string,
): Promise<void> {
  await channel.send(email, {
    title: EMAIL_VERIFY_COPY.title,
    body: EMAIL_VERIFY_COPY.body,
    url: `${env.APP_URL.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(token)}`,
  });
}

/**
 * Confirms an address from the emailed token. The token is the proof (it can be opened on
 * any device), so no session is needed. It must be unexpired, unused, and still match the
 * player's current address: changing the email again voids older links.
 */
export async function confirmEmail(token: string, now = new Date()): Promise<{ ok: true }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.emailVerifications)
      .where(
        and(
          eq(schema.emailVerifications.tokenHash, hashToken(token)),
          gt(schema.emailVerifications.expiresAt, now),
        ),
      )
      .for('update');
    if (!row) throw new BadRequestException(EMAIL_VERIFY_COPY.invalid);
    const [user] = await tx
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, row.userId));
    await tx
      .delete(schema.emailVerifications)
      .where(eq(schema.emailVerifications.userId, row.userId));
    if (!user || user.email !== row.email) throw new BadRequestException(EMAIL_VERIFY_COPY.invalid);
    await tx
      .update(schema.users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(eq(schema.users.id, row.userId));
    return { ok: true as const };
  });
}
