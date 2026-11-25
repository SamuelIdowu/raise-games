import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CountUp } from './count-up';
import { PixelIcon, type PixelIconName } from './pixel-icon';

export interface StatCardProps {
  label: string;
  /** Numbers count up; strings (e.g. "20-5-1", "W3") render as-is. */
  value: number | string;
  /** Small line under the numeral, e.g. "+12 vs last week". */
  delta?: ReactNode;
  icon?: PixelIconName;
  tone?: 'accent' | 'brand' | 'dark';
  /** `md` for dense rows of four (dashboard); `lg` is the marketing numeral. */
  size?: 'md' | 'lg';
  className?: string;
}

const tones = {
  accent: 'bg-accent text-on-accent [--fold:var(--accent-ink)]',
  brand: 'bg-brand text-on-brand [--fold:var(--brand-ink)]',
  dark: 'surface-card text-fg [--fold:var(--bg-0)]',
} as const;

const inks = {
  accent: '[--hard-ink:var(--accent-ink)]',
  brand: '[--hard-ink:var(--brand-ink)]',
  dark: '[--hard-ink:var(--shadow-ink)]',
} as const;

/**
 * Blocks.fun §7.7: coloured block, top-right chamfer with a folded-paper
 * triangle and a pixel icon in the notch, tiny caption over a huge numeral.
 * The sharp shadow is a drop-shadow on the wrapper so the chamfer keeps it.
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  tone = 'accent',
  size = 'lg',
  className,
}: StatCardProps) {
  return (
    <div className={cn('group/stat drop-hard relative', inks[tone], className)}>
      <div
        className={cn(
          size === 'lg' ? 'min-h-[120px]' : 'min-h-[104px]',
          'chamfer-tr relative flex flex-col justify-between gap-4 p-5 md:p-6',
          'transition-transform duration-[var(--motion-default)] ease-standard group-hover/stat:-translate-y-0.5',
          tones[tone],
        )}
      >
        <span
          aria-hidden
          className="absolute right-0 top-0 size-7 bg-[var(--fold)] [clip-path:polygon(0_0,100%_100%,0_100%)]"
        />
        <span className="pr-10 font-display text-[10px] font-bold uppercase tracking-[0.1em] opacity-80">
          {label}
        </span>
        <div>
          <p
            className={cn(
              'font-display uppercase leading-none tabular',
              size === 'lg'
                ? 'text-mk-display-lg'
                : 'whitespace-nowrap text-[clamp(1.75rem,2.6vw,2.5rem)] font-black tracking-[-0.02em]',
            )}
          >
            {typeof value === 'number' ? <CountUp value={value} /> : value}
          </p>
          {delta ? (
            <p className="mt-2 font-display text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">
              {delta}
            </p>
          ) : null}
        </div>
      </div>
      {icon ? (
        <PixelIcon
          name={icon}
          size={34}
          className="absolute -right-2 -top-3 rotate-[12deg] text-white [--hard-ink:var(--shadow-ink)] transition-transform duration-[var(--motion-micro)] group-hover/stat:rotate-[18deg]"
        />
      ) : null}
    </div>
  );
}
