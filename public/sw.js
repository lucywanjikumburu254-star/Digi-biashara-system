/*
 * Digi Biashara PWA service worker.
 * Network-first by design: private dashboards, business data, receipts,
 * authentication and payment requests are never cached.
 * Bump APP_RELEASE with each PWA release so installed clients can detect updates.
 */
const APP_RELEASE = "2026-11-16.2";
void APP_RELEASE;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Network-only navigation handler: offline feedback without retaining private pages.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(() =>
      new Response(
        "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Digi Biashara</title><body style=\"font-family:Arial,sans-serif;background:#fff8f0;color:#263238;padding:32px;line-height:1.6\"><h2>Digi Biashara</h2><p>An internet connection is needed to open your business workspace and securely load the latest records.</p><p>Please reconnect and try again.</p></body></html>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
      )
    )
  );
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
