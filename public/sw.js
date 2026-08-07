const VERSION = "bynex-pwa-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PUBLIC_CACHE = `${VERSION}-public`;
const OFFLINE_URL = "/offline";

const STATIC_SHELL = [
  OFFLINE_URL,
  "/brand/bynex-mark.png",
  "/brand/bynex-wordmark.png",
];

const PRIVATE_PREFIXES = [
  "/api/",
  "/app",
  "/field",
  "/start",
  "/admin",
  "/account",
  "/auth",
  "/login",
  "/signup",
  "/onboarding",
  "/pilot-login",
  "/kundportal",
  "/ata/",
  "/offert/",
  "/q/",
  "/projects",
];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, PUBLIC_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/") || isPrivatePath(url.pathname)) {
    if (request.mode === "navigate") {
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(PUBLIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match(OFFLINE_URL)),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
