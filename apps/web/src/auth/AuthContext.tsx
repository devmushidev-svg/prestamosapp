import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type UserInfo = {
  id: string;
  email: string;
  /** Nombre mostrado en la interfaz (parte local del correo). */
  displayName: string;
};

type AuthState = {
  session: Session | null;
  user: UserInfo | null;
  loading: boolean;
  login: (p: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function toUserInfo(session: Session | null): UserInfo | null {
  const u = session?.user;
  if (!u) return null;
  const email = u.email ?? "";
  return { id: u.id, email, displayName: email.split("@")[0] || "Usuario" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (p: { email: string; password: string }) => {
    const { error } = await supabase.auth.signInWithPassword(p);
    if (error) {
      throw new Error(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Revise la conexión e intente de nuevo."
      );
    }
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("No se pudo cerrar la sesión.");
  }, []);

  const value = useMemo(
    () => ({ session, user: toUserInfo(session), loading, login, logout }),
    [session, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
