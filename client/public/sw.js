/**
 * WebWaka Logistics Service Worker [Part 6 — PWA First, Offline First]
 * Blueprint: "PWA with service worker for offline caching and background sync."
 * Cache-first strategy for static assets; network-first for API calls.
 */

const CACHE_NAME = "webwaka-logistics-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// ─────────────────────────────────────────────────────────────────────────────
// Install — cache static assets
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Activate — clean up old caches
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─────────────────────────────────────────────────────────────────────────────
// Fetch — network-first for API, cache-first for static assets
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network-first, no caching
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: "offline", message: "Request queued for sync" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful GET responses
        if (
          event.request.method === "GET" &&
          response.status === 200 &&
          !url.pathname.startsWith("/api/")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Background Sync — process mutation queue when back online
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "ww-mutation-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SYNC_REQUESTED" });
        });
      })
    );
  }
});
