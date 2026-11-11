import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  containerClassName?: string;
}

export function Input({
  label,
  helper,
  error,
  id,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className="text-body-sm text-fg-muted">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 w-full rounded-control border bg-raised px-3 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none',
          error ? 'border-loss' : 'border-line',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="flex items-center gap-1 text-caption text-loss">
          <Icon name="alert-triangle" size={16} />
          {error}
        </p>
      ) : helper ? (
        <p id={`${inputId}-helper`} className="text-caption text-fg-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
