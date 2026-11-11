import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control border font-display font-semibold leading-none transition-colors duration-[var(--motion-micro)] ease-standard disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-11 px-4 text-h3',
  lg: 'h-12 px-5 text-h3',
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press',
  secondary: 'border-line-strong bg-transparent text-fg hover:bg-overlay active:bg-overlay',
  ghost:
    'border-transparent bg-transparent text-accent hover:bg-accent-subtle active:bg-accent-subtle',
  danger: 'border-loss bg-transparent text-loss hover:bg-loss/10 active:bg-loss/20',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Explanation shown under a disabled button (Design §8: never disable silently). */
  hint?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  hint,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const button = (
    <button
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? <Spinner /> : null}
      <span className={cn(loading && 'invisible')}>{children}</span>
    </button>
  );

  if (!hint) return button;

  return (
    <span className={cn('inline-flex flex-col gap-1', fullWidth && 'w-full')}>
      {button}
      <span className="text-caption text-fg-muted">{hint}</span>
    </span>
  );
}
