import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PixelIcon, type PixelIconName } from './pixel-icon';

export interface PromoBannerProps {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  /** Usually a <Button variant="white" arrow>. */
  action?: ReactNode;
  icon?: PixelIconName;
  className?: string;
}

/** Scattered pixel icons on the right, like the coin cluster in the reference. */
const CLUSTER = [
  { size: 64, className: 'right-[14%] top-[18%] rotate-[-14deg]' },
  { size: 44, className: 'right-[4%] top-[8%] rotate-[18deg]' },
  { size: 40, className: 'right-[26%] bottom-[14%] rotate-[10deg]' },
  { size: 52, className: 'right-[6%] bottom-[10%] rotate-[-8deg]' },
  { size: 28, className: 'right-[32%] top-[12%] rotate-[24deg]' },
] as const;

/**
 * Blocks.fun §7.9 promo banner: full-width purple block, 16px radius with
 * pixel "bites" on the left corners, white eyebrow + display title + copy +
 * white button, a cluster of pixel icons on the right. Sharp offset shadow.
 */
export function PromoBanner({
  eyebrow,
  title,
  children,
  action,
  icon = 'coin',
  className,
}: PromoBannerProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-lg bg-accent text-on-accent shadow-hard [--hard-ink:var(--accent-ink)]',
        className,
      )}
    >
      {/* pixel bites */}
      <span aria-hidden className="absolute left-0 top-0 size-3 bg-bg" />
      <span aria-hidden className="absolute left-3 top-0 size-1.5 bg-bg" />
      <span aria-hidden className="absolute left-0 top-3 size-1.5 bg-bg" />
      <span aria-hidden className="absolute bottom-0 left-0 size-3 bg-bg" />
      <span aria-hidden className="absolute bottom-0 left-3 size-1.5 bg-bg" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 sm:block"
      >
        {CLUSTER.map((item, index) => (
          <span
            key={index}
            className={cn('animate-float absolute text-white', item.className)}
            style={{ animationDelay: `${index * -1.3}s` }}
          >
            <PixelIcon name={icon} size={item.size} className="[--hard-ink:var(--shadow-ink)]" />
          </span>
        ))}
      </div>

      <div className="relative max-w-[440px] space-y-3 p-6 md:p-8">
        {eyebrow ? (
          <p className="eyebrow text-on-accent! [&::before]:bg-on-accent!">{eyebrow}</p>
        ) : null}
        <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-black uppercase leading-[0.95] tracking-[-0.02em]">
          {title}
        </h2>
        {children ? <div className="text-[12px] leading-relaxed opacity-90">{children}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </section>
  );
}
