'use client';

import { useEffect } from 'react';
import { isAuthenticated, setSessionExpiredHandler } from '@raise/api-client';

function toSignIn() {
  const here = window.location.pathname + window.location.search;
  window.location.replace('/onboarding/phone?next=' + encodeURIComponent(here));
}

/**
 * Signed-in pages need a session. Without tokens, go to sign-in and come back here after.
 * While mounted, a session that expires mid-visit (refresh refused) does the same, once,
 * instead of every widget showing an auth error.
 */
export function AuthGate() {
  useEffect(() => {
    if (!isAuthenticated()) {
      toSignIn();
      return;
    }
    let sent = false;
    setSessionExpiredHandler(() => {
      if (sent) return;
      sent = true;
      toSignIn();
    });
    return () => setSessionExpiredHandler(null);
  }, []);
  return null;
}
