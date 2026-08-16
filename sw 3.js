// Service Worker de Hábitos — offline-first.
//
// IMPORTANTE PARA RENZO: cada vez que subas una versión nueva de index.html,
// sube también este archivo con CACHE_VERSION incrementado (v2 -> v3 -> v4...).
// Si no cambias el número, el navegador seguirá sirviendo la versión vieja
// desde la caché y no vas a ver tus cambios.
const CACHE_VERSION = "v3";
const CACHE_NAME = "habitos-" + CACHE_VERSION;

// Recursos del propio sitio (mismo origen).
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Librerías de terceros (CDN) que la app necesita para funcionar.
const THIRD_PARTY = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&display=swap"
];

// Guarda UN recurso en caché sin dejar que su fallo tumbe todo lo demás.
// (A diferencia de cache.addAll, que es todo-o-nada: si un solo recurso
// falla, cache.addAll cancela la instalación completa y no se guarda nada.)
async function cacheOne(cache, url, opts) {
  try {
    const req = new Request(url, opts);
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) {
      await cache.put(req, res);
    }
  } catch (e) {
    // Se ignora a propósito: si falla ahora (sin red, CDN caído, etc.),
    // el fetch handler de abajo lo intentará cachear la próxima vez
    // que cargue con éxito.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cada recurso por separado — nunca todo-o-nada.
      await Promise.all(APP_SHELL.map((url) => cacheOne(cache, url)));
      await Promise.all(THIRD_PARTY.map((url) => cacheOne(cache, url, { mode: "no-cors" })));

      // Avisa a la pestaña/app abierta que ya terminó de guardar todo,
      // para que Renzo pueda VER en pantalla que la copia offline quedó lista.
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      clientsList.forEach((client) => client.postMessage({ type: "HABITOS_CACHE_READY" }));

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
        networkFetch;
        return cached;
      }

      const fresh = await networkFetch;
      if (fresh) return fresh;

      if (req.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return new Response("Sin conexión y sin copia guardada todavía.", { status: 503, statusText: "Offline" });
    })()
  );
});
