/**
 * Spendly Pro (v3.0.0) — Service Worker Cache Manager
 */

const CACHE_NAME = 'spendly-v3.2.0';
const ASSETS = [
  './',
  'index.html',
  'login.html',
  'workspace.html',
  'css/styles.css?v=3.2.0',
  'js/app.js?v=3.2.0',
  'manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Bypass caching for non-GET requests (e.g. Google Auth POSTs)
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  const url = new URL(e.request.url);

  // Bypass caching for external Google API calls completely to ensure real-time auth
  if (url.origin.includes('google') || url.origin.includes('googleapis')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-First strategy for page navigation documents (HTMLs)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // Cache the latest page version
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request)) // Fallback to offline cache
    );
    return;
  }

  // Stale-While-Revalidate strategy for other static assets
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {}); // Silent catch network errors

      return cachedResponse || fetchPromise;
    })
  );
});
