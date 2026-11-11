import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: 'http://127.0.0.1:6006',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'dark-360',
      use: { viewport: { width: 360, height: 800 }, colorScheme: 'dark' },
    },
    {
      name: 'light-1024',
      use: { viewport: { width: 1024, height: 900 }, colorScheme: 'light' },
    },
  ],
  webServer: {
    command: 'pnpm exec http-server storybook-static -p 6006 -s',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
