// Toolbox service worker — installable PWA + offline app shell.
//
// Code (html / js / css / svg) is fetched NETWORK-FIRST and always bypasses the
// HTTP cache (cache:"reload"), so a fresh deploy is picked up immediately — even
// when a previous response was cached "immutable". Fonts/images are cache-first
// (they never change). API requests and mutations are never intercepted, so
// auth/data are always live.
const CACHE = "toolbox-v2";
const SHELL = ["/", "/assets/css/output.css", "/assets/js/app.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        // Bypass the HTTP cache so we can never precache a stale "immutable" copy.
        Promise.all(
          SHELL.map((u) =>
            fetch(u, { cache: "reload" })
              .then((r) => (r && r.ok ? c.put(u, r) : null))
              .catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Always hit the network (bypassing the HTTP cache), update the cache, and only
// fall back to the cache when offline.
function networkFirst(req, key) {
  return fetch(req, { cache: "reload" })
    .then((res) => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key || req, copy));
      }
      return res;
    })
    .catch(() => caches.match(key || req).then((r) => r || (key ? caches.match(req) : undefined)));
}

// Serve from cache, fetching + caching on a miss (for assets that never change).
function cacheFirst(req) {
  return caches.match(req).then(
    (cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // mutations pass straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API (auth/data)

  // App navigations: always fetch a fresh shell, fall back to cache when offline.
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, "/"));
    return;
  }
  // Code & generated assets: network-first so deploys are picked up at once.
  if (/\.(?:js|mjs|css|svg|json|html)$/.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }
  // Fonts, raster icons: cache-first (content-stable).
  e.respondWith(cacheFirst(req));
});
