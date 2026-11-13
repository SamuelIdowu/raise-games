import { describe, expect, it } from 'vitest';
import { toChallengeCard, type ChallengeCardRow } from './challenges.mapper';

const NOW = new Date('2026-11-13T12:00:00.000Z');

function row(overrides: Partial<ChallengeCardRow> = {}): ChallengeCardRow {
  return {
    id: '6f1c1b7e-0000-7000-8000-000000000001',
    status: 'open',
    createdAt: new Date('2026-11-13T10:00:00.000Z'),
    startsAt: new Date('2026-11-13T18:00:00.000Z'),
    endsAt: new Date('2026-11-13T22:00:00.000Z'),
    acceptanceDeadline: new Date('2026-11-15T10:00:00.000Z'),
    stakeAmountMinor: 0,
    currency: 'NGN',
    ratingGap: 120,
    posterId: 'poster-1',
    gameId: 'game-1',
    gameKey: 'efootball',
    gameName: 'eFootball',
    formatId: 'format-1',
    formatKey: '1v1_duel',
    formatName: '1v1 Duel',
    username: 'Chioma_O',
    inGameId: 'chioma_konami',
    rating: 1247,
    wins: 12,
    losses: 3,
    draws: 1,
    provisional: true,
    ...overrides,
  };
}

describe('toChallengeCard', () => {
  it('renders a zero stake as Free', () => {
    const card = toChallengeCard(row(), 'viewer-1', NOW);
    expect(card.stake).toEqual({ amountMinor: 0, currency: 'NGN', display: 'Free', band: null });
  });

  it('keeps the Stage 2 rating-gap slot present but null', () => {
    const card = toChallengeCard(row({ ratingGap: 200 }), 'viewer-1', NOW);
    expect(card.ratingGap).toBeNull();
    expect('ratingGap' in card).toBe(true);
  });

  it('passes the provisional flag through', () => {
    expect(toChallengeCard(row(), 'viewer-1', NOW).poster.provisional).toBe(true);
    expect(toChallengeCard(row({ provisional: false }), 'viewer-1', NOW).poster.provisional).toBe(
      false,
    );
  });

  it('exposes the reputation badge class as new', () => {
    expect(toChallengeCard(row(), 'viewer-1', NOW).poster.reputation).toBe('new');
  });

  it('formats the record with W-L-D en dashes', () => {
    expect(toChallengeCard(row(), 'viewer-1', NOW).poster.record).toBe('12\u20133\u20131');
  });

  it('derives rank tier from the per-game rating', () => {
    const card = toChallengeCard(row({ rating: 1320 }), 'viewer-1', NOW);
    expect(card.poster.rankTier).toBe('elite');
    expect(card.poster.rankLabel).toBe('Elite');
  });

  it('marks the viewer own challenge as mine', () => {
    expect(toChallengeCard(row(), 'poster-1', NOW).isMine).toBe(true);
    expect(toChallengeCard(row(), 'someone-else', NOW).isMine).toBe(false);
  });

  it('displays overdue open challenges as expired', () => {
    const overdue = row({ acceptanceDeadline: new Date('2026-11-13T11:00:00.000Z') });
    expect(toChallengeCard(overdue, 'viewer-1', NOW).status).toBe('expired');
  });

  it('falls back to the in-game id when no display name is set', () => {
    expect(toChallengeCard(row({ username: null }), 'viewer-1', NOW).poster.username).toBe(
      'chioma_konami',
    );
  });
});
