import { cn } from '@/lib/cn';
import { Icon } from './icons';

export function RatingBadge({
  value,
  provisional = false,
  className,
}: {
  value: number;
  provisional?: boolean;
  className?: string;
}) {
  const label = `Rating ${value.toLocaleString('en-NG')}${provisional ? ', provisional' : ''}`;
  return (
    <span role="img" aria-label={label} className={cn('inline-flex items-center gap-1', className)}>
      <span aria-hidden className="font-display text-stat-md font-semibold text-fg tabular">
        {value.toLocaleString('en-NG')}
      </span>
      {provisional ? (
        <span aria-hidden className="size-2 rounded-full border border-fg-subtle" />
      ) : null}
    </span>
  );
}

const TIER_LABELS = ['Rookie', 'Challenger', 'Contender', 'Elite', 'Champion'] as const;
export type TierLevel = 1 | 2 | 3 | 4 | 5;

export function RankTierBadge({
  tier,
  label,
  className,
}: {
  tier: TierLevel;
  label?: string;
  className?: string;
}) {
  const tierLabel = label ?? TIER_LABELS[tier - 1];
  return (
    <span
      role="img"
      aria-label={`Rank ${tierLabel}`}
      className={cn(
        'chamfer-tr-sm inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 pr-4 text-on-accent',
        tier === 5 && 'shadow-glow',
        className,
      )}
    >
      <span aria-hidden className="flex items-end gap-0.5">
        {Array.from({ length: tier }, (_, index) => (
          <span key={index} className="h-2 w-0.5 bg-current" />
        ))}
      </span>
      <span className="label-caps">{tierLabel}</span>
    </span>
  );
}

export type ReputationLevel = 'new' | 'low' | 'reliable' | 'trusted';

const REPUTATION: Record<
  ReputationLevel,
  { label: string; icon: 'circle' | 'alert-triangle' | 'shield' | 'check-circle' }
> = {
  new: { label: 'New', icon: 'circle' },
  low: { label: 'Low', icon: 'alert-triangle' },
  reliable: { label: 'Reliable', icon: 'shield' },
  trusted: { label: 'Trusted', icon: 'check-circle' },
};

export function ReputationBadge({
  level,
  className,
}: {
  level: ReputationLevel;
  className?: string;
}) {
  const config = REPUTATION[level];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-xs bg-overlay px-2 label-caps text-fg-muted',
        className,
      )}
    >
      <Icon name={config.icon} size={14} />
      {config.label}
    </span>
  );
}
