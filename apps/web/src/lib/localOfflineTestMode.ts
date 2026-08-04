/**
 * Modo de verificación reproducible, disponible únicamente en localhost.
 * Permite probar la misma PWA y su IndexedDB con `?modo-offline=1` sin tocar
 * la conexión de red del equipo ni afectar el despliegue de producción.
 */
export function enableLocalOfflineTestMode() {
  const localHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (!localHost || new URLSearchParams(window.location.search).get("modo-offline") !== "1") return;

  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => false,
  });
}
