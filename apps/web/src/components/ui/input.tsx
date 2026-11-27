import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  /** Positive feedback (e.g. "Username available"); shown when there is no error. */
  success?: string;
  /** A check is running (e.g. availability); shown when there is no error or success. */
  pending?: string;
  containerClassName?: string;
}

export function Input({
  label,
  helper,
  error,
  success,
  pending,
  id,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const status = error
    ? 'error'
    : success
      ? 'success'
      : pending
        ? 'pending'
        : helper
          ? 'helper'
          : null;
  const describedBy = status ? `${inputId}-${status}` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className="label-caps text-fg-muted">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 lg:h-9 w-full rounded-control border bg-surface px-3 text-body-sm text-fg placeholder:text-fg-subtle ' +
            'focus:border-accent focus:shadow-[3px_3px_0_0_var(--accent-ink)] focus:outline-none transition-colors duration-[var(--motion-micro)] ease-standard',
          error
            ? 'border-loss'
            : success
              ? 'border-win'
              : 'border-line-strong hover:border-control',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="flex items-center gap-1 text-caption text-loss">
          <Icon name="alert-triangle" size={16} />
          {error}
        </p>
      ) : success ? (
        <p
          id={`${inputId}-success`}
          role="status"
          className="flex items-center gap-1 text-caption text-win"
        >
          <Icon name="check-circle" size={16} />
          {success}
        </p>
      ) : pending ? (
        <p
          id={`${inputId}-pending`}
          role="status"
          className="flex items-center gap-1 text-caption text-fg-muted"
        >
          <Icon name="loader" size={16} className="animate-spin" />
          {pending}
        </p>
      ) : helper ? (
        <p id={`${inputId}-helper`} className="text-caption text-fg-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
