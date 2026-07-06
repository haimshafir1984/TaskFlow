// No offline cache.
// This service worker only cleans old TaskFlow caches and then gets out of the way.

const CACHE_PREFIX = "taskflow-pwa";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Do not serve anything from cache.
  // Let the browser/network handle every request normally.
  return;
});