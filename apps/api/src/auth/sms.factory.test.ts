import { describe, expect, it, vi } from 'vitest';
import { AllowlistSmsAdapter, SmsNotAllowlistedError, createSmsAdapter } from './sms.factory';
import { MockSmsAdapter } from './mock-sms.adapter';
import { TermiiSmsAdapter } from './termii-sms.adapter';

describe('createSmsAdapter', () => {
  it('ignores the allow-list for the mock provider', () => {
    expect(createSmsAdapter({ provider: 'mock', allowlist: ['+2348000000001'] })).toBeInstanceOf(
      MockSmsAdapter,
    );
  });

  it('wraps real providers in the staging allow-list when one is set', () => {
    const adapter = createSmsAdapter({
      provider: 'termii',
      apiKey: 'k',
      senderId: 'RAISE',
      allowlist: ['+2348000000001'],
    });
    expect(adapter).toBeInstanceOf(AllowlistSmsAdapter);
    expect(createSmsAdapter({ provider: 'termii', apiKey: 'k', senderId: 'RAISE' })).toBeInstanceOf(
      TermiiSmsAdapter,
    );
  });
});

describe('AllowlistSmsAdapter', () => {
  it('only forwards allow-listed numbers', async () => {
    const inner = { send: vi.fn().mockResolvedValue(undefined) };
    const adapter = new AllowlistSmsAdapter(inner, ['+2348000000001']);
    await adapter.send('+2348000000001', '123456');
    expect(inner.send).toHaveBeenCalledWith('+2348000000001', '123456');
    await expect(adapter.send('+2348099999999', '123456')).rejects.toBeInstanceOf(
      SmsNotAllowlistedError,
    );
    expect(inner.send).toHaveBeenCalledTimes(1);
  });
});

describe('TermiiSmsAdapter', () => {
  it('sends OTPs on the DND (transactional) route, never the generic route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await new TermiiSmsAdapter({ apiKey: 'k', senderId: 'RAISE' }).send('+2348000000001', '1');
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body.channel).toBe('dnd');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
