import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Banknote, CalendarDays, HandCoins, Landmark, MapPin, Percent, Phone, ReceiptText, Repeat2, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { InstallmentSchedule } from "../components/InstallmentSchedule";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState } from "../components/ui";
import { formatDateOnly, formatMoney } from "../lib/format";
import { FREQUENCY_LABELS } from "../lib/loanCalculator";
import { getLoanDetail, type PrestamoDetalle } from "../lib/loanService";

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "primary" | "info" | "success" | "warning";
}) {
  const styles = {
    primary: "border-pf-primary-soft bg-pf-primary-soft/35 text-pf-primary-hover",
    info: "border-pf-info-soft bg-pf-info-soft/35 text-pf-info",
    success: "border-pf-success-soft bg-pf-success-soft/35 text-pf-success",
    warning: "border-pf-warning-soft bg-pf-warning-soft/35 text-pf-warning",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-surface-elevated/85 shadow-sm">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-pf-muted">{label}</p>
          <p className="mt-1 whitespace-nowrap text-lg font-extrabold tabular-nums text-pf-text">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function LoanDetailPage() {
  const { loanId = "" } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [loan, setLoan] = useState<PrestamoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreated] = useState(() => Boolean((location.state as { created?: boolean } | null)?.created));

  const load = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    setError("");
    try {
      setLoan(await getLoanDetail(loanId));
    } catch {
      setError("No pudimos cargar este préstamo. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showCreated) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, showCreated]);

  if (loading) {
    return <Card className="p-10 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando préstamo…</Card>;
  }

  if (error || !loan) {
    return (
      <Card>
        <EmptyState
          icon={<HandCoins className="h-5 w-5" strokeWidth={2} aria-hidden />}
          title="No se pudo abrir el préstamo"
          description={error || "El préstamo solicitado no está disponible."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate("/prestamos")}>
                Volver
              </Button>
              <Button type="button" onClick={() => void load()}>Reintentar</Button>
            </div>
          }
        />
      </Card>
    );
  }

  const totalPagar = loan.cuotas.reduce((sum, cuota) => sum + cuota.monto, 0);
  const interes = Math.max(0, totalPagar - loan.monto);

  return (
    <div className="space-y-4 pf-safe-page">
      <PageHero
        title={loan.cliente?.nombre ?? "Detalle del préstamo"}
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate("/prestamos")}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Volver a préstamos
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LoanStatusBadge status={loan.estado} />
          <span className="font-mono text-xs text-pf-muted">Código {loan.id.slice(0, 8)}</span>
        </div>
      </PageHero>

      {showCreated ? (
        <div className="rounded-xl border border-pf-success-soft bg-pf-success-soft/55 px-4 py-3 text-sm font-semibold text-pf-success" role="status">
          Préstamo creado correctamente. Las {loan.cuotas.length} cuotas ya quedaron generadas.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Capital" value={formatMoney("L", loan.monto)} icon={HandCoins} tone="primary" />
        <SummaryCard label="Interés fijo" value={formatMoney("L", interes)} icon={Percent} tone="warning" />
        <SummaryCard label="Total a cobrar" value={formatMoney("L", totalPagar)} icon={Landmark} tone="info" />
        <SummaryCard label="Saldo actual" value={formatMoney("L", loan.saldo)} icon={Banknote} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3 border-b border-pf-border-soft pb-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
              <UserRound className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-pf-text">Cliente</h2>
              <p className="text-xs text-pf-muted">Datos vinculados al préstamo.</p>
            </div>
          </div>
          <div>
            <p className="font-extrabold text-pf-text">{loan.cliente?.nombre ?? "Cliente no disponible"}</p>
            <div className="mt-2 space-y-2 text-sm text-pf-text-secondary">
              <p className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                {loan.cliente?.identidad || "Sin identidad registrada"}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                {loan.cliente?.telefono || "Sin teléfono registrado"}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
                {loan.cliente?.direccion || "Sin dirección registrada"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3 border-b border-pf-border-soft pb-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-info-soft text-pf-info">
              <Repeat2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-pf-text">Condiciones</h2>
              <p className="text-xs text-pf-muted">Interés fijo aplicado una sola vez.</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-pf-muted">Tasa total</dt>
              <dd className="mt-0.5 font-bold text-pf-text">{loan.tasa_interes}%</dd>
            </div>
            <div>
              <dt className="text-xs text-pf-muted">Frecuencia</dt>
              <dd className="mt-0.5 font-bold text-pf-text">{FREQUENCY_LABELS[loan.frecuencia]}</dd>
            </div>
            <div>
              <dt className="text-xs text-pf-muted">Número de cuotas</dt>
              <dd className="mt-0.5 font-bold text-pf-text">{loan.plazo}</dd>
            </div>
            <div>
              <dt className="text-xs text-pf-muted">Fecha de inicio</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-bold text-pf-text">
                <CalendarDays className="h-4 w-4 text-pf-muted" strokeWidth={2} aria-hidden />
                {formatDateOnly(loan.fecha_inicio)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="font-bold text-pf-text">Tabla de cuotas</h2>
          <p className="mt-1 text-xs text-pf-muted">Calendario generado automáticamente al crear el préstamo.</p>
        </div>
        <InstallmentSchedule
          items={loan.cuotas.map((cuota) => ({
            numero: cuota.numero,
            fechaVencimiento: cuota.fecha_vencimiento,
            monto: cuota.monto,
            estado: cuota.estado,
          }))}
        />
      </Card>
    </div>
  );
}
