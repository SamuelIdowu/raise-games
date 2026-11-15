'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export interface ScoreStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Accessible unit, e.g. "goals" → "Your goals, 3". */
  unit?: string;
  disabled?: boolean;
  className?: string;
}

const stepButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line-strong text-fg ' +
  'transition-colors duration-[var(--motion-micro)] ease-standard hover:bg-overlay active:bg-overlay ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Score stepper driven by the game config (Design §8 result sheet): 44px targets,
 * numeric keyboard, tabular stat-md digits, clamped to the score model bounds.
 */
export function ScoreStepper({
  label,
  value,
  min,
  max,
  onChange,
  unit,
  disabled = false,
  className,
}: ScoreStepperProps) {
  const id = useId();
  const clamp = (n: number) =>
    Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className={cn('flex flex-col gap-1', className)}
    >
      <span id={`${id}-label`} className="text-body-sm text-fg-muted">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={stepButton}
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <Icon name="minus" size={20} />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={unit ? `${label} ${unit}` : label}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            onChange(clamp(digits === '' ? min : Number(digits)));
          }}
          onFocus={(e) => e.target.select()}
          className="h-11 w-16 rounded-card border border-line bg-raised text-center font-display text-stat-md font-semibold text-fg tabular focus:border-accent focus:outline-none disabled:opacity-40"
        />
        <button
          type="button"
          className={stepButton}
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
    </div>
  );
}
