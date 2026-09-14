// Service worker — strategi NETWORK-FIRST supaya setiap refresh papar versi
// TERKINI dari server. Cache cuma fallback bila offline sahaja.
const CACHE_NAME = 'relief-v2';

const STATIC_ASSETS = [
  '/', '/index.html', '/ruang-guru.html', '/penyelaras.html', '/admin.html', '/migrate.html',
  '/manifest.json', '/icon-192.png', '/icon-512.png',
  '/css/style.css', '/css/relief-extra.css'
];

// JANGAN cache Firebase / Google / CDN — data hidup & SDK mesti sentiasa terkini
const BYPASS_DOMAINS = [
  'googleapis.com', 'google.com', 'gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(() => {}) // jangan gagal install walaupun ada 1-2 aset tak dapat dicache
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || BYPASS_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // NETWORK-FIRST: cuba rangkaian dahulu (selalu dapat versi terkini).
  // Cache disimpan/dikemaskini setiap kali berjaya. Fallback ke cache HANYA bila offline/network gagal.
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
