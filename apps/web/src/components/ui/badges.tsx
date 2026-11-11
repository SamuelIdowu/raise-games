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
        'chamfer inline-flex items-center gap-1.5 border border-accent/50 bg-accent-subtle px-2.5 py-1 text-accent',
        tier === 5 && 'shadow-[0_0_0_1px_var(--accent),0_0_12px_rgba(34,211,238,0.35)]',
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
        'inline-flex items-center gap-1 rounded-[2px] border border-line px-2 py-0.5 text-caption text-fg-muted',
        className,
      )}
    >
      <Icon name={config.icon} size={14} />
      {config.label}
    </span>
  );
}
