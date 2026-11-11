'use client';

import { useId, type ChangeEvent, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

interface Option {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'onChange'
> {
  label?: string;
  helper?: string;
  error?: string;
  placeholder?: string;
  options: Option[];
  containerClassName?: string;
  /** Controlled value (use with onChange) */
  value?: string;
  /** Called with the selected value string */
  onChange?: (value: string) => void;
}

export function Select({
  label,
  helper,
  error,
  placeholder,
  options,
  id,
  className,
  containerClassName,
  value,
  onChange,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = error ? `${selectId}-error` : helper ? `${selectId}-helper` : undefined;

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = e.target.value;
    onChange?.(nextValue);
  };

  return (
    <div className={cn('flex flex-col gap-1', containerClassName)}>
      {label ? (
        <label htmlFor={selectId} className="text-body-sm text-fg-muted">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        value={value ?? ''}
        onChange={handleChange}
        className={cn(
          'h-11 w-full rounded-control border bg-raised px-3 py-2 text-body text-fg focus:border-accent focus:outline-none appearance-none bg-[url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236B7788" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 9l6 6 6-6"/></svg>\')] bg-no-repeat bg-right-3 bg-center pr-10',
          error ? 'border-loss' : 'border-line',
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="flex items-center gap-1 text-caption text-loss">
          <Icon name="alert-triangle" size={16} />
          {error}
        </p>
      ) : helper ? (
        <p id={`${selectId}-helper`} className="text-caption text-fg-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
