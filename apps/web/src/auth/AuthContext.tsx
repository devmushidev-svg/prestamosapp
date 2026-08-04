import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { countOfflineOperations, setOfflineUserScope } from "../lib/offlineDb";
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
  offlineSession: boolean;
  loading: boolean;
  login: (p: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const OFFLINE_USER_KEY = "multiprestamos.offline-user";
const OFFLINE_ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredOfflineUser = {
  user: UserInfo;
  validatedAt: string;
};

function toUserInfo(session: Session | null): UserInfo | null {
  const user = session?.user;
  if (!user) return null;
  const email = user.email ?? "";
  return { id: user.id, email, displayName: email.split("@")[0] || "Usuario" };
}

function readOfflineUser(): UserInfo | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OFFLINE_USER_KEY) ?? "null") as StoredOfflineUser | null;
    const validatedAt = Date.parse(parsed?.validatedAt ?? "");
    const fresh = Number.isFinite(validatedAt) && Date.now() - validatedAt <= OFFLINE_ACCESS_TTL_MS;
    return fresh && parsed?.user?.id && parsed.user.email ? parsed.user : null;
  } catch {
    return null;
  }
}

function rememberOfflineUser(user: UserInfo | null) {
  try {
    if (user) {
      const stored: StoredOfflineUser = { user, validatedAt: new Date().toISOString() };
      window.localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(stored));
    }
    else window.localStorage.removeItem(OFFLINE_USER_KEY);
  } catch {
    // Supabase conserva su propia sesión; este dato solo permite abrir la copia local.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [offlineUser, setOfflineUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const useSession = (nextSession: Session | null) => {
      const nextUser = toUserInfo(nextSession);
      setSession(nextSession);
      if (nextUser) {
        setOfflineUser(null);
        rememberOfflineUser(nextUser);
        setOfflineUserScope(nextUser.id);
        return;
      }
      const cached = readOfflineUser();
      if (!navigator.onLine && cached) {
        setOfflineUser(cached);
        setOfflineUserScope(cached.id);
      } else {
        setOfflineUser(null);
        if (navigator.onLine) rememberOfflineUser(null);
        setOfflineUserScope(null);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => useSession(data.session))
      .catch(() => {
        const cached = readOfflineUser();
        if (cached) {
          setOfflineUser(cached);
          setOfflineUserScope(cached.id);
        } else {
          setSession(null);
          setOfflineUserScope(null);
        }
      })
      .finally(() => setLoading(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) {
        useSession(nextSession);
      } else if (navigator.onLine) {
        setSession(null);
        setOfflineUser(null);
        rememberOfflineUser(null);
        setOfflineUserScope(null);
      }
    });
    const handleOnline = () => {
      void supabase.auth.getSession()
        .then(({ data }) => useSession(data.session))
        .catch(() => undefined);
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    if (!navigator.onLine) {
      throw new Error("El primer ingreso necesita Internet. Después podrá abrir la aplicación sin conexión.");
    }
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      throw new Error(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Revise la conexión e intente de nuevo."
      );
    }
  }, []);

  const logout = useCallback(async () => {
    if (!navigator.onLine) {
      throw new Error("Conéctese a Internet para cerrar la sesión de forma segura en este dispositivo.");
    }
    const pending = await countOfflineOperations().catch(() => 0);
    if (pending > 0) {
      throw new Error("Hay operaciones pendientes. Conéctese y sincronice antes de cerrar sesión.");
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("No se pudo cerrar la sesión.");
    setSession(null);
    setOfflineUser(null);
    rememberOfflineUser(null);
    setOfflineUserScope(null);
  }, []);

  const sessionUser = useMemo(() => toUserInfo(session), [session]);
  const user = sessionUser ?? offlineUser;
  const value = useMemo(
    () => ({ session, user, offlineSession: !session && Boolean(offlineUser), loading, login, logout }),
    [session, user, offlineUser, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth outside provider");
  return context;
}
