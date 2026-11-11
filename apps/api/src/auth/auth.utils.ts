const REFRESH_TOKEN_DELIMITER = ':';

export function parseTtl(ttl: string): number {
  const match = /^(\d+)([dms])$/.exec(ttl);
  if (!match) throw new Error(`Cannot parse TTL: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  return value * 24 * 60 * 60 * 1000;
}

export function maskPhone(phone: string): string {
  return phone.slice(0, 5) + '****' + phone.slice(-2);
}

export function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function randomSecret(): string {
  return crypto.randomUUID() + '.' + crypto.randomUUID();
}

/**
 * Refresh tokens are `{sessionId}:{secret}` so refresh can look the session up by primary key
 * instead of scanning (and argon2-verifying) every active session.
 */
export function buildRefreshToken(sessionId: string): string {
  return `${sessionId}${REFRESH_TOKEN_DELIMITER}${randomSecret()}`;
}

export function parseRefreshToken(token: string): { sessionId: string } | null {
  const index = token.indexOf(REFRESH_TOKEN_DELIMITER);
  if (index <= 0 || index === token.length - 1) return null;
  const sessionId = token.slice(0, index);
  if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) return null;
  return { sessionId };
}
