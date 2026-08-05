const DEFAULT_NETWORK_TIMEOUT_MS = 8_000;
const STORAGE_WRITE_TIMEOUT_MS = 45_000;
const TRANSIENT_NETWORK_STATUSES = new Set([502, 503, 504, 520]);

function networkError(message: string, name: "AbortError" | "TimeoutError") {
  const error = new Error(message);
  error.name = name;
  return error;
}

function isAbortFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  const name = String((error as { name?: unknown }).name).toLowerCase();
  return name === "aborterror" || name === "timeouterror";
}

function connectionFailure(cause: unknown): Error {
  const error = networkError("No se pudo conectar con el servicio.", "AbortError") as Error & {
    cause?: unknown;
  };
  error.cause = cause;
  return error;
}

function sourceSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | null {
  if (init?.signal) return init.signal;
  return typeof Request !== "undefined" && input instanceof Request ? input.signal : null;
}

function requestTimeoutMs(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method
    ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"))
    .toUpperCase();
  const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const writesStorageObject = requestUrl.includes("/storage/v1/object")
    && !requestUrl.includes("/storage/v1/object/sign/")
    && method !== "GET"
    && method !== "HEAD";
  return writesStorageObject
    ? STORAGE_WRITE_TIMEOUT_MS
    : DEFAULT_NETWORK_TIMEOUT_MS;
}

async function bufferResponse(response: Response): Promise<Response> {
  if (!response.body) return response;
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  // El navegador ya entregó el contenido descomprimido. Estos encabezados
  // describían el transporte original y no el Response recreado en memoria.
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * Fetch usado por Supabase y las fotos. Cancela inmediatamente una solicitud
 * iniciada con red cuando el navegador avisa que se perdió la conexión. El
 * plazo también cubre redes que siguen diciendo "online" sin tener Internet.
 */
export const offlineAwareFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const inheritedSignal = sourceSignal(input, init);
  const abortFromSource = () => controller.abort(
    inheritedSignal?.reason ?? networkError("La solicitud fue cancelada.", "AbortError"),
  );
  const abortForOffline = () => controller.abort(
    networkError("Se perdió la conexión a Internet.", "AbortError"),
  );
  const abortForTimeout = () => controller.abort(
    // PostgREST no reintenta AbortError. Usar ese nombre evita convertir un
    // plazo de 8 s en cuatro intentos con backoff antes de abrir la caché.
    networkError("La conexión tardó demasiado en responder.", "AbortError"),
  );

  if (inheritedSignal?.aborted) abortFromSource();
  else inheritedSignal?.addEventListener("abort", abortFromSource, { once: true });

  if (typeof window !== "undefined") {
    if (!navigator.onLine) abortForOffline();
    else window.addEventListener("offline", abortForOffline, { once: true });
  }
  const timeoutId = setTimeout(abortForTimeout, requestTimeoutMs(input, init));

  try {
    const response = await globalThis.fetch(input, { ...init, signal: controller.signal });
    // fetch() resuelve al recibir encabezados. Consumir el cuerpo aquí mantiene
    // activo el mismo AbortController hasta que JSON, archivos o fotos estén
    // completos; de otro modo un corte durante res.text()/blob() volvería a colgar.
    const buffered = await bufferResponse(response);
    // PostgREST reintenta algunos fallos temporales con Retry-After. Convertirlos
    // en AbortError evita que una pantalla permanezca cargando varios intentos.
    if (TRANSIENT_NETWORK_STATUSES.has(buffered.status)) {
      throw networkError("El servicio no está disponible temporalmente.", "AbortError");
    }
    return buffered;
  } catch (cause) {
    if (controller.signal.aborted) throw controller.signal.reason ?? cause;
    if (isAbortFailure(cause)) throw cause;
    // Los navegadores reportan una pérdida de red como TypeError. Normalizarla
    // también impide los reintentos internos y activa la copia local enseguida.
    throw connectionFailure(cause);
  } finally {
    clearTimeout(timeoutId);
    inheritedSignal?.removeEventListener("abort", abortFromSource);
    if (typeof window !== "undefined") window.removeEventListener("offline", abortForOffline);
  }
};

/** Limita promesas locales de Auth que pueden esperar indefinidamente un lock. */
export function withTimeout<T>(operation: PromiseLike<T>, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => clearTimeout(timeoutId);
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const timeoutId = setTimeout(
      () => rejectOnce(networkError("La operación tardó demasiado en responder.", "TimeoutError")),
      timeoutMs,
    );
    Promise.resolve(operation).then(resolveOnce, rejectOnce);
  });
}

/**
 * Además del plazo, libera la interfaz en el mismo instante en que llega el
 * evento offline. La operación de red subyacente usa offlineAwareFetch y se
 * aborta por el mismo evento.
 */
export function withOnlineDeadline<T>(operation: PromiseLike<T>, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      if (typeof window !== "undefined") window.removeEventListener("offline", handleOffline);
    };
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleOffline = () => rejectOnce(networkError("Se perdió la conexión a Internet.", "AbortError"));
    const timeoutId = setTimeout(
      () => rejectOnce(networkError("La conexión tardó demasiado en responder.", "TimeoutError")),
      timeoutMs,
    );

    Promise.resolve(operation).then(resolveOnce, rejectOnce);
    if (typeof window !== "undefined") {
      if (!navigator.onLine) handleOffline();
      else window.addEventListener("offline", handleOffline, { once: true });
    }
  });
}
