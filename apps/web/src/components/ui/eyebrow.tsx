import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Blocks.fun §7.4: 6x6 orange pixel marker + 11px uppercase label. */
export function Eyebrow({
  as: Component = 'p',
  children,
  className,
  id,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Component id={id} className={cn('eyebrow', className)}>
      {children}
    </Component>
  );
}
