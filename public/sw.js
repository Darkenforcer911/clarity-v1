importScripts("/notification-sw-utils.js");

const CACHE_NAME = "clarity-shell-v2";
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/notification-sw-utils.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request)),
    );
  }
});

self.addEventListener("push", (event) => {
  let value;
  try {
    value = event.data?.json();
  } catch {
    return;
  }
  const payload = self.ClarityNotificationUtils.parsePushPayload(value);
  if (!payload) return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { targetUrl: payload.targetUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = self.ClarityNotificationUtils.normalizeTargetUrl(
    event.notification.data?.targetUrl,
  );
  if (!targetUrl) return;

  event.waitUntil(
    self.ClarityNotificationUtils.openNotificationTarget(
      self.clients,
      targetUrl,
    ),
  );
});
