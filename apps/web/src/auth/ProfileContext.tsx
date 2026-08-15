import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type ProfileStatus = "loading" | "ready" | "inactive" | "missing_schema" | "error";

type ProfileState = {
  profile: Profile | null;
  status: ProfileStatus;
  error: string;
  isAdmin: boolean;
  reload: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

function isMissingProfilesSchema(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
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
    // Con sesión offline se conserva el último perfil conocido (guardado en
    // memoria por esta misma pestaña) en vez de bloquear la app sin Internet.
    if (offlineSession) {
      if (requestId !== requestIdRef.current) return;
      setStatus((current) => (profile ? "ready" : current === "loading" ? "loading" : current));
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
        setStatus("error");
        setError("No encontramos su ficha de usuario. Contacte al administrador.");
        return;
      }
      setProfile(data as Profile);
      setStatus((data as Profile).activo ? "ready" : "inactive");
    } catch {
      if (requestId !== requestIdRef.current) return;
      setProfile(null);
      setStatus("error");
      setError("No pudimos consultar su perfil. Revise la conexión e intente de nuevo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, offlineSession]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Sin la migración de usuarios aplicada todavía no hay tabla `profiles`:
  // se mantiene el comportamiento previo (un solo administrador implícito)
  // para no bloquear la instalación existente.
  const isAdmin = status === "missing_schema" || (profile?.rol === "admin" && profile.activo);
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
