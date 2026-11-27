// Keep-awake ping for free staging (decision 0008, docs/runbooks/staging-free.md).
//
// Render's free web service sleeps after 15 minutes without traffic and Koyeb's free instance
// after an hour. A sleeping API also stops its background jobs (expiry sweeper, outbox relay,
// alerts), so staging would stop behaving like the real thing. This Worker runs on a
// Cloudflare cron trigger (free plan) and requests each URL in TARGETS.
//
// Staging only. Production runs on paid, always-on instances and needs none of this.

export default {
  async scheduled(_event, env, ctx) {
    const targets = (env.TARGETS ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);

    ctx.waitUntil(
      Promise.all(
        targets.map(async (url) => {
          const started = Date.now();
          try {
            const res = await fetch(url, {
              headers: { 'user-agent': 'raise-staging-keepalive' },
              signal: AbortSignal.timeout(25_000),
            });
            console.log(`${url} ${res.status} in ${Date.now() - started} ms`);
          } catch (error) {
            // Logged, not thrown: one sleeping service must not stop the other's ping.
            console.log(`${url} failed after ${Date.now() - started} ms: ${String(error)}`);
          }
        }),
      ),
    );
  },
};
