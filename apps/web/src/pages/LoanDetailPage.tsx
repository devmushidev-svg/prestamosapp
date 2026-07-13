import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  HandCoins,
  Landmark,
  MapPin,
  Percent,
  Phone,
  ReceiptText,
  Repeat2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { InstallmentSchedule } from "../components/InstallmentSchedule";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState } from "../components/ui";
import { formatDate, formatDateOnly, formatLoanNumber, formatMoney, formatPaymentNumber } from "../lib/format";
import { FREQUENCY_LABELS } from "../lib/loanCalculator";
import { getLoanDetail, type PrestamoDetalle } from "../lib/loanService";
import { listPayments, refreshPortfolioStatuses, type PaymentSummary } from "../lib/paymentService";

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
          <p className="mt-1 text-base font-extrabold tabular-nums text-pf-text sm:whitespace-nowrap sm:text-lg">{value}</p>
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
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [showAllInstallments, setShowAllInstallments] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const requestRef = useRef(0);
  const [showCreated] = useState(() => Boolean((location.state as { created?: boolean } | null)?.created));

  const load = useCallback(async () => {
    if (!loanId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError("");
    setHistoryError("");
    try {
      await refreshPortfolioStatuses();
      const [loanResult, paymentsResult] = await Promise.allSettled([
        getLoanDetail(loanId),
        listPayments(loanId),
      ]);
      if (request !== requestRef.current) return;
      if (loanResult.status === "rejected") throw loanResult.reason;
      setLoan(loanResult.value);
      if (paymentsResult.status === "fulfilled") {
        setPayments(paymentsResult.value);
      } else {
        setPayments([]);
        setHistoryError("No pudimos cargar los recibos de este préstamo.");
      }
    } catch {
      if (request === requestRef.current) {
        setError("No pudimos cargar este préstamo. Revise la conexión e intente de nuevo.");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    setShowAllInstallments(false);
    setShowAllHistory(false);
    void load();
  }, [load, loanId]);

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
  const totalPagado = Math.min(totalPagar, Math.max(0, totalPagar - loan.saldo));
  const progress = totalPagar > 0 ? Math.min(100, Math.max(0, (totalPagado / totalPagar) * 100)) : 0;
  const paidInstallments = loan.cuotas.filter((cuota) => cuota.estado === "pagada").length;
  const partialInstallments = loan.cuotas.filter(
    (cuota) => cuota.monto_pagado > 0 && cuota.monto_pagado < cuota.monto
  ).length;
  const overdueInstallments = loan.cuotas.filter((cuota) => cuota.estado === "vencida" && cuota.monto_pagado < cuota.monto);
  const overdueAmount = overdueInstallments.reduce(
    (sum, cuota) => sum + Math.max(0, cuota.monto - cuota.monto_pagado),
    0
  );
  const nextInstallment = loan.cuotas.find((cuota) => cuota.monto_pagado < cuota.monto) ?? null;
  const nextInstallmentIsOverdue = nextInstallment?.estado === "vencida";
  const acceptsPayments = loan.saldo > 0 && loan.estado !== "pagado" && loan.estado !== "cancelado";
  const pendingInstallments = loan.cuotas.filter((cuota) => cuota.monto_pagado < cuota.monto);
  const compactInstallments = pendingInstallments.length ? pendingInstallments.slice(0, 8) : loan.cuotas.slice(-8);
  const visibleInstallments = showAllInstallments ? loan.cuotas : compactInstallments;
  const visiblePayments = showAllHistory ? payments : payments.slice(0, 6);

  return (
    <div className="space-y-4 pf-safe-page max-md:pb-24">
      <PageHero
        title={loan.cliente?.nombre ?? "Detalle del préstamo"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate("/prestamos")}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              Volver
            </Button>
            {acceptsPayments ? (
              <Button type="button" className="max-md:hidden" onClick={() => navigate(`/pagos/nuevo?prestamoId=${loan.id}`)}>
                <Banknote className="h-4 w-4" strokeWidth={2} aria-hidden />
                Registrar pago
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LoanStatusBadge status={loan.estado} />
          <span className="font-mono text-xs font-bold text-pf-muted">{formatLoanNumber(loan.numero, loan.id)}</span>
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

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold text-pf-text">Progreso del préstamo</h2>
            <p className="mt-1 text-xs text-pf-muted">
              {paidInstallments} completas{partialInstallments ? ` · ${partialInstallments} parcial${partialInstallments === 1 ? "" : "es"}` : ""} · {loan.cuotas.length} en total
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-pf-muted">Pagado</p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-pf-success">{formatMoney("L", totalPagado)}</p>
            <p className="mt-0.5 text-[11px] text-pf-muted">de {formatMoney("L", totalPagar)} · {Math.round(progress)}%</p>
          </div>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-pf-surface-soft shadow-inner"
          role="progressbar"
          aria-label="Progreso pagado del préstamo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={`${formatMoney("L", totalPagado)} pagados de ${formatMoney("L", totalPagar)}`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-pf-primary to-pf-success transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-pf-surface-soft p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-pf-muted">
              <Clock3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />{nextInstallmentIsOverdue ? "Cuota vencida" : "Próximo pago"}
            </p>
            <p className="mt-1 font-bold text-pf-text">
              {nextInstallment ? formatDateOnly(nextInstallment.fecha_vencimiento) : "Sin pagos pendientes"}
            </p>
          </div>
          <div className="rounded-xl bg-pf-surface-soft p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-pf-muted">
              <Banknote className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />{nextInstallmentIsOverdue ? "Pendiente inmediato" : "Monto próximo"}
            </p>
            <p className="mt-1 font-bold tabular-nums text-pf-text">
              {nextInstallment
                ? formatMoney("L", Math.max(0, nextInstallment.monto - nextInstallment.monto_pagado))
                : formatMoney("L", 0)}
            </p>
          </div>
          <div className={`rounded-xl p-3 ${overdueInstallments.length ? "bg-pf-danger-soft/65" : "bg-pf-success-soft/45"}`}>
            <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide ${overdueInstallments.length ? "text-pf-danger" : "text-pf-success"}`}>
              {overdueInstallments.length ? <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              {overdueInstallments.length ? "Vencido" : "Al día"}
            </p>
            <p className="mt-1 font-bold tabular-nums text-pf-text">
              {overdueInstallments.length
                ? `${overdueInstallments.length} cuota(s) · ${formatMoney("L", overdueAmount)}`
                : "Sin cuotas vencidas"}
            </p>
          </div>
        </div>
      </Card>

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
            <div>
              <dt className="text-xs text-pf-muted">Primer pago</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-bold text-pf-text">
                <CalendarDays className="h-4 w-4 text-pf-muted" strokeWidth={2} aria-hidden />
                {formatDateOnly(loan.fecha_primer_pago ?? loan.cuotas[0]?.fecha_vencimiento ?? loan.fecha_inicio)}
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
          items={visibleInstallments.map((cuota) => ({
            numero: cuota.numero,
            fechaVencimiento: cuota.fecha_vencimiento,
            monto: cuota.monto,
            montoPagado: cuota.monto_pagado,
            estado: cuota.estado,
          }))}
        />
        {loan.cuotas.length > compactInstallments.length ? (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setShowAllInstallments((current) => !current)}>
            {showAllInstallments ? "Ver solo cuotas pendientes" : `Ver todas las ${loan.cuotas.length} cuotas`}
          </Button>
        ) : null}
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-pf-text">Historial del préstamo</h2>
            <p className="mt-1 text-xs text-pf-muted">Creación y comprobantes registrados en orden reciente.</p>
          </div>
          {acceptsPayments ? (
            <Button type="button" variant="secondary" className="max-md:hidden" onClick={() => navigate(`/pagos/nuevo?prestamoId=${loan.id}`)}>
              <Banknote className="h-4 w-4" strokeWidth={2} aria-hidden />Registrar pago
            </Button>
          ) : null}
        </div>

        {historyError ? (
          <div className="flex flex-col gap-2 rounded-xl border border-pf-warning-soft bg-pf-warning-soft/45 p-3 text-sm text-pf-warning sm:flex-row sm:items-center sm:justify-between" role="status">
            <span>{historyError}</span>
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => void load()}>Reintentar</Button>
          </div>
        ) : null}

        <ol className={`space-y-2 ${showAllHistory ? "max-h-[36rem] overflow-y-auto pr-1" : ""}`}>
          {visiblePayments.map((payment) => (
            <li key={payment.id} className="flex items-start gap-3 rounded-xl border border-pf-border-soft bg-pf-surface-elevated p-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-success-soft text-pf-success">
                <ReceiptText className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-pf-text">Pago {formatPaymentNumber(payment.numero_recibo, payment.recibo)}</p>
                    <p className="mt-0.5 text-xs text-pf-muted">{formatDate(payment.fecha)}</p>
                  </div>
                  <p className="whitespace-nowrap text-lg font-extrabold tabular-nums text-pf-success">{formatMoney("L", payment.monto)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 min-h-11 px-3 py-1 text-xs md:min-h-9"
                  onClick={() => navigate(`/pagos/${payment.id}/recibo`)}
                  aria-label={`Ver recibo ${formatPaymentNumber(payment.numero_recibo, payment.recibo)}`}
                >
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Ver recibo
                </Button>
              </div>
            </li>
          ))}
          <li className="flex items-start gap-3 rounded-xl border border-pf-border-soft bg-pf-surface-soft p-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
              <Landmark className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="font-bold text-pf-text">Préstamo creado</p>
              <p className="mt-0.5 text-xs text-pf-muted">{formatDate(loan.creado_en)}</p>
              <p className="mt-1 text-xs text-pf-text-secondary">Capital entregado: {formatMoney("L", loan.monto)}</p>
            </div>
          </li>
        </ol>
        {payments.length > 6 ? (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setShowAllHistory((current) => !current)}>
            {showAllHistory ? "Mostrar menos pagos" : `Ver los ${payments.length} pagos`}
          </Button>
        ) : null}
      </Card>

      {acceptsPayments ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-pf-border-soft bg-pf-surface-elevated/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Saldo pendiente</p>
              <p className="truncate text-lg font-extrabold tabular-nums text-pf-text">{formatMoney("L", loan.saldo)}</p>
            </div>
            <Button type="button" className="min-h-[52px] shrink-0 px-5" onClick={() => navigate(`/pagos/nuevo?prestamoId=${loan.id}`)}>
              <Banknote className="h-4 w-4" strokeWidth={2} aria-hidden />Cobrar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
