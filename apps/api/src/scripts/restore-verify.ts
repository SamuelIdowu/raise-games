/**
 * Restore drill verifier (Sprint 15, F15.7). Compares a restored database with its source
 * and proves the copy is usable, not just present:
 *
 *   - every table in `public` has the same row count
 *   - the same user triggers exist (append-only and ledger-balance guards are triggers,
 *     so a restore that drops them silently loses integrity guarantees)
 *   - the same migrations are recorded as applied
 *   - the restored ledger nets to zero and its cached balances match the entries
 *
 * Usage: SOURCE_DATABASE_URL=… TARGET_DATABASE_URL=… tsx src/scripts/restore-verify.ts
 * Exits 1 on any mismatch and prints a JSON report either way.
 */
import pg from 'pg';

interface Report {
  ok: boolean;
  tables: number;
  rows: number;
  mismatches: string[];
}

async function rows<T>(client: pg.Client, text: string): Promise<T[]> {
  return (await client.query(text)).rows as T[];
}

async function tableCounts(client: pg.Client): Promise<Map<string, number>> {
  const tables = await rows<{ name: string }>(
    client,
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
     ORDER BY 1`,
  );
  const out = new Map<string, number>();
  for (const t of tables) {
    const [r] = await rows<{ n: string }>(client, `SELECT count(*)::text AS n FROM "${t.name}"`);
    out.set(t.name, Number(r!.n));
  }
  return out;
}

async function triggers(client: pg.Client): Promise<string[]> {
  return (
    await rows<{ t: string }>(
      client,
      `SELECT c.relname || '.' || tg.tgname AS t FROM pg_trigger tg
       JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT tg.tgisinternal AND n.nspname = 'public' ORDER BY 1`,
    )
  ).map((r) => r.t);
}

async function migrations(client: pg.Client): Promise<number> {
  const [r] = await rows<{ n: string }>(
    client,
    `SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`,
  );
  return Number(r!.n);
}

async function ledgerIssues(client: pg.Client): Promise<number> {
  const [r] = await rows<{ n: string }>(
    client,
    `SELECT (
       (SELECT count(*) FROM (SELECT currency FROM ledger_entries GROUP BY currency
          HAVING sum(amount_minor) <> 0) a)
     + (SELECT count(*) FROM (SELECT a.id FROM ledger_accounts a
          LEFT JOIN ledger_entries e ON e.account_id = a.id GROUP BY a.id
          HAVING a.balance_minor <> coalesce(sum(e.amount_minor), 0)) b)
     )::text AS n`,
  );
  return Number(r!.n);
}

export async function verify(sourceUrl: string, targetUrl: string): Promise<Report> {
  const source = new pg.Client({ connectionString: sourceUrl });
  const target = new pg.Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();
  try {
    const mismatches: string[] = [];
    const [a, b] = await Promise.all([tableCounts(source), tableCounts(target)]);
    for (const [table, n] of a) {
      if (!b.has(table)) mismatches.push(`missing table ${table}`);
      else if (b.get(table) !== n) mismatches.push(`${table}: ${n} rows → ${b.get(table)}`);
    }
    for (const table of b.keys()) if (!a.has(table)) mismatches.push(`extra table ${table}`);

    const [ta, tb] = await Promise.all([triggers(source), triggers(target)]);
    for (const t of ta) if (!tb.includes(t)) mismatches.push(`missing trigger ${t}`);

    const [ma, mb] = await Promise.all([migrations(source), migrations(target)]);
    if (ma !== mb) mismatches.push(`migrations applied: ${ma} → ${mb}`);

    const issues = await ledgerIssues(target);
    if (issues > 0) mismatches.push(`restored ledger has ${issues} invariant issue(s)`);

    return {
      ok: mismatches.length === 0,
      tables: a.size,
      rows: [...a.values()].reduce((s, n) => s + n, 0),
      mismatches,
    };
  } finally {
    await source.end();
    await target.end();
  }
}

if (process.argv[1]?.endsWith('restore-verify.ts')) {
  const src = process.env.SOURCE_DATABASE_URL;
  const dst = process.env.TARGET_DATABASE_URL;
  if (!src || !dst) {
    console.error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL');
    process.exit(2);
  }
  verify(src, dst)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
    })
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
}
