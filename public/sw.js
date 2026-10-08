/* Huddle service worker.
 *
 * Purpose: make the app installable and let the app shell open offline.
 * It deliberately does NOT touch signaling (/socket.io/), the API (/api/),
 * non-GET requests, or cross-origin requests. Media never goes through HTTP.
 *
 * Bump VERSION when changing this file's caching behaviour.
 */
const VERSION = 'v1';
const SHELL_CACHE = `huddle-shell-${VERSION}`;
const ASSET_CACHE = `huddle-assets-${VERSION}`;
const MAX_ASSET_ENTRIES = 80;

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

const ICON_RE = /^\/(icon[\w-]*\.(png|svg)|apple-touch-icon\.png)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Add individually so one missing file doesn't abort installation.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('huddle-') && !keep.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) return;
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  if (url.pathname.startsWith('/assets/') || ICON_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
  // Everything else: default browser behaviour.
});

async function networkFirstNavigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      // Every route (/, /r/:roomId) serves the same SPA shell; store it as '/'.
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => undefined);
    }
    return res;
  } catch (err) {
    const cached = await caches.match('/', { cacheName: SHELL_CACHE });
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
        '<title>Huddle — offline</title>' +
        '<body style="background:#0b0d12;color:#e6e8ef;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
        '<p>You\u2019re offline. Reconnect to join a call.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches
      .open(ASSET_CACHE)
      .then(async (c) => {
        await c.put(req, copy);
        await trimCache(c, MAX_ASSET_ENTRIES);
      })
      .catch(() => undefined);
  }
  return res;
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  // Cache keys are returned in insertion order; drop the oldest.
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
  }
}
