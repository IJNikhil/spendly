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
  console.info('[Spendly:SW] Installing service worker, caching core assets:', ASSETS);
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.info('[Spendly:SW] Cache opened successfully:', CACHE_NAME);
        return cache.addAll(ASSETS);
      })
      .then(() => {
        console.info('[Spendly:SW] All core assets cached successfully.');
      })
      .catch((err) => {
        console.error('[Spendly:SW] Asset caching failed during install:', err);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.info('[Spendly:SW] Activating service worker. Purging stale caches...');
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.info('[Spendly:SW] Deleting stale cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => {
      console.info('[Spendly:SW] Cache cleanup complete. Current cache:', CACHE_NAME);
    }).catch((err) => {
      console.error('[Spendly:SW] Error during cache cleanup:', err);
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Bypass caching for non-GET requests (e.g. Google Auth POSTs)
  if (e.request.method !== 'GET') {
    console.debug('[Spendly:SW] Bypassing non-GET request:', e.request.method, e.request.url);
    e.respondWith(fetch(e.request));
    return;
  }

  const url = new URL(e.request.url);

  // Bypass caching for external Google API calls completely to ensure real-time auth
  if (url.origin.includes('google') || url.origin.includes('googleapis')) {
    console.debug('[Spendly:SW] Bypassing external Google API call:', e.request.url);
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-First strategy for page navigation documents (HTMLs)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          console.debug('[Spendly:SW] Navigation fetched from network, updating cache:', e.request.url);
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch((err) => {
          console.warn('[Spendly:SW] Network navigation failed, falling back to cache:', e.request.url, err);
          return caches.match(e.request).then((cached) => {
            if (cached) return cached;
            console.error('[Spendly:SW] No cached fallback available for navigation:', e.request.url);
            return caches.match('./index.html') || caches.match('index.html');
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate strategy for other static assets
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            console.debug('[Spendly:SW] Revalidated asset from network:', e.request.url);
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch((err) => {
          console.debug('[Spendly:SW] Asset network fetch failed (offline mode):', e.request.url, err);
        });

      if (cachedResponse) {
        console.debug('[Spendly:SW] Serving asset from cache:', e.request.url);
        return cachedResponse;
      }
      console.debug('[Spendly:SW] Asset not in cache, fetching from network:', e.request.url);
      return fetchPromise;
    })
  );
});
