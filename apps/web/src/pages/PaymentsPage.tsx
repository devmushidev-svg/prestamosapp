import { Banknote, CalendarDays, Eye, Plus, ReceiptText, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, PaginationBar } from "../components/ui";
import { formatDate, formatLoanNumber, formatMoney, formatPaymentNumber } from "../lib/format";
import { listPayments, type PaymentSummary } from "../lib/paymentService";

const PAGE_SIZE = 12;

export function PaymentsPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayments(await listPayments());
    } catch {
      setError("No pudimos cargar el historial de pagos. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-HN");
    if (!term) return payments;
    return payments.filter((payment) =>
      [
        formatPaymentNumber(payment.numero_recibo, payment.recibo),
        payment.prestamo?.cliente?.nombre,
        payment.prestamo ? formatLoanNumber(payment.prestamo.numero, payment.prestamo.id) : null,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es-HN").includes(term))
    );
  }, [payments, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const totalFiltered = filtered.reduce((sum, payment) => sum + payment.monto, 0);

  return (
    <div className="space-y-4 pf-safe-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero title="Pagos" constrained>
          <p className="pf-page-lead">Consulte cada cobro, su recibo y el saldo que dejó.</p>
          <p className="pf-page-lead-muted">Cada operación aparece una sola vez aunque cubra varias cuotas.</p>
        </PageHero>
        <Button type="button" className="min-h-[52px] w-full shrink-0 shadow-lg sm:min-h-[48px] sm:w-auto" onClick={() => navigate("/pagos/nuevo")}>
          <Plus className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />Registrar pago
        </Button>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <Field label="Buscar por recibo, cliente o préstamo" htmlFor="payment-search">
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pf-muted" strokeWidth={2} aria-hidden /><Input id="payment-search" className="pl-10" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="REC-000001, cliente o PRE-000001…" /></div>
        </Field>
        <div className="pf-table-toolbar"><div className="flex flex-wrap gap-1.5"><span className="pf-filter-chip">{filtered.length} pago(s)</span><span className="pf-filter-chip">Total filtrado: {formatMoney("L", totalFiltered)}</span></div></div>
      </Card>

      {error ? (
        <Card><EmptyState title="No se pudieron cargar los pagos" description={error} icon={<ReceiptText className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : loading ? (
        <Card className="p-10 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando pagos…</Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title={payments.length === 0 ? "Aún no hay pagos" : "No encontramos coincidencias"} description={payments.length === 0 ? "Registre el primer cobro para comenzar el historial." : "Pruebe con otro recibo, cliente o préstamo."} icon={<Banknote className="h-5 w-5" strokeWidth={2} aria-hidden />} action={payments.length === 0 ? <Button type="button" onClick={() => navigate("/pagos/nuevo")}><Plus className="h-4 w-4" strokeWidth={2} aria-hidden />Registrar pago</Button> : undefined} /></Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {visible.map((payment) => (
              <Card key={payment.id} className="space-y-3 border-white/70 bg-white/90 p-3 shadow-md shadow-stone-900/[0.04]">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-bold text-pf-primary-hover">{formatPaymentNumber(payment.numero_recibo, payment.recibo)}</p><p className="mt-1 truncate font-extrabold text-pf-text">{payment.prestamo?.cliente?.nombre ?? "Cliente no disponible"}</p></div><strong className="shrink-0 text-lg tabular-nums text-pf-text">{formatMoney("L", payment.monto)}</strong></div>
                <div className="space-y-1.5 rounded-xl bg-pf-surface-soft p-3 text-xs text-pf-text-secondary"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-pf-muted" strokeWidth={2} aria-hidden />{formatDate(payment.fecha)}</p><p>Préstamo {payment.prestamo ? formatLoanNumber(payment.prestamo.numero, payment.prestamo.id) : "no disponible"}</p><p className="flex justify-between gap-3"><span>Saldo restante</span><strong>{payment.saldo_posterior == null ? "—" : formatMoney("L", payment.saldo_posterior)}</strong></p></div>
                <Button type="button" variant="secondary" className="w-full" onClick={() => navigate(`/pagos/${payment.id}/recibo`)} aria-label={`Ver recibo ${formatPaymentNumber(payment.numero_recibo, payment.recibo)} de ${payment.prestamo?.cliente?.nombre ?? "cliente no disponible"}`}><Eye className="h-4 w-4" strokeWidth={2} aria-hidden />Ver recibo</Button>
              </Card>
            ))}
            {filtered.length > PAGE_SIZE ? <Card className="overflow-hidden p-0"><PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filtered.length} itemLabel="pagos" onPageChange={setPage} /></Card> : null}
          </div>

          <Card className="pf-table-shell hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="pf-table-thead"><tr><th className="px-4 py-3">Recibo</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Préstamo</th><th className="px-4 py-3 text-right">Monto</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3 text-right">Acción</th></tr></thead><tbody className="pf-table-body">{visible.map((payment) => <tr key={payment.id} className="pf-table-row"><td className="px-4 py-3 font-mono text-xs font-bold text-pf-primary-hover">{formatPaymentNumber(payment.numero_recibo, payment.recibo)}</td><td className="whitespace-nowrap px-4 py-3 text-pf-text-secondary">{formatDate(payment.fecha)}</td><td className="max-w-[220px] px-4 py-3 font-bold text-pf-text"><p className="truncate">{payment.prestamo?.cliente?.nombre ?? "Cliente no disponible"}</p></td><td className="px-4 py-3 font-mono text-xs text-pf-muted">{payment.prestamo ? formatLoanNumber(payment.prestamo.numero, payment.prestamo.id) : "—"}</td><td className="whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums text-pf-text">{formatMoney("L", payment.monto)}</td><td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{payment.saldo_posterior == null ? "—" : formatMoney("L", payment.saldo_posterior)}</td><td className="px-4 py-3 text-right"><Button type="button" variant="ghost" className="min-h-9 px-3 py-1 text-xs" onClick={() => navigate(`/pagos/${payment.id}/recibo`)} aria-label={`Ver recibo ${formatPaymentNumber(payment.numero_recibo, payment.recibo)} de ${payment.prestamo?.cliente?.nombre ?? "cliente no disponible"}`}><Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Ver</Button></td></tr>)}</tbody></table></div>
            <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filtered.length} itemLabel="pagos" onPageChange={setPage} />
          </Card>
        </>
      )}
    </div>
  );
}
