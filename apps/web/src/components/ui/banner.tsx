import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icons';

export type BannerVariant = 'needs-action' | 'offline' | 'system';

const variants: Record<
  BannerVariant,
  { className: string; icon: IconName; iconClassName: string }
> = {
  'needs-action': {
    className: 'border-accent/40 bg-accent-subtle text-fg',
    icon: 'info',
    iconClassName: 'text-accent',
  },
  offline: {
    className: 'border-line bg-raised text-fg-muted',
    icon: 'wifi-off',
    iconClassName: 'text-fg-muted',
  },
  system: {
    className: 'border-line bg-surface text-fg',
    icon: 'info',
    iconClassName: 'text-fg-muted',
  },
};

export interface BannerProps {
  variant?: BannerVariant;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ variant = 'system', children, action, className }: BannerProps) {
  const config = variants[variant];
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-card border p-3 text-body-sm',
        config.className,
        className,
      )}
    >
      <Icon name={config.icon} size={20} className={cn('mt-0.5 shrink-0', config.iconClassName)} />
      <div className="flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
