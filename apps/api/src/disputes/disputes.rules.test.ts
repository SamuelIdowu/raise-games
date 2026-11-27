import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { disputeRuledEventSchema } from './dispute-events';
import {
  acceptsEvidence,
  appealBlock,
  ratingActionFor,
  rulingRoundFor,
  trackerSteps,
  winnerSideOf,
} from './disputes.rules';

describe('dispute rules', () => {
  it('accepts evidence only before a ruling or during the appeal', () => {
    expect(acceptsEvidence('open')).toBe(true);
    expect(acceptsEvidence('awaiting_info')).toBe(true);
    expect(acceptsEvidence('appealed')).toBe(true);
    expect(acceptsEvidence('reviewed')).toBe(false);
    expect(acceptsEvidence('ruled')).toBe(false);
    expect(acceptsEvidence('final')).toBe(false);
  });

  it('rules in round 1 from review states and round 2 only after an appeal', () => {
    expect(rulingRoundFor('open')).toBe(1);
    expect(rulingRoundFor('reviewed')).toBe(1);
    expect(rulingRoundFor('appealed')).toBe(2);
    expect(rulingRoundFor('ruled')).toBeNull();
    expect(rulingRoundFor('final')).toBeNull();
  });

  it('allows exactly one appeal, never on a void or final ruling', () => {
    expect(appealBlock({ status: 'ruled', lastOutcome: 'side0_win', hasAppeal: false })).toBeNull();
    expect(appealBlock({ status: 'appealed', lastOutcome: 'side0_win', hasAppeal: true })).toBe(
      'already_appealed',
    );
    expect(appealBlock({ status: 'final', lastOutcome: 'side1_win', hasAppeal: true })).toBe(
      'already_appealed',
    );
    expect(appealBlock({ status: 'final', lastOutcome: 'void', hasAppeal: false })).toBe(
      'void_is_final',
    );
    expect(appealBlock({ status: 'open', lastOutcome: null, hasAppeal: false })).toBe('not_ruled');
  });

  it('maps outcomes to winners and rating actions', () => {
    expect(winnerSideOf('side1_win')).toBe(1);
    expect(winnerSideOf('draw')).toBeNull();
    expect(ratingActionFor(1, 'side0_win', null)).toBe('apply');
    expect(ratingActionFor(1, 'void', null)).toBe('none');
    expect(ratingActionFor(2, 'side0_win', 'side0_win')).toBe('none');
    expect(ratingActionFor(2, 'side1_win', 'side0_win')).toBe('reverse_and_apply');
    expect(ratingActionFor(2, 'void', 'side0_win')).toBe('reverse');
  });

  it('tracker shows the same steps for both players', () => {
    expect(trackerSteps('open', false).map((s) => s.state)).toEqual([
      'done',
      'current',
      'upcoming',
    ]);
    expect(trackerSteps('awaiting_info', false)[1]!.label).toBe('More information requested');
    expect(trackerSteps('ruled', false).every((s) => s.state === 'done')).toBe(true);
    expect(trackerSteps('appealed', true).map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'upcoming',
    ]);
    expect(trackerSteps('final', true).every((s) => s.state === 'done')).toBe(true);
  });
});

describe('dispute.ruled contract', () => {
  const base = {
    disputeId: uuidv7(),
    matchId: uuidv7(),
    gameId: uuidv7(),
    round: 1,
    outcome: 'side0_win',
    previousOutcome: null,
    winnerUserId: uuidv7(),
    loserUserId: uuidv7(),
    draw: false,
    void: false,
    participants: [uuidv7(), uuidv7()],
    ratingAction: 'apply',
    final: false,
    ruledAt: new Date().toISOString(),
    resolutionMs: 3_600_000,
  };

  it('accepts a well-formed event', () => {
    expect(disputeRuledEventSchema.parse(base)).toEqual(base);
  });

  it('rejects unknown outcomes, rounds and missing participants', () => {
    expect(() => disputeRuledEventSchema.parse({ ...base, outcome: 'side2_win' })).toThrow();
    expect(() => disputeRuledEventSchema.parse({ ...base, round: 3 })).toThrow();
    expect(() =>
      disputeRuledEventSchema.parse({ ...base, participants: [base.winnerUserId] }),
    ).toThrow();
  });
});
