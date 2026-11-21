/**
 * Client IP behind proxies (audit B2).
 *
 * Per-IP rate limits (OTP verify, invite codes, waitlist, socket handshakes) need the
 * player's address, not the address of the proxy in front of the API. `TRUST_PROXY` is the
 * number of proxies between the internet and the API: 0 locally, 1 behind a host load
 * balancer, 2 behind Cloudflare plus a host load balancer. Fastify gets the same number
 * (`trustProxy`) for HTTP; this helper applies the same rule to WebSocket handshakes, whose
 * `handshake.address` is always the nearest peer.
 *
 * Same semantics as Fastify/proxy-addr with a hop count: the candidate list is the socket
 * peer followed by the `X-Forwarded-For` entries from right to left, and the client is
 * entry `hops` (clamped to the list). Never trust more hops than you really have: each extra
 * hop lets a client choose its own IP by sending a forged `X-Forwarded-For`.
 */
export function clientIpFrom(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  hops: number,
): string {
  const fallback = peer ?? 'unknown';
  if (hops <= 0 || !forwardedFor) return fallback;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const chain = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse();
  const candidates = [fallback, ...chain];
  return candidates[Math.min(hops, candidates.length - 1)] ?? fallback;
}
