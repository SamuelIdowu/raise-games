import { randomInt } from 'node:crypto';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';

/**
 * Closed-beta gate (Sprint 16, F16.1). Plain functions over the database so AuthService
 * can use them without a module cycle.
 */

export const INVITE_FLAG_KEY = 'beta.invite_only';
/** No 0/O, 1/I/L: codes are read aloud and typed from posters and group chats. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const WAITLIST_RETENTION_DAYS = 90;
/** Wrong codes allowed per IP per hour before 429 (guessing 31^8 is hopeless anyway). */
export const BAD_INVITE_LIMIT = { max: 10, windowMs: 3_600_000 } as const;

export const INVITE_COPY = {
  required: 'RAISE is in a closed beta. Enter your invite code, or join the waitlist.',
  invalid: 'This invite code is not valid. Check it, or join the waitlist.',
} as const;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++)
    out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}

/**
 * Accepts what people actually type (lower case, spaces, dashes). Characters outside the
 * alphabet, such as O or 1, make the code invalid rather than being guessed at.
 */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Flag read per call (one indexed lookup) so an admin toggle applies at once. */
export async function inviteOnly(): Promise<boolean> {
  const f = schema.featureFlags;
  const [row] = await db
    .select({ enabled: f.enabled })
    .from(f)
    .where(
      and(
        eq(f.key, INVITE_FLAG_KEY),
        eq(f.stage, process.env.APP_STAGE ?? '1'),
        isNull(f.jurisdiction),
      ),
    )
    .limit(1);
  return row?.enabled ?? false;
}

const usable = (code: string) => {
  const c = schema.inviteCodes;
  return and(
    eq(c.code, code),
    eq(c.active, true),
    lt(c.uses, c.maxUses),
    or(isNull(c.expiresAt), gt(c.expiresAt, sql`now()`)),
  );
};

/** Read-only check (OTP request, and before an OTP code is spent at verify). */
export async function inviteUsable(raw: string | null | undefined): Promise<boolean> {
  const code = normalizeInviteCode(raw);
  if (!code) return false;
  const [row] = await db
    .select({ id: schema.inviteCodes.id })
    .from(schema.inviteCodes)
    .where(usable(code))
    .limit(1);
  return !!row;
}

/**
 * Atomic redemption inside the account-creating transaction: the conditional increment
 * succeeds only while the code is active, unexpired and under `max_uses`, so concurrent
 * signups can never overshoot. Returns false when the code cannot be used.
 */
export async function redeemInvite(
  tx: Tx,
  raw: string | null | undefined,
  userId: string,
): Promise<boolean> {
  const code = normalizeInviteCode(raw);
  if (!code) return false;
  const c = schema.inviteCodes;
  const [row] = await tx
    .update(c)
    .set({ uses: sql`${c.uses} + 1` })
    .where(usable(code))
    .returning({ id: c.id, cohort: c.cohort });
  if (!row) return false;
  await tx.insert(schema.inviteRedemptions).values({ userId, codeId: row.id, cohort: row.cohort });
  return true;
}

/** Waitlist rows older than the retention window are deleted. */
export async function purgeWaitlist(): Promise<number> {
  const rows = await db
    .delete(schema.betaWaitlist)
    .where(
      lt(
        schema.betaWaitlist.createdAt,
        sql`now() - make_interval(days => ${WAITLIST_RETENTION_DAYS})`,
      ),
    )
    .returning({ id: schema.betaWaitlist.id });
  return rows.length;
}
