import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link, { type LinkProps } from 'next/link';
import { cn } from '@/lib/cn';
import { Icon } from './icons';
import { Spinner } from './spinner';

/**
 * Blocks.fun §7.3 buttons, with a sharp offset "pixel" shadow.
 * - primary: purple, the main action
 * - brand: orange, the secondary highlight
 * - secondary: cream on dark (ink on light theme)
 * - white: on purple/orange banners
 * - outline: quiet hairline button for tertiary actions
 * - ghost: text-only accent, no shadow
 * - danger: destructive outline
 */
export type ButtonVariant =
  'primary' | 'brand' | 'secondary' | 'white' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Shape, shadow and press motion come from .btn-chamfer (globals.css):
// rounded corners with the top-right corner cut at 45deg, sharp drop-shadow.
const base =
  'btn-chamfer group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap ' +
  'font-display text-[11px] font-bold uppercase tracking-[0.04em] leading-none ' +
  'disabled:pointer-events-none disabled:text-fg-disabled ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover';

// Mobile keeps a 44px touch target; desktop uses the reference 32/36/44 heights.
const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 px-3 [--btn-cut:8px] lg:h-8',
  md: 'h-11 px-4 [--btn-cut:9px] lg:h-9',
  lg: 'h-11 px-5 text-[12px] [--btn-cut:11px]',
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'text-on-accent [--btn-bg:var(--accent)] [--hard-ink:var(--accent-ink)] hover:[--btn-bg:var(--accent-hover)] active:[--btn-bg:var(--accent-press)]',
  brand:
    'text-on-brand [--btn-bg:var(--brand)] [--hard-ink:var(--brand-ink)] hover:[--btn-bg:var(--brand-hover)] active:[--btn-bg:var(--brand-press)]',
  secondary:
    'text-[var(--btn-secondary-fg)] [--btn-bg:var(--btn-secondary-bg)] [--hard-ink:var(--cream-ink)] hover:[--btn-bg:var(--btn-secondary-hover)]',
  white:
    'text-on-cream [--btn-bg:white] [--hard-ink:var(--cream-ink)] hover:[--btn-bg:var(--cream)]',
  outline:
    'text-fg [--btn-bg:var(--border-strong)] [--btn-fill:var(--bg-0)] [--hard-ink:var(--border-strong)] hover:[--btn-bg:var(--text-3)]',
  ghost:
    'text-accent [--btn-bg:transparent] [--hard-ink:transparent] hover:[--btn-bg:var(--accent-subtle)]',
  danger:
    'text-loss [--btn-bg:color-mix(in_srgb,var(--loss)_60%,transparent)] [--btn-fill:var(--bg-0)] [--hard-ink:color-mix(in_srgb,var(--loss)_40%,var(--bg-0))] hover:[--btn-fill:color-mix(in_srgb,var(--loss)_12%,var(--bg-0))]',
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
