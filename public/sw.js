/*
 * Digi Biashara service worker.
 * Deliberately does not cache pages, API responses, business records,
 * receipts, authentication data, or payment requests.
 * This worker provides safe update activation only; the app remains online-first.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("digi-biashara-pwa-"))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});
