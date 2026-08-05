import { CheckCircle2, CloudDownload, RefreshCw, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useOffline } from "../offline/OfflineContext";
import { Button, Card } from "./ui";

const OPERATION_LABELS = {
  "business.upsert": "Configuración del negocio",
  "customer.upsert": "Cliente",
  "loan.create": "Préstamo",
  "payment.create": "Pago",
  "gestion.create": "Gestión de cobranza",
  "route.update": "Orden de ruta",
} as const;

function formatLastSync(value: string | null, prepared: boolean) {
  if (!value) return prepared
    ? "La copia local está disponible; todavía no tiene una fecha de sincronización."
    : "Todavía no se ha preparado una copia local.";
  return `Última sincronización: ${new Intl.DateTimeFormat("es-HN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`;
}

export function OfflineControlCard() {
  const {
    online,
    syncing,
    preparing,
    prepared,
    pending,
    attention,
    issues,
    lastSync,
    storagePersistent,
    protectingStorage,
    error,
    syncNow,
    protectStorage,
    retryIssue,
    discardIssue,
  } = useOffline();

  async function discard(id: string) {
    const confirmed = window.confirm(
      "Se eliminará este cambio pendiente del dispositivo y se recuperará la información del servidor. Esta acción no se puede deshacer."
    );
    if (confirmed) await discardIssue(id);
  }
  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${online ? "bg-pf-success-soft text-pf-success" : "bg-pf-warning-soft text-pf-warning"}`}>
            {online ? <Wifi className="h-5 w-5" strokeWidth={2} aria-hidden /> : <WifiOff className="h-5 w-5" strokeWidth={2} aria-hidden />}
          </span>
          <div>
            <h2 className="font-extrabold text-pf-text">Datos para trabajar sin Internet</h2>
            <p className="mt-1 text-sm text-pf-text-tertiary">
              {online
                ? "La aplicación puede descargar la cartera y enviar operaciones pendientes."
                : prepared
                  ? "La copia de clientes, préstamos, cuotas, cobros y fotos está guardada en este dispositivo."
                  : "Todavía no hay una copia preparada. Conéctese una vez antes de salir a cobrar."}
            </p>
            <p className="mt-2 text-xs font-medium text-pf-muted">{formatLastSync(lastSync, prepared)}</p>
          </div>
        </div>
        <Button type="button" onClick={() => void syncNow()} disabled={!online || syncing || preparing}>
          {syncing || preparing ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden /> : <CloudDownload className="h-4 w-4" strokeWidth={2} aria-hidden />}
          {prepared ? "Sincronizar ahora" : "Preparar datos offline"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
          prepared
            ? "border-pf-success/25 bg-pf-success-soft text-pf-success"
            : "border-pf-warning/25 bg-pf-warning-soft text-pf-warning"
        }`}>
          {prepared ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : null}
          {prepared ? "Copia de datos completa" : "Falta preparar la copia"}
        </span>
        <span className="rounded-full border border-pf-border-soft bg-pf-surface-soft px-3 py-1.5 text-pf-text-secondary">
          {pending} pendiente{pending === 1 ? "" : "s"}
        </span>
        {attention > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-pf-danger/25 bg-pf-danger-soft px-3 py-1.5 text-pf-danger">
            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {attention} por revisar
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-pf-danger" role="alert">{error}</p> : null}
      {prepared && storagePersistent === true ? (
        <p className="mt-3 rounded-xl border border-pf-success/25 bg-pf-success-soft px-4 py-3 text-xs font-semibold leading-relaxed text-pf-text-secondary">
          Copia protegida contra la limpieza automática del navegador en este dispositivo.
        </p>
      ) : prepared && storagePersistent === false ? (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-pf-warning/25 bg-pf-warning-soft px-4 py-3 text-xs leading-relaxed text-pf-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>
            La copia funciona, pero el navegador todavía podría limpiarla si falta espacio. Instale la aplicación y pulse el botón para solicitar protección.
          </p>
          <Button type="button" variant="secondary" className="shrink-0" onClick={() => void protectStorage()} disabled={protectingStorage}>
            {protectingStorage ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden /> : <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />}
            {protectingStorage ? "Solicitando…" : "Proteger copia"}
          </Button>
        </div>
      ) : prepared ? (
        <p className="mt-3 rounded-xl border border-pf-border-soft bg-pf-surface-soft px-4 py-3 text-xs leading-relaxed text-pf-text-secondary">
          Este navegador no permite confirmar la protección contra limpieza automática. No borre los datos del sitio ni use navegación privada.
        </p>
      ) : null}
      {issues.length > 0 ? (
        <div className="mt-4 space-y-2" aria-label="Operaciones que requieren revisión">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-xl border border-pf-danger/20 bg-pf-danger-soft/40 p-3">
              <p className="text-sm font-extrabold text-pf-text">{OPERATION_LABELS[issue.type]}</p>
              <p className="mt-1 break-words text-xs leading-relaxed text-pf-text-secondary">
                {issue.lastError || "No fue posible enviar este cambio."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void retryIssue(issue.id)} disabled={!online || syncing}>
                  Reintentar
                </Button>
                {issue.type === "business.upsert" || issue.type === "route.update" ? (
                  <Button type="button" variant="danger" onClick={() => void discard(issue.id)} disabled={!online || syncing}>
                    Descartar cambio local
                  </Button>
                ) : null}
              </div>
              {issue.type !== "business.upsert" && issue.type !== "route.update" ? (
                <p className="mt-2 text-xs font-semibold text-pf-danger">
                  Este movimiento no se puede descartar porque puede representar dinero o una gestión realizada.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-pf-muted">
        Abra y sincronice la aplicación una vez con Internet antes de salir a cobrar. Los pagos offline muestran un comprobante provisional hasta recibir su número oficial.
      </p>
    </Card>
  );
}
