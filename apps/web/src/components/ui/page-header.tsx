import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Eyebrow } from './eyebrow';

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned slot, e.g. an "Edit profile" button. */
  action?: ReactNode;
  className?: string;
}

/** Eyebrow + uppercase display H1 (Blocks.fun §3.2 / §7.4). One per page. */
export function PageHeader({ title, eyebrow, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-3">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="font-display text-mk-h1 uppercase text-fg text-balance">{title}</h1>
        {subtitle ? <p className="max-w-prose text-body-sm text-fg-subtle">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}
