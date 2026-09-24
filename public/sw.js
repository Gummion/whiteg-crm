/* White G CRM — service worker: push notifications only (no offline caching, never breaks the app). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const VIBRATE = { urgent: [220, 90, 220, 90, 420], high: [180, 80, 180], normal: [120], low: [] };

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "White G CRM", body: event.data ? event.data.text() : "" }; }
  const priority = d.priority || "normal";
  const title = d.title || "White G CRM";
  const options = {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!(d.tag && d.renotify),
    requireInteraction: !!d.requireInteraction,
    vibrate: VIBRATE[priority] || VIBRATE.normal,
    silent: priority === "low",
    timestamp: Date.now(),
    data: { url: d.url || "/notifications" },
  };
  event.waitUntil((async () => {
    try { if (typeof d.badge === "number" && self.navigator.setAppBadge) await self.navigator.setAppBadge(d.badge); } catch {}
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        try { await c.focus(); await c.navigate(url); return; } catch {}
      }
    }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // the app re-syncs its subscription on next open; nothing to do offline
  event.waitUntil(Promise.resolve());
});
