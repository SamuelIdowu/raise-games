'use client';

import type { CSSProperties, ReactNode } from 'react';
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED, useSidebarCollapsed } from './sidebar-state';

/**
 * Root of the signed-in layout. Publishes the sidebar width as --sidebar-w so the
 * fixed sidebar and the content column's left padding stay in step when it collapses.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const [collapsed] = useSidebarCollapsed();
  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  return (
    <div
      id="top"
      className="relative min-h-screen overflow-x-clip bg-bg text-fg"
      style={{ '--sidebar-w': `${width}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
