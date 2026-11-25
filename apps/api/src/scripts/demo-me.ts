/**
 * Demo data for real accounts (development only). `demo-seed.ts` fills the ladders with
 * demo players; this gives YOUR account something to look at against them:
 *
 *   pnpm --filter @raise/api demo:me                 # every non-demo account
 *   pnpm --filter @raise/api demo:me 08031234501     # one or more phones (local or +234)
 *
 * A phone with no account gets one (username from the phone), so you can sign in with it
 * (OTP 000000 under OTP_MOCK_ENABLED). For each account, in every game it plays (all
 * launch games if it plays none):
 * - consent accepted, a game profile if missing;
 * - 10 confirmed matches against demo players over the last two weeks, with the same
 *   `match.confirmed` outbox event the results flow emits, so the running API's ratings
 *   consumer applies them (ratings stay reproducible from the event log);
 * - one match per live state: starts in 3h, in progress (submit due), and awaiting your
 *   confirmation (opponent reported);
 * - two direct challenges sent to you, one open challenge of your own;
 * - notifications for the above, rendered from the real catalog.
 *
 * Needs `demo-seed.ts` first (the opponents). Refuses outside development/test.
 */
import { and, eq, like, notLike } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { env } from '../config/env.instance';
import { CURRENT_CONSENT } from '../consent/consent.constants';
import { CATALOG, type NotificationType, type Params } from '../notifications/catalog';
import { db, pool, schema } from '../db/client';

const DAY = 86_400_000;
const HOUR = 3_600_000;

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return `+234${digits}`;
}

async function ensureUser(phone: string) {
  const e164 = toE164(phone);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.phone, e164));
  if (existing) return existing;
  const id = uuidv7();
  const [created] = await db
    .insert(schema.users)
    .values({
      id,
      phone: e164,
      displayName: `player_${e164.slice(-4)}`,
      tosVersionAccepted: CURRENT_CONSENT.terms,
      jurisdictionState: 'Lagos',
    })
    .returning();
  console.log(`created account ${e164} (${created!.displayName})`);
  return created!;
}

async function ensureConsent(userId: string) {
  for (const [termsType, termsVersion] of [
    ['terms', CURRENT_CONSENT.terms],
    ['privacy', CURRENT_CONSENT.privacy],
  ] as const) {
    const [has] = await db
      .select({ id: schema.consentRecords.id })
      .from(schema.consentRecords)
      .where(
        and(
          eq(schema.consentRecords.userId, userId),
          eq(schema.consentRecords.termsType, termsType),
          eq(schema.consentRecords.termsVersion, termsVersion),
        ),
      )
      .limit(1);
    if (!has) {
      await db
        .insert(schema.consentRecords)
        .values({ id: uuidv7(), userId, termsType, termsVersion });
    }
  }
  await db
    .update(schema.users)
    .set({ tosVersionAccepted: CURRENT_CONSENT.terms })
    .where(eq(schema.users.id, userId));
}

// Newest notification ~5 minutes ago, each earlier one 37 minutes before the next.
let notifClock = Date.now() - 5 * 60_000;
async function notify(userId: string, type: NotificationType, params: Params, read = false) {
  const entry = CATALOG[type];
  await db.insert(schema.notifications).values({
    id: uuidv7(),
    userId,
    type,
    sourceKey: `demo-me:${uuidv7()}`,
    params,
    title: entry.title(params),
    body: entry.body(params),
    link: entry.link(params),
    readAt: read ? new Date() : null,
    createdAt: new Date((notifClock -= 37 * 60_000)),
  });
}

async function main() {
  if (!['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('demo-me refuses to run outside development/test');
  }

  // Targets: phones from argv, else every account that is not a demo player.
  const phones = process.argv.slice(2);
  const users = phones.length
    ? await Promise.all(phones.map(ensureUser))
    : await db.select().from(schema.users).where(notLike(schema.users.displayName, 'demo_%'));
  if (users.length === 0) throw new Error('No accounts. Pass a phone: demo:me 08031234501');

  const games = await db.select().from(schema.games);
  let eventClock = Date.now() - 60_000;

  for (const user of users) {
    if (!user.displayName) {
      console.log(`skip ${user.phone}: finish onboarding (username) first`);
      continue;
    }
    await ensureConsent(user.id);
    let profiles = await db
      .select()
      .from(schema.gameProfiles)
      .where(eq(schema.gameProfiles.userId, user.id));
    if (profiles.length === 0) {
      for (const game of games) {
        await db.insert(schema.gameProfiles).values({
          id: uuidv7(),
          userId: user.id,
          gameId: game.id,
          inGameId: `${user.displayName}_${game.key}`,
          city: 'Lagos',
          campus: 'UNILAG',
        });
      }
      profiles = await db
        .select()
        .from(schema.gameProfiles)
        .where(eq(schema.gameProfiles.userId, user.id));
    }

    for (const profile of profiles) {
      const game = games.find((g) => g.id === profile.gameId)!;
      const [format] = await db
        .select()
        .from(schema.gameFormats)
        .where(
          and(eq(schema.gameFormats.gameId, game.id), eq(schema.gameFormats.status, 'enabled')),
        )
        .limit(1);
      if (!format) continue;

      // Demo opponents in this game.
      const opponents = await db
        .select({
          userId: schema.users.id,
          name: schema.users.displayName,
          profileId: schema.gameProfiles.id,
        })
        .from(schema.gameProfiles)
        .innerJoin(schema.users, eq(schema.users.id, schema.gameProfiles.userId))
        .where(
          and(eq(schema.gameProfiles.gameId, game.id), like(schema.users.displayName, 'demo_%')),
        )
        .limit(12);
      if (opponents.length < 6) {
        console.log(`skip ${game.key}: run demo-seed first (needs demo opponents)`);
        continue;
      }

      const makeMatch = async (
        opp: (typeof opponents)[number],
        startsAt: Date,
        status: 'confirmed' | 'accepted' | 'in_progress' | 'awaiting_confirmation',
        extra: Partial<typeof schema.matches.$inferInsert> = {},
      ) => {
        const challengeId = uuidv7();
        const userPosts = Math.random() < 0.5;
        await db.insert(schema.challenges).values({
          id: challengeId,
          gameId: game.id,
          formatId: format.id,
          posterId: userPosts ? user.id : opp.userId,
          status: 'accepted',
          rules: 'Standard settings, full time, no extra time.',
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR),
          acceptanceDeadline: new Date(startsAt.getTime() - HOUR),
          acceptedById: userPosts ? opp.userId : user.id,
          acceptedAt: new Date(startsAt.getTime() - 3 * HOUR),
        });
        const matchId = uuidv7();
        await db.insert(schema.matches).values({
          id: matchId,
          challengeId,
          status,
          acceptedAt: new Date(startsAt.getTime() - 3 * HOUR),
          scheduledStartAt: startsAt,
          resultDeadline: new Date(startsAt.getTime() + 24 * HOUR),
          ...extra,
        });
        const userSide = uuidv7();
        const oppSide = uuidv7();
        await db.insert(schema.matchSides).values([
          {
            id: userSide,
            matchId,
            userId: user.id,
            gameProfileId: profile.id,
            side: 0,
            isPoster: userPosts,
            isAcceptor: !userPosts,
          },
          {
            id: oppSide,
            matchId,
            userId: opp.userId,
            gameProfileId: opp.profileId,
            side: 1,
            isPoster: !userPosts,
            isAcceptor: userPosts,
          },
        ]);
        return { matchId, userSide, oppSide };
      };

      // History: 10 confirmed matches, oldest first, about 60% wins.
      let lastConfirmed = '';
      for (let m = 0; m < 10; m++) {
        const opp = opponents[m % opponents.length]!;
        const confirmedAt = new Date(Date.now() - 14 * DAY + m * 1.3 * DAY);
        const startsAt = new Date(confirmedAt.getTime() - 2 * HOUR);
        const userWins = (m * 7) % 10 < 6;
        const { matchId } = await makeMatch(opp, startsAt, 'confirmed', {
          winnerSide: userWins ? 0 : 1,
          decidedVia: 'agreement',
          inProgressAt: startsAt,
          resultSubmittedAt: new Date(confirmedAt.getTime() - 10 * 60_000),
          confirmedAt,
        });
        lastConfirmed = matchId;
        const [winner, loser] = userWins ? [user.id, opp.userId] : [opp.userId, user.id];
        await db.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'match.confirmed',
          subjectId: matchId,
          createdAt: new Date((eventClock += 5)),
          payload: {
            matchId,
            gameId: game.id,
            winnerUserId: winner,
            loserUserId: loser,
            draw: false,
            participants: [winner, loser],
            via: 'agreement',
            confirmedAt: confirmedAt.toISOString(),
          },
        });
      }

      // Live: one match per state the dashboard and match room show.
      const [o1, o2, o3, o4, o5, o6] = opponents.slice(6).concat(opponents);
      const upcoming = await makeMatch(o1!, new Date(Date.now() + 3 * HOUR), 'accepted');
      await notify(user.id, 'challenge_accepted', {
        opponent: o1!.name,
        game: game.name,
        matchId: upcoming.matchId,
      });

      const startedAt = new Date(Date.now() - 40 * 60_000);
      await makeMatch(o2!, startedAt, 'in_progress', { inProgressAt: startedAt });

      const playedAt = new Date(Date.now() - 3 * HOUR);
      const toConfirm = await makeMatch(o3!, playedAt, 'awaiting_confirmation', {
        inProgressAt: playedAt,
        resultSubmittedAt: new Date(Date.now() - HOUR),
        confirmationDeadline: new Date(Date.now() + 23 * HOUR),
      });
      await db.insert(schema.resultSubmissions).values({
        id: uuidv7(),
        matchId: toConfirm.matchId,
        submitterId: o3!.userId,
        matchSideId: toConfirm.oppSide,
        kind: 'result',
        result: 'loss',
        score: { self: 1, opponent: 3 },
        submittedAt: new Date(Date.now() - HOUR),
      });
      await notify(user.id, 'result_needs_confirmation', {
        opponent: o3!.name,
        game: game.name,
        matchId: toConfirm.matchId,
      });

      // Challenges sent to me, and one of my own on the board.
      for (const opp of [o4!, o5!]) {
        const startsAt = new Date(Date.now() + (6 + Math.random() * 30) * HOUR);
        await db.insert(schema.challenges).values({
          id: uuidv7(),
          gameId: game.id,
          formatId: format.id,
          posterId: opp.userId,
          targetPlayerId: user.id,
          status: 'open',
          rules: 'Rematch? Same settings as last time.',
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR),
          acceptanceDeadline: new Date(Date.now() + 40 * HOUR),
        });
        await notify(user.id, 'challenge_received', { from: opp.name, game: game.name });
      }
      const mineAt = new Date(Date.now() + 20 * HOUR);
      await db.insert(schema.challenges).values({
        id: uuidv7(),
        gameId: game.id,
        formatId: format.id,
        posterId: user.id,
        status: 'open',
        rules: 'Best of one. Agree the room in chat.',
        startsAt: mineAt,
        endsAt: new Date(mineAt.getTime() + 2 * HOUR),
        acceptanceDeadline: new Date(Date.now() + 44 * HOUR),
      });
      await notify(
        user.id,
        'result_auto_confirmed',
        { opponent: o6!.name, game: game.name, matchId: lastConfirmed },
        true,
      );

      console.log(`${user.displayName} · ${game.key}: 10 confirmed, 3 live, 2 incoming, 1 open`);
    }
  }
  console.log('Done. Ratings apply as the running API drains the outbox.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
