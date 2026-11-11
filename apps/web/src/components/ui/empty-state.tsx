import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icons';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon = 'circle',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center',
        className,
      )}
    >
      <Icon name={icon} size={32} className="text-fg-subtle" />
      <h3 className="font-display text-h3 font-semibold text-fg">{title}</h3>
      <p className="max-w-[40ch] text-body-sm text-fg-muted">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
