import { CloudCheck, CloudDownload, CloudOff, CloudUpload, RefreshCw, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { useOffline } from "../offline/OfflineContext";

export function OfflineStatus() {
  const { online, syncing, prepared, pending, attention, storagePersistent, error, syncNow } = useOffline();
  const { appShellReady, applyUpdate, updateAvailable, updating } = usePwaInstall();
  const navigate = useNavigate();
  const readyForOffline = appShellReady && prepared;

  const state = online && updateAvailable
    ? { label: updating ? "Aplicando nueva versión…" : "Nueva versión disponible", Icon: RefreshCw, className: "border-pf-info/35 bg-pf-info-soft text-pf-info" }
    : !online
      ? readyForOffline
      ? { label: pending ? `Sin conexión · ${pending} cambio${pending === 1 ? "" : "s"} solo aquí` : "Sin conexión", Icon: CloudOff, className: "border-pf-warning/35 bg-pf-warning-soft text-pf-warning" }
      : { label: "Modo offline incompleto", Icon: TriangleAlert, className: "border-pf-danger/35 bg-pf-danger-soft text-pf-danger" }
    : attention > 0
      ? { label: `${attention} operación${attention === 1 ? "" : "es"} por revisar`, Icon: TriangleAlert, className: "border-pf-danger/35 bg-pf-danger-soft text-pf-danger" }
      : error
        ? { label: "Sincronización incompleta", Icon: TriangleAlert, className: "border-pf-danger/35 bg-pf-danger-soft text-pf-danger" }
        : syncing
          ? { label: "Sincronizando…", Icon: RefreshCw, className: "border-pf-info/35 bg-pf-info-soft text-pf-info" }
        : pending > 0
          ? storagePersistent === true
            ? { label: `Sincronizar ${pending} pendiente${pending === 1 ? "" : "s"}`, Icon: CloudUpload, className: "border-pf-primary/35 bg-pf-primary-soft text-pf-primary-hover" }
            : { label: `${pending} cambio${pending === 1 ? "" : "s"} solo en este dispositivo`, Icon: TriangleAlert, className: "border-pf-warning/35 bg-pf-warning-soft text-pf-warning" }
          : !readyForOffline
            ? { label: "Preparar modo offline", Icon: CloudDownload, className: "border-pf-warning/35 bg-pf-warning-soft text-pf-warning" }
            : { label: "Listo sin Internet", Icon: CloudCheck, className: "border-pf-success/35 bg-pf-success-soft text-pf-success" };
  const Icon = state.Icon;

  return (
    <button
      type="button"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-3 z-50 inline-flex min-h-11 max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-extrabold shadow-lg backdrop-blur-md print:hidden md:bottom-4 ${state.className}`}
      onClick={() => {
        if (online && updateAvailable) void applyUpdate();
        else if (attention > 0 || error || !readyForOffline) navigate("/ajustes");
        else void syncNow();
      }}
      disabled={updating || syncing || (!online && readyForOffline && attention === 0 && !error)}
      title={online && updateAvailable
        ? "Actualizar MultiPréstamos ahora"
        : attention > 0 || error
        ? "Abrir revisión de sincronización"
        : !readyForOffline
          ? "Preparar la aplicación para trabajar sin Internet"
        : online
          ? "Sincronizar ahora"
          : "Se sincronizará automáticamente cuando vuelva Internet"}
      aria-label={state.label}
    >
      <Icon className={`h-4 w-4 shrink-0 ${syncing || updating ? "animate-spin" : ""}`} strokeWidth={2.2} aria-hidden />
      <span className="truncate" role="status" aria-live="polite">{state.label}</span>
    </button>
  );
}
