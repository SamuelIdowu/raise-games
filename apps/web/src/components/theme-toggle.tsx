'use client';

import { useSyncExternalStore } from 'react';
import { Button, Icon } from '@/components/ui';
import { applyTheme, getStoredTheme, subscribeTheme, type ThemeChoice } from '@/lib/theme';

const ORDER: ThemeChoice[] = ['dark', 'light', 'system'];

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribeTheme, getStoredTheme, () => 'dark' as const);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    applyTheme(next);
  }

  return (
    <Button variant="secondary" size="sm" onClick={cycle} aria-label={`Theme: ${choice}`}>
      <Icon name="shield" size={16} />
      <span className="label-caps">{choice}</span>
    </Button>
  );
}
