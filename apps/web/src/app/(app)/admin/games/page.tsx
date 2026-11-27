'use client';

import { adminApi } from '@raise/api-client';
import {
  Button,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui';
import { AdminHeader, LoadState, useAdminData, useStepUp } from '@/features/admin/admin-kit';

/**
 * Game and format config (completes the Sprint 4 admin stub). games.json stays the source
 * of truth for definitions; here admins can pause or resume a format without a deploy.
 */
export default function GamesPage() {
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const { data, error, reload } = useAdminData(() => adminApi.games(), []);
  const setStatus = async (id: string, status: 'enabled' | 'disabled') => {
    try {
      await withStepUp(() => adminApi.updateFormat(id, { status }));
      toast({
        title: status === 'enabled' ? 'Format resumed' : 'Format paused for new challenges',
      });
      reload();
    } catch (e) {
      toast({
        title: 'Could not update the format',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader title="Games & formats" />
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data?.map((g) => (
        <section key={g.id} className="flex flex-col gap-2">
          <h2 className="font-display text-h2 font-black uppercase text-fg">{g.name}</h2>
          <Table aria-label={`${g.name} formats`}>
            <TableHead>
              <TableHeaderCell>Format</TableHeaderCell>
              <TableHeaderCell>Key</TableHeaderCell>
              <TableHeaderCell>Tiebreak</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableHead>
            <TableBody>
              {g.formats.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.name}</TableCell>
                  <TableCell className="font-mono text-caption">{f.key}</TableCell>
                  <TableCell className="max-w-[28rem] truncate" title={f.tiebreakRules ?? ''}>
                    {f.tiebreakRules ?? '—'}
                  </TableCell>
                  <TableCell>
                    {f.status === 'enabled' ? (
                      <StatusChip label="Live" variant="accent" />
                    ) : (
                      <StatusChip label="Paused" variant="muted" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void setStatus(f.id, f.status === 'enabled' ? 'disabled' : 'enabled')
                      }
                    >
                      {f.status === 'enabled' ? 'Pause' : 'Resume'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
