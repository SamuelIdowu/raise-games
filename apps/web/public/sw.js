/* RAISE service worker (Sprint 11, F11.4): web push only. No offline caching yet. */
self.addEventListener('push', (event) => {
  let data = { title: 'RAISE', body: '', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* non-JSON payloads fall back to the defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { url: data.url },
    }),
  );
});

// Tapping a notification opens (or focuses) the related object — Design §8.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  // Only ever navigate within this app.
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
