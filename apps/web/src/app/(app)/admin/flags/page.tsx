'use client';

import { adminApi } from '@raise/api-client';
import {
  Button,
  EmptyState,
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

/** Feature flags per stage and jurisdiction (PRD admin story). Admin-only toggles, audited. */
export default function FlagsPage() {
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const { data, error, reload } = useAdminData(() => adminApi.flags(), []);
  const toggle = async (id: string, enabled: boolean) => {
    try {
      await withStepUp(() => adminApi.setFlag(id, enabled));
      toast({ title: enabled ? 'Flag turned on' : 'Flag turned off' });
      reload();
    } catch (e) {
      toast({
        title: 'Could not change the flag',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Feature flags" />
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && data.length === 0 ? (
        <EmptyState
          icon="info"
          title="No flags"
          description="Flags are seeded per stage and jurisdiction."
        />
      ) : null}
      {data && data.length > 0 ? (
        <Table aria-label="Feature flags">
          <TableHead>
            <TableHeaderCell>Key</TableHeaderCell>
            <TableHeaderCell>Stage</TableHeaderCell>
            <TableHeaderCell>Jurisdiction</TableHeaderCell>
            <TableHeaderCell>State</TableHeaderCell>
            <TableHeaderCell>
              <span className="sr-only">Actions</span>
            </TableHeaderCell>
          </TableHead>
          <TableBody>
            {data.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono text-caption">{f.key}</TableCell>
                <TableCell>{f.stage}</TableCell>
                <TableCell>{f.jurisdiction ?? 'All'}</TableCell>
                <TableCell>
                  {f.enabled ? (
                    <StatusChip label="On" variant="accent" icon="check" />
                  ) : (
                    <StatusChip label="Off" variant="muted" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void toggle(f.id, !f.enabled)}
                  >
                    Turn {f.enabled ? 'off' : 'on'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
