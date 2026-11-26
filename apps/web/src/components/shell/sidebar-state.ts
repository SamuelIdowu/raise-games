'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'raise.sidebar';
const EVENT = 'raise:sidebar';

export const SIDEBAR_EXPANDED = 216;
export const SIDEBAR_COLLAPSED = 64;

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Desktop sidebar collapsed state, remembered per browser. Server render = expanded. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, read() ? 'expanded' : 'collapsed');
    } catch {
      /* private mode: state just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [collapsed, toggle];
}
