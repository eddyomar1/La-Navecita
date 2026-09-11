/* Bump VERSION whenever a shipped game asset changes. Updates activate on demand. */
'use strict';
const VERSION = 'v3';
const SCOPE = new URL(self.registration.scope);
const PREFIX = `etotu-${encodeURIComponent(SCOPE.pathname)}-`;
const CACHE = `${PREFIX}${VERSION}`;
const ASSETS = [
  './', 'index.html', 'styles.css', 'magia.js', 'pwa.js', 'manifest.webmanifest',
  'navec.png', 'navep.png', 'alienave.png', 'alien.png', 'rayo.png',
  'marcianito-real-no-fake.gif', 'playsong.ogg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'fonts/barlow-condensed-700-latin.woff2', 'fonts/dm-sans-latin.woff2'
].map(path => new URL(path, SCOPE).href);
const ASSET_URLS = new Set(ASSETS);

self.addEventListener('install', event => {
  // addAll commits the complete release atomically. Keep the previous worker active
  // until the player accepts the update or closes all tabs of this app.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

// Media players can request partial audio even while offline.
async function rangeResponse(response, range) {
  const buffer = await response.arrayBuffer(), size = buffer.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const unsatisfied = () => new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  if (!match || (!match[1] && !match[2])) return unsatisfied();
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return unsatisfied();
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  url.search = ''; url.hash = '';
  // Do not turn unknown URLs/404s or other GitHub Pages projects into the game.
  if (!ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(url.href);
    if (!response) return fetch(event.request);
    const range = event.request.headers.get('range');
    return range ? rangeResponse(response, range) : response;
  })());
});
