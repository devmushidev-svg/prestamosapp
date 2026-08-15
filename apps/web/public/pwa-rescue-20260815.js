/*
 * Migración de una sola ejecución para PWA instaladas antes del aviso global
 * de actualización. Esas versiones podían dejar indefinidamente un worker en
 * espera. El marcador vive fuera del precache de Workbox y sobrevive a futuras
 * compilaciones; por eso skipWaiting solo se usa durante este rescate.
 */
const rescueCacheName = "multiprestamos-pwa-migrations-v1";
const rescueDoneRequest = new Request(`${self.location.origin}/__pwa_migration__/prompt-global-v1-done`);
const rescuePendingRequest = new Request(`${self.location.origin}/__pwa_migration__/prompt-global-v1-pending`);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(rescueCacheName);
      const [done, pending] = await Promise.all([
        cache.match(rescueDoneRequest),
        cache.match(rescuePendingRequest),
      ]);

      if (done) return;

      // En una instalación nueva no hay nada que rescatar ni que recargar.
      if (!self.registration.active) {
        await cache.put(rescueDoneRequest, new Response("ok"));
        return;
      }

      if (!pending) {
        await cache.put(rescuePendingRequest, new Response("pending"));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(rescueCacheName);
      if (!(await cache.match(rescuePendingRequest))) return;

      await self.clients.claim();
      const windows = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });

      await Promise.allSettled(
        windows.map((client) => client.navigate(client.url)),
      );
      await cache.put(rescueDoneRequest, new Response("ok"));
      await cache.delete(rescuePendingRequest);
    })(),
  );
});
