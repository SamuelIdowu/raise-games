import type { ElementType, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Hover: strong border + 4px lift (Blocks.fun §7.11). */
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5 md:p-6' } as const;

/** Blocks.fun §5.3 card: gradient surface, hairline border, inset highlight, no drop shadow. */
export function Card({
  as: Component = 'div',
  interactive = false,
  padding = 'md',
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        'surface-card rounded-card',
        paddings[padding],
        interactive &&
          'transition-[transform,border-color,box-shadow] duration-[var(--motion-default)] ease-standard hover:-translate-x-0.5 hover:-translate-y-1 hover:border-accent hover:shadow-[4px_4px_0_0_var(--accent-ink)]',
        className,
      )}
      {...props}
    />
  );
}
