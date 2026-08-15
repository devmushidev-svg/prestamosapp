import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { isNetworkFailure, readCache, writeCache } from "../lib/offlineDb";
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
  reload: () => Promise<void>;
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

async function readCachedProfile(userId: string): Promise<CachedProfile | null> {
  const cached = await readCache<CachedProfile>(PROFILE_CACHE_KEY).catch(() => undefined);
  return cached?.profile.id === userId ? cached : null;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, offlineSession, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!user) {
      if (requestId !== requestIdRef.current) return;
      setProfile(null);
      setStatus(authLoading ? "loading" : "ready");
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
    setStatus("loading");
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (requestId !== requestIdRef.current) return;
      if (queryError) {
        if (isMissingProfilesSchema(queryError)) {
          setProfile(null);
          setStatus("missing_schema");
          return;
        }
        throw queryError;
      }
      if (!data) {
        setProfile(null);
        setStatus("unassigned");
        setError("Su acceso todavía no está vinculado a una empresa.");
        return;
      }
      const nextProfile = data as Profile;
      const { data: company, error: companyError } = await supabase
        .from("empresas")
        .select("activo")
        .eq("id", nextProfile.empresa_id)
        .maybeSingle();
      if (requestId !== requestIdRef.current) return;
      if (companyError) throw companyError;
      if (!company) {
        setProfile(null);
        setStatus("unassigned");
        setError("La empresa asignada a su cuenta ya no existe.");
        return;
      }
      const cached = { profile: nextProfile, companyActive: Boolean(company.activo) } satisfies CachedProfile;
      await writeCache(PROFILE_CACHE_KEY, cached).catch(() => undefined);
      if (requestId !== requestIdRef.current) return;
      setProfile(nextProfile);
      setStatus(statusFor(cached));
      setError(cached.companyActive ? "" : "La empresa está desactivada.");
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
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

  // Sin la migración de usuarios aplicada todavía no hay tabla `profiles`:
  // se mantiene el comportamiento previo (una sola cuenta maestra implícita)
  // para no bloquear la instalación existente.
  const isAdmin = status === "missing_schema" || (status === "ready" && profile?.rol === "admin" && profile.activo);
  const value = useMemo(
    () => ({ profile, status, error, isAdmin: Boolean(isAdmin), reload }),
    [profile, status, error, isAdmin, reload]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile outside provider");
  return context;
}
