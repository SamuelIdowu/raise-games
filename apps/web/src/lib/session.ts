'use client';

import { authApi, clearTokens, getRefreshToken } from '@raise/api-client';
import { closeSocket } from './realtime';

/**
 * Signs the player out (F3.2, audit B9). `everywhere` revokes every device session; otherwise
 * only this device's refresh token. The server call is best effort: tokens are always cleared
 * locally, so a dead network never leaves the player signed in on a shared phone.
 */
export async function signOut({ everywhere = false }: { everywhere?: boolean } = {}) {
  try {
    if (everywhere) {
      await authApi.logoutAll();
    } else {
      const refresh = getRefreshToken();
      if (refresh) await authApi.logout(refresh);
    }
  } catch {
    // Already expired or offline: clearing locally is enough on this device.
  } finally {
    closeSocket();
    clearTokens();
    window.location.assign('/onboarding/phone');
  }
}
