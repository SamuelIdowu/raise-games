/**
 * Integration test files run in parallel against one database while the outbox relay
 * drains events from all of them. A test's cleanup deleting outbox events can deadlock
 * with the relay writing delivery rows for those events; Postgres aborts one side
 * (40P01). Cleanup retries instead of failing the suite.
 */
export async function retryOnDeadlock<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts || !isRetryable(error)) throw error;
      await new Promise((r) => setTimeout(r, 50 * i + Math.random() * 50));
    }
  }
}

function isRetryable(error: unknown): boolean {
  for (
    let e = error as { code?: unknown; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    // 40P01 deadlock_detected, 40001 serialization_failure
    if (e.code === '40P01' || e.code === '40001') return true;
  }
  return false;
}
