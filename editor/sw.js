/* EDDYSIBAW portfolio — service worker
   Bump VERSION on every deploy: old caches are dropped on activate. */
const VERSION = 'v5';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const FONTS = `fonts-${VERSION}`;
const KEEP = [SHELL, ASSETS, FONTS];

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './line-qr.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll is all-or-nothing; a single 404 would abort the install
      .then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

const isFont = (url) =>
  url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // opaque responses have status 0 but are still worth storing
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

async function navigationHandler(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(SHELL);
    cache.put('./index.html', res.clone());
    return res;
  } catch (err) {
    const cache = await caches.open(SHELL);
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Drive video previews must always hit the network — never cache or intercept.
  if (url.hostname.endsWith('google.com') && !isFont(url)) return;

  if (req.mode === 'navigate') {
    e.respondWith(navigationHandler(req));
    return;
  }

  if (isFont(url)) {
    e.respondWith(staleWhileRevalidate(req, FONTS));
    return;
  }

  if (url.origin === self.location.origin) {
    // covers are content-addressed by Drive file id, so they never change in place
    if (url.pathname.includes('/covers/') || url.pathname.includes('/icons/')) {
      e.respondWith(cacheFirst(req, ASSETS));
      return;
    }
    e.respondWith(staleWhileRevalidate(req, SHELL));
  }
});
