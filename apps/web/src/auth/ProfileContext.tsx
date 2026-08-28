import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import {
  clearOfflineCache,
  getOfflineAccessEpoch,
  invalidateOfflineAccess,
  isNetworkFailure,
  isOfflineAccessInvalid,
  readCache,
  restoreOfflineAccess,
  writeCache,
} from "../lib/offlineDb";
import type { Profile } from "../types";

type ProfileStatus =
  | "loading"
  | "ready"
  | "inactive"
  | "company_inactive"
  | "offline_restricted"
  | "unassigned"
  | "missing_schema"
  | "error";

type CachedProfile = {
  profile: Profile;
  companyActive: boolean;
};

type ProfileState = {
  profile: Profile | null;
  status: ProfileStatus;
  error: string;
  isAdmin: boolean;
  /** Códigos de `permissions` concedidos explícitamente (no incluye el comodín de admin). */
  permissions: Set<string>;
  /** El admin siempre puede; el resto depende de `permissions`. La autorización real vive en RLS/RPC, esto solo es para pintar la interfaz. */
  hasPermission: (code: string) => boolean;
  reload: (options?: { silent?: boolean; recoverInvalidAccess?: boolean }) => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);
const PROFILE_CACHE_KEY = "auth-profile";

function isMissingProfilesSchema(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

function statusFor(cached: CachedProfile): ProfileStatus {
  if (!cached.profile.activo) return "inactive";
  return cached.companyActive ? "ready" : "company_inactive";
}

function hasSameProfileAccess(left: Profile, right: Profile): boolean {
  return left.id === right.id
    && left.empresa_id === right.empresa_id
    && left.rol === right.rol
    && left.activo === right.activo;
}

async function readCachedProfile(userId: string): Promise<CachedProfile | null> {
  const cached = await readCache<CachedProfile>(PROFILE_CACHE_KEY).catch(() => undefined);
  return cached?.profile.id === userId ? cached : null;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, offlineSession, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const requestIdRef = useRef(0);
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const reload = useCallback(async (options: { silent?: boolean; recoverInvalidAccess?: boolean } = {}) => {
    const requestId = ++requestIdRef.current;
    let verifiedProfile: Profile | null = null;
    let verifiedAccess: CachedProfile | null = null;
    let accessChanged = Boolean(user && isOfflineAccessInvalid(user.id));
    let accessEpoch = user && accessChanged ? getOfflineAccessEpoch(user.id) : 0;
    let cachePurged = false;
    const inMemoryProfile = profileRef.current;
    if (!user) {
      if (requestId !== requestIdRef.current) return;
      setProfile(null);
      setStatus(authLoading ? "loading" : "ready");
      setError("");
      return;
    }
    if (accessChanged && !options.recoverInvalidAccess) {
      // Otra pestaña puede seguir ejecutando el RPC. Hasta que la pestaña que
      // inició el cambio retire el marcador, ninguna otra debe restaurarlo con
      // el rol anterior que todavía pudiera responder el servidor.
      setProfile(null);
      setStatus("loading");
      setError("");
      return;
    }
    // Una recarga fría sin Internet restaura el perfil persistido. Las
    // instalaciones antiguas que aún no lo tengan entran de forma segura sin
    // privilegios administrativos, pero conservan su cartera offline.
    if (offlineSession) {
      const cached = await readCachedProfile(user.id);
      if (requestId !== requestIdRef.current) return;
      if (cached) {
        setProfile(cached.profile);
        setStatus(statusFor(cached));
        setError(cached.companyActive ? "" : "La empresa está desactivada.");
      } else {
        setProfile(null);
        setStatus("offline_restricted");
        setError("");
      }
      return;
    }
    if (accessChanged) {
      // Otra pestaña pudo iniciar la transferencia. Oculta de inmediato las
      // vistas ya cargadas hasta confirmar el nuevo alcance en el servidor.
      setProfile(null);
      setStatus("loading");
      setError("");
    } else if (!options.silent) {
      setStatus("loading");
      setError("");
    }
    const invalidateAndPurge = async () => {
      accessChanged = true;
      if (!isOfflineAccessInvalid(user.id)) {
        accessEpoch = invalidateOfflineAccess(user.id);
      } else {
        accessEpoch = getOfflineAccessEpoch(user.id);
      }
      if (cachePurged) return;
      await clearOfflineCache();
      cachePurged = true;
    };
    try {
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (requestId !== requestIdRef.current) return;
      if (queryError) {
        if (isMissingProfilesSchema(queryError) && !accessChanged) {
          setProfile(null);
          setStatus("missing_schema");
          return;
        }
        throw queryError;
      }
      // Un marcador pendiente bloquea por diseño la lectura de la copia vieja.
      // Si no existe, el perfil guardado permite detectar cambios remotos de
      // empresa, rol o estado y retirar toda la cartera privilegiada.
      const previousCached = accessChanged ? null : await readCachedProfile(user.id);
      if (requestId !== requestIdRef.current) return;
      if (!data) {
        await invalidateAndPurge();
        setProfile(null);
        setStatus("unassigned");
        setError("Su acceso todavía no está vinculado a una empresa.");
        return;
      }
      const nextProfile = data as Profile;
      verifiedProfile = nextProfile;
      const profileAccessChanged = Boolean(
        (previousCached && !hasSameProfileAccess(previousCached.profile, nextProfile))
        || (inMemoryProfile && !hasSameProfileAccess(inMemoryProfile, nextProfile)),
      );
      if (accessChanged || profileAccessChanged) {
        setProfile(null);
        setStatus("loading");
        setError("");
        // El rol/empresa/estado ya cambió en el servidor. Retira la copia
        // privilegiada antes de cualquier otra consulta que pudiera fallar.
        await invalidateAndPurge();
      }
      const { data: company, error: companyError } = await supabase
        .from("empresas")
        .select("activo")
        .eq("id", nextProfile.empresa_id)
        .maybeSingle();
      if (requestId !== requestIdRef.current) return;
      if (companyError) throw companyError;
      if (!company) {
        await invalidateAndPurge();
        setProfile(null);
        setStatus("unassigned");
        setError("La empresa asignada a su cuenta ya no existe.");
        return;
      }
      const cached = { profile: nextProfile, companyActive: Boolean(company.activo) } satisfies CachedProfile;
      verifiedAccess = cached;
      if (previousCached && previousCached.companyActive !== cached.companyActive) {
        // La activación de la empresa también cambia el alcance de acceso.
        await invalidateAndPurge();
      }
      if (accessChanged) {
        await invalidateAndPurge();
        if (requestId !== requestIdRef.current) return;
        // Es la única escritura permitida mientras el marcador está activo:
        // proviene de consultas online autoritativas y reemplaza el perfil
        // anterior antes de volver a habilitar la copia offline.
        await writeCache(PROFILE_CACHE_KEY, cached, user.id, { allowInvalidAccess: true });
        if (requestId !== requestIdRef.current) return;
        restoreOfflineAccess(user.id, accessEpoch);
      } else {
        // Si la copia no es crítica para un cambio de acceso, una falla local
        // no debe impedir que la sesión online continúe funcionando.
        await writeCache(PROFILE_CACHE_KEY, cached, user.id).catch(() => undefined);
      }
      if (requestId !== requestIdRef.current) return;
      setProfile(nextProfile);
      setStatus(statusFor(cached));
      setError(cached.companyActive ? "" : "La empresa está desactivada.");
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      if (accessChanged) {
        // No reutiliza un perfil/caché con privilegios antiguos si la limpieza
        // local falló. Un nuevo intento online volverá a ejecutar la purga.
        setProfile(verifiedAccess?.profile ?? verifiedProfile);
        setStatus("error");
        setError("Sus permisos cambiaron, pero no pudimos actualizar la copia local. Recargue con Internet.");
        return;
      }
      const cached = await readCachedProfile(user.id);
      if (requestId !== requestIdRef.current) return;
      if (cached) {
        setProfile(cached.profile);
        setStatus(statusFor(cached));
        setError(cached.companyActive ? "" : "La empresa está desactivada.");
        return;
      }
      if (isNetworkFailure(cause) || !navigator.onLine) {
        setProfile(null);
        setStatus("offline_restricted");
        setError("");
        return;
      }
      setProfile(null);
      setStatus("error");
      setError("No pudimos consultar su perfil. Revise la conexión e intente de nuevo.");
    }
  }, [authLoading, user, offlineSession]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!user || offlineSession) return;
    let lastRefreshAt = 0;
    const refreshProfile = () => {
      if (!navigator.onLine || Date.now() - lastRefreshAt < 1_000) return;
      lastRefreshAt = Date.now();
      void reload({ silent: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshProfile();
    };
    window.addEventListener("focus", refreshProfile);
    window.addEventListener("online", refreshProfile);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshProfile);
      window.removeEventListener("online", refreshProfile);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [offlineSession, reload, user]);

  useEffect(() => {
    if (!user) return;
    let wasBlocked = isOfflineAccessInvalid(user.id);
    const handleStorage = () => {
      if (isOfflineAccessInvalid(user.id)) {
        wasBlocked = true;
        setProfile(null);
        setStatus("loading");
        setError("");
        return;
      }
      if (wasBlocked && !offlineSession && navigator.onLine) {
        wasBlocked = false;
        void reload({ silent: true });
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [offlineSession, reload, user]);

  // Sin la migración de usuarios aplicada todavía no hay tabla `profiles`:
  // se mantiene el comportamiento previo (una sola cuenta maestra implícita)
  // para no bloquear la instalación existente.
  const isAdmin = status === "missing_schema" || (status === "ready" && profile?.rol === "admin" && profile.activo);

  useEffect(() => {
    if (!profile || status !== "ready" || offlineSession || isAdmin) {
      setPermissions(new Set());
      return;
    }
    let cancelled = false;
    void supabase.rpc("mis_permisos").then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) {
        // La migración de permisos pudo no estar aplicada todavía; no bloquea
        // el resto de la aplicación, solo deja la navegación sin esas opciones.
        // eslint-disable-next-line no-console
        console.warn("No se pudieron cargar los permisos del usuario:", rpcError);
        return;
      }
      setPermissions(new Set((data ?? []) as string[]));
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.rol, profile?.activo, status, offlineSession, isAdmin]);

  const hasPermission = useCallback(
    (code: string) => Boolean(isAdmin) || permissions.has(code),
    [isAdmin, permissions]
  );
  const value = useMemo(
    () => ({ profile, status, error, isAdmin: Boolean(isAdmin), permissions, hasPermission, reload }),
    [profile, status, error, isAdmin, permissions, hasPermission, reload]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile outside provider");
  return context;
}
