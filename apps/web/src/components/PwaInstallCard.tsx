import { CheckCircle2, Download, MonitorSmartphone, RefreshCw, Share2, SquarePlus, TriangleAlert } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { useOffline } from "../offline/OfflineContext";
import { Button, Card } from "./ui";

export function PwaInstallCard() {
  const {
    appShellReady,
    applyUpdate,
    canInstall,
    install,
    installing,
    isEmbeddedBrowser,
    isIos,
    outcome,
    registrationError,
    secureContext,
    serviceWorkerSupported,
    standalone,
    updateAvailable,
  } = usePwaInstall();
  const { prepared } = useOffline();
  const readyForOffline = appShellReady && prepared;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-info-soft text-pf-info">
            <MonitorSmartphone className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="font-extrabold text-pf-text">Instalar y usar sin Internet</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-pf-muted">
              Son dos pasos: guardar la aplicación y preparar una copia de la cartera en este dispositivo.
            </p>
          </div>
        </div>

        {canInstall ? (
          <Button type="button" className="shrink-0" disabled={installing} onClick={() => void install()}>
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
            {installing ? "Preparando…" : "Instalar MultiPréstamos"}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Estado de preparación sin Internet">
        <div className={`rounded-xl border px-4 py-3 ${appShellReady ? "border-pf-success/25 bg-pf-success-soft" : "border-pf-border-soft bg-pf-surface-soft"}`}>
          <div className="flex items-start gap-2.5">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${appShellReady ? "bg-pf-success text-white" : "bg-pf-primary-soft text-pf-primary-hover"}`}>
              {appShellReady ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : "1"}
            </span>
            <div>
              <p className="text-sm font-extrabold text-pf-text">Guardar la aplicación</p>
              <p className="mt-0.5 text-xs leading-relaxed text-pf-text-secondary">
                {appShellReady ? "El programa ya quedó disponible en este navegador." : "Espere el botón de instalación o use el menú del navegador."}
              </p>
            </div>
          </div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${prepared ? "border-pf-success/25 bg-pf-success-soft" : "border-pf-border-soft bg-pf-surface-soft"}`}>
          <div className="flex items-start gap-2.5">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${prepared ? "bg-pf-success text-white" : "bg-pf-primary-soft text-pf-primary-hover"}`}>
              {prepared ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : "2"}
            </span>
            <div>
              <p className="text-sm font-extrabold text-pf-text">Preparar la cartera</p>
              <p className="mt-0.5 text-xs leading-relaxed text-pf-text-secondary">
                {prepared ? "Clientes, préstamos, cuotas, cobros y fotos están guardados." : "Use “Preparar datos offline” en la tarjeta siguiente."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        {updateAvailable ? (
          <div className="flex flex-col gap-3 rounded-xl border border-pf-info/25 bg-pf-info-soft px-4 py-3 text-sm text-pf-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-pf-text">Hay una actualización lista</p>
              <p className="mt-0.5 text-xs">Guarde cualquier formulario abierto y actualice para usar la versión nueva.</p>
            </div>
            <Button type="button" variant="secondary" className="shrink-0" onClick={applyUpdate}>
              <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
              Actualizar ahora
            </Button>
          </div>
        ) : readyForOffline ? (
          <div className="flex items-start gap-3 rounded-xl border border-pf-success/25 bg-pf-success-soft px-4 py-3 text-sm text-pf-text-secondary">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pf-success" strokeWidth={2} aria-hidden />
            <div>
              <p className="font-bold text-pf-text">Este dispositivo está listo para trabajar sin Internet</p>
              <p className="mt-0.5 text-xs">
                {standalone
                  ? "Puede abrir MultiPréstamos desde el escritorio o la pantalla de inicio."
                  : isIos
                    ? "La copia ya funciona en Safari; para instalarla use Compartir → Agregar a pantalla de inicio."
                    : "La copia ya funciona en este navegador; agregue el acceso a la pantalla de inicio si lo desea."}
              </p>
            </div>
          </div>
        ) : standalone ? (
          <div className="flex items-start gap-3 rounded-xl border border-pf-success/25 bg-pf-success-soft px-4 py-3 text-sm text-pf-text-secondary">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pf-success" strokeWidth={2} aria-hidden />
            <div>
              <p className="font-bold text-pf-text">MultiPréstamos ya está instalada</p>
              <p className="mt-0.5 text-xs">Complete el paso 2 para guardar la cartera antes de salir sin señal.</p>
            </div>
          </div>
        ) : isEmbeddedBrowser ? (
          <div className="rounded-xl border border-pf-warning/25 bg-pf-warning-soft px-4 py-3 text-xs leading-relaxed text-pf-text-secondary">
            <p className="font-bold text-pf-text">Abra el enlace en el navegador del teléfono</p>
            <p className="mt-1">La vista interna de WhatsApp, Facebook o Google no permite instalar. Use su menú y elija “Abrir en Chrome” o “Abrir en Safari”.</p>
          </div>
        ) : registrationError || !secureContext || !serviceWorkerSupported ? (
          <div className="flex items-start gap-3 rounded-xl border border-pf-danger/25 bg-pf-danger-soft px-4 py-3 text-sm text-pf-text-secondary" role="alert">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-pf-danger" strokeWidth={2} aria-hidden />
            <div>
              <p className="font-bold text-pf-text">Este navegador todavía no pudo guardar la aplicación</p>
              <p className="mt-0.5 text-xs">{registrationError || "Abra MultiPréstamos en Chrome, Edge o Safari desde su dirección segura."}</p>
            </div>
          </div>
        ) : isIos ? (
          <div className="rounded-xl border border-pf-border-soft bg-pf-surface-soft px-4 py-3">
            <p className="text-sm font-bold text-pf-text">Instalar en iPhone o iPad</p>
            <ol className="mt-3 space-y-2 text-xs text-pf-text-secondary">
              <li className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pf-primary-soft font-bold text-pf-primary-hover">1</span>
                Abra esta página con Safari.
              </li>
              <li className="flex items-center gap-2">
                <Share2 className="h-5 w-5 shrink-0 text-pf-info" strokeWidth={2} aria-hidden />
                Toque el botón Compartir.
              </li>
              <li className="flex items-center gap-2">
                <SquarePlus className="h-5 w-5 shrink-0 text-pf-primary" strokeWidth={2} aria-hidden />
                Elija “Agregar a pantalla de inicio” y confirme.
              </li>
            </ol>
          </div>
        ) : outcome === "accepted" ? (
          <div className="flex items-start gap-3 rounded-xl border border-pf-success/25 bg-pf-success-soft px-4 py-3 text-sm text-pf-text-secondary">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pf-success" strokeWidth={2} aria-hidden />
            <div>
              <p className="font-bold text-pf-text">Instalación aceptada</p>
              <p className="mt-0.5 text-xs">MultiPréstamos aparecerá en el escritorio o la pantalla de inicio.</p>
            </div>
          </div>
        ) : outcome === "dismissed" ? (
          <p className="rounded-xl border border-pf-warning/25 bg-pf-warning-soft px-4 py-3 text-xs text-pf-text-secondary">
            La instalación fue cancelada. Puede intentarlo de nuevo desde la opción “Instalar aplicación” del menú del navegador.
          </p>
        ) : !canInstall ? (
          <p className="rounded-xl border border-pf-border-soft bg-pf-surface-soft px-4 py-3 text-xs text-pf-text-secondary">
            El botón puede tardar un momento en aparecer. Si no aparece, abra el menú de Chrome o Edge y seleccione “Instalar aplicación” o “Agregar a pantalla de inicio”.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
