import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { IconName } from './icons';
import { PixelIcon, type PixelIconName } from './pixel-icon';

export interface EmptyStateProps {
  /** Line-icon name kept for compatibility; mapped onto the pixel set. */
  icon?: IconName;
  pixel?: PixelIconName;
  /** Small label above the title, e.g. "Nothing here yet". */
  eyebrow?: string;
  title: string;
  description: string;
  /** Primary next action (every empty state offers one: UX spec, Shell). */
  action?: ReactNode;
  /** A quieter second option, e.g. a ghost button or link. */
  secondaryAction?: ReactNode;
  /** Up to three short "how to fill this" steps, numbered like How it works. */
  steps?: ReadonlyArray<string>;
  /** Colour of the icon tile. */
  tone?: 'accent' | 'brand' | 'magenta';
  /** One row (icon, text, action) for lists, rails and cards. */
  compact?: boolean;
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
  user: 'heart',
  lock: 'shield',
  'check-circle': 'star',
};

const TILE = {
  accent: 'bg-accent text-on-accent [--hard-ink:var(--accent-ink)]',
  brand: 'bg-brand text-on-brand [--hard-ink:var(--brand-ink)]',
  magenta: 'bg-magenta-500 text-white [--hard-ink:var(--magenta-700)]',
} as const;

/** The pixel icon on a chamfered, slightly tilted block with a sharp shadow. */
function IconTile({
  name,
  tone,
  size,
}: {
  name: PixelIconName;
  tone: keyof typeof TILE;
  size: 'sm' | 'md';
}) {
  return (
    <span
      aria-hidden
      className={cn('drop-hard inline-flex shrink-0', size === 'md' ? '-rotate-6' : '-rotate-3')}
    >
      <span
        className={cn(
          'chamfer-tr-sm flex items-center justify-center',
          size === 'md' ? 'size-16' : 'size-11',
          TILE[tone],
        )}
      >
        <PixelIcon
          name={name}
          size={size === 'md' ? 30 : 22}
          className="[--hard-ink:var(--shadow-ink)]"
        />
      </span>
    </span>
  );
}

/**
 * Blocks-style empty state: tilted pixel tile, eyebrow, display title, a readable
 * sentence on what fills this space, optional numbered steps, and the next action.
 * The card carries the scattered pixel crosses from the hero so it reads as designed,
 * not missing. `compact` is a single row for rails and lists.
 */
export function EmptyState({
  icon = 'circle',
  pixel,
  eyebrow,
  title,
  description,
  action,
  secondaryAction,
  steps,
  tone = 'accent',
  compact = false,
  className,
}: EmptyStateProps) {
  const name = pixel ?? PIXEL_FOR[icon] ?? 'star';

  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-4 rounded-card border border-dashed border-line-strong p-4',
          className,
        )}
      >
        <IconTile name={name} tone={tone} size="sm" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-display text-[13px] font-black uppercase tracking-[-0.01em] text-fg">
            {title}
          </p>
          <p className="text-body-sm text-fg-muted">{description}</p>
        </div>
        {action || secondaryAction ? (
          <div className="flex shrink-0 items-center gap-2">
            {secondaryAction}
            {action}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={cn('surface-card relative overflow-hidden rounded-card px-6 py-12', className)}
    >
      <div aria-hidden className="pixel-field pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex max-w-[520px] flex-col items-center gap-4 text-center">
        <IconTile name={name} tone={tone} size="md" />
        <div className="space-y-2">
          {eyebrow ? <p className="eyebrow justify-center">{eyebrow}</p> : null}
          <h3 className="font-display text-h2 font-black uppercase tracking-[-0.01em] text-fg text-balance">
            {title}
          </h3>
          <p className="mx-auto max-w-[44ch] text-body-sm text-fg-muted text-pretty">
            {description}
          </p>
        </div>

        {steps && steps.length > 0 ? (
          <ol className="grid w-full gap-2 text-left sm:grid-cols-3">
            {steps.slice(0, 3).map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-2 rounded-control border border-line bg-bg/40 p-3"
              >
                <span className="font-display text-[12px] font-bold italic text-accent tabular">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-caption text-fg-muted">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {action || secondaryAction ? (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </section>
  );
}
