import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { useBusinessConfig } from "./BusinessConfigContext";

export function RequireBusinessConfig({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { config, status, error, reload } = useBusinessConfig();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4 text-sm font-medium text-pf-muted">
        Preparando su negocio…
      </div>
    );
  }

  // La versión anterior sigue operativa hasta que se aplique la migración consolidada.
  if (status === "missing_schema") return <>{children}</>;

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pf-surface px-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-bold text-pf-text">No pudimos preparar la aplicación</p>
          <p className="mt-2 text-sm text-pf-muted">{error}</p>
          <Button type="button" className="mt-4" onClick={() => void reload()}>
            Reintentar
          </Button>
        </Card>
      </div>
    );
  }

  if (!config) {
    return <Navigate to="/configuracion/inicial" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
