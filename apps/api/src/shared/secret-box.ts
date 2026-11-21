import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for small secrets at rest (staff TOTP seeds). Format: v1.<iv>.<tag>.<ct>
 * (base64url). The key is MFA_ENCRYPTION_KEY (32 bytes, base64); in development/test only
 * it may be derived from JWT_ACCESS_SECRET so local setups work without extra config.
 * Production refuses to boot without the dedicated key (config/env.ts).
 */
export function secretBoxKey(env: {
  MFA_ENCRYPTION_KEY?: string;
  JWT_ACCESS_SECRET: string;
  NODE_ENV: string;
}): Buffer {
  if (env.MFA_ENCRYPTION_KEY) {
    const key = Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes (base64)');
    return key;
  }
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
    throw new Error('MFA_ENCRYPTION_KEY is required outside development/test');
  }
  return Buffer.from(hkdfSync('sha256', env.JWT_ACCESS_SECRET, 'raise-mfa', 'secret-box-v1', 32));
}

export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function open(key: Buffer, sealed: string): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('unrecognised sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}
