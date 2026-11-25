import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { IconName } from './icons';
import { PixelIcon, type PixelIconName } from './pixel-icon';

export interface EmptyStateProps {
  /** Line-icon name kept for compatibility; mapped onto the pixel set. */
  icon?: IconName;
  pixel?: PixelIconName;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

const PIXEL_FOR: Partial<Record<IconName, PixelIconName>> = {
  trophy: 'crown',
  mail: 'chat',
  'gamepad-2': 'gamepad',
  flag: 'flame',
  shield: 'shield',
  star: 'star',
  'user-plus': 'heart',
  'bell-off': 'chat',
};

/** Pixel icon with a hard shadow, uppercase display title, short caption, CTA. */
export function EmptyState({
  icon = 'circle',
  pixel,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'surface-card flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center',
        className,
      )}
    >
      <PixelIcon
        name={pixel ?? PIXEL_FOR[icon] ?? 'star'}
        size={40}
        className="mb-1 text-accent [--hard-ink:var(--accent-ink)]"
      />
      <h3 className="font-display text-h3 font-black uppercase text-fg">{title}</h3>
      <p className="max-w-[40ch] text-[11px] font-medium uppercase leading-relaxed tracking-[0.04em] text-fg-subtle">
        {description}
      </p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
