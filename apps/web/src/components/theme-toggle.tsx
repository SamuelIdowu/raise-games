'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { applyTheme, getStoredTheme, subscribeTheme, type ThemeChoice } from '@/lib/theme';

const ORDER: ThemeChoice[] = ['dark', 'light', 'system'];

/** Segmented control: uppercase labels, the active option filled orange. */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribeTheme, getStoredTheme, () => 'dark' as const);

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-control border border-line p-0.5"
    >
      {ORDER.map((option) => {
        const active = option === choice;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => applyTheme(option)}
            className={cn(
              'h-9 rounded-xs px-3 font-body text-mk-label uppercase transition-colors duration-[var(--motion-micro)] lg:h-8',
              active ? 'bg-accent text-on-accent' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
