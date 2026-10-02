/*
 * Notario service worker: makes the installed web app (iPhone home screen,
 * desktop browsers) open without internet.
 *
 * - Page loads: network first (so updates arrive), cached copy when offline.
 * - App files (hashed JS/CSS/wasm/fonts/images): cache first; they never change
 *   under the same name, so the cache is always correct.
 * Data never goes through here: notes live in the device's IndexedDB.
 */
const CACHE = 'notario-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // e.g. the sync server: never cached
  // Downloads (Android app, big files) go straight to the network, never through the cache.
  if (/\.(apk|zip|pdf)$/i.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only the app page itself is kept for offline use.
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }),
    ),
  );
});

// Reminders: tapping a notification opens the app on that entry.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const itemId = event.notification.data && event.notification.data.itemId;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if (itemId) c.postMessage({ type: 'notario-open', itemId });
          return c.focus();
        }
      }
      return self.clients.openWindow(itemId ? `./#open=${itemId}` : './');
    }),
  );
});

// Reminders sent from the server while the app is closed (Web Push).
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Notario', {
    body: d.body || '', tag: d.tag, icon: './icon-192.png', badge: './icon-192.png', data: { itemId: d.itemId || null },
  }));
});
