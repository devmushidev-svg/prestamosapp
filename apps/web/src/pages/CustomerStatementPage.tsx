import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  FilePlus2,
  HandCoins,
  Landmark,
  MapPin,
  Phone,
  Printer,
  ReceiptText,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState } from "../components/ui";
import {
  emitirEstadoCuenta,
  getCustomerStatement,
  type CustomerStatement,
} from "../lib/customerStatementService";
import { formatDate, formatDateOnly, formatLoanNumber, formatMoney, formatPaymentNumber } from "../lib/format";
import { formatLoanPlan } from "../lib/loanCalculator";

const PAYMENT_PREVIEW_LIMIT = 12;

function MetricCard({ label, value, detail, icon: Icon, tone }: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "primary" | "info" | "success" | "danger";
}) {
  const tones = {
    primary: "border-pf-primary-soft bg-pf-primary-soft/35 text-pf-primary-hover",
    info: "border-pf-info-soft bg-pf-info-soft/35 text-pf-info",
    success: "border-pf-success-soft bg-pf-success-soft/35 text-pf-success",
    danger: "border-pf-danger-soft bg-pf-danger-soft/35 text-pf-danger",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-pf-muted">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-surface-elevated/85 shadow-sm">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
      </div>
      <p className="mt-2 truncate whitespace-nowrap text-[clamp(1rem,4.5vw,1.25rem)] font-extrabold tabular-nums text-pf-text" title={value}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-pf-muted">{detail}</p>
    </div>
  );
}

export function CustomerStatementPage() {
  const { customerId = "" } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { config } = useBusinessConfig();
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllPayments, setShowAllPayments] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) {
      setError("No se indicó un cliente válido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setStatement(await getCustomerStatement(customerId));
    } catch {
      setStatement(null);
      setError("No pudimos preparar el estado de cuenta. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <Card className="mx-auto max-w-xl p-10 text-center text-sm font-medium text-pf-muted" aria-live="polite">Preparando estado de cuenta…</Card>;
  }

  if (error || !statement) {
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState
          title="No se pudo abrir el estado de cuenta"
          description={error || "El cliente solicitado no está disponible."}
          icon={<ReceiptText className="h-5 w-5" strokeWidth={2} aria-hidden />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate("/clientes")}>Volver</Button>
              <Button type="button" onClick={() => void load()}>Reintentar</Button>
            </div>
          }
        />
      </Card>
    );
  }

  const visiblePayments = showAllPayments
    ? statement.pagos
    : statement.pagos.slice(0, PAYMENT_PREVIEW_LIMIT);
  const canCreateLoan = statement.cliente.estado !== "cancelado";

  return (
    <div className="space-y-4 pf-safe-page">
      <PageHero
        title="Estado de cuenta"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => navigate("/clientes")}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />Volver
            </Button>
            <Button type="button" onClick={() => emitirEstadoCuenta(statement, config)}>
              <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />PDF / imprimir
            </Button>
          </>
        }
      >
        <p className="pf-page-lead max-w-2xl">Resumen completo de {statement.cliente.nombre}.</p>
        <p className="pf-page-lead-muted">Actualizado el {formatDate(statement.generadoEn)}.</p>
      </PageHero>

      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-pf-primary-soft/65 via-pf-surface-elevated to-pf-info-soft/35 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-pf-primary text-white shadow-md shadow-orange-900/10">
                <UserRound className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="break-words text-lg font-extrabold text-pf-text">{statement.cliente.nombre}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-pf-muted">Ficha del cliente</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                type="button"
                variant="secondary"
                className="px-3"
                disabled={!canCreateLoan}
                onClick={() => navigate(`/prestamos/nuevo?clienteId=${encodeURIComponent(statement.cliente.id)}`)}
              >
                <FilePlus2 className="h-4 w-4" strokeWidth={2} aria-hidden />Préstamo
              </Button>
              <Button type="button" variant="secondary" className="px-3" onClick={() => navigate(`/pagos/nuevo?clienteId=${encodeURIComponent(statement.cliente.id)}`)}>
                <Banknote className="h-4 w-4" strokeWidth={2} aria-hidden />Registrar pago
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 border-t border-white/70 pt-4 text-sm text-pf-text-secondary sm:grid-cols-2 lg:grid-cols-4">
            <p className="flex min-w-0 items-center gap-2"><ReceiptText className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{statement.cliente.identidad || "Sin DNI"}</span></p>
            <p className="flex min-w-0 items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{statement.cliente.telefono || "Sin teléfono"}</span></p>
            <p className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{statement.cliente.direccion || "Sin dirección"}</span></p>
            <p className="flex min-w-0 items-center gap-2"><BriefcaseBusiness className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{statement.cliente.lugar_trabajo || "Sin trabajo registrado"}</span></p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Capital otorgado" value={formatMoney("L", statement.totals.capitalOtorgado)} detail={`${statement.totals.prestamosVigentes} préstamo(s) con saldo`} icon={HandCoins} tone="primary" />
        <MetricCard label="Pagado" value={formatMoney("L", statement.totals.pagado)} detail={`De ${formatMoney("L", statement.totals.totalPactado)} pactado`} icon={TrendingUp} tone="success" />
        <MetricCard label="Saldo pendiente" value={formatMoney("L", statement.totals.pendiente)} detail="Saldo registrado de sus préstamos" icon={Landmark} tone="info" />
        <MetricCard label="Vencido" value={formatMoney("L", statement.totals.vencido)} detail={statement.totals.vencido > 0 ? "Cuotas con fecha ya vencida" : "Sin cuotas vencidas pendientes"} icon={AlertTriangle} tone={statement.totals.vencido > 0 ? "danger" : "success"} />
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-pf-text">Préstamos del cliente</h2>
            <p className="mt-1 text-xs text-pf-muted">{statement.prestamos.length} préstamo(s) en su historial.</p>
          </div>
          <span className="pf-filter-chip">{statement.totals.prestamosVigentes} vigentes</span>
        </div>

        {statement.prestamos.length === 0 ? (
          <EmptyState
            title="Este cliente todavía no tiene préstamos"
            description="Puede crear el primero desde esta misma pantalla."
            icon={<HandCoins className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={canCreateLoan ? <Button type="button" onClick={() => navigate(`/prestamos/nuevo?clienteId=${encodeURIComponent(statement.cliente.id)}`)}><FilePlus2 className="h-4 w-4" strokeWidth={2} aria-hidden />Nuevo préstamo</Button> : undefined}
          />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {statement.prestamos.map((loan) => (
                <button
                  key={loan.id}
                  type="button"
                  className="w-full rounded-2xl border border-pf-border-soft bg-pf-surface-elevated p-3 text-left shadow-sm transition hover:border-pf-primary-soft"
                  onClick={() => navigate(`/prestamos/${loan.id}`)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block font-mono text-xs text-pf-primary-hover">{formatLoanNumber(loan.numero, loan.id)}</strong>
                      <span className="mt-1 block text-xs text-pf-muted">{formatLoanPlan(loan.frecuencia, loan.plazo)}</span>
                    </span>
                    <LoanStatusBadge status={loan.estado} />
                  </span>
                  <span className="mt-3 grid grid-cols-2 gap-3 border-t border-pf-border-soft pt-3">
                    <span><span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Pagado</span><strong className="mt-0.5 block tabular-nums text-pf-success">{formatMoney("L", loan.pagado)}</strong></span>
                    <span className="text-right"><span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Saldo</span><strong className="mt-0.5 block tabular-nums text-pf-text">{formatMoney("L", loan.pendiente)}</strong></span>
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-pf-muted"><CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />{loan.proximaCuota ? formatDateOnly(loan.proximaCuota.fecha_vencimiento) : "Sin cuotas pendientes"}</span>
                    {loan.vencido > 0 ? <strong className="text-pf-danger">Vencido: {formatMoney("L", loan.vencido)}</strong> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="max-md:hidden overflow-hidden rounded-xl border border-pf-border-soft">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="pf-table-thead">
                    <tr><th className="p-3">Préstamo</th><th className="p-3">Plan</th><th className="p-3">Estado</th><th className="p-3 text-right">Capital</th><th className="p-3 text-right">Pagado</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Vencido</th><th className="p-3">Próxima cuota</th><th className="p-3 text-right">Acción</th></tr>
                  </thead>
                  <tbody className="pf-table-body">
                    {statement.prestamos.map((loan) => (
                      <tr key={loan.id} className="pf-table-row">
                        <td className="p-3 font-mono text-xs font-bold text-pf-primary-hover">{formatLoanNumber(loan.numero, loan.id)}</td>
                        <td className="p-3 text-pf-text-secondary">{formatLoanPlan(loan.frecuencia, loan.plazo)}</td>
                        <td className="p-3"><LoanStatusBadge status={loan.estado} /></td>
                        <td className="p-3 text-right font-medium tabular-nums">{formatMoney("L", loan.monto)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums text-pf-success">{formatMoney("L", loan.pagado)}</td>
                        <td className="p-3 text-right font-bold tabular-nums text-pf-text">{formatMoney("L", loan.pendiente)}</td>
                        <td className={`p-3 text-right font-bold tabular-nums ${loan.vencido > 0 ? "text-pf-danger" : "text-pf-muted"}`}>{formatMoney("L", loan.vencido)}</td>
                        <td className="whitespace-nowrap p-3 text-pf-text-secondary">{loan.proximaCuota ? formatDateOnly(loan.proximaCuota.fecha_vencimiento) : "—"}</td>
                        <td className="p-3 text-right"><Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => navigate(`/prestamos/${loan.id}`)}>Ver</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-pf-text">Historial de pagos</h2>
            <p className="mt-1 text-xs text-pf-muted">Movimientos registrados en todos sus préstamos.</p>
          </div>
          <span className="pf-filter-chip">{statement.pagos.length} pago(s)</span>
        </div>

        {statement.pagos.length === 0 ? (
          <EmptyState title="Todavía no hay pagos registrados" icon={<ReceiptText className="h-5 w-5" strokeWidth={2} aria-hidden />} />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {visiblePayments.map((payment) => (
                <button key={payment.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-xl border border-pf-border-soft bg-pf-surface-elevated p-3 text-left" onClick={() => navigate(`/pagos/${payment.id}/recibo`)}>
                  <span className="min-w-0"><strong className="block font-mono text-xs text-pf-primary-hover">{formatPaymentNumber(payment.numero_recibo, payment.recibo)}</strong><span className="mt-0.5 block text-xs text-pf-muted">{payment.numeroPrestamo} · {formatDate(payment.fecha)}</span></span>
                  <strong className="shrink-0 tabular-nums text-pf-success">{formatMoney("L", payment.monto)}</strong>
                </button>
              ))}
            </div>
            <div className="max-md:hidden overflow-hidden rounded-xl border border-pf-border-soft">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="pf-table-thead"><tr><th className="p-3">Recibo</th><th className="p-3">Fecha</th><th className="p-3">Préstamo</th><th className="p-3 text-right">Pago</th><th className="p-3 text-right">Saldo posterior</th><th className="p-3 text-right">Acción</th></tr></thead>
                  <tbody className="pf-table-body">
                    {visiblePayments.map((payment) => (
                      <tr key={payment.id} className="pf-table-row">
                        <td className="p-3 font-mono text-xs font-bold text-pf-primary-hover">{formatPaymentNumber(payment.numero_recibo, payment.recibo)}</td>
                        <td className="whitespace-nowrap p-3 text-pf-text-secondary">{formatDate(payment.fecha)}</td>
                        <td className="p-3 text-pf-text-secondary">{payment.numeroPrestamo}</td>
                        <td className="p-3 text-right font-bold tabular-nums text-pf-success">{formatMoney("L", payment.monto)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums text-pf-text">{payment.saldo_posterior == null ? "—" : formatMoney("L", payment.saldo_posterior)}</td>
                        <td className="p-3 text-right"><Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => navigate(`/pagos/${payment.id}/recibo`)}>Recibo</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {statement.pagos.length > PAYMENT_PREVIEW_LIMIT ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => setShowAllPayments((current) => !current)}>
                {showAllPayments ? "Mostrar pagos recientes" : `Ver los ${statement.pagos.length} pagos`}
              </Button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
