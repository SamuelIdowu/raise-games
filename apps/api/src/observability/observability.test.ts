import { describe, expect, it } from 'vitest';
import { toAnalytics } from './analytics';
import { requestIdFor } from './request-id';
import { scrub, scrubString } from './scrub';

describe('PII scrubbing (F15.4)', () => {
  it('removes phones, emails, bearer tokens, JWTs and refresh tokens from text', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const s = scrubString(
      `user +2348031234567 / 0803 123 4567 mail ada@example.com Authorization: Bearer abc.def.ghi ${jwt} ` +
        'refresh 01a1f000-0000-7000-8000-000000000001.abcdefghijklmnopqrstuvwxyz',
    );
    expect(s).not.toMatch(
      /2348031234567|0803 123 4567|ada@example\.com|abc\.def\.ghi|eyJ|abcdefghijklmnop/,
    );
    expect(s).toContain('[phone]');
    expect(s).toContain('[email]');
  });

  it('drops secret keys entirely and scrubs nested values', () => {
    expect(
      scrub({
        phone: '+2348031234567',
        code: '123456',
        nested: { note: 'call 08031234567', ok: 1 },
      }),
    ).toEqual({ phone: '[redacted]', code: '[redacted]', nested: { note: 'call [phone]', ok: 1 } });
  });

  it('keeps ordinary ids and numbers intact', () => {
    expect(scrubString('match 01a1f000-0000-7000-8000-000000000001 score 2-1')).toBe(
      'match 01a1f000-0000-7000-8000-000000000001 score 2-1',
    );
  });
});

describe('request ids', () => {
  const run = (header?: string) => {
    const headers: Record<string, string> = {};
    const res = { headersSent: false, setHeader: (k: string, v: string) => (headers[k] = v) };
    const id = requestIdFor({ headers: header ? { 'x-request-id': header } : {} }, res);
    return { id, header: headers['x-request-id'] };
  };

  it('keeps a plain caller id, replaces unsafe ones, always echoes', () => {
    expect(run('trace-abc-12345')).toEqual({ id: 'trace-abc-12345', header: 'trace-abc-12345' });
    const injected = run('bad\nlog line');
    expect(injected.id).not.toContain('\n');
    expect(injected.header).toBe(injected.id);
    expect(run().id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('analytics mapping (success metrics)', () => {
  const ev = (type: string, payload: Record<string, unknown>) => ({
    id: 'e1',
    type,
    subjectId: 's',
    payload,
    createdAt: new Date('2026-11-18T10:00:00Z'),
    processedAt: null,
  });

  it('uses pseudonymous ids only and covers both players where both matter', () => {
    const done = toAnalytics(
      ev('match.confirmed', {
        matchId: 'm',
        participants: ['u1', 'u2'],
        via: 'agreement',
        draw: false,
      }),
    );
    expect(done.map((d) => d.distinctId)).toEqual(['u1', 'u2']);
    expect(JSON.stringify(done)).not.toMatch(/phone|email|displayName/);
  });

  it('counts auto-opened disputes for both players and player-opened ones for the opener', () => {
    expect(
      toAnalytics(ev('dispute.opened', { matchId: 'm', openedBy: 'u1' })).map((d) => d.distinctId),
    ).toEqual(['u1']);
    expect(
      toAnalytics(
        ev('dispute.opened', { matchId: 'm', source: 'auto_conflict', participants: ['u1', 'u2'] }),
      ).map((d) => d.distinctId),
    ).toEqual(['u1', 'u2']);
  });

  it('ignores events it does not know', () => {
    expect(toAnalytics(ev('message.created', {}))).toEqual([]);
  });
});
