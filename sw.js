/* TripTally service worker — cache-first, version-stamped.
   Bump CACHE on every release that changes index.html or assets
   (see README → "Releasing / bumping the cache version"). */
const CACHE = "triptally-v9";

const ASSETS = [
  "./",
  "./index.html",
  "./js/core.js",
  "./js/vendor/qrcode.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

// Precache the app shell. Do NOT skipWaiting here — let the page drive updates.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

// Drop old caches, then take control of open pages.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// The page tells a waiting worker to activate immediately.
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Cache-first; fall back to network; navigations fall back to cached index.html.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
