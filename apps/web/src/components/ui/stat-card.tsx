import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CountUp } from './count-up';
import { Icon, type IconName } from './icons';

export interface StatCardProps {
  label: string;
  /** Numbers count up; strings (e.g. "20-5-1", "W3") render as-is. */
  value: number | string;
  /** Small line under the numeral, e.g. "+12 vs last week". */
  delta?: ReactNode;
  icon?: IconName;
  tone?: 'orange' | 'dark';
  className?: string;
}

/** Blocks.fun §7.7: orange block, top-right chamfer, tiny caption over a huge numeral. */
export function StatCard({ label, value, delta, icon, tone = 'orange', className }: StatCardProps) {
  const orange = tone === 'orange';
  return (
    <div
      className={cn(
        'chamfer-tr group/stat relative flex min-h-[110px] flex-col justify-between gap-4 p-5 md:p-6',
        'transition-transform duration-[var(--motion-default)] ease-standard hover:-translate-y-0.5',
        orange ? 'bg-orange-500 text-white' : 'surface-card text-fg',
        className,
      )}
    >
      {orange ? (
        // Folded-paper triangle in the notch (§5.2).
        <span
          aria-hidden
          className="absolute right-0 top-0 size-7 bg-orange-700 [clip-path:polygon(0_0,100%_100%,0_100%)]"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2 pr-6">
        <span
          className={cn(
            'font-body text-mk-label uppercase',
            orange ? 'text-on-orange/70' : 'text-fg-subtle',
          )}
        >
          {label}
        </span>
        {icon ? (
          <Icon
            name={icon}
            size={20}
            strokeWidth={2}
            className={cn(
              'transition-transform duration-[var(--motion-micro)] group-hover/stat:rotate-6',
              orange ? 'text-white' : 'text-accent',
            )}
          />
        ) : null}
      </div>
      <div>
        <p className="font-display text-mk-display-lg uppercase leading-none tabular">
          {typeof value === 'number' ? <CountUp value={value} /> : value}
        </p>
        {delta ? (
          <p
            className={cn(
              'mt-2 font-body text-mk-label uppercase',
              orange ? 'text-on-orange/80' : 'text-win',
            )}
          >
            {delta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
