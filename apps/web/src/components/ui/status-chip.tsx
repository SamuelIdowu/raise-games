import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icons';

export type StatusChipVariant = 'neutral' | 'accent' | 'dispute' | 'win' | 'loss' | 'muted';

const variants: Record<StatusChipVariant, string> = {
  neutral: 'border-line bg-transparent text-fg-muted',
  accent: 'border-accent/40 bg-accent-subtle text-accent',
  dispute: 'border-dispute/40 bg-dispute/10 text-dispute',
  win: 'border-win/40 bg-win/10 text-win',
  loss: 'border-loss/40 bg-loss/10 text-loss',
  muted: 'border-line bg-transparent text-fg-subtle',
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
        'inline-flex h-6 items-center gap-1 rounded-[2px] border px-2 label-caps',
        variants[variant],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {label}
    </span>
  );
}
