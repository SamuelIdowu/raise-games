import { defineConfig } from 'vitest/config';

/**
 * Integration suites share Postgres/Redis and run in parallel; under load a 5s default
 * timeout fails healthy tests (seen on 8 GB machines). Individual tests still set their
 * own longer timeouts where they need them.
 */
export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
