import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { getBusinessConfig, upsertBusinessConfig } from "../lib/businessConfigService";
import type { ConfiguracionPrestamista, ConfiguracionPrestamistaInput } from "../types";

type BusinessConfigStatus = "loading" | "ready" | "missing_schema" | "error";

type BusinessConfigState = {
  config: ConfiguracionPrestamista | null;
  status: BusinessConfigStatus;
  error: string;
  reload: () => Promise<void>;
  save: (input: ConfiguracionPrestamistaInput) => Promise<ConfiguracionPrestamista>;
};

const BusinessConfigContext = createContext<BusinessConfigState | null>(null);

export function BusinessConfigProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<ConfiguracionPrestamista | null>(null);
  const [status, setStatus] = useState<BusinessConfigStatus>("loading");
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!session) {
      if (requestId !== requestIdRef.current) return;
      setConfig(null);
      setStatus(authLoading ? "loading" : "ready");
      setError("");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const result = await getBusinessConfig();
      if (requestId !== requestIdRef.current) return;
      setConfig(result.config);
      setStatus(result.status);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setConfig(null);
      setStatus("error");
      setError("No pudimos consultar la configuración del negocio.");
    }
  }, [authLoading, session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: ConfiguracionPrestamistaInput) => {
    const saved = await upsertBusinessConfig(input);
    requestIdRef.current += 1;
    setConfig(saved);
    setStatus("ready");
    setError("");
    return saved;
  }, []);

  const value = useMemo(
    () => ({ config, status, error, reload, save }),
    [config, status, error, reload, save]
  );

  return <BusinessConfigContext.Provider value={value}>{children}</BusinessConfigContext.Provider>;
}

export function useBusinessConfig() {
  const context = useContext(BusinessConfigContext);
  if (!context) throw new Error("useBusinessConfig outside provider");
  return context;
}
