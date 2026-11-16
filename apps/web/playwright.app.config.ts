import { defineConfig } from '@playwright/test';

/**
 * Full-app e2e (Sprint 8 two-browser suite). Unlike playwright.config.ts (which
 * drives Storybook for visual regression), this boots the real API and web app.
 * Needs `pnpm db:up`, a migrated + seeded database, and the storage service.
 *
 *   E2E_DATABASE_URL=postgres://raise:raise@localhost:5432/raise_test \
 *     pnpm --filter @raise/web test:e2e
 */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://raise:raise@localhost:5432/raise_test';
// Dedicated ports, so a dev server already on 3000/3001 (this or another project) is never reused.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
process.env.E2E_API_URL ??= API_URL;

export default defineConfig({
  testDir: './e2e-app',
  globalSetup: './e2e-app/global-setup.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    // Must be localhost (not 127.0.0.1): storage CORS and API CORS allow this origin.
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
    viewport: { width: 360, height: 800 },
    colorScheme: 'dark',
  },
  webServer: [
    {
      // Compiled API: `tsx watch` (the dev script) does not emit decorator metadata,
      // so Nest constructor injection is unavailable under it.
      command: 'pnpm --filter @raise/api build && pnpm --filter @raise/api start',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { DATABASE_URL, PORT: String(API_PORT), WEB_ORIGIN },
    },
    {
      command: `pnpm --filter @raise/web exec next dev -p ${WEB_PORT}`,
      url: WEB_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { NEXT_PUBLIC_API_URL: API_URL },
    },
  ],
});
