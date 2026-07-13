import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Banknote, CalendarRange, Download, HandCoins, Landmark, Percent, Printer, ReceiptText, Search, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, PaginationBar, Select } from "../components/ui";
import { formatDate, formatDateOnly, formatLoanNumber, formatMoney, formatPaymentNumber } from "../lib/format";
import { downloadPortfolioCsv, getPortfolioReport, type PortfolioReport } from "../lib/reportService";
import type { EstadoPrestamo } from "../types";

const PAGE_SIZE = 12;
type StatusFilter = "todos" | EstadoPrestamo;

function hondurasDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function initialRange() {
  const hasta = hondurasDate();
  return { desde: `${hasta.slice(0, 7)}-01`, hasta };
}

function MetricCard({ label, value, detail, icon: Icon, tone }: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "primary" | "info" | "success" | "warning" | "danger";
}) {
  const tones = {
    primary: "border-pf-primary-soft bg-pf-primary-soft/35 text-pf-primary-hover",
    info: "border-pf-info-soft bg-pf-info-soft/35 text-pf-info",
    success: "border-pf-success-soft bg-pf-success-soft/35 text-pf-success",
    warning: "border-pf-warning-soft bg-pf-warning-soft/35 text-pf-warning",
    danger: "border-pf-danger-soft bg-pf-danger-soft/35 text-pf-danger",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-pf-surface-elevated/85 shadow-sm sm:flex">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-pf-muted">{label}</p>
          <p className="mt-1 text-base font-extrabold tabular-nums text-pf-text sm:text-lg">{value}</p>
          <p className="mt-0.5 text-[11px] text-pf-muted">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [draftRange, setDraftRange] = useState(initialRange);
  const [range, setRange] = useState(initialRange);
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [page, setPage] = useState(1);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const nextReport = await getPortfolioReport(range.desde, range.hasta);
      if (request === requestRef.current) setReport(nextReport);
    } catch {
      if (request === requestRef.current) {
        setError("No pudimos preparar los reportes. Revise la conexión e intente de nuevo.");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [range.desde, range.hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const filteredRows = useMemo(() => {
    if (!report) return [];
    const term = search.trim().toLocaleLowerCase("es-HN");
    return report.rows.filter((row) => {
      if (status !== "todos" && row.prestamo.estado !== status) return false;
      if (!term) return true;
      return [row.prestamo.cliente?.nombre, formatLoanNumber(row.prestamo.numero, row.prestamo.id)]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es-HN").includes(term));
    });
  }, [report, search, status]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function applyRange() {
    if (!draftRange.desde || !draftRange.hasta || draftRange.desde > draftRange.hasta) {
      setRangeError("Seleccione un período válido: la fecha inicial no puede ser posterior a la final.");
      return;
    }
    setRangeError("");
    setRange({ ...draftRange });
  }

  return (
    <div className="space-y-4 pf-safe-page print:space-y-3">
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>
      <div className="flex flex-col gap-4 print:block sm:flex-row sm:items-start sm:justify-between">
        <PageHero title="Reportes de cartera" constrained>
          <p className="pf-page-lead">Cartera actual, morosidad y cobros del período.</p>
          <p className="pf-page-lead-muted">Período: {formatDateOnly(range.desde)} al {formatDateOnly(range.hasta)}</p>
        </PageHero>
        <div className="grid grid-cols-2 gap-2 print:hidden sm:flex">
          <Button type="button" variant="secondary" onClick={() => window.print()} disabled={loading || Boolean(error) || !report}>
            <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />PDF / imprimir
          </Button>
          <Button type="button" onClick={() => report && downloadPortfolioCsv({ ...report, rows: filteredRows })} disabled={loading || Boolean(error) || !report}>
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />Excel (.csv)
          </Button>
        </div>
      </div>

      <Card className="grid gap-3 p-4 print:hidden sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1fr_auto] lg:items-end">
        <Field label="Desde" htmlFor="report-from"><Input id="report-from" type="date" value={draftRange.desde} onChange={(event) => setDraftRange((current) => ({ ...current, desde: event.target.value }))} /></Field>
        <Field label="Hasta" htmlFor="report-to"><Input id="report-to" type="date" value={draftRange.hasta} onChange={(event) => setDraftRange((current) => ({ ...current, hasta: event.target.value }))} /></Field>
        <Field label="Buscar cartera" htmlFor="report-search"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pf-muted" strokeWidth={2} aria-hidden /><Input id="report-search" className="pl-10" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente o préstamo" /></div></Field>
        <Field label="Estado" htmlFor="report-status"><Select id="report-status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="todos">Todos</option><option value="activo">Activo</option><option value="al_dia">Al día</option><option value="en_mora">En mora</option><option value="pagado">Pagado</option><option value="cancelado">Cancelado</option></Select></Field>
        <Button type="button" className="min-h-[48px]" onClick={applyRange}><CalendarRange className="h-4 w-4" strokeWidth={2} aria-hidden />Aplicar</Button>
      </Card>
      {rangeError ? <p className="rounded-xl border border-pf-danger-soft bg-pf-danger-soft/40 px-4 py-3 text-sm font-medium text-pf-danger print:hidden" role="alert">{rangeError}</p> : null}

      {error ? <Card className="p-5 text-center text-sm text-pf-danger" role="alert"><p>{error}</p><Button type="button" variant="secondary" className="mt-3" onClick={() => void load()}>Reintentar</Button></Card> : loading ? <Card className="p-10 text-center text-sm font-medium text-pf-muted" aria-live="polite">Preparando reportes…</Card> : report ? (
        <>
          <div className="hidden print:block">
            <h2 className="text-base font-bold">Resumen general</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <p><strong>Capital:</strong> {formatMoney("L", report.totals.capitalPrestado)}</p>
              <p><strong>Por cobrar:</strong> {formatMoney("L", report.totals.porCobrar)}</p>
              <p><strong>Vencido:</strong> {formatMoney("L", report.totals.vencido)}</p>
              <p><strong>Cobrado:</strong> {formatMoney("L", report.totals.cobradoPeriodo)}</p>
              <p><strong>Interés pactado:</strong> {formatMoney("L", report.totals.interesPactado)}</p>
              <p><strong>Interés cobrado estimado:</strong> {formatMoney("L", report.totals.interesCobradoEstimado)}</p>
            </div>
            <h2 className="mb-2 mt-5 text-base font-bold">Cartera filtrada ({filteredRows.length})</h2>
            <table className="w-full border-collapse text-[9px]">
              <thead><tr className="bg-stone-100"><th className="border border-stone-400 p-1 text-left">Préstamo</th><th className="border border-stone-400 p-1 text-left">Cliente</th><th className="border border-stone-400 p-1 text-left">Estado</th><th className="border border-stone-400 p-1 text-right">Capital</th><th className="border border-stone-400 p-1 text-right">Pagado</th><th className="border border-stone-400 p-1 text-right">Pendiente</th><th className="border border-stone-400 p-1 text-right">Vencido</th></tr></thead>
              <tbody>{filteredRows.map((row) => <tr key={`print-${row.prestamo.id}`}><td className="border border-stone-300 p-1">{formatLoanNumber(row.prestamo.numero, row.prestamo.id)}</td><td className="border border-stone-300 p-1">{row.prestamo.cliente?.nombre ?? "Cliente no disponible"}</td><td className="border border-stone-300 p-1">{row.prestamo.estado}</td><td className="border border-stone-300 p-1 text-right">{formatMoney("L", row.prestamo.monto)}</td><td className="border border-stone-300 p-1 text-right">{formatMoney("L", row.pagado)}</td><td className="border border-stone-300 p-1 text-right">{formatMoney("L", row.pendiente)}</td><td className="border border-stone-300 p-1 text-right">{formatMoney("L", row.vencido)}</td></tr>)}</tbody>
            </table>
            <section className="break-before-page">
              <h2 className="mb-2 text-base font-bold">Cobros del período ({report.payments.length})</h2>
              <table className="w-full border-collapse text-[9px]">
                <thead><tr className="bg-stone-100"><th className="border border-stone-400 p-1 text-left">Recibo</th><th className="border border-stone-400 p-1 text-left">Fecha</th><th className="border border-stone-400 p-1 text-left">Cliente</th><th className="border border-stone-400 p-1 text-left">Préstamo</th><th className="border border-stone-400 p-1 text-right">Monto</th></tr></thead>
                <tbody>{report.payments.map((payment) => <tr key={`print-payment-${payment.id}`}><td className="border border-stone-300 p-1">{formatPaymentNumber(payment.numero_recibo, payment.recibo)}</td><td className="border border-stone-300 p-1">{formatDate(payment.fecha)}</td><td className="border border-stone-300 p-1">{payment.prestamo?.cliente?.nombre ?? "Cliente no disponible"}</td><td className="border border-stone-300 p-1">{payment.prestamo ? formatLoanNumber(payment.prestamo.numero, payment.prestamo.id) : "—"}</td><td className="border border-stone-300 p-1 text-right">{formatMoney("L", payment.monto)}</td></tr>)}</tbody>
              </table>
            </section>
            <p className="mt-3 text-[9px]">El interés cobrado es una estimación proporcional. La mora diaria monetaria permanece desactivada.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-3 print:hidden">
            <MetricCard label="Capital prestado" value={formatMoney("L", report.totals.capitalPrestado)} detail={`${report.rows.length - report.totals.cancelados} préstamo(s) no cancelados`} icon={HandCoins} tone="primary" />
            <MetricCard label="Por cobrar" value={formatMoney("L", report.totals.porCobrar)} detail="Saldo de cartera vigente" icon={Landmark} tone="info" />
            <MetricCard label="Vencido" value={formatMoney("L", report.totals.vencido)} detail={`${report.totals.morosos} préstamo(s) en mora`} icon={AlertTriangle} tone={report.totals.morosos ? "danger" : "success"} />
            <MetricCard label="Cobrado en período" value={formatMoney("L", report.totals.cobradoPeriodo)} detail={`${report.payments.length} pago(s)`} icon={TrendingUp} tone="success" />
            <MetricCard label="Interés pactado" value={formatMoney("L", report.totals.interesPactado)} detail="Interés fijo total de la cartera" icon={Percent} tone="warning" />
            <MetricCard label="Interés cobrado estimado" value={formatMoney("L", report.totals.interesCobradoEstimado)} detail="Proporcional a lo pagado" icon={Banknote} tone="info" />
          </div>

          <Card className="space-y-4 p-4 print:hidden sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-bold text-pf-text">Estado de la cartera</h2><p className="mt-1 text-xs text-pf-muted">{filteredRows.length} préstamo(s) según el filtro actual.</p></div>
              <div className="flex flex-wrap gap-1.5"><span className="pf-filter-chip">{report.totals.activos} activos</span><span className="pf-filter-chip">{report.totals.pagados} pagados</span><span className="pf-filter-chip">{report.totals.cancelados} cancelados</span></div>
            </div>
            {filteredRows.length === 0 ? <EmptyState title="No hay préstamos para este filtro" description="Cambie el estado o el texto de búsqueda." icon={<Landmark className="h-5 w-5" strokeWidth={2} aria-hidden />} /> : (
              <>
                <div className="space-y-2 md:hidden">
                  {visibleRows.map((row) => <button key={row.prestamo.id} type="button" className="w-full rounded-2xl border border-pf-border-soft bg-pf-surface-elevated p-3 text-left shadow-sm" onClick={() => navigate(`/prestamos/${row.prestamo.id}`)}><span className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block truncate text-sm text-pf-text">{row.prestamo.cliente?.nombre ?? "Cliente no disponible"}</strong><span className="mt-0.5 block font-mono text-xs text-pf-muted">{formatLoanNumber(row.prestamo.numero, row.prestamo.id)}</span></span><LoanStatusBadge status={row.prestamo.estado} /></span><span className="mt-3 grid grid-cols-2 gap-3 border-t border-pf-border-soft pt-3"><span><span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Pagado</span><strong className="mt-0.5 block tabular-nums text-pf-success">{formatMoney("L", row.pagado)}</strong></span><span className="text-right"><span className="block text-[10px] font-bold uppercase tracking-wide text-pf-muted">Pendiente</span><strong className="mt-0.5 block tabular-nums text-pf-text">{formatMoney("L", row.pendiente)}</strong></span></span>{row.vencido > 0 ? <span className="mt-2 block text-xs font-bold text-pf-danger">Vencido: {formatMoney("L", row.vencido)}</span> : null}</button>)}
                  {filteredRows.length > PAGE_SIZE ? <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filteredRows.length} itemLabel="préstamos" onPageChange={setPage} /> : null}
                </div>
                <div className="max-md:hidden overflow-hidden rounded-xl border border-pf-border-soft">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1020px] text-left text-sm">
                      <thead className="pf-table-thead">
                        <tr>
                          <th className="p-3">Préstamo</th><th className="p-3">Cliente</th><th className="p-3">Estado</th>
                          <th className="p-3 text-right">Capital</th><th className="p-3 text-right">Pagado</th>
                          <th className="p-3 text-right">Pendiente</th><th className="p-3 text-right">Vencido</th>
                          <th className="p-3">Próxima cuota</th><th className="p-3 text-right print:hidden">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="pf-table-body">
                        {visibleRows.map((row) => (
                          <tr key={row.prestamo.id} className="pf-table-row">
                            <td className="p-3 font-mono text-xs font-bold text-pf-primary-hover">{formatLoanNumber(row.prestamo.numero, row.prestamo.id)}</td>
                            <td className="max-w-[210px] p-3 font-bold text-pf-text"><p className="truncate">{row.prestamo.cliente?.nombre ?? "Cliente no disponible"}</p></td>
                            <td className="p-3"><LoanStatusBadge status={row.prestamo.estado} /></td>
                            <td className="p-3 text-right font-medium tabular-nums">{formatMoney("L", row.prestamo.monto)}</td>
                            <td className="p-3 text-right font-semibold tabular-nums text-pf-success">{formatMoney("L", row.pagado)}</td>
                            <td className="p-3 text-right font-bold tabular-nums text-pf-text">{formatMoney("L", row.pendiente)}</td>
                            <td className={`p-3 text-right font-bold tabular-nums ${row.vencido ? "text-pf-danger" : "text-pf-muted"}`}>{formatMoney("L", row.vencido)}</td>
                            <td className="whitespace-nowrap p-3 text-pf-text-secondary">{row.proximaCuota ? formatDateOnly(row.proximaCuota) : "—"}</td>
                            <td className="p-3 text-right print:hidden"><Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => navigate(`/prestamos/${row.prestamo.id}`)} aria-label={`Ver ${formatLoanNumber(row.prestamo.numero, row.prestamo.id)} de ${row.prestamo.cliente?.nombre ?? "cliente no disponible"}`}>Ver</Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filteredRows.length} itemLabel="préstamos" onPageChange={setPage} />
                </div>
              </>
            )}
          </Card>

          <Card className="space-y-4 p-4 print:hidden sm:p-5">
            <div><h2 className="font-bold text-pf-text">Cobros del período</h2><p className="mt-1 text-xs text-pf-muted">Del {formatDateOnly(report.desde)} al {formatDateOnly(report.hasta)}.</p></div>
            {report.payments.length === 0 ? <EmptyState title="No hubo cobros en este período" icon={<ReceiptText className="h-5 w-5" strokeWidth={2} aria-hidden />} /> : <div className="space-y-2">{report.payments.slice(0, 10).map((payment) => <button key={payment.id} type="button" className="flex w-full flex-col gap-2 rounded-xl border border-pf-border-soft bg-pf-surface-elevated p-3 text-left sm:flex-row sm:items-center sm:justify-between" onClick={() => navigate(`/pagos/${payment.id}/recibo`)}><span className="min-w-0"><strong className="block font-mono text-xs text-pf-primary-hover">{formatPaymentNumber(payment.numero_recibo, payment.recibo)}</strong><span className="mt-0.5 block truncate text-sm font-bold text-pf-text">{payment.prestamo?.cliente?.nombre ?? "Cliente no disponible"}</span><span className="block text-xs text-pf-muted">{formatDate(payment.fecha)}</span></span><strong className="whitespace-nowrap text-lg tabular-nums text-pf-success">{formatMoney("L", payment.monto)}</strong></button>)}{report.payments.length > 10 ? <Button type="button" variant="secondary" className="w-full print:hidden" onClick={() => navigate("/pagos")}>Ver todos los pagos</Button> : null}</div>}
          </Card>

          <p className="px-1 text-xs leading-relaxed text-pf-muted print:hidden">El interés cobrado es una estimación proporcional al avance del préstamo. La mora diaria monetaria continúa desactivada, tal como se acordó para esta etapa.</p>
        </>
      ) : null}
    </div>
  );
}
