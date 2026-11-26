'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  /** Optional count shown after the label. */
  count?: number;
}

export interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Prefix for tab/panel ids; pair panels with tabPanelProps(idPrefix, key). */
  idPrefix: string;
  'aria-label': string;
  /** Stretch tabs to fill the row (default) or hug their labels. */
  fill?: boolean;
  className?: string;
}

export const tabId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
export const panelId = (prefix: string, key: string) => `${prefix}-panel-${key}`;

export function tabPanelProps(prefix: string, key: string) {
  return {
    role: 'tabpanel' as const,
    id: panelId(prefix, key),
    'aria-labelledby': tabId(prefix, key),
    tabIndex: 0,
  };
}

/**
 * Blocks.fun §7.2 nav style: 11px uppercase labels, muted when inactive,
 * a 2px orange underline sitting on the hairline when active.
 * Roving tabindex with arrow / Home / End keys.
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  idPrefix,
  fill = true,
  className,
  ...aria
}: TabsProps<K>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.key === value);
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={aria['aria-label']}
      onKeyDown={onKeyDown}
      className={cn(
        // Baseline as an inset shadow: the active tab's 2px underline paints over it
        // inside the box, so clipping the y-axis (no stray scrollbar) never cuts it.
        'flex overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, item.key)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, item.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex min-h-11 lg:min-h-10 items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 sm:px-4',
              'font-display text-[10px] font-bold uppercase sm:text-[11px] tracking-[0.08em] transition-colors duration-[var(--motion-micro)]',
              fill && 'flex-1',
              selected
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            {item.label}
            {item.count ? (
              <span className="tabular rounded-xs bg-accent-subtle px-1.5 py-0.5 text-accent">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
