/**
 * Load-test fixtures (Sprint 15, F15.2/F15.3). Creates N signed-in players in pairs, each
 * pair with a live match and its chat, plus open challenges for the board, and writes
 * their access tokens to a JSON file for k6 and the WebSocket script.
 *
 * Sessions are real rows and tokens are signed with JWT_ACCESS_SECRET, so the auth guard
 * treats load players exactly like real ones (no bypass exists for load tests). Never run
 * against production: it refuses unless NODE_ENV is development/test or LOAD_SEED_ALLOW=1.
 *
 *   tsx src/scripts/load-seed.ts <players> <out.json>
 */
import { writeFileSync } from 'node:fs';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { env } from '../config/env.instance';
import { CURRENT_CONSENT } from '../consent/consent.constants';
import { db, pool, schema } from '../db/client';

const count = Math.max(2, Number(process.argv[2] ?? 100)) & ~1; // even: players come in pairs
const out = process.argv[3] ?? 'load-tokens.json';

async function main() {
  if (!['development', 'test'].includes(env.NODE_ENV) && process.env.LOAD_SEED_ALLOW !== '1') {
    throw new Error(
      'load-seed refuses to run outside development/test (set LOAD_SEED_ALLOW=1 on staging)',
    );
  }
  const jwt = new JwtService();
  const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
  if (!game) throw new Error('Seed reference data first (pnpm db:seed)');
  const [format] = await db
    .select()
    .from(schema.gameFormats)
    .where(eq(schema.gameFormats.gameId, game.id))
    .limit(1);

  const run = uuidv7().slice(-6);
  // E.164: +234 99 PPPP NNNNN (14 digits), PPPP random per run so reruns do not collide.
  const prefix = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  const players: Array<{ userId: string; token: string; profileId: string }> = [];
  for (let i = 0; i < count; i++) {
    const userId = uuidv7();
    const profileId = uuidv7();
    const sessionId = uuidv7();
    await db.insert(schema.users).values({
      id: userId,
      phone: `+23499${prefix}${String(i).padStart(5, '0')}`,
      displayName: `load_${run}_${i}`,
      tosVersionAccepted: CURRENT_CONSENT.terms,
    });
    await db.insert(schema.consentRecords).values([
      { id: uuidv7(), userId, termsType: 'terms', termsVersion: CURRENT_CONSENT.terms },
      { id: uuidv7(), userId, termsType: 'privacy', termsVersion: CURRENT_CONSENT.privacy },
    ]);
    await db
      .insert(schema.gameProfiles)
      .values({ id: profileId, userId, gameId: game.id, inGameId: `load_${run}_${i}` });
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      familyId: sessionId,
      refreshTokenHash: 'load-test-no-refresh',
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });
    const token = await jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: 6 * 3600 },
    );
    players.push({ userId, token, profileId });
  }

  const now = Date.now();
  const pairs: Array<{ a: number; b: number; matchId: string }> = [];
  for (let i = 0; i < players.length; i += 2) {
    const a = players[i]!;
    const b = players[i + 1]!;
    const challengeId = uuidv7();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId: game.id,
      formatId: format!.id,
      posterId: a.userId,
      status: 'accepted',
      startsAt: new Date(now - 600_000),
      endsAt: new Date(now + 3600_000),
      acceptanceDeadline: new Date(now - 700_000),
      acceptedById: b.userId,
      acceptedAt: new Date(now - 650_000),
    });
    const matchId = uuidv7();
    await db.insert(schema.matches).values({
      id: matchId,
      challengeId,
      status: 'in_progress',
      inProgressAt: new Date(now - 600_000),
      resultDeadline: new Date(now + 24 * 3600_000),
    });
    await db.insert(schema.matchSides).values([
      {
        id: uuidv7(),
        matchId,
        userId: a.userId,
        gameProfileId: a.profileId,
        side: 0,
        isPoster: true,
      },
      {
        id: uuidv7(),
        matchId,
        userId: b.userId,
        gameProfileId: b.profileId,
        side: 1,
        isAcceptor: true,
      },
    ]);
    const conversationId = uuidv7();
    await db.insert(schema.conversations).values({ id: conversationId, scope: 'match', matchId });
    await db.insert(schema.conversationParticipants).values([
      { conversationId, userId: a.userId },
      { conversationId, userId: b.userId },
    ]);
    // An open challenge from every pair keeps the board realistic.
    await db.insert(schema.challenges).values({
      id: uuidv7(),
      gameId: game.id,
      formatId: format!.id,
      posterId: a.userId,
      status: 'open',
      startsAt: new Date(now + 2 * 3600_000),
      endsAt: new Date(now + 3 * 3600_000),
      acceptanceDeadline: new Date(now + 3600_000),
    });
    pairs.push({ a: i, b: i + 1, matchId });
  }

  writeFileSync(
    out,
    JSON.stringify({
      run,
      players: players.map((p, i) => ({
        userId: p.userId,
        token: p.token,
        matchId: pairs[Math.floor(i / 2)]!.matchId,
        role: i % 2 === 0 ? 'a' : 'b',
      })),
    }),
  );
  console.log(`seeded ${players.length} players / ${pairs.length} matches → ${out}`);
}

main()
  .then(() => pool.end())
  .catch(async (error: Error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
