/**
 * PRD acceptance check, runnable against any environment:
 *   pnpm --filter @raise/api ratings:verify
 * Replays the whole rating event log and exits non-zero on any difference.
 */
import { RatingsService } from '../ratings/ratings.service';
import { pool } from '../db/client';

async function main() {
  const report = await new RatingsService().verify();
  const bad = report.mismatches.length + report.profileMismatches.length;
  console.log(
    `rating events: ${report.events}; event mismatches: ${report.mismatches.length}; ` +
      `profile mismatches: ${report.profileMismatches.length}`,
  );
  if (bad > 0) console.log(JSON.stringify(report, null, 2));
  await pool.end();
  process.exit(bad > 0 ? 1 : 0);
}

void main();
