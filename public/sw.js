// Service Worker for Soccer Prediction Engine PWA / APK
const CACHE_NAME = 'soccer-predictor-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

// Check if current scope is a dev preview environment
const isDevEnv =
  self.location.hostname === 'localhost' ||
  self.location.hostname.includes('ais-dev-') ||
  self.location.port === '3000';

self.addEventListener('install', (event) => {
  if (isDevEnv) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(() => {
      // Ignore cache failures in dynamic environments
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  if (isDevEnv) {
    // Unregister and clear caches immediately in dev environments
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      }).then(() => self.registration.unregister())
    );
    return;
  }
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (isDevEnv) {
    // In dev environment, never intercept any requests
    return;
  }

  const url = new URL(event.request.url);

  // Do NOT intercept server API routes, dev bundles, or non-GET requests
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('node_modules') ||
    url.pathname.includes('hot-update') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first with cache fallback for HTML pages
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
