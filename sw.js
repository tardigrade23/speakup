/* SpeakUp service worker: app files network-first (so updates arrive at once),
 * cache fallback offline; Google Fonts cache-first. The AI itself needs the network.
 * Bump CACHE_VERSION when the list of precached files changes. */
const CACHE_VERSION = 'speakup-v2';
const FONT_CACHE = 'speakup-fonts';
const PRECACHE = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('speakup-') && k !== CACHE_VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' })
    .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
