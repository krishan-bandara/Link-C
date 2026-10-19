// Minimal service worker: makes the app installable. Nothing is cached, so
// API, auth and media responses never persist on the device.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  // Intentionally no respondWith: the browser does a normal network fetch
  // (keeps Range requests for media and auth/API calls untouched).
  void event;
});

// Push notifications. The text comes from the admin panel and is generic on purpose (no names, no message content).
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    // not json: show the defaults
  }
  event.waitUntil(
    self.registration.showNotification(String(d.title || 'Notification').slice(0, 60), {
      body: String(d.body || 'You have a new message.').slice(0, 140),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'linkc',
      renotify: true,
      data: { url: '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('/');
    }),
  );
});
