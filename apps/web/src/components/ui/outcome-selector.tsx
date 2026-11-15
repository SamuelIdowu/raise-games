'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export interface OutcomeOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface OutcomeSelectorProps<T extends string> {
  legend: string;
  options: OutcomeOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Outcome rows for the result sheet (Design §8). Native radios keep keyboard
 * and screen-reader behaviour; the selected row gets the 2px accent border.
 * Outcome colours are not used here: Win/Loss tags belong to finished matches.
 */
export function OutcomeSelector<T extends string>({
  legend,
  options,
  value,
  onChange,
  className,
}: OutcomeSelectorProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn('flex flex-col gap-2', className)}>
      <legend className="mb-1 text-body-sm text-fg-muted">{legend}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-card border bg-surface px-3 py-2',
              'transition-colors duration-[var(--motion-micro)] ease-standard',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
              selected
                ? 'border-2 border-accent bg-accent-subtle px-[11px]'
                : 'border-line hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-[2px] border',
                selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
              )}
            >
              {selected ? <Icon name="check" size={14} /> : null}
            </span>
            <span className="flex flex-col">
              <span className="font-display text-h3 font-semibold text-fg">{option.label}</span>
              {option.description ? (
                <span className="text-caption text-fg-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
