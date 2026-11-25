'use client';

import { useEffect } from 'react';
import { isAuthenticated } from '@raise/api-client';

/**
 * App routes need a session. Without tokens, go to sign-in and come back here after.
 * (An expired session is handled where it is detected, in apiFetch.)
 */
export function AuthGate() {
  useEffect(() => {
    if (isAuthenticated()) return;
    const here = window.location.pathname + window.location.search;
    window.location.replace('/onboarding/phone?next=' + encodeURIComponent(here));
  }, []);
  return null;
}
