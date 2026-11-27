'use client';

import Link from 'next/link';
import { adminApi } from '@raise/api-client';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { AdminHeader, LoadState, fmt, useAdminData } from '@/features/admin/admin-kit';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' ? v.slice(0, 8) : '—');

function Section({
  title,
  empty,
  children,
  count,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-h2 font-black uppercase text-fg">
        {title} <span className="tabular text-fg-muted">({count})</span>
      </h2>
      {count === 0 ? <p className="text-body-sm text-fg-muted">{empty}</p> : children}
    </section>
  );
}

/** Fraud signals (F12.4): the day-one collectors (Sprints 3, 5, 8, 10) reviewed here. */
export default function SignalsPage() {
  const { data, error, reload } = useAdminData(() => adminApi.signals(), []);
  const hash = (data?.hashFlags ?? []) as Row[];
  const trading = (data?.winTrading ?? []) as Row[];
  const devices = (data?.sharedDevices ?? []) as Row[];
  const repeat = (data?.repeatPairings ?? []) as Row[];
  const limited = (data?.autoLimited ?? []) as Row[];
  return (
    <div className="flex flex-col gap-8">
      <AdminHeader title="Fraud signals" />
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data ? (
        <>
          <Section
            title="Auto-limited accounts"
            count={limited.length}
            empty="No accounts are limited right now."
          >
            <ul className="flex flex-col gap-1 text-body-sm">
              {limited.map((u) => (
                <li key={s(u.id)}>
                  <Link href={`/admin/users/${s(u.id)}`} className="text-accent hover:underline">
                    {s(u.displayName)}
                  </Link>
                  <span className="text-fg-muted"> — {(u.reasons as string[]).join(', ')}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Screenshot hash flags (30 days)"
            count={hash.length}
            empty="No reused or near-duplicate screenshots."
          >
            <Table aria-label="Hash flags">
              <TableHead>
                <TableHeaderCell>Kind</TableHeaderCell>
                <TableHeaderCell>Uploader</TableHeaderCell>
                <TableHeaderCell>Match</TableHeaderCell>
                <TableHeaderCell>Earlier match</TableHeaderCell>
                <TableHeaderCell numeric>Distance</TableHeaderCell>
                <TableHeaderCell>When</TableHeaderCell>
              </TableHead>
              <TableBody>
                {hash.map((h) => (
                  <TableRow key={s(h.upload_id)}>
                    <TableCell>
                      {h.kind === 'reused' ? 'Reused (rejected)' : 'Near-duplicate'}
                    </TableCell>
                    <TableCell>
                      <Link
                        className="text-accent hover:underline"
                        href={`/admin/users/${s(h.owner_id)}`}
                      >
                        {s(h.owner_name)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-caption">{short(h.match_id)}</TableCell>
                    <TableCell className="font-mono text-caption">
                      {short(h.earlier_match_id)}
                    </TableCell>
                    <TableCell numeric>{h.kind === 'reused' ? 0 : s(h.similar_distance)}</TableCell>
                    <TableCell>{fmt(s(h.created_at))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section
            title="Win-trading risk (7 days)"
            count={trading.length}
            empty="No pair played 4 or more rated matches this week."
          >
            <Table aria-label="Win trading">
              <TableHead>
                <TableHeaderCell>Pair</TableHeaderCell>
                <TableHeaderCell numeric>Matches</TableHeaderCell>
                <TableHeaderCell numeric>Wins A–B</TableHeaderCell>
                <TableHeaderCell numeric>Dampened</TableHeaderCell>
                <TableHeaderCell numeric>Risk</TableHeaderCell>
              </TableHead>
              <TableBody>
                {trading.map((t) => (
                  <TableRow key={`${s(t.a)}-${s(t.b)}-${s(t.game_id)}`}>
                    <TableCell>
                      <Link className="text-accent hover:underline" href={`/admin/users/${s(t.a)}`}>
                        {s(t.a_name)}
                      </Link>{' '}
                      vs{' '}
                      <Link className="text-accent hover:underline" href={`/admin/users/${s(t.b)}`}>
                        {s(t.b_name)}
                      </Link>
                    </TableCell>
                    <TableCell numeric>{s(t.matches)}</TableCell>
                    <TableCell numeric>
                      {s(t.a_wins)}–{s(t.b_wins)}
                    </TableCell>
                    <TableCell numeric>{s(t.dampened)}</TableCell>
                    <TableCell numeric>{s(t.risk)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section
            title="Shared devices (30 days)"
            count={devices.length}
            empty="No device signed into more than one account."
          >
            <Table aria-label="Shared devices">
              <TableHead>
                <TableHeaderCell>Device</TableHeaderCell>
                <TableHeaderCell numeric>Accounts</TableHeaderCell>
                <TableHeaderCell>Accounts</TableHeaderCell>
                <TableHeaderCell>Last seen</TableHeaderCell>
              </TableHead>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={s(d.device_id)}>
                    <TableCell className="font-mono text-caption">
                      {s(d.device_id).slice(0, 12)}
                    </TableCell>
                    <TableCell numeric>{s(d.accounts)}</TableCell>
                    <TableCell>
                      {(d.user_ids as string[]).map((u) => (
                        <Link
                          key={u}
                          href={`/admin/users/${u}`}
                          className="mr-2 font-mono text-caption text-accent hover:underline"
                        >
                          {u.slice(0, 8)}
                        </Link>
                      ))}
                    </TableCell>
                    <TableCell>{fmt(s(d.last_seen))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section
            title="Repeat pairings (all time, 5+)"
            count={repeat.length}
            empty="No pair has played 5 or more times."
          >
            <Table aria-label="Repeat pairings">
              <TableHead>
                <TableHeaderCell>Player A</TableHeaderCell>
                <TableHeaderCell>Player B</TableHeaderCell>
                <TableHeaderCell numeric>Matches</TableHeaderCell>
                <TableHeaderCell>Last</TableHeaderCell>
              </TableHead>
              <TableBody>
                {repeat.map((r) => (
                  <TableRow key={`${s(r.user_a_id)}-${s(r.user_b_id)}-${s(r.game_id)}`}>
                    <TableCell>
                      <Link
                        className="font-mono text-caption text-accent hover:underline"
                        href={`/admin/users/${s(r.user_a_id)}`}
                      >
                        {short(r.user_a_id)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        className="font-mono text-caption text-accent hover:underline"
                        href={`/admin/users/${s(r.user_b_id)}`}
                      >
                        {short(r.user_b_id)}
                      </Link>
                    </TableCell>
                    <TableCell numeric>{s(r.count)}</TableCell>
                    <TableCell>{fmt(s(r.last_pairing_at))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </>
      ) : null}
    </div>
  );
}
