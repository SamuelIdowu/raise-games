'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'lg';
}

/**
 * Native <dialog> gives us focus trapping and Escape handling for free.
 * Mobile = bottom sheet, desktop = centered modal (Design §8).
 */
export function Sheet({ open, onClose, title, children, footer, size = 'sm' }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="sheet-title"
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-modal border border-line bg-raised p-0 text-fg backdrop:bg-scrim',
        'max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none',
        size === 'sm' ? 'max-w-[480px]' : 'max-w-[640px]',
      )}
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex items-center justify-between border-b border-line p-4">
          <h2 id="sheet-title" className="font-display text-h2 font-semibold text-fg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-fg-muted hover:text-fg"
          >
            <Icon name="x" size={20} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-line p-4">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
