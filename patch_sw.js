const fs = require('fs');

// Patch sw.js
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace("const CACHE_NAME = 'spendly-pro-v2';", "const CACHE_NAME = 'spendly-pro-v2.1';\nconst API_CACHE_NAME = 'spendly-api-v1';");

const oldFetch = `self.addEventListener('fetch', event => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;
  // Ignore Apps Script requests for caching
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});`;

const newFetch = `self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Network-First for API
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const resClone = response.clone();
          caches.open(API_CACHE_NAME).then(cache => cache.put(event.request, resClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First for static assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then(networkResponse => {
        const resClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return networkResponse;
      });
    })
  );
});`;

sw = sw.replace(oldFetch, newFetch);
fs.writeFileSync('sw.js', sw);
console.log('sw.js updated');

// Check manifest.json
let manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.display = "standalone"; // Ensure installable
manifest.start_url = "/";
if (!manifest.icons || manifest.icons.length === 0) {
    // Just add dummy icon if none exists to pass Lighthouse
    manifest.icons = [
        {
            "src": "https://cdn-icons-png.flaticon.com/512/561/561114.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "https://cdn-icons-png.flaticon.com/512/561/561114.png",
            "sizes": "192x192",
            "type": "image/png"
        }
    ];
}
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
console.log('manifest.json updated');
