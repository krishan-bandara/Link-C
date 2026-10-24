// Service worker: installable app + offline start.
//
// What is cached (and ONLY this): the generic offline page (/offline.html + /offline.js, no personal data), the
// app icons / manifest, and the hashed build files under /_next/static/. NEVER cached: HTML pages of the app,
// API routes, auth routes, RSC payloads, media streams, anything with cookies. So nothing personal survives a
// logout in the Cache Storage. Cached chat text lives in IndexedDB instead (src/lib/offline), wiped on logout.
//
// With no signal, page navigations get /offline.html, a small read-only viewer of that IndexedDB data.
const SHELL = 'linkc-shell-v1';
const STATIC = 'linkc-static-v1';
const OFFLINE_FILES = ['/offline.html', '/offline.js'];
const STATIC_FILES = ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest'];
const MAX_STATIC_ENTRIES = 150;
const DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'; // dev chunk names are not hashed

// The offline page runs with its own strict policy (the app's CSP is set per request in middleware.ts).
const OFFLINE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

async function precache() {
  const cache = await caches.open(SHELL);
  for (const url of OFFLINE_FILES) {
    try {
      const res = await fetch(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
      const type = res.headers.get('content-type') || '';
      // never store a login redirect or an error page under these names
      if (res.ok && (url.endsWith('.html') ? type.includes('text/html') : type.includes('javascript'))) await cache.put(url, res);
    } catch {
      // offline or blocked: the page is cached on the next start
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => precache())
      .then(() => self.clients.claim()),
  );
});

async function offlinePage() {
  const cached = await (await caches.open(SHELL)).match('/offline.html');
  if (!cached) return null;
  const headers = new Headers(cached.headers);
  headers.set('Content-Security-Policy', OFFLINE_CSP);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(cached.body, { status: 200, headers });
}

async function navigate(request) {
  try {
    const res = await fetch(request);
    // the server or the tunnel being down looks like "no signal" to the person
    if (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 530) throw new Error('down');
    return res;
  } catch {
    return (await offlinePage()) || Response.error();
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES))) await cache.delete(k);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone());
    void trim(cache);
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then((res) => {
      if (res.ok && res.type === 'basic') void cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('probe')) return; // connection checks must hit the network
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (request.headers.has('range')) return; // media: leave Range requests alone
  if (OFFLINE_FILES.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL).then((c) => c.match(url.pathname)).then((hit) => hit || fetch(request)));
    return;
  }
  if (DEV) return;
  if (url.pathname.startsWith('/_next/static/')) event.respondWith(cacheFirst(request));
  else if (STATIC_FILES.includes(url.pathname)) event.respondWith(staleWhileRevalidate(request));
  // everything else (API, auth, RSC, media streams): no respondWith, a normal network request
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
