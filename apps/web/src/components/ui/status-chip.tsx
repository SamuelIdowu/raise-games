import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icons';

export type StatusChipVariant = 'neutral' | 'accent' | 'dispute' | 'win' | 'loss' | 'muted';

const variants: Record<StatusChipVariant, string> = {
  neutral: 'bg-overlay text-fg-muted',
  accent: 'bg-accent-subtle text-accent',
  dispute: 'bg-warning/15 text-warning',
  win: 'bg-success/15 text-success',
  loss: 'bg-danger/15 text-danger',
  muted: 'bg-transparent text-fg-subtle',
};

export interface StatusChipProps {
  label: string;
  variant?: StatusChipVariant;
  icon?: IconName;
  className?: string;
}

export function StatusChip({ label, variant = 'neutral', icon, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-xs px-2 label-caps',
        variants[variant],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {label}
    </span>
  );
}
