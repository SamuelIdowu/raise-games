import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link, { type LinkProps } from 'next/link';
import { cn } from '@/lib/cn';
import { Icon } from './icons';
import { Spinner } from './spinner';

/**
 * Blocks.fun §7.3 buttons.
 * - primary: orange action
 * - brand: purple brand moment (hero CTA, banners)
 * - secondary: cream on dark (dark ink on light theme)
 * - white: on purple/orange banners
 * - outline: quiet hairline button for tertiary actions
 * - ghost: text-only accent
 * - danger: destructive outline
 */
export type ButtonVariant =
  'primary' | 'brand' | 'secondary' | 'white' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'group/btn relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control border ' +
  'font-body text-mk-button font-bold uppercase tracking-[0.06em] leading-none ' +
  'transition-[transform,background-color,border-color,color] duration-[var(--motion-micro)] ease-standard ' +
  'hover:-translate-y-px active:translate-y-0 ' +
  'disabled:pointer-events-none disabled:border-transparent disabled:bg-raised disabled:text-fg-disabled ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover';

// Mobile keeps a 44px touch target; desktop uses the reference 32/36/44 heights.
const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 px-3 lg:h-8',
  md: 'h-11 px-4 lg:h-9',
  lg: 'h-11 px-5',
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press',
  brand: 'border-transparent bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-press',
  secondary:
    'border-transparent bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-fg)] hover:bg-[var(--btn-secondary-hover)]',
  white: 'border-transparent bg-white text-on-cream hover:bg-cream',
  outline: 'border-line-strong bg-transparent text-fg hover:border-fg-subtle hover:bg-overlay',
  ghost:
    'border-transparent bg-transparent text-accent hover:bg-accent-subtle active:bg-accent-subtle',
  danger: 'border-loss/60 bg-transparent text-loss hover:bg-loss/10 active:bg-loss/20',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}) {
  return cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className);
}

function Arrow() {
  return (
    <Icon
      name="trend-up"
      size={14}
      strokeWidth={2}
      className="transition-transform duration-[var(--motion-micro)] ease-standard group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5"
    />
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Trailing arrow-up-right (Blocks.fun CTA style). */
  arrow?: boolean;
  /** Explanation shown under a disabled button (Design §8: never disable silently). */
  hint?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  arrow = false,
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
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {children}
        {arrow ? <Arrow /> : null}
      </span>
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

export interface ButtonLinkProps extends LinkProps, ButtonStyleOptions {
  children: ReactNode;
  arrow?: boolean;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}

/** A Next.js link styled as a Button. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  arrow = false,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      {children}
      {arrow ? <Arrow /> : null}
    </Link>
  );
}
