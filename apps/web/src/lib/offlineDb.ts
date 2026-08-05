const DATABASE_NAME = "multiprestamos-offline";
const DATABASE_VERSION = 1;
const USER_SCOPE_STORAGE_KEY = "multiprestamos.offline-user-scope";
const BROADCAST_CHANNEL_NAME = "multiprestamos-offline-changes";

const CACHE_STORE = "cache";
const OUTBOX_STORE = "outbox";
const ALIAS_STORE = "aliases";
const CACHE_REVISION_KEY = "__cache-revision";
const OFFLINE_CACHE_NETWORK_GRACE_MS = 1500;

export type OfflineOperationType =
  | "business.upsert"
  | "customer.upsert"
  | "loan.create"
  | "payment.create"
  | "gestion.create"
  | "route.update";

export type OfflineOperationStatus = "pending" | "syncing" | "attention";

export type OfflineOperation<TPayload = unknown> = {
  id: string;
  scope: string;
  type: OfflineOperationType;
  payload: TPayload;
  entityId: string | null;
  requestId: string | null;
  dependsOn: string[];
  status: OfflineOperationStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueOfflineOperationInput<TPayload = unknown> = {
  id?: string;
  type: OfflineOperationType;
  payload: TPayload;
  entityId?: string | null;
  requestId?: string | null;
  dependsOn?: string[];
  status?: OfflineOperationStatus;
  nextAttemptAt?: string | null;
};

export type OfflineOperationListOptions = {
  statuses?: OfflineOperationStatus[];
  dueBefore?: string;
  limit?: number;
};

export type OfflineOperationPatch<TPayload = unknown> = Partial<
  Pick<
    OfflineOperation<TPayload>,
    "payload" | "entityId" | "requestId" | "dependsOn" | "status" | "attempts" | "lastError" | "nextAttemptAt"
  >
>;

export type OfflineDbChange = {
  scope: string | null;
  area: "scope" | "cache" | "outbox" | "aliases";
  action: "set" | "delete" | "update";
  key?: string;
};

type CacheRecord = {
  scope: string;
  key: string;
  value: unknown;
  updatedAt: string;
};

export type OfflineCacheEntry = {
  key: string;
  value: unknown;
};

type AliasRecord = {
  scope: string;
  localId: string;
  remoteId: string;
  updatedAt: string;
};

export class OfflineDatabaseUnavailableError extends Error {
  constructor(message = "El almacenamiento sin conexión no está disponible en este navegador.") {
    super(message);
    this.name = "OfflineDatabaseUnavailableError";
  }
}

export class OfflineUserScopeError extends Error {
  constructor() {
    super("No hay un usuario activo para acceder a los datos sin conexión.");
    this.name = "OfflineUserScopeError";
  }
}

export const offlineDbEvents = new EventTarget();

let currentUserScope: string | null | undefined;
let databasePromise: Promise<IDBDatabase> | null = null;
let broadcastChannel: BroadcastChannel | null | undefined;
let preferOfflineCache = false;

function nowIso(): string {
  return new Date().toISOString();
}

function getStoredScope(): string | null {
  try {
    return globalThis.localStorage?.getItem(USER_SCOPE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistScope(scope: string | null): void {
  try {
    if (scope) globalThis.localStorage?.setItem(USER_SCOPE_STORAGE_KEY, scope);
    else globalThis.localStorage?.removeItem(USER_SCOPE_STORAGE_KEY);
  } catch {
    // La sesión actual aún puede usar memoria aunque el navegador bloquee localStorage.
  }
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (broadcastChannel !== undefined) return broadcastChannel;
  if (typeof globalThis.BroadcastChannel !== "function") {
    broadcastChannel = null;
    return null;
  }
  broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  broadcastChannel.addEventListener("message", (event: MessageEvent<OfflineDbChange>) => {
    if (!event.data || typeof event.data !== "object") return;
    offlineDbEvents.dispatchEvent(new CustomEvent<OfflineDbChange>("change", { detail: event.data }));
  });
  return broadcastChannel;
}

function emitChange(change: OfflineDbChange): void {
  offlineDbEvents.dispatchEvent(new CustomEvent<OfflineDbChange>("change", { detail: change }));
  getBroadcastChannel()?.postMessage(change);
}

export function subscribeOfflineChanges(listener: (change: OfflineDbChange) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<OfflineDbChange>).detail);
  offlineDbEvents.addEventListener("change", handler);
  getBroadcastChannel();
  return () => offlineDbEvents.removeEventListener("change", handler);
}

export function setOfflineUserScope(scope: string | null): void {
  const normalized = scope?.trim() || null;
  const previous = getOfflineUserScope();
  currentUserScope = normalized;
  persistScope(normalized);
  if (previous !== normalized) emitChange({ scope: normalized, area: "scope", action: "set" });
}

export function getOfflineUserScope(): string | null {
  if (currentUserScope === undefined) currentUserScope = getStoredScope();
  return currentUserScope;
}

function requireUserScope(): string {
  const scope = getOfflineUserScope();
  if (!scope) throw new OfflineUserScopeError();
  return scope;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("Falló una operación de almacenamiento sin conexión.")),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("Se canceló una operación de almacenamiento sin conexión.")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("Falló una operación de almacenamiento sin conexión.")),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof globalThis.indexedDB === "undefined") {
    return Promise.reject(new OfflineDatabaseUnavailableError());
  }

  databasePromise = new Promise((resolve, reject) => {
    let settled = false;
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        const store = database.createObjectStore(CACHE_STORE, { keyPath: ["scope", "key"] });
        store.createIndex("scope", "scope", { unique: false });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("scope", "scope", { unique: false });
        store.createIndex("scope_status", ["scope", "status"], { unique: false });
      }
      if (!database.objectStoreNames.contains(ALIAS_STORE)) {
        const store = database.createObjectStore(ALIAS_STORE, { keyPath: ["scope", "localId"] });
        store.createIndex("scope", "scope", { unique: false });
      }
    });
    request.addEventListener("success", () => {
      const database = request.result;
      database.addEventListener("versionchange", () => {
        database.close();
        databasePromise = null;
      });
      if (!settled) {
        settled = true;
        resolve(database);
      } else {
        database.close();
      }
    });
    request.addEventListener("error", () => {
      databasePromise = null;
      if (settled) return;
      settled = true;
      reject(
        new OfflineDatabaseUnavailableError(
          `No se pudo abrir el almacenamiento sin conexión: ${request.error?.message ?? "error desconocido"}`,
        ),
      );
    });
    request.addEventListener("blocked", () => {
      databasePromise = null;
      if (settled) return;
      settled = true;
      reject(
        new OfflineDatabaseUnavailableError(
          "No se pudo actualizar el almacenamiento sin conexión porque otra pestaña mantiene una versión anterior abierta.",
        ),
      );
    });
  });
  return databasePromise;
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(CACHE_STORE).get([scope, key]) as IDBRequest<CacheRecord | undefined>,
  );
  await transactionComplete(transaction);
  return record?.value as T | undefined;
}

export class OfflineCacheMissError extends Error {
  constructor() {
    super("Esta información todavía no fue preparada para trabajar sin Internet.");
    this.name = "OfflineCacheMissError";
  }
}

export class OfflineCacheChangedError extends Error {
  constructor() {
    super("Los datos locales cambiaron durante la preparación. La copia anterior se conservó.");
    this.name = "OfflineCacheChangedError";
  }
}

/** Permite abrir IndexedDB cuando hay Wi-Fi pero la sesión remota no responde. */
export function setPreferOfflineCache(prefer: boolean): void {
  preferOfflineCache = prefer;
}

/** Permite omitir tareas remotas auxiliares cuando ya falló la conectividad. */
export function isOfflineCachePreferred(): boolean {
  return preferOfflineCache;
}

function normalizeRevision(value: unknown): number {
  const numericValue = Number(value ?? 0);
  return Number.isSafeInteger(numericValue) && numericValue >= 0 ? numericValue : 0;
}

function revisionValue(record: CacheRecord | undefined): number {
  const value = normalizeRevision(record?.value);
  return value;
}

function bumpCacheRevision(store: IDBObjectStore, scope: string): void {
  const request = store.get([scope, CACHE_REVISION_KEY]) as IDBRequest<CacheRecord | undefined>;
  request.addEventListener("success", () => {
    store.put({
      scope,
      key: CACHE_REVISION_KEY,
      value: revisionValue(request.result) + 1,
      updatedAt: nowIso(),
    } satisfies CacheRecord);
  }, { once: true });
}

export async function getOfflineCacheRevision(): Promise<number> {
  return normalizeRevision(await readCache<number>(CACHE_REVISION_KEY).catch(() => 0));
}

export async function writeCache<T>(key: string, value: T, expectedScope?: string): Promise<void> {
  const scope = requireUserScope();
  if (expectedScope && scope !== expectedScope) throw new OfflineUserScopeError();
  const database = await openDatabase();
  if (expectedScope && getOfflineUserScope() !== expectedScope) throw new OfflineUserScopeError();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  const store = transaction.objectStore(CACHE_STORE);
  store.put({ scope, key, value, updatedAt: nowIso() } satisfies CacheRecord);
  bumpCacheRevision(store, scope);
  await transactionComplete(transaction);
  emitChange({ scope, area: "cache", action: "set", key });
}

/**
 * Publica varias partes de una copia offline en una sola transacción. Así el
 * manifiesto nunca queda confirmado si una de las colecciones no pudo
 * escribirse (por ejemplo, por falta de espacio en el dispositivo).
 */
export async function writeCacheBatch(
  entries: readonly OfflineCacheEntry[],
  expectedScope?: string,
  options: { expectedRevision?: number; requireEmptyOutbox?: boolean } = {},
): Promise<void> {
  const scope = requireUserScope();
  if (expectedScope && scope !== expectedScope) {
    throw new OfflineUserScopeError();
  }
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.key, entry] as const)).values(),
  );
  if (uniqueEntries.length === 0) return;

  const database = await openDatabase();
  if (expectedScope && getOfflineUserScope() !== expectedScope) {
    throw new OfflineUserScopeError();
  }
  const storeNames = options.requireEmptyOutbox ? [CACHE_STORE, OUTBOX_STORE] : [CACHE_STORE];
  const transaction = database.transaction(storeNames, "readwrite");
  const store = transaction.objectStore(CACHE_STORE);
  const completed = transactionComplete(transaction);
  const revisionRequest = store.get([scope, CACHE_REVISION_KEY]) as IDBRequest<CacheRecord | undefined>;
  const outboxRequest = options.requireEmptyOutbox
    ? transaction.objectStore(OUTBOX_STORE).index("scope").getAll(scope) as IDBRequest<OfflineOperation[]>
    : null;
  const [revisionRecord, outbox] = await Promise.all([
    requestResult(revisionRequest),
    outboxRequest ? requestResult(outboxRequest) : Promise.resolve([]),
  ]);
  const currentRevision = revisionValue(revisionRecord);
  if (options.expectedRevision !== undefined && currentRevision !== options.expectedRevision) {
    transaction.abort();
    await completed.catch(() => undefined);
    throw new OfflineCacheChangedError();
  }
  if (outbox.length > 0) {
    transaction.abort();
    await completed.catch(() => undefined);
    throw new Error("Hay cambios pendientes en este dispositivo. La copia local se conservó.");
  }
  const updatedAt = nowIso();
  uniqueEntries.forEach(({ key, value }) => {
    store.put({ scope, key, value, updatedAt } satisfies CacheRecord);
  });
  store.put({
    scope,
    key: CACHE_REVISION_KEY,
    value: currentRevision + 1,
    updatedAt,
  } satisfies CacheRecord);
  await completed;
  uniqueEntries.forEach(({ key }) => emitChange({ scope, area: "cache", action: "set", key }));
}

export async function updateCache<T>(
  key: string,
  updater: (current: T | undefined) => T | undefined,
): Promise<T | undefined> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  const store = transaction.objectStore(CACHE_STORE);
  bumpCacheRevision(store, scope);
  const completed = transactionComplete(transaction);
  const mutation = new Promise<T | undefined>((resolve, reject) => {
    const request = store.get([scope, key]) as IDBRequest<CacheRecord | undefined>;
    request.addEventListener("success", () => {
      try {
        const updated = updater(request.result?.value as T | undefined);
        if (updated === undefined) store.delete([scope, key]);
        else store.put({ scope, key, value: updated, updatedAt: nowIso() } satisfies CacheRecord);
        resolve(updated);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
  const [next] = await Promise.all([mutation, completed]);
  emitChange({ scope, area: "cache", action: next === undefined ? "delete" : "update", key });
  return next;
}

export async function deleteCache(key: string): Promise<void> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  const store = transaction.objectStore(CACHE_STORE);
  store.delete([scope, key]);
  bumpCacheRevision(store, scope);
  await transactionComplete(transaction);
  emitChange({ scope, area: "cache", action: "delete", key });
}

function errorProperty(error: unknown, property: string): unknown {
  return typeof error === "object" && error !== null && property in error
    ? (error as Record<string, unknown>)[property]
    : undefined;
}

export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof OfflineCacheMissError) return true;
  const name = String(errorProperty(error, "name") ?? "").toLowerCase();
  const code = String(errorProperty(error, "code") ?? "").toUpperCase();
  const rawStatus = errorProperty(error, "status");
  const status = typeof rawStatus === "number"
    ? rawStatus
    : typeof rawStatus === "string" && rawStatus.trim() !== ""
      ? Number(rawStatus)
      : Number.NaN;
  const message = String(
    error instanceof Error ? error.message : errorProperty(error, "message") ?? error ?? "",
  ).toLowerCase();

  if (["aborterror", "timeouterror", "networkerror", "fetcherror", "authretryablefetcherror"].includes(name)) return true;
  if (code === "ABORT_ERR" || code === "TIMEOUT_ERR" || code === "PGRST002") return true;
  if (status === 0) return true;
  if ([502, 503, 504, 520].includes(status)) return true;
  if (/^(ECONN|ENET|EHOST|ETIMEDOUT|NETWORK_)/.test(code)) return true;
  if (Number.isFinite(status) && status >= 400) return false;
  if (/^(?:PGRST|23|42|P0|XX)[A-Z0-9]*$/.test(code)) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return /aborterror|timeouterror|failed to fetch|networkerror|network request failed|load failed|timed out|tardó demasiado|connection (?:failed|refused|reset)|internet disconnected|\boffline\b|err_(?:internet|network|connection)/i.test(message);
}

function operationAffectsCache(operation: OfflineOperation, key: string): boolean {
  if (key === "business-config") return operation.type === "business.upsert";
  if (key === "customers") return operation.type === "customer.upsert" || operation.type === "route.update";
  if (key === "loans" || key === "installments") {
    return operation.type === "loan.create" || operation.type === "payment.create";
  }
  if (key === "payments" || key === "payment-applications") return operation.type === "payment.create";
  if (key === "gestiones") return operation.type === "gestion.create";
  if (key.startsWith("loan-detail:")) {
    const loanId = key.slice("loan-detail:".length);
    if (operation.type === "loan.create") return operation.entityId === loanId;
    if (operation.type === "payment.create") {
      const payload = operation.payload as { input?: { prestamoId?: string } };
      return payload.input?.prestamoId === loanId;
    }
  }
  if (key.startsWith("payment-detail:")) {
    const paymentId = key.slice("payment-detail:".length);
    return operation.type === "payment.create" && operation.entityId === paymentId;
  }
  return false;
}

export async function readThroughCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const requestScope = getOfflineUserScope();
  const preserveOptimisticCopy = requestScope
    ? await listOfflineOperations().then((operations) => operations.some((item) => operationAffectsCache(item, key))).catch(() => false)
    : false;
  const browserIsOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (browserIsOffline || preserveOptimisticCopy) {
    const cached = await readCache<T>(key);
    if (cached !== undefined) return cached;
    if (browserIsOffline) throw new OfflineCacheMissError();
  }
  if (preferOfflineCache) {
    const cached = await readCache<T>(key);
    if (cached === undefined) throw new OfflineCacheMissError();
    const preferredScope = getOfflineUserScope();
    if (!preferredScope) throw new OfflineUserScopeError();
    const preferredRevision = await getOfflineCacheRevision();

    // Con una sesión aún no confirmada damos una ventana corta al servidor.
    // Si responde, la vista nace fresca; si no, abre la copia sin esperar los
    // timeouts largos. Una respuesta tardía se descarta para no pisar cambios.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let fallbackWon = false;
    const fresh = loader().then(async (value) => {
      if (fallbackWon) return cached;
      await writeCacheBatch(
        [{ key, value }],
        preferredScope,
        { expectedRevision: preferredRevision, requireEmptyOutbox: true },
      );
      return value;
    });
    const fallback = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => {
        fallbackWon = true;
        resolve(cached);
      }, OFFLINE_CACHE_NETWORK_GRACE_MS);
    });
    try {
      return await Promise.race([fresh, fallback]);
    } catch {
      return cached;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
  try {
    const fresh = await loader();
    if (requestScope) await writeCache(key, fresh, requestScope);
    return fresh;
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    preferOfflineCache = true;
    const cached = await readCache<T>(key);
    if (cached !== undefined) return cached;
    throw error;
  }
}

function createOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new OfflineDatabaseUnavailableError(
      "Este navegador no puede crear identificadores seguros para operaciones sin conexión.",
    );
  }
  return globalThis.crypto.randomUUID();
}

function sameQueuedOperation(left: OfflineOperation, right: OfflineOperation): boolean {
  return left.type === right.type
    && left.entityId === right.entityId
    && left.requestId === right.requestId
    && JSON.stringify(left.payload) === JSON.stringify(right.payload)
    && JSON.stringify(left.dependsOn) === JSON.stringify(right.dependsOn);
}

export async function queueOfflineOperation<TPayload>(
  input: QueueOfflineOperationInput<TPayload>,
): Promise<OfflineOperation<TPayload>> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const timestamp = nowIso();
  const operation: OfflineOperation<TPayload> = {
    id: input.id ?? createOperationId(),
    scope,
    type: input.type,
    payload: input.payload,
    entityId: input.entityId ?? null,
    requestId: input.requestId ?? null,
    dependsOn: [...new Set(input.dependsOn ?? [])],
    status: input.status ?? "pending",
    attempts: 0,
    lastError: null,
    nextAttemptAt: input.nextAttemptAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let transaction: IDBTransaction;
  try {
    // Los movimientos de dinero deben llegar al disco antes de mostrarse como
    // guardados. Navegadores antiguos ignoran esta opción mediante el fallback.
    transaction = database.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  } catch {
    transaction = database.transaction(OUTBOX_STORE, "readwrite");
  }
  const store = transaction.objectStore(OUTBOX_STORE);
  const completed = transactionComplete(transaction);
  const mutation = new Promise<OfflineOperation<TPayload> | undefined>((resolve, reject) => {
    const request = store.get(operation.id) as IDBRequest<OfflineOperation<TPayload> | undefined>;
    request.addEventListener("success", () => {
      try {
        if (!request.result) store.add(operation);
        resolve(request.result);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
  const [existing] = await Promise.all([mutation, completed]);
  if (existing) {
    if (existing.scope !== scope || !sameQueuedOperation(existing, operation)) {
      throw new Error("El identificador de la operación sin conexión ya fue usado con datos diferentes.");
    }
    return existing;
  }
  emitChange({ scope, area: "outbox", action: "set", key: operation.id });
  return operation;
}

export async function listOfflineOperations(
  options: OfflineOperationListOptions = {},
): Promise<OfflineOperation[]> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, "readonly");
  const rows = await requestResult(
    transaction.objectStore(OUTBOX_STORE).index("scope").getAll(scope) as IDBRequest<OfflineOperation[]>,
  );
  await transactionComplete(transaction);

  const statuses = options.statuses?.length ? new Set(options.statuses) : null;
  const limit = options.limit == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(options.limit));
  return rows
    .filter((operation) => !statuses || statuses.has(operation.status))
    .filter((operation) => !options.dueBefore || !operation.nextAttemptAt || operation.nextAttemptAt <= options.dueBefore)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export async function countOfflineOperations(statuses?: OfflineOperationStatus[]): Promise<number> {
  return (await listOfflineOperations({ statuses })).length;
}

export async function updateOfflineOperation<TPayload = unknown>(
  id: string,
  patch: OfflineOperationPatch<TPayload>,
): Promise<OfflineOperation<TPayload> | null> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, "readwrite");
  const store = transaction.objectStore(OUTBOX_STORE);
  const completed = transactionComplete(transaction);
  const mutation = new Promise<OfflineOperation<TPayload> | null>((resolve, reject) => {
    const request = store.get(id) as IDBRequest<OfflineOperation<TPayload> | undefined>;
    request.addEventListener("success", () => {
      try {
        const current = request.result;
        if (!current || current.scope !== scope) {
          resolve(null);
          return;
        }
        const next: OfflineOperation<TPayload> = {
          ...current,
          ...patch,
          dependsOn: patch.dependsOn ? [...new Set(patch.dependsOn)] : current.dependsOn,
          updatedAt: nowIso(),
        };
        store.put(next);
        resolve(next);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
  const [updated] = await Promise.all([mutation, completed]);
  if (!updated) return null;
  emitChange({ scope, area: "outbox", action: "update", key: id });
  return updated;
}

export async function removeOfflineOperation(id: string): Promise<void> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, "readwrite");
  const store = transaction.objectStore(OUTBOX_STORE);
  const completed = transactionComplete(transaction);
  const mutation = new Promise<boolean>((resolve, reject) => {
    const request = store.get(id) as IDBRequest<OfflineOperation | undefined>;
    request.addEventListener("success", () => {
      try {
        const matches = request.result?.scope === scope;
        if (matches) store.delete(id);
        resolve(matches);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
  const [removed] = await Promise.all([mutation, completed]);
  if (removed) emitChange({ scope, area: "outbox", action: "delete", key: id });
}

export async function setOfflineAlias(localId: string, remoteId: string): Promise<void> {
  const scope = requireUserScope();
  if (!localId.trim() || !remoteId.trim()) throw new Error("El alias local y remoto son obligatorios.");
  if (localId === remoteId) return;
  const database = await openDatabase();
  const transaction = database.transaction(ALIAS_STORE, "readwrite");
  transaction.objectStore(ALIAS_STORE).put({
    scope,
    localId,
    remoteId,
    updatedAt: nowIso(),
  } satisfies AliasRecord);
  await transactionComplete(transaction);
  emitChange({ scope, area: "aliases", action: "set", key: localId });
}

export async function resolveOfflineAlias(id: string): Promise<string> {
  const scope = requireUserScope();
  const database = await openDatabase();
  const visited = new Set<string>();
  let current = id;

  while (true) {
    if (visited.has(current)) {
      throw new Error("Se detectó un ciclo al resolver identificadores sin conexión.");
    }
    visited.add(current);
    const transaction = database.transaction(ALIAS_STORE, "readonly");
    const completed = transactionComplete(transaction);
    const [record] = await Promise.all([
      requestResult(
        transaction.objectStore(ALIAS_STORE).get([scope, current]) as IDBRequest<AliasRecord | undefined>,
      ),
      completed,
    ]);
    if (!record) break;
    current = record.remoteId;
  }
  return current;
}
