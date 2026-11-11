'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface CountUpProps {
  value: number;
  /** Clamped to the doc's 240–400ms signature window. */
  duration?: number;
  className?: string;
}

/** Signature moment stub: rating count-up on result-confirmed (Design §5). */
export function CountUp({ value, duration = 300, className }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || from === value) {
      setDisplay(value);
      return;
    }

    const ms = Math.min(Math.max(duration, 240), 400);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span aria-live="polite" className={cn('tabular', className)}>
      {display.toLocaleString('en-NG')}
    </span>
  );
}
