import { describe, expect, it } from 'vitest';
import { CATALOG, NOTIFICATION_TYPES, quietUntil, render } from './catalog';

describe('notification catalog', () => {
  it('has a template, link and defaults for every Stage 1 type', () => {
    for (const type of NOTIFICATION_TYPES) {
      const out = render(type, {
        opponent: 'Ada',
        from: 'Ada',
        game: 'eFootball',
        matchId: 'm1',
        count: 1,
      });
      expect(out.title.length, type).toBeGreaterThan(0);
      expect(out.body.length, type).toBeGreaterThan(0);
      expect(out.link.startsWith('/'), type).toBe(true);
      expect(CATALOG[type].defaults, type).toBeDefined();
    }
  });

  it('deep-links match notifications to the match room', () => {
    expect(render('result_needs_confirmation', { opponent: 'Ada', matchId: 'abc' }).link).toBe(
      '/matches/abc',
    );
  });

  it('never puts message text in a notification (it leaves the app via push/email)', () => {
    const out = render('new_message', { opponent: 'Ada', matchId: 'm', count: 3, body: 'secret' });
    expect(out.title).toBe('3 new messages from Ada');
    expect(out.body).not.toContain('secret');
  });

  it('marks dispute, no-show and sanction notifications critical', () => {
    expect(CATALOG.dispute_ruled.critical).toBe(true);
    expect(CATALOG.no_show_reported.critical).toBe(true);
    expect(CATALOG.sanction_applied.critical).toBe(true);
    expect(CATALOG.new_message.critical).toBe(false);
  });
});

describe('quiet hours', () => {
  const lagos = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 17, h - 1, m)); // WAT = UTC+1

  it('is off when unset or empty', () => {
    expect(
      quietUntil(lagos(23), {
        quietStartMinute: null,
        quietEndMinute: null,
        timeZone: 'Africa/Lagos',
      }),
    ).toBeNull();
    expect(
      quietUntil(lagos(23), {
        quietStartMinute: 600,
        quietEndMinute: 600,
        timeZone: 'Africa/Lagos',
      }),
    ).toBeNull();
  });

  it('handles windows that wrap midnight (22:00–07:00 WAT)', () => {
    const s = { quietStartMinute: 22 * 60, quietEndMinute: 7 * 60, timeZone: 'Africa/Lagos' };
    expect(quietUntil(lagos(21, 59), s)).toBeNull();
    const at23 = quietUntil(lagos(23), s)!;
    expect(at23.getTime() - lagos(23).getTime()).toBe(8 * 3600_000);
    const at3 = quietUntil(lagos(3), s)!;
    expect(at3.getTime() - lagos(3).getTime()).toBe(4 * 3600_000);
    expect(quietUntil(lagos(7), s)).toBeNull();
  });

  it('handles same-day windows (13:00–14:00)', () => {
    const s = { quietStartMinute: 13 * 60, quietEndMinute: 14 * 60, timeZone: 'Africa/Lagos' };
    expect(quietUntil(lagos(13, 30), s)).not.toBeNull();
    expect(quietUntil(lagos(14), s)).toBeNull();
  });
});
