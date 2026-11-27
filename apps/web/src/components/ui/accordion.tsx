'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AccordionItem {
  question: string;
  answer: ReactNode;
}

/**
 * Blocks.fun §7.12 FAQ accordion: single-open, uppercase label rows,
 * white when open and grey when collapsed, plus icon that turns into an x.
 * Enter/Space toggle (native button); Up/Down/Home/End move between questions.
 */
export function Accordion({
  items,
  defaultOpen = 0,
  className,
}: {
  items: readonly AccordionItem[];
  defaultOpen?: number | null;
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {items.map((item, index) => {
        const expanded = open === index;
        const buttonId = `${baseId}-q-${index}`;
        const panelId = `${baseId}-a-${index}`;
        return (
          <div key={item.question} className="border-b border-line">
            <h3>
              <button
                ref={(el) => {
                  refs.current[index] = el;
                }}
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between gap-4 py-3 text-left font-display text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
                  expanded ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                )}
              >
                {item.question}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  aria-hidden
                  className={cn(
                    'shrink-0 transition-transform duration-[var(--motion-default)]',
                    expanded && 'rotate-45 text-accent',
                  )}
                >
                  <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!expanded}
              className={cn(
                'grid transition-[grid-template-rows] duration-[var(--motion-default)] ease-standard',
                expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <p className="max-w-[440px] pb-4 text-[11px] font-medium uppercase italic leading-relaxed tracking-[0.04em] text-fg-muted">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
