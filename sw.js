// Offline support for the installed game. The page is fetched fresh when
// there's a connection and from the cache when there isn't; everything else
// comes from the cache first. Each deploy stamps VERSION with the commit, so
// a new service worker installs and old caches are cleared.
const VERSION = 'dev';
const CACHE = `gridlock-${VERSION}`;
const FONTS = ['Regular', 'Italic', 'Fill', 'ShadeLeft', 'ShadeRight'].map((f) => `fonts/Megazoid-${f}.woff2`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch('./', { cache: 'no-cache' });
      const html = await page.clone().text();
      await cache.put('./', page);
      // The stylesheet, scripts, manifest and icons the page links to.
      const links = [...html.matchAll(/(?:href|src)="((?:style\.css|js\/|manifest|icons\/)[^"]*)"/g)].map((m) => m[1]);
      await cache.addAll([...links, ...FONTS]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put('./', fresh.clone());
          return fresh;
        } catch (e) {
          return (await cache.match('./')) || Response.error();
        }
      })()
    );
    return;
  }
  // Our own files and Google Fonts: cache first, and keep whatever loads.
  const ours = url.origin === self.location.origin;
  if (!ours && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })()
  );
});
