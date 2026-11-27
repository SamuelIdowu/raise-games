import { describe, expect, it } from 'vitest';
import { runKeywordFilter } from './keyword-filter';

describe('keyword filter', () => {
  it('passes normal match coordination', () => {
    for (const body of [
      'gg, ready when you are',
      'I bet you cannot beat my Arsenal side',
      'Room code sent, join in 5 mins',
      'class was long today, starting at 8',
      'score was 3-1, submitting now',
    ]) {
      expect(runKeywordFilter(body), body).toEqual({ flagged: false, categories: [], terms: [] });
    }
  });

  it('flags profanity including leetspeak and stretched letters', () => {
    expect(runKeywordFilter('you are a fucking cheat').categories).toContain('profanity');
    expect(runKeywordFilter('fuuuuuck off').categories).toContain('profanity');
    expect(runKeywordFilter('sh1t game').categories).toContain('profanity');
  });

  it('does not flag Scunthorpe-style substrings', () => {
    expect(runKeywordFilter('Scunthorpe vs assassin creed').flagged).toBe(false);
  });

  it('flags Nigerian phone numbers in common formats', () => {
    for (const body of ['call 08031234567', 'my num +234 803 123 4567', '0803-123-4567 abeg']) {
      const r = runKeywordFilter(body);
      expect(r.categories, body).toContain('off_platform_contact');
      expect(r.terms, body).toContain('phone_number');
      // A phone number is not also an account number.
      expect(r.terms, body).not.toContain('account_number');
    }
  });

  it('flags WhatsApp / Telegram moves', () => {
    expect(runKeywordFilter('add me on whatsapp').categories).toContain('off_platform_contact');
    expect(runKeywordFilter('wa.me/2348031234567').categories).toContain('off_platform_contact');
    expect(runKeywordFilter('join t.me/fifa_lagos').categories).toContain('off_platform_contact');
  });

  it('flags money solicitation', () => {
    expect(runKeywordFilter('loser pays ₦5,000').categories).toContain('money_solicitation');
    expect(runKeywordFilter('5k on this match?').categories).toContain('money_solicitation');
    expect(runKeywordFilter('send to my opay').categories).toContain('money_solicitation');
    const nuban = runKeywordFilter('acct 0123456789 GTB');
    expect(nuban.categories).toContain('money_solicitation');
  });

  it('reports multiple categories and deduplicates terms', () => {
    const r = runKeywordFilter('whatsapp me 08031234567, send 10k to my opay, whatsapp');
    expect(r.flagged).toBe(true);
    expect(r.categories.sort()).toEqual(['money_solicitation', 'off_platform_contact']);
    expect(new Set(r.terms).size).toBe(r.terms.length);
  });
});
