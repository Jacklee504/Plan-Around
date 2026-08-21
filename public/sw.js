// Runtime-caching only - there is no build-time precache manifest here, so a
// page/asset is only available offline once it has actually been visited.
// Bump this on any change to the caching logic below to drop stale entries.
const CACHE_VERSION = "planaround-v1";
const STATIC_ASSET_PATTERN = /\.(png|jpg|jpeg|svg|ico|woff2?)$/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // HTML navigations: prefer the network (so a new deploy is picked up
  // immediately while online), fall back to whatever was last cached when
  // offline, and fall back to the shell page if this exact page was never visited.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  // Next's static chunks are content-hashed and immutable, and images/icons
  // rarely change, so both are safe to serve cache-first once fetched once.
  if (request.url.includes("/_next/static/") || STATIC_ASSET_PATTERN.test(new URL(request.url).pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
