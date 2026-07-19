// Kill-switch service worker.
// TaskFlow no longer uses a service worker at all. Any device still holding an
// older registration (possibly one that actively served cached/stale pages)
// will eventually fetch this file for its periodic update check, see it changed,
// and activate it. On activate it wipes every cache, unregisters itself, and
// force-reloads any open tab it controls so the device converges back to a
// plain network-only page with no service worker at all.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url))))
  );
});

self.addEventListener("fetch", (event) => {
  // Do not serve anything from cache.
  // Let the browser/network handle every request normally.
  return;
});