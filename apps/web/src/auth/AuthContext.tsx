import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { countOfflineOperations, isNetworkFailure, setOfflineUserScope } from "../lib/offlineDb";
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
  const logoutRequestedRef = useRef(false);
  const lastAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const signOutVerifications = new Set<string>();
    const verificationTimers = new Set<number>();

    const useOfflineIdentity = () => {
      const cached = readOfflineUser();
      setSession(null);
      if (!cached) {
        setOfflineUser(null);
        rememberOfflineUser(null);
        setOfflineUserScope(null);
        return false;
      }
      setOfflineUser(cached);
      setOfflineUserScope(cached.id);
      return true;
    };

    const clearIdentity = () => {
      setSession(null);
      setOfflineUser(null);
      rememberOfflineUser(null);
      setOfflineUserScope(null);
      lastAccessTokenRef.current = null;
    };

    const useSession = (nextSession: Session) => {
      const nextUser = toUserInfo(nextSession);
      setSession(nextSession);
      setOfflineUser(null);
      lastAccessTokenRef.current = nextSession.access_token;
      if (!nextUser) return;
      rememberOfflineUser(nextUser);
      setOfflineUserScope(nextUser.id);
    };

    const verifyUnexpectedSignOut = (accessToken: string) => {
      if (signOutVerifications.has(accessToken)) return;
      signOutVerifications.add(accessToken);
      void supabase.auth.getUser(accessToken)
        .then(({ error }) => {
          if (disposed || lastAccessTokenRef.current !== accessToken) return;
          if (!navigator.onLine || (error && isNetworkFailure(error))) useOfflineIdentity();
          else clearIdentity();
        })
        .catch((cause) => {
          if (disposed || lastAccessTokenRef.current !== accessToken) return;
          if (!navigator.onLine || isNetworkFailure(cause)) useOfflineIdentity();
          else clearIdentity();
        })
        .finally(() => {
          signOutVerifications.delete(accessToken);
        });
    };

    const scheduleUnexpectedSignOutVerification = (accessToken: string) => {
      const timerId = window.setTimeout(() => {
        verificationTimers.delete(timerId);
        verifyUnexpectedSignOut(accessToken);
      }, 0);
      verificationTimers.add(timerId);
    };

    // No se espera el reintento de Supabase (puede tardar ~30 s con un token
    // vencido). Si el navegador sabe que no hay red, se abre la copia local de
    // inmediato y la sesión remota se comprueba en segundo plano.
    if (!navigator.onLine) {
      useOfflineIdentity();
      setLoading(false);
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (disposed) return;
        if (data.session) {
          useSession(data.session);
          return;
        }
        if ((!navigator.onLine || (error && isNetworkFailure(error))) && useOfflineIdentity()) return;
        clearIdentity();
      })
      .catch((cause) => {
        if (disposed) return;
        if (!navigator.onLine || isNetworkFailure(cause)) useOfflineIdentity();
        else clearIdentity();
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        useSession(nextSession);
        return;
      }
      // La comprobación inicial ya está en curso arriba. Dejar que termine evita
      // borrar la identidad local cuando el navegador dice estar online pero no
      // consigue llegar a Supabase.
      if (event === "INITIAL_SESSION") return;
      if (logoutRequestedRef.current) {
        clearIdentity();
        return;
      }
      if (!navigator.onLine) {
        useOfflineIdentity();
        return;
      }
      const accessToken = lastAccessTokenRef.current;
      if (accessToken) scheduleUnexpectedSignOutVerification(accessToken);
      else clearIdentity();
    });
    const handleOnline = () => {
      void supabase.auth.getSession()
        .then(({ data, error }) => {
          if (data.session) useSession(data.session);
          else if (error && isNetworkFailure(error)) useOfflineIdentity();
          else clearIdentity();
        })
        .catch(() => useOfflineIdentity());
    };
    window.addEventListener("online", handleOnline);
    return () => {
      disposed = true;
      verificationTimers.forEach((timerId) => window.clearTimeout(timerId));
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
    logoutRequestedRef.current = true;
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error("No se pudo cerrar la sesión.");
      setSession(null);
      setOfflineUser(null);
      rememberOfflineUser(null);
      setOfflineUserScope(null);
      lastAccessTokenRef.current = null;
    } finally {
      logoutRequestedRef.current = false;
    }
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
