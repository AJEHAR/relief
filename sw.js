const CACHE_NAME = 'relief-v1';

const STATIC_ASSETS = [
  '/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png',
  '/css/style.css', '/css/relief-extra.css'
];

// JANGAN cache Firebase / Google / CDN — data hidup & SDK mesti sentiasa terkini
const BYPASS_DOMAINS = [
  'googleapis.com', 'google.com', 'gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (BYPASS_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (event.request.method === 'GET' && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
