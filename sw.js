// Service Worker de Hábitos — offline-first.
//
// IMPORTANTE PARA RENZO: cada vez que subas una versión nueva de index.html,
// sube también este archivo con CACHE_VERSION incrementado (v1 -> v2 -> v3...).
// Si no cambias el número, el navegador seguirá sirviendo la versión vieja
// desde la caché y no vas a ver tus cambios.
const CACHE_VERSION = "v1";
const CACHE_NAME = "habitos-" + CACHE_VERSION;

// Recursos del propio sitio (mismo origen) que se cachean de entrada.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Librerías de terceros (CDN) que la app necesita para funcionar.
// Se cachean con fetch en modo "no-cors" para no depender de que el CDN
// mande cabeceras CORS perfectas — así una falla en una no tumba la instalación entera.
const THIRD_PARTY = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Same-origin: si esto falla, queremos saberlo (no atrapamos el error).
      await cache.addAll(APP_SHELL);

      // Cross-origin: cada uno por separado, con no-cors, y sin dejar que
      // un fallo puntual (ej. sin red en este momento) rompa toda la instalación.
      await Promise.all(
        THIRD_PARTY.map(async (url) => {
          try {
            const req = new Request(url, { mode: "no-cors" });
            const res = await fetch(req);
            await cache.put(req, res);
          } catch (e) {
            // Si no hay red ahora mismo, el runtime caching del fetch handler
            // lo intentará cachear la próxima vez que sí cargue con éxito.
          }
        })
      );

      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("habitos-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// Estrategia: cache-first con actualización en segundo plano (stale-while-revalidate).
// Sirve rápido desde caché y, si hay red, refresca la copia guardada para la próxima vez.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreVary: true });

      const networkFetch = fetch(req.mode === "navigate" ? req : new Request(req.url, { mode: req.mode === "cors" ? "cors" : "no-cors" }))
        .then((res) => {
          cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Actualiza en segundo plano sin bloquear la respuesta.
        networkFetch;
        return cached;
      }

      const fresh = await networkFetch;
      if (fresh) return fresh;

      // Sin caché y sin red: si es una navegación, al menos intenta servir el shell.
      if (req.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return new Response("Sin conexión y sin copia guardada todavía.", { status: 503, statusText: "Offline" });
    })()
  );
});
