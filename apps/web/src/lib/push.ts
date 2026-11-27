'use client';

import { notificationsApi } from '@raise/api-client';

/**
 * Web push enablement (F11.4). iOS only supports web push for an installed PWA (TA), so the
 * preferences screen explains that email is the reliable fallback there.
 */
export type PushSupport = 'supported' | 'unsupported' | 'needs-install' | 'denied';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'supported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error('Notifications are blocked for this site in your browser settings.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await notificationsApi.subscribePush({ endpoint: json.endpoint, keys: json.keys });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await notificationsApi.unsubscribePush(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}
