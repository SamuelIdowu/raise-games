'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export type ToastVariant = 'status' | 'error';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastApi {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const item: ToastItem = {
        id: crypto.randomUUID(),
        variant: input.variant ?? 'status',
        title: input.title,
        description: input.description,
      };
      setItems((current) => [...current, item]);
      if (item.variant !== 'error') {
        window.setTimeout(() => remove(item.id), 4000);
      }
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.variant === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-card border p-3 text-body-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
              item.variant === 'error'
                ? 'border-loss/50 bg-surface text-fg'
                : 'border-line bg-raised text-fg',
            )}
          >
            <div className="flex items-start gap-2">
              <Icon
                name={item.variant === 'error' ? 'alert-triangle' : 'info'}
                size={20}
                className={item.variant === 'error' ? 'text-loss' : 'text-accent'}
              />
              <div className="flex-1">
                <p className="font-semibold">{item.title}</p>
                {item.description ? <p className="text-fg-muted">{item.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Dismiss"
                className="text-fg-muted hover:text-fg"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
