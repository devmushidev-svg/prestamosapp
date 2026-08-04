import { CloudCheck, CloudDownload, CloudOff, CloudUpload, RefreshCw, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { useOffline } from "../offline/OfflineContext";

export function OfflineStatus() {
  const { online, syncing, prepared, pending, attention, error, syncNow } = useOffline();
  const { appShellReady } = usePwaInstall();
  const navigate = useNavigate();
  const readyForOffline = appShellReady && prepared;

  const state = !online
    ? readyForOffline
      ? { label: pending ? `Sin conexión · ${pending} pendiente${pending === 1 ? "" : "s"}` : "Sin conexión", Icon: CloudOff, className: "border-pf-warning/35 bg-pf-warning-soft text-pf-warning" }
      : { label: "Modo offline incompleto", Icon: TriangleAlert, className: "border-pf-danger/35 bg-pf-danger-soft text-pf-danger" }
    : attention > 0
      ? { label: `${attention} operación${attention === 1 ? "" : "es"} por revisar`, Icon: TriangleAlert, className: "border-pf-danger/35 bg-pf-danger-soft text-pf-danger" }
      : error
        ? { label: "Sincronización incompleta", Icon: TriangleAlert, className: "border-pf-danger/35 bg-pf-danger-soft text-pf-danger" }
        : syncing
          ? { label: "Sincronizando…", Icon: RefreshCw, className: "border-pf-info/35 bg-pf-info-soft text-pf-info" }
        : pending > 0
          ? { label: `Sincronizar ${pending} pendiente${pending === 1 ? "" : "s"}`, Icon: CloudUpload, className: "border-pf-primary/35 bg-pf-primary-soft text-pf-primary-hover" }
          : !readyForOffline
            ? { label: "Preparar modo offline", Icon: CloudDownload, className: "border-pf-warning/35 bg-pf-warning-soft text-pf-warning" }
            : { label: "Listo sin Internet", Icon: CloudCheck, className: "border-pf-success/35 bg-pf-success-soft text-pf-success" };
  const Icon = state.Icon;

  return (
    <button
      type="button"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-3 z-50 inline-flex min-h-11 max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-extrabold shadow-lg backdrop-blur-md print:hidden md:bottom-4 ${state.className}`}
      onClick={() => {
        if (attention > 0 || error || !readyForOffline) navigate("/ajustes");
        else void syncNow();
      }}
      disabled={syncing || (!online && readyForOffline && attention === 0 && !error)}
      title={attention > 0 || error
        ? "Abrir revisión de sincronización"
        : !readyForOffline
          ? "Preparar la aplicación para trabajar sin Internet"
        : online
          ? "Sincronizar ahora"
          : "Se sincronizará automáticamente cuando vuelva Internet"}
      aria-label={state.label}
    >
      <Icon className={`h-4 w-4 shrink-0 ${syncing ? "animate-spin" : ""}`} strokeWidth={2.2} aria-hidden />
      <span className="truncate" role="status" aria-live="polite">{state.label}</span>
    </button>
  );
}
