import { describe, expect, it } from 'vitest';
import { clientIpFrom } from './client-ip';

describe('clientIpFrom (TRUST_PROXY hop count)', () => {
  it('ignores X-Forwarded-For when no proxy is trusted (a client cannot pick its IP)', () => {
    expect(clientIpFrom('10.0.0.5', '1.2.3.4', 0)).toBe('10.0.0.5');
  });

  it('one hop: the address the load balancer saw', () => {
    expect(clientIpFrom('10.0.0.5', '203.0.113.9', 1)).toBe('203.0.113.9');
  });

  it('two hops (Cloudflare + load balancer): skips the Cloudflare edge', () => {
    expect(clientIpFrom('10.0.0.5', '203.0.113.9, 172.68.1.1', 2)).toBe('203.0.113.9');
  });

  it('a forged leftmost entry is not trusted beyond the configured hops', () => {
    expect(clientIpFrom('10.0.0.5', '6.6.6.6, 203.0.113.9, 172.68.1.1', 2)).toBe('203.0.113.9');
  });

  it('clamps when the chain is shorter than the hop count', () => {
    expect(clientIpFrom('10.0.0.5', '203.0.113.9', 3)).toBe('203.0.113.9');
    expect(clientIpFrom('10.0.0.5', undefined, 2)).toBe('10.0.0.5');
  });

  it('accepts a repeated header', () => {
    expect(clientIpFrom('10.0.0.5', ['203.0.113.9', '172.68.1.1'], 2)).toBe('203.0.113.9');
  });
});
