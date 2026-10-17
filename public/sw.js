self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // The live-updates connection must go straight to the network. Wrapping a
  // never-ending stream in respondWith() makes some browsers abort it.
  if (req.method !== 'GET' ||
      req.url.indexOf('/api/splits/stream') !== -1 ||
      (req.headers.get('accept') || '').indexOf('text/event-stream') !== -1) {
    return;
  }
  event.respondWith(fetch(req));
});

// ---- Push notifications (Splits) ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* not JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Expense Tracker', {
      body: data.body || '',
      tag: data.tag || 'splits'     // same group = one notification, not a pile
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow('/');
  })());
});