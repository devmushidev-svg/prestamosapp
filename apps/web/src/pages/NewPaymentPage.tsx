import { ArrowLeft, Banknote, CheckCircle2, Landmark, Search, UserPlus, UserRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoanStatusBadge } from "../components/LoanStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Modal } from "../components/ui";
import { formatDateOnly, formatLoanNumber, formatMoney } from "../lib/format";
import { moneyToCents, previewPayment } from "../lib/paymentAllocator";
import {
  getPaymentContext,
  listLoansForPayment,
  registerPayment,
  type PaymentContext,
} from "../lib/paymentService";
import { FREQUENCY_LABELS } from "../lib/loanCalculator";
import type { PrestamoConCliente } from "../lib/loanService";

const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const PAYMENT_REQUEST_KEY = "multiprestamos.payment-draft-request-id";

function getOrCreatePaymentRequestId() {
  try {
    const saved = window.sessionStorage.getItem(PAYMENT_REQUEST_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(PAYMENT_REQUEST_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function NewPaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loans, setLoans] = useState<PrestamoConCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loanId, setLoanId] = useState("");
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [contextReload, setContextReload] = useState(0);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(getOrCreatePaymentRequestId);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setLoans(await listLoansForPayment());
    } catch {
      setLoadError("No pudimos cargar los préstamos disponibles. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = useMemo(() => {
    const unique = new Map<string, NonNullable<PrestamoConCliente["cliente"]>>();
    for (const loan of loans) {
      if (loan.cliente) unique.set(loan.cliente.id, loan.cliente);
    }
    return [...unique.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es-HN"));
  }, [loans]);

  useEffect(() => {
    if (loans.length === 0) return;
    const requestedLoan = searchParams.get("prestamoId");
    const matchingLoan = requestedLoan ? loans.find((loan) => loan.id === requestedLoan) : null;
    if (matchingLoan) {
      setCustomerId(matchingLoan.cliente_id);
      setLoanId(matchingLoan.id);
      return;
    }
    const requestedCustomer = searchParams.get("clienteId");
    if (requestedCustomer && customers.some((customer) => customer.id === requestedCustomer)) {
      setCustomerId((current) => current || requestedCustomer);
    }
  }, [customers, loans, searchParams]);

  useEffect(() => {
    if (!loanId) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    setContextError("");
    setError("");
    getPaymentContext(loanId)
      .then((result) => {
        if (!cancelled) setContext(result);
      })
      .catch(() => {
        if (!cancelled) {
          setContext(null);
          setContextError("No pudimos cargar las cuotas de este préstamo.");
        }
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contextReload, loanId]);

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const customerLoans = useMemo(
    () => loans
      .filter((loan) => loan.cliente_id === customerId)
      .sort((a, b) => {
        if (a.estado === "en_mora" && b.estado !== "en_mora") return -1;
        if (b.estado === "en_mora" && a.estado !== "en_mora") return 1;
        return (a.fecha_primer_pago ?? a.fecha_inicio).localeCompare(b.fecha_primer_pago ?? b.fecha_inicio);
      }),
    [customerId, loans]
  );
  const selectedLoan = loans.find((loan) => loan.id === loanId) ?? null;
  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLocaleLowerCase("es-HN");
    if (!term) return customers.slice(0, 8);
    return customers.filter((customer) =>
      [customer.nombre, customer.identidad, customer.telefono]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es-HN").includes(term))
    ).slice(0, 8);
  }, [customerSearch, customers]);

  const amountValue = Number(amount);
  const amountHasTwoDecimals = /^\d+(?:\.\d{0,2})?$/.test(amount);
  const amountValid = Boolean(
    context && amount && Number.isFinite(amountValue) && amountValue > 0 && amountHasTwoDecimals && amountValue <= context.prestamo.saldo
  );
  const paymentPreview = context && amountValid ? previewPayment(amountValue, context.cuotas) : null;
  const installmentBalance = context?.cuotas.reduce((sum, installment) => sum + installment.pendiente, 0) ?? 0;
  const contextConsistent = Boolean(context && moneyToCents(installmentBalance) === moneyToCents(context.prestamo.saldo));
  const canSubmit = Boolean(amountValid && contextConsistent && paymentPreview && paymentPreview.montoSinAplicar < 0.01);
  const nextInstallment = context?.cuotas.find((installment) => installment.pendiente > 0) ?? null;
  const balanceAfter = context ? Math.max(0, context.prestamo.saldo - (Number.isFinite(amountValue) ? amountValue : 0)) : 0;
  const amountError = amount
    ? !Number.isFinite(amountValue) || amountValue <= 0 || !amountHasTwoDecimals
      ? "Ingrese un monto positivo con máximo dos decimales."
      : context && amountValue > context.prestamo.saldo
        ? `No puede superar el saldo de ${formatMoney("L", context.prestamo.saldo)}.`
        : ""
    : "";

  function selectCustomer(id: string) {
    setCustomerId(id);
    setLoanId("");
    setContext(null);
    setContextError("");
    setAmount("");
    setError("");
  }

  function selectLoan(id: string) {
    setLoanId(id);
    setContext(null);
    setContextError("");
    setAmount("");
    setError("");
  }

  function validateAndReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!customerId || !loanId || !context) {
      setError("Seleccione el cliente y el préstamo.");
      return;
    }
    if (!amount || !Number.isFinite(amountValue) || amountValue <= 0 || !amountHasTwoDecimals) {
      setError("Ingrese un monto válido con máximo dos decimales.");
      return;
    }
    if (amountValue > context.prestamo.saldo) {
      setError(`El pago no puede superar el saldo de ${formatMoney("L", context.prestamo.saldo)}.`);
      return;
    }
    if (!contextConsistent || !paymentPreview || paymentPreview.montoSinAplicar >= 0.01) {
      setError("El saldo no coincide con las cuotas. No se registró ningún pago; revise la migración de Supabase.");
      return;
    }
    setReviewOpen(true);
  }

  async function confirmPayment() {
    if (!context || !canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const paymentId = await registerPayment({
        solicitudId: requestId,
        prestamoId: context.prestamo.id,
        monto: amountValue,
      });
      try {
        if (window.sessionStorage.getItem(PAYMENT_REQUEST_KEY) === requestId) {
          window.sessionStorage.removeItem(PAYMENT_REQUEST_KEY);
        }
      } catch {
        // El recibo ya fue confirmado; sessionStorage es solo una protección adicional.
      }
      navigate(`/pagos/${paymentId}/recibo`, { replace: true, state: { created: true } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.startsWith("Falta aplicar") || message.includes("saldo") || message.includes("admite pagos")
          ? message
          : "No pudimos registrar el pago. Sus datos se conservaron para reintentar."
      );
      setReviewOpen(false);
      window.requestAnimationFrame(() => document.getElementById("payment-form-error")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="mx-auto max-w-6xl space-y-4 pf-safe-page max-md:pb-24 max-md:[&_input]:scroll-mb-32"
      onSubmit={validateAndReview}
    >
      <PageHero
        title="Registrar pago"
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate(selectedLoan ? `/prestamos/${selectedLoan.id}` : "/pagos")}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Volver
          </Button>
        }
      >
        <p className="pf-page-lead">Seleccione al cliente, el préstamo y el monto recibido.</p>
        <p className="pf-page-lead-muted">El pago se aplicará primero a la cuota pendiente más antigua.</p>
      </PageHero>

      {loadError ? (
        <Card><EmptyState title="No se pudieron cargar los cobros" description={loadError} icon={<WalletCards className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : loading ? (
        <Card className="p-10 text-center text-sm font-medium text-pf-muted">Cargando cartera…</Card>
      ) : loans.length === 0 ? (
        <Card><EmptyState title="No hay préstamos pendientes" description="Cuando exista un préstamo con saldo, podrá registrar el pago desde aquí." icon={<Banknote className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" onClick={() => navigate("/prestamos/nuevo")}><UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />Crear préstamo</Button>} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
          <div className="space-y-4">
            <Card className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center gap-3 border-b border-pf-border-soft pb-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover"><UserRound className="h-5 w-5" strokeWidth={2} aria-hidden /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-widest text-pf-muted">Paso 1</p><h2 className="font-bold text-pf-text">Cliente</h2></div>
              </div>
              {selectedCustomer ? (
                <div className="flex items-center gap-3 rounded-xl border border-pf-primary-soft bg-pf-primary-soft/30 p-3">
                  <div className="min-w-0 flex-1"><p className="truncate font-extrabold text-pf-text">{selectedCustomer.nombre}</p><p className="truncate text-xs text-pf-muted">{[selectedCustomer.identidad, selectedCustomer.telefono].filter(Boolean).join(" · ") || "Sin identidad / teléfono"}</p></div>
                  <Button type="button" variant="ghost" className="shrink-0" onClick={() => selectCustomer("")}>Cambiar</Button>
                </div>
              ) : (
                <>
                  <Field label="Buscar por nombre, DNI o teléfono" htmlFor="payment-customer-search">
                    <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pf-muted" strokeWidth={2} aria-hidden /><Input id="payment-customer-search" className="pl-10" type="search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Ej. Juan Pérez o 0801…" /></div>
                  </Field>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {filteredCustomers.map((customer) => (
                      <button key={customer.id} type="button" className="pf-list-row-hover flex min-h-[58px] w-full items-center gap-3 rounded-xl border border-pf-border-soft bg-pf-surface-elevated px-3 py-2.5 text-left" onClick={() => selectCustomer(customer.id)}>
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-pf-primary-soft text-pf-primary-hover"><UserRound className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
                        <span className="min-w-0"><strong className="block truncate text-sm text-pf-text">{customer.nombre}</strong><span className="block truncate text-xs text-pf-muted">{[customer.identidad, customer.telefono].filter(Boolean).join(" · ") || "Sin identidad / teléfono"}</span></span>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 ? <p className="rounded-xl border border-dashed border-pf-border p-5 text-center text-sm text-pf-muted">No encontramos clientes con préstamos pendientes.</p> : null}
                  </div>
                </>
              )}
            </Card>

            <Card className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center gap-3 border-b border-pf-border-soft pb-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-info-soft text-pf-info"><Landmark className="h-5 w-5" strokeWidth={2} aria-hidden /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-widest text-pf-muted">Paso 2</p><h2 className="font-bold text-pf-text">Préstamo</h2></div>
              </div>
              {!selectedCustomer ? (
                <p className="rounded-xl bg-pf-surface-soft p-4 text-center text-sm text-pf-muted">Seleccione primero al cliente.</p>
              ) : customerLoans.length === 0 ? (
                <EmptyState title="Este cliente no tiene saldo pendiente" icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />} />
              ) : (
                <div className="space-y-2">
                  {customerLoans.map((loan) => {
                    const selected = loan.id === loanId;
                    return (
                      <button key={loan.id} type="button" aria-pressed={selected} className={`w-full rounded-xl border p-3 text-left transition ${loanId && !selected ? "max-md:hidden" : ""} ${selected ? "border-pf-primary bg-pf-primary-soft/35 shadow-sm" : "border-pf-border-soft bg-pf-surface-elevated hover:bg-pf-surface-soft"}`} onClick={() => selectLoan(loan.id)}>
                        <span className="flex items-start justify-between gap-3"><span><strong className="block font-mono text-xs text-pf-primary-hover">{formatLoanNumber(loan.numero, loan.id)}</strong><span className="mt-1 block text-xs text-pf-muted">{loan.plazo} cuotas · {FREQUENCY_LABELS[loan.frecuencia]}</span></span><LoanStatusBadge status={loan.estado} /></span>
                        <span className="mt-3 flex items-end justify-between gap-3 border-t border-pf-border-soft pt-2.5"><span className="text-xs text-pf-muted">{selected && nextInstallment ? `Próxima cuota ${formatDateOnly(nextInstallment.fecha_vencimiento)}` : "Saldo pendiente"}</span><strong className="whitespace-nowrap text-lg tabular-nums text-pf-text">{formatMoney("L", loan.saldo)}</strong></span>
                      </button>
                    );
                  })}
                  {loanId && customerLoans.length > 1 ? <Button type="button" variant="ghost" className="w-full md:hidden" onClick={() => selectLoan("")}>Cambiar préstamo</Button> : null}
                </div>
              )}
            </Card>

            <Card className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center gap-3 border-b border-pf-border-soft pb-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-success-soft text-pf-success"><Banknote className="h-5 w-5" strokeWidth={2} aria-hidden /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-widest text-pf-muted">Paso 3</p><h2 className="font-bold text-pf-text">Monto recibido</h2></div>
              </div>
              {!loanId || contextLoading ? (
                <p className="rounded-xl bg-pf-surface-soft p-4 text-center text-sm text-pf-muted">{contextLoading ? "Cargando cuotas…" : "Seleccione el préstamo que desea cobrar."}</p>
              ) : contextError ? (
                <div className="rounded-xl border border-pf-danger-soft bg-pf-danger-soft/40 p-4 text-center" role="alert">
                  <p className="text-sm font-medium text-pf-danger">{contextError}</p>
                  <Button type="button" variant="secondary" className="mt-3" onClick={() => setContextReload((current) => current + 1)}>Reintentar</Button>
                </div>
              ) : context ? (
                <>
                  <Field label="Monto recibido (L) *" htmlFor="payment-amount">
                    <Input id="payment-amount" data-autofocus="true" className={`${NUMBER_INPUT_CLASS} text-xl font-extrabold tabular-nums`} type="number" inputMode="decimal" min="0.01" max={context.prestamo.saldo} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(""); }} placeholder="0.00" required aria-invalid={Boolean(amountError || !contextConsistent)} aria-describedby={amountError || !contextConsistent ? "payment-amount-error" : undefined} />
                  </Field>
                  {amountError || !contextConsistent ? <p id="payment-amount-error" className="text-sm font-medium text-pf-danger" role="alert">{amountError || "El saldo del préstamo no coincide con sus cuotas. Aplique la migración consolidada antes de cobrar."}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {nextInstallment ? <Button type="button" variant="secondary" className="min-h-11 px-3 text-xs" onClick={() => setAmount(nextInstallment.pendiente.toFixed(2))}>Cuota pendiente {formatMoney("L", nextInstallment.pendiente)}</Button> : null}
                    <Button type="button" variant="secondary" className="min-h-11 px-3 text-xs" onClick={() => setAmount(context.prestamo.saldo.toFixed(2))}>Saldo total {formatMoney("L", context.prestamo.saldo)}</Button>
                  </div>
                  {nextInstallment ? <p className="rounded-xl border border-pf-info-soft bg-pf-info-soft/35 p-3 text-xs text-pf-text-secondary">Se aplicará primero a la cuota #{nextInstallment.numero}, vencimiento {formatDateOnly(nextInstallment.fecha_vencimiento)}.</p> : null}
                  {error ? <p id="payment-form-error" className="text-sm font-medium text-pf-danger" role="alert">{error}</p> : null}
                </>
              ) : null}
            </Card>
          </div>

          <Card className="h-fit space-y-4 p-4 shadow-lg sm:p-5 lg:sticky lg:top-[11.5rem]">
            <div><p className="text-xs font-bold uppercase tracking-widest text-pf-muted">Resumen del pago</p><h2 className="mt-1 truncate text-lg font-extrabold text-pf-text">{selectedCustomer?.nombre ?? "Seleccione un cliente"}</h2>{selectedLoan ? <p className="font-mono text-xs text-pf-muted">{formatLoanNumber(selectedLoan.numero, selectedLoan.id)}</p> : null}</div>
            <div className="rounded-2xl border border-pf-primary-soft bg-gradient-to-br from-pf-info-soft/55 via-pf-primary-soft/45 to-pf-warning-soft/45 p-4 shadow-sm">
              <div className="space-y-2.5 text-sm"><p className="flex justify-between gap-3 text-pf-text-secondary"><span>Saldo actual</span><strong className="tabular-nums text-pf-text">{context ? formatMoney("L", context.prestamo.saldo) : "—"}</strong></p><p className="flex justify-between gap-3 text-pf-text-secondary"><span>Monto recibido</span><strong className="tabular-nums text-pf-text">{amountValid ? formatMoney("L", amountValue) : "—"}</strong></p><div className="border-t border-pf-border-soft pt-2.5"><p className="flex items-end justify-between gap-3"><span className="font-bold text-pf-text-secondary">Saldo después</span><strong className="whitespace-nowrap text-xl font-extrabold tabular-nums text-pf-text">{amountValid ? formatMoney("L", balanceAfter) : "—"}</strong></p></div></div>
            </div>
            {paymentPreview?.aplicaciones.length ? <div className="space-y-1.5 rounded-xl bg-pf-surface-soft p-3 text-xs text-pf-text-secondary"><p className="font-bold text-pf-text">Aplicación automática</p>{paymentPreview.aplicaciones.map((application) => <p key={application.cuotaId} className="flex justify-between gap-3"><span>Cuota #{application.numero}</span><strong>{formatMoney("L", application.monto)}</strong></p>)}</div> : null}
            {error ? <p className="text-sm font-medium text-pf-danger" role="alert">{error}</p> : null}
            <Button type="submit" className="hidden min-h-[52px] w-full text-base shadow-lg md:inline-flex" disabled={!context || !amount || saving}>
              <CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />Revisar pago
            </Button>
          </Card>
        </div>
      )}

      {!loading && loans.length > 0 && context ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-pf-border-soft bg-pf-surface-elevated/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-pf-muted">Saldo después</p><p className="truncate text-lg font-extrabold tabular-nums text-pf-text">{amountValid ? formatMoney("L", balanceAfter) : "Revise el monto"}</p></div><Button type="submit" className="min-h-[52px] shrink-0 px-5" disabled={!amount || saving}>Revisar</Button></div>
        </div>
      ) : null}

      <Modal open={reviewOpen} title="Confirmar pago" onClose={() => { if (!saving) setReviewOpen(false); }} maxWidthClass="sm:max-w-lg">
        <div className="space-y-4">
          <div className="text-center"><p className="text-sm font-medium text-pf-muted">Monto recibido</p><p className="mt-1 text-3xl font-black tabular-nums text-pf-text">{formatMoney("L", amountValue)}</p></div>
          <div className="rounded-xl bg-pf-surface-soft p-4 text-sm"><p className="flex justify-between gap-3"><span className="text-pf-muted">Cliente</span><strong className="text-right text-pf-text">{selectedCustomer?.nombre}</strong></p><p className="mt-2 flex justify-between gap-3"><span className="text-pf-muted">Préstamo</span><strong className="font-mono text-pf-text">{selectedLoan ? formatLoanNumber(selectedLoan.numero, selectedLoan.id) : "—"}</strong></p><p className="mt-2 flex justify-between gap-3"><span className="text-pf-muted">Saldo actual</span><strong>{formatMoney("L", context?.prestamo.saldo ?? 0)}</strong></p><p className="mt-2 flex justify-between gap-3 border-t border-pf-border-soft pt-2"><span className="font-bold text-pf-text">Nuevo saldo</span><strong className="text-lg text-pf-text">{formatMoney("L", balanceAfter)}</strong></p></div>
          <p className="text-xs leading-relaxed text-pf-muted">Esta operación actualizará el saldo y aplicará el monto a las cuotas más antiguas.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={saving} onClick={() => setReviewOpen(false)}>Volver y corregir</Button><Button type="button" className="min-h-[48px]" disabled={saving} onClick={() => void confirmPayment()}>{saving ? "Registrando…" : "Confirmar pago"}</Button></div>
        </div>
      </Modal>
    </form>
  );
}
