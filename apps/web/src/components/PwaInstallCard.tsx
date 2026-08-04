import { CheckCircle2, Download, MonitorSmartphone, Share2, SquarePlus } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { Button, Card } from "./ui";

export function PwaInstallCard() {
  const { canInstall, install, installing, isIos, outcome, standalone } = usePwaInstall();

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-info-soft text-pf-info">
            <MonitorSmartphone className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="font-extrabold text-pf-text">Aplicación en este dispositivo</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-pf-muted">
              Instale MultiPréstamos para abrirlo desde su pantalla de inicio, como cualquier otra aplicación.
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

      <div className="mt-5" aria-live="polite">
        {standalone ? (
          <div className="flex items-start gap-3 rounded-xl border border-pf-success/25 bg-pf-success-soft px-4 py-3 text-sm text-pf-text-secondary">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pf-success" strokeWidth={2} aria-hidden />
            <div>
              <p className="font-bold text-pf-text">MultiPréstamos ya está instalada</p>
              <p className="mt-0.5 text-xs">Puede abrirla directamente desde el escritorio o la pantalla de inicio.</p>
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
            Si no aparece el botón, abra el menú de Chrome o Edge y seleccione “Instalar aplicación” o “Agregar a pantalla de inicio”.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
