/**
 * Sprint 16 (F16.4) adversarial pack: the two auto-limit triggers that no earlier suite
 * drives end to end. Other attacks are proven where they live; the map is in
 * docs/beta/adversarial-playbook.md. Needs Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool, schema } from './db/client';
import { ESCALATION_RULES } from './moderation/ladder';
import { assertCanPlay, getStanding } from './moderation/standing';

describe('Sprint 16 adversarial pack — auto-limits', () => {
  let gameId = '';
  let formatId = '';
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let n = Math.floor(Math.random() * 1_000_000);

  async function player(name: string) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23483${(n++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-6)}`,
      role: 'player',
    });
    userIds.push(id);
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}_${id.slice(-6)}` });
    return id;
  }

  async function rejectedReuse(ownerId: string) {
    await db.insert(schema.uploads).values({
      id: uuidv7(),
      ownerId,
      purpose: 'result_proof',
      status: 'rejected',
      rejectReason: 'reused_screenshot',
      declaredMime: 'image/png',
      declaredSize: 1000,
      quarantineKey: `q/${uuidv7()}`,
    });
  }

  /** A ruled dispute raised by `raiser`; `raiserWon` decides the ruling. */
  async function ruledDispute(a: string, b: string, raiser: string, raiserWon: boolean) {
    const challengeId = uuidv7();
    const now = new Date();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: a,
      status: 'accepted',
      startsAt: new Date(now.getTime() - 7200_000),
      endsAt: now,
      acceptanceDeadline: new Date(now.getTime() - 9000_000),
      acceptedById: b,
      acceptedAt: new Date(now.getTime() - 8000_000),
    });
    challengeIds.push(challengeId);
    const raiserSide = raiser === a ? 0 : 1;
    const matchId = uuidv7();
    await db.insert(schema.matches).values({
      id: matchId,
      challengeId,
      status: 'resolved',
      resolvedAt: now,
      winnerSide: raiserWon ? raiserSide : 1 - raiserSide,
    });
    matchIds.push(matchId);
    const profiles = await db
      .select()
      .from(schema.gameProfiles)
      .where(inArray(schema.gameProfiles.userId, [a, b]));
    const pid = (u: string) => profiles.find((p) => p.userId === u)!.id;
    await db.insert(schema.matchSides).values([
      { id: uuidv7(), matchId, userId: a, gameProfileId: pid(a), side: 0, isPoster: true },
      { id: uuidv7(), matchId, userId: b, gameProfileId: pid(b), side: 1, isAcceptor: true },
    ]);
    await db.insert(schema.disputes).values({
      id: uuidv7(),
      matchId,
      raisedById: raiser,
      source: 'player',
      reason: 'wrong_winner',
      status: 'ruled',
      ruledAt: now,
    });
  }

  beforeAll(async () => {
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = format!.id;
  });

  afterAll(async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
      if (matchIds.length) {
        await tx
          .delete(schema.outboxEvents)
          .where(inArray(schema.outboxEvents.subjectId, matchIds));
        await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
      }
    });
    if (challengeIds.length)
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    if (userIds.length) {
      await db.delete(schema.uploads).where(inArray(schema.uploads.ownerId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    // This file opens no Nest app; release the pool it used.
    await pool.end();
  });

  it('one reused screenshot is a mistake; a second in 30 days pauses new challenges', async () => {
    const cheat = await player('reuser');
    await rejectedReuse(cheat);
    expect((await getStanding(cheat)).canPlay).toBe(true);
    await expect(assertCanPlay(cheat)).resolves.toBeUndefined();

    for (let i = 1; i < ESCALATION_RULES.reusedScreenshots; i++) await rejectedReuse(cheat);
    const standing = await getStanding(cheat);
    expect(standing.autoLimit.limited).toBe(true);
    expect(standing.autoLimit.reasons).toContain('reusedScreenshots');
    expect(standing.canPlay).toBe(false);
    await expect(assertCanPlay(cheat)).rejects.toMatchObject({ status: 403 });

    // A moderator clear lifts it: signals before the clear stop counting.
    await db
      .update(schema.users)
      .set({ fraudClearedAt: new Date(Date.now() + 1000) })
      .where(eq(schema.users.id, cheat));
    expect((await getStanding(cheat)).canPlay).toBe(true);
  });

  it('opening and losing disputes counts only for the opener, and limits at the threshold', async () => {
    const opener = await player('serial_disputer');
    const victim = await player('victim');
    // Disputes the victim raised and lost do not count against the opener…
    await ruledDispute(opener, victim, victim, false);
    // …nor do disputes the opener raised and won.
    await ruledDispute(opener, victim, opener, true);
    for (let i = 1; i < ESCALATION_RULES.disputesLostAsOpener; i++)
      await ruledDispute(opener, victim, opener, false);
    let s = await getStanding(opener);
    expect(s.autoLimit.counts.disputesLostAsOpener).toBe(ESCALATION_RULES.disputesLostAsOpener - 1);
    expect(s.canPlay).toBe(true);

    await ruledDispute(opener, victim, opener, false);
    s = await getStanding(opener);
    expect(s.autoLimit.reasons).toContain('disputesLostAsOpener');
    expect(s.canPlay).toBe(false);
    expect((await getStanding(victim)).autoLimit.counts.disputesLostAsOpener).toBe(1);
  });
});
