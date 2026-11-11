'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icons';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  label?: string;
  disabled?: boolean;
  error?: string;
  resendSeconds?: number;
  onResend?: () => void;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  label = 'One-time code',
  disabled = false,
  error,
  resendSeconds = 0,
  onResend,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length }, (_, index) => value[index] ?? '');

  function setChar(index: number, char: string) {
    const next = [...chars];
    next[index] = char;
    onChange(next.join('').trimEnd());
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, '').slice(-1);
    setChar(index, char);
    if (char && index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (chars[index]) {
        setChar(index, '');
      } else if (index > 0) {
        setChar(index - 1, '');
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label={label} className="flex gap-2">
        {chars.map((char, index) => (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={char}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'h-[52px] w-11 rounded-control border bg-raised text-center font-display text-[20px] text-fg tabular focus:border-accent focus:outline-none disabled:opacity-40',
              error ? 'border-loss' : 'border-line',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        {error ? (
          <p className="flex items-center gap-1 text-caption text-loss">
            <Icon name="alert-triangle" size={16} />
            {error}
          </p>
        ) : (
          <span />
        )}
        {onResend ? (
          <button
            type="button"
            onClick={onResend}
            disabled={resendSeconds > 0}
            className="text-caption text-accent disabled:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
