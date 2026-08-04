import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  listOfflineOperations,
  removeOfflineOperation,
  setOfflineUserScope,
  subscribeOfflineChanges,
  type OfflineOperation,
} from "../lib/offlineDb";
import { retryOfflineOperation, syncOfflineOperations } from "../lib/offlineSyncService";
import { isOfflineWorkspacePrepared, prepareOfflineWorkspace } from "../lib/offlineWorkspace";
import { supabase } from "../lib/supabase";

type OfflineState = {
  online: boolean;
  syncing: boolean;
  preparing: boolean;
  prepared: boolean;
  pending: number;
  attention: number;
  issues: OfflineOperation[];
  lastSync: string | null;
  storagePersistent: boolean | null;
  error: string;
  syncNow: () => Promise<void>;
  retryIssue: (id: string) => Promise<void>;
  discardIssue: (id: string) => Promise<void>;
};

const OfflineContext = createContext<OfflineState | null>(null);
const LAST_SYNC_KEY = "multiprestamos.offline.last-sync";

function lastSyncKey(userId: string) {
  return `${LAST_SYNC_KEY}:${userId}`;
}

function savedLastSync(userId?: string) {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(lastSyncKey(userId));
  } catch {
    return null;
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const userId = user?.id ?? null;
  const hasSession = Boolean(session);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [pending, setPending] = useState(0);
  const [attention, setAttention] = useState(0);
  const [issues, setIssues] = useState<OfflineOperation[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const runningRef = useRef<Promise<void> | null>(null);

  const refreshCounts = useCallback(async () => {
    if (!userId) {
      setPending(0);
      setAttention(0);
      setIssues([]);
      return;
    }
    const operations = await listOfflineOperations();
    setPending(operations.filter((item) => item.status !== "attention").length);
    const nextIssues = operations.filter((item) => item.status === "attention");
    setAttention(nextIssues.length);
    setIssues(nextIssues);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || !navigator.onLine) {
      setOnline(navigator.onLine);
      await refreshCounts().catch(() => undefined);
      return;
    }
    if (!hasSession) {
      setError("Estamos validando la sesión antes de enviar los cambios. Si continúa, vuelva a iniciar sesión con Internet.");
      return;
    }
    if (runningRef.current) return runningRef.current;
    const task = (async () => {
      setSyncing(true);
      setPreparing(true);
      setError("");
      try {
        const authResult = await supabase.auth.refreshSession();
        if (authResult.error || !authResult.data.session) {
          setError("La sesión necesita validarse otra vez. Inicie sesión con Internet; los cambios seguirán guardados.");
          return;
        }
        const result = await syncOfflineOperations();
        await prepareOfflineWorkspace();
        if (!(await isOfflineWorkspacePrepared())) {
          throw new Error("La copia local quedó incompleta. Vuelva a pulsar Preparar datos offline.");
        }
        setPrepared(true);
        if (result.attention > 0) {
          setError(`${result.attention} operación requiere revisión antes de reemplazar la copia local.`);
        } else if (result.pending > 0) {
          setError(`${result.pending} operación sigue pendiente. Se reintentará cuando la conexión sea estable.`);
        } else {
          const timestamp = new Date().toISOString();
          try {
            window.localStorage.setItem(lastSyncKey(userId), timestamp);
          } catch {
            // La fecha visible no es crítica para la copia local.
          }
          setLastSync(timestamp);
        }
        try {
          const persisted = typeof navigator.storage?.persist === "function"
            ? await navigator.storage.persist()
            : null;
          setStoragePersistent(persisted);
        } catch {
          setStoragePersistent(false);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo completar la sincronización.");
      } finally {
        await refreshCounts().catch(() => undefined);
        setSyncing(false);
        setPreparing(false);
      }
    })();
    runningRef.current = task.finally(() => {
      runningRef.current = null;
    });
    return runningRef.current;
  }, [hasSession, refreshCounts, userId]);

  const retryIssue = useCallback(async (id: string) => {
    await retryOfflineOperation(id);
    await refreshCounts();
    if (navigator.onLine) await syncNow();
  }, [refreshCounts, syncNow]);

  const discardIssue = useCallback(async (id: string) => {
    await removeOfflineOperation(id);
    await refreshCounts();
    if (navigator.onLine) await syncNow();
  }, [refreshCounts, syncNow]);

  useEffect(() => {
    setOfflineUserScope(userId);
    const storedSync = savedLastSync(userId ?? undefined);
    setLastSync(storedSync);
    setPrepared(false);
    setStoragePersistent(null);
    if (!userId) {
      void refreshCounts().catch(() => undefined);
      return;
    }

    let cancelled = false;
    void Promise.all([
      isOfflineWorkspacePrepared().catch(() => false),
      typeof navigator.storage?.persisted === "function"
        ? navigator.storage.persisted().catch(() => null)
        : Promise.resolve(null),
    ]).then(([workspacePrepared, persisted]) => {
      if (cancelled) return;
      setPrepared(workspacePrepared);
      setStoragePersistent(persisted);
      void refreshCounts().catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshCounts, userId]);

  useEffect(() => {
    if (userId && hasSession && navigator.onLine) void syncNow();
  }, [hasSession, syncNow, userId]);

  useEffect(() => subscribeOfflineChanges(() => {
    void refreshCounts().catch(() => undefined);
  }), [refreshCounts]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => {
      setOnline(false);
      setError("");
      void refreshCounts().catch(() => undefined);
    };
    const handleFocus = () => {
      if (navigator.onLine) void syncNow();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshCounts, syncNow]);

  const value = useMemo(
    () => ({
      online,
      syncing,
      preparing,
      prepared,
      pending,
      attention,
      issues,
      lastSync,
      storagePersistent,
      error,
      syncNow,
      retryIssue,
      discardIssue,
    }),
    [online, syncing, preparing, prepared, pending, attention, issues, lastSync, storagePersistent, error, syncNow, retryIssue, discardIssue],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error("useOffline outside provider");
  return context;
}
