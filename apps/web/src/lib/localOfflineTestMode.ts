/**
 * Modo de verificación reproducible, disponible únicamente en localhost.
 * Permite probar la misma PWA y su IndexedDB con `?modo-offline=1` sin tocar
 * la conexión de red del equipo ni afectar el despliegue de producción.
 */
export function enableLocalOfflineTestMode() {
  const localHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (!localHost) return;
  const params = new URLSearchParams(window.location.search);
  const startsOffline = params.get("modo-offline") === "1";
  const cutsConnection = params.get("modo-corte-internet") === "1";
  const cutsDuringBody = params.get("modo-corte-cuerpo") === "1";
  const hangsConnection = params.get("modo-red-colgada") === "1";
  if (!startsOffline && !cutsConnection && !cutsDuringBody && !hangsConnection) return;

  let online = !startsOffline;

  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });

  if (!cutsConnection && !cutsDuringBody && !hangsConnection) return;

  // Reproduce una petición que quedó esperando justo antes de perder la red.
  // Solo existe en localhost y permite comprobar que los AbortController
  // liberan tanto la sincronización como los loaders de las páginas.
  window.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (cutsDuringBody) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const abort = () => controller.error(signal?.reason ?? new DOMException("Sin conexión", "AbortError"));
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        },
      });
      return Promise.resolve(new Response(body, {
        headers: { "content-type": "application/json" },
        status: 200,
      }));
    }
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(signal?.reason ?? new DOMException("Sin conexión", "AbortError"));
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  }) as typeof window.fetch;

  if (cutsConnection || cutsDuringBody) {
    window.setTimeout(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    }, 500);
  }
}
