import { describe, expect, it } from 'vitest';
import { isMatchStateEvent, matchIdForEvent } from './match-state.broadcaster';

describe('match-state broadcast routing', () => {
  it('routes match.* events by subject', () => {
    expect(matchIdForEvent({ type: 'match.confirmed', subjectId: 'm1', payload: {} })).toBe('m1');
    expect(isMatchStateEvent('match.started')).toBe(true);
  });

  it('routes Sprint 6/8 events that name the match in the payload', () => {
    for (const type of [
      'challenge.accepted',
      'result.submitted',
      'noshow.reported',
      'dispute.opened',
    ]) {
      expect(isMatchStateEvent(type), type).toBe(true);
      expect(matchIdForEvent({ type, subjectId: 'x', payload: { matchId: 'm2' } }), type).toBe(
        'm2',
      );
    }
  });

  it('ignores chat and unrelated events (chat is delivered directly)', () => {
    expect(isMatchStateEvent('message.created')).toBe(false);
    expect(isMatchStateEvent('challenge.created')).toBe(false);
    expect(
      matchIdForEvent({ type: 'message.created', subjectId: 'x', payload: { matchId: 'm3' } }),
    ).toBeNull();
  });
});
