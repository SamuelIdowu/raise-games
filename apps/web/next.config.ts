import type { NextConfig } from 'next';
import path from 'node:path';

const isDev = process.env.NODE_ENV !== 'production';

/** Origins the browser talks to directly. Keep in sync with what the app fetches. */
function origin(url: string | undefined, fallback: string): string {
  try {
    return new URL(url ?? fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}
const API = origin(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:3001');
const API_WS = API.replace(/^http/, 'ws');
// Presigned screenshot PUTs and signed reads go straight to the bucket (Sprint 8).
const STORAGE = origin(process.env.NEXT_PUBLIC_STORAGE_ORIGIN, 'http://localhost:9000');
const POSTHOG = origin(process.env.NEXT_PUBLIC_POSTHOG_HOST, 'https://eu.i.posthog.com');
const TURNSTILE = 'https://challenges.cloudflare.com';

/**
 * Security headers (Sprint 0 audit). The app uses Cache Components / partial
 * prerendering, which the Next.js CSP guide says cannot use nonces, so this is the
 * guide's "without nonces" policy, narrowed to the origins above.
 * `'unsafe-eval'` is dev-only (React Refresh).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${STORAGE}`,
  "font-src 'self'",
  `connect-src 'self' ${API} ${API_WS} ${STORAGE} ${POSTHOG}${isDev ? ' ws://localhost:*' : ''}`,
  `frame-src ${TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Camera capture uses <input capture>, not getUserMedia, so no device APIs are needed.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isDev
    ? []
    : [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ]),
];

const nextConfig: NextConfig = {
  // Docker builds set NEXT_OUTPUT=standalone (audit B5): a minimal server with only the
  // files it needs, traced from the monorepo root. Local runs and CI's `next start` are
  // unchanged.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(__dirname, '../..') }
    : {}),
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
