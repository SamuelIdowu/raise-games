/**
 * Demo ladders for development and staging (audit B27; Delivery Plan "seed scripts for demo
 * ladders"). Creates players per launch game, spread over a few Nigerian campuses and cities,
 * a history of confirmed matches between them, and some open challenges, so the board,
 * leaderboards, local filters and profiles can be shown and tested with realistic data.
 *
 *   pnpm --filter @raise/api exec tsx src/scripts/demo-seed.ts [playersPerGame=24] [matchesPerGame=80]
 *
 * Ratings are NOT written here. Each match gets the same `match.confirmed` outbox event the
 * results flow emits, and the running API's ratings consumer applies them, so every demo
 * rating is reproducible from the rating event log (`pnpm ratings:verify`). Start the API
 * (or leave it running) and the leaderboards fill within seconds.
 *
 * Never for production: launch ladders are seeded by real players from partner campuses,
 * and fake opponents would mislead them. Refuses outside development/test unless
 * DEMO_SEED_ALLOW=1 (staging). Demo accounts use display names starting `demo_` and phones
 * +23498…, so a staging reset can find them.
 */
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { env } from '../config/env.instance';
import { CURRENT_CONSENT } from '../consent/consent.constants';
import { db, pool, schema } from '../db/client';

const PLAYERS = Math.max(4, Number(process.argv[2] ?? 24));
const MATCHES = Math.max(1, Number(process.argv[3] ?? 80));
const DAY = 86_400_000;

const PLACES: Array<{ city: string; campus: string | null }> = [
  { city: 'Lagos', campus: 'UNILAG' },
  { city: 'Lagos', campus: 'LASU' },
  { city: 'Ibadan', campus: 'UI' },
  { city: 'Ile-Ife', campus: 'OAU' },
  { city: 'Abuja', campus: null },
  { city: 'Port Harcourt', campus: 'UNIPORT' },
];

/** Deterministic PRNG so a rerun with the same sizes gives a similar-looking ladder. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

async function main() {
  if (!['development', 'test'].includes(env.NODE_ENV) && process.env.DEMO_SEED_ALLOW !== '1') {
    throw new Error(
      'demo-seed refuses to run outside development/test (DEMO_SEED_ALLOW=1 on staging)',
    );
  }
  const games = await db.select().from(schema.games);
  if (games.length === 0) throw new Error('Seed reference data first (pnpm db:seed)');

  const random = rng(PLAYERS * 7919 + MATCHES);
  const run = uuidv7().slice(-5);
  const prefix = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  let phone = 0;
  let eventClock = Date.now() - 60_000;

  for (const game of games) {
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(and(eq(schema.gameFormats.gameId, game.id), eq(schema.gameFormats.status, 'enabled')))
      .limit(1);
    if (!format) continue;

    // Players with a hidden skill, so results look like a ladder rather than coin flips.
    const players: Array<{ userId: string; profileId: string; skill: number }> = [];
    for (let i = 0; i < PLAYERS; i++) {
      const userId = uuidv7();
      const profileId = uuidv7();
      const place = PLACES[i % PLACES.length]!;
      const name = `demo_${game.key.slice(0, 4)}_${run}_${i}`;
      await db.insert(schema.users).values({
        id: userId,
        phone: `+23498${prefix}${String(phone++).padStart(5, '0')}`,
        displayName: name,
        tosVersionAccepted: CURRENT_CONSENT.terms,
        jurisdictionState: 'Lagos',
      });
      await db.insert(schema.consentRecords).values([
        { id: uuidv7(), userId, termsType: 'terms', termsVersion: CURRENT_CONSENT.terms },
        { id: uuidv7(), userId, termsType: 'privacy', termsVersion: CURRENT_CONSENT.privacy },
      ]);
      await db.insert(schema.gameProfiles).values({
        id: profileId,
        userId,
        gameId: game.id,
        inGameId: name,
        city: place.city,
        campus: place.campus,
      });
      players.push({ userId, profileId, skill: 800 + random() * 800 });
    }

    // Confirmed matches over the last three weeks, oldest first (the order ratings apply).
    for (let m = 0; m < MATCHES; m++) {
      const a = players[Math.floor(random() * players.length)]!;
      let b = players[Math.floor(random() * players.length)]!;
      while (b === a) b = players[Math.floor(random() * players.length)]!;
      const aWins = random() < 1 / (1 + 10 ** ((b.skill - a.skill) / 400));
      const [winner, loser] = aWins ? [a, b] : [b, a];
      const confirmedAt = new Date(Date.now() - 21 * DAY + (m / MATCHES) * 20 * DAY);
      const startsAt = new Date(confirmedAt.getTime() - 2 * 3600_000);

      const challengeId = uuidv7();
      await db.insert(schema.challenges).values({
        id: challengeId,
        gameId: game.id,
        formatId: format.id,
        posterId: a.userId,
        status: 'accepted',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3600_000),
        acceptanceDeadline: new Date(startsAt.getTime() - 3600_000),
        acceptedById: b.userId,
        acceptedAt: new Date(startsAt.getTime() - 3 * 3600_000),
      });
      const matchId = uuidv7();
      await db.insert(schema.matches).values({
        id: matchId,
        challengeId,
        status: 'confirmed',
        winnerSide: aWins ? 0 : 1,
        acceptedAt: new Date(startsAt.getTime() - 3 * 3600_000),
        scheduledStartAt: startsAt,
        inProgressAt: startsAt,
        resultSubmittedAt: new Date(confirmedAt.getTime() - 600_000),
        confirmedAt,
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
      // The event the results flow emits; the ratings consumer turns it into rating events.
      await db.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'match.confirmed',
        subjectId: matchId,
        createdAt: new Date((eventClock += 5)),
        payload: {
          matchId,
          gameId: game.id,
          winnerUserId: winner.userId,
          loserUserId: loser.userId,
          draw: false,
          participants: [winner.userId, loser.userId],
          via: 'agreement',
          confirmedAt: confirmedAt.toISOString(),
        },
      });
    }

    // A few open challenges so the board is not empty.
    for (let c = 0; c < Math.min(6, players.length); c++) {
      const startsAt = new Date(Date.now() + (c + 1) * 3 * 3600_000);
      await db.insert(schema.challenges).values({
        id: uuidv7(),
        gameId: game.id,
        formatId: format.id,
        posterId: players[c]!.userId,
        status: 'open',
        rules: 'Demo challenge: standard settings.',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3600_000),
        acceptanceDeadline: new Date(Date.now() + 48 * 3600_000),
      });
    }
    console.log(`${game.key}: ${PLAYERS} players, ${MATCHES} confirmed matches, 6 open challenges`);
  }
  console.log(
    'Done. Ratings apply as the running API drains the outbox (pnpm ratings:verify to check).',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
